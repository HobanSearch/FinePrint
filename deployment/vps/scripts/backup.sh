#!/bin/bash

# Fine Print AI - Backup Script
# Performs automated backups of database, uploads, and configurations

set -e

# Configuration
BACKUP_DIR="${BACKUP_PATH:-/var/backups/fineprintai}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PREFIX="fineprintai_backup_${TIMESTAMP}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DEPLOYMENT_DIR="/opt/fineprintai"

# Load environment variables
if [ -f "$DEPLOYMENT_DIR/.env.production" ]; then
    source "$DEPLOYMENT_DIR/.env.production"
fi

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "${BACKUP_DIR}/backup.log"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "${BACKUP_DIR}/backup.log"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "${BACKUP_DIR}/backup.log"
}

# Create backup directory
mkdir -p "${BACKUP_DIR}/${TIMESTAMP}"
cd "${BACKUP_DIR}/${TIMESTAMP}"

# Backup PostgreSQL
backup_postgres() {
    log "Starting PostgreSQL backup..."
    
    docker exec fineprintai-postgres pg_dump \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-owner \
        --no-acl \
        --format=custom \
        --compress=9 \
        > "${BACKUP_PREFIX}_postgres.dump"
    
    if [ $? -eq 0 ]; then
        log_success "PostgreSQL backup completed: ${BACKUP_PREFIX}_postgres.dump"
    else
        log_error "PostgreSQL backup failed"
        return 1
    fi
}

# Backup Redis
backup_redis() {
    log "Starting Redis backup..."
    
    docker exec fineprintai-redis redis-cli \
        -a "$REDIS_PASSWORD" \
        --rdb "${BACKUP_PREFIX}_redis.rdb"
    
    docker cp fineprintai-redis:/data/"${BACKUP_PREFIX}_redis.rdb" .
    
    if [ $? -eq 0 ]; then
        log_success "Redis backup completed: ${BACKUP_PREFIX}_redis.rdb"
    else
        log_error "Redis backup failed"
        return 1
    fi
}

# Backup Qdrant vector database
backup_qdrant() {
    log "Starting Qdrant backup..."
    
    docker exec fineprintai-qdrant tar czf \
        /tmp/"${BACKUP_PREFIX}_qdrant.tar.gz" \
        /qdrant/storage
    
    docker cp fineprintai-qdrant:/tmp/"${BACKUP_PREFIX}_qdrant.tar.gz" .
    
    if [ $? -eq 0 ]; then
        log_success "Qdrant backup completed: ${BACKUP_PREFIX}_qdrant.tar.gz"
    else
        log_error "Qdrant backup failed"
        return 1
    fi
}

# Backup configurations
backup_configs() {
    log "Backing up configurations..."
    
    tar czf "${BACKUP_PREFIX}_configs.tar.gz" \
        -C "$DEPLOYMENT_DIR" \
        .env.production \
        deployment/vps/config/ \
        2>/dev/null || true
    
    log_success "Configuration backup completed: ${BACKUP_PREFIX}_configs.tar.gz"
}

# Backup Docker volumes (optional, for complete backup)
backup_volumes() {
    log "Backing up Docker volumes..."
    
    local volumes=("postgres_data" "redis_data" "qdrant_data")
    
    for volume in "${volumes[@]}"; do
        docker run --rm \
            -v "fineprintai_${volume}:/data" \
            -v "${BACKUP_DIR}/${TIMESTAMP}:/backup" \
            alpine tar czf "/backup/${BACKUP_PREFIX}_${volume}.tar.gz" -C /data .
    done
    
    log_success "Docker volumes backup completed"
}

# Create backup manifest
create_manifest() {
    cat > "${BACKUP_PREFIX}_manifest.json" <<EOF
{
    "timestamp": "${TIMESTAMP}",
    "version": "$(cd $DEPLOYMENT_DIR && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "files": [
        "${BACKUP_PREFIX}_postgres.dump",
        "${BACKUP_PREFIX}_redis.rdb",
        "${BACKUP_PREFIX}_qdrant.tar.gz",
        "${BACKUP_PREFIX}_configs.tar.gz"
    ],
    "database": {
        "name": "${DB_NAME}",
        "user": "${DB_USER}"
    },
    "domain": "${DOMAIN_NAME}"
}
EOF
    
    log "Backup manifest created"
}

# Compress all backups into single archive
compress_backup() {
    log "Compressing backup archive..."
    
    cd "${BACKUP_DIR}"
    tar czf "${BACKUP_PREFIX}.tar.gz" "${TIMESTAMP}/"
    
    # Calculate size
    local size=$(du -h "${BACKUP_PREFIX}.tar.gz" | cut -f1)
    log_success "Backup archive created: ${BACKUP_PREFIX}.tar.gz (Size: ${size})"
    
    # Remove uncompressed directory
    rm -rf "${TIMESTAMP}/"
}

# Upload to S3 (optional)
upload_to_s3() {
    if [ -n "$S3_BACKUP_BUCKET" ]; then
        log "Uploading backup to S3..."
        
        aws s3 cp "${BACKUP_DIR}/${BACKUP_PREFIX}.tar.gz" \
            "s3://${S3_BACKUP_BUCKET}/backups/${BACKUP_PREFIX}.tar.gz" \
            --storage-class GLACIER_IR
        
        if [ $? -eq 0 ]; then
            log_success "Backup uploaded to S3"
        else
            log_error "S3 upload failed"
        fi
    fi
}

# Clean old backups
cleanup_old_backups() {
    log "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
    
    find "${BACKUP_DIR}" -name "fineprintai_backup_*.tar.gz" \
        -mtime +${RETENTION_DAYS} -delete
    
    local remaining=$(ls -1 "${BACKUP_DIR}"/fineprintai_backup_*.tar.gz 2>/dev/null | wc -l)
    log "Cleanup completed. ${remaining} backup(s) remaining."
}

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..."
    
    cd "${BACKUP_DIR}"
    
    if tar tzf "${BACKUP_PREFIX}.tar.gz" > /dev/null 2>&1; then
        log_success "Backup integrity verified"
        return 0
    else
        log_error "Backup integrity check failed!"
        return 1
    fi
}

# Send notification (optional)
send_notification() {
    local status=$1
    local message=$2
    
    # Send email notification if configured
    if [ -n "$ADMIN_EMAIL" ] && [ -n "$SMTP_HOST" ]; then
        echo "$message" | mail -s "Fine Print AI Backup ${status}" "$ADMIN_EMAIL"
    fi
    
    # Send to monitoring system if configured
    if [ -n "$MONITORING_WEBHOOK" ]; then
        curl -X POST "$MONITORING_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"status\":\"${status}\",\"message\":\"${message}\"}"
    fi
}

# Main backup process
main() {
    log "=========================================="
    log "Starting Fine Print AI backup process"
    log "=========================================="
    
    # Perform backups
    backup_postgres || exit 1
    backup_redis || exit 1
    backup_qdrant || exit 1
    backup_configs
    
    # Create manifest and compress
    create_manifest
    compress_backup
    
    # Verify and upload
    if verify_backup; then
        upload_to_s3
        cleanup_old_backups
        
        log_success "Backup completed successfully!"
        send_notification "SUCCESS" "Backup completed: ${BACKUP_PREFIX}.tar.gz"
    else
        log_error "Backup verification failed!"
        send_notification "FAILED" "Backup failed: ${BACKUP_PREFIX}"
        exit 1
    fi
    
    log "=========================================="
    log "Backup process completed"
    log "=========================================="
}

# Run main function
main "$@"