# Fine Print AI - Comprehensive Deployment & Distribution Guide

This guide provides complete instructions for deploying the Fine Print AI platform across all environments and platforms.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Infrastructure Setup](#infrastructure-setup)
- [CI/CD Pipeline Configuration](#cicd-pipeline-configuration)
- [Multi-Platform Deployment](#multi-platform-deployment)
- [Store Submission Automation](#store-submission-automation)
- [Monitoring & Observability](#monitoring--observability)
- [Security & Compliance](#security--compliance)
- [Disaster Recovery](#disaster-recovery)
- [Troubleshooting](#troubleshooting)

## 🌟 Overview

Fine Print AI's deployment infrastructure supports:

- **Multi-Cloud Deployment**: AWS, GCP, Azure
- **Multi-Platform Applications**: Web, Mobile (iOS/Android), Browser Extensions
- **Automated Store Submissions**: App Store, Google Play, Chrome Web Store, Firefox Add-ons, Safari Extensions, Edge Add-ons
- **Zero-Downtime Deployments**: Blue-Green deployment strategy
- **Comprehensive Monitoring**: Prometheus, Grafana, Loki, Jaeger
- **Enterprise Security**: SOC2, ISO27001, GDPR, CCPA compliance
- **Disaster Recovery**: Automated backups and failover

## 🔧 Prerequisites

### Required Tools

```bash
# Infrastructure tools
terraform >= 1.5.0
kubectl >= 1.28.0
helm >= 3.12.0
docker >= 24.0.0

# Cloud CLIs
aws-cli >= 2.13.0
gcloud >= 440.0.0
az-cli >= 2.52.0

# Mobile development
node.js >= 20.0.0
expo-cli >= 6.0.0
xcode >= 15.0 (for iOS)
android-studio >= 2023.1 (for Android)

# Store submission tools
chrome-webstore-upload-cli
web-ext (Firefox)
```

### Required Accounts & Credentials

- **Cloud Providers**: AWS, GCP (optional), Azure (optional)
- **Container Registry**: GitHub Container Registry (GHCR)
- **App Stores**: Apple Developer Account, Google Play Console
- **Browser Stores**: Chrome Web Store, Firefox Add-ons, Safari Extensions, Edge Add-ons
- **Monitoring**: Datadog (optional), Sentry
- **Communication**: Slack, PagerDuty

## 🏗️ Infrastructure Setup

### 1. Initialize Terraform State

```bash
# Create S3 bucket for Terraform state
aws s3 mb s3://fineprintai-terraform-state --region us-west-2

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name fineprintai-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

### 2. Configure Environment Variables

```bash
# Copy environment template
cp infrastructure/terraform/terraform.tfvars.example infrastructure/terraform/terraform.tfvars

# Edit with your values
vim infrastructure/terraform/terraform.tfvars
```

Example `terraform.tfvars`:

```hcl
# Environment configuration
environment = "production"
name_prefix = "fineprintai"
region      = "us-west-2"

# Multi-cloud configuration
cloud_providers = {
  aws   = true
  gcp   = false  # Enable for multi-cloud
  azure = false  # Enable for multi-cloud
}

# Domain configuration
domain_name = "fineprintai.com"

# AWS configuration
aws_region   = "us-west-2"
aws_vpc_cidr = "10.0.0.0/16"

# Database configuration
db_instance_class = "db.r6g.large"
db_allocated_storage = 100
db_backup_retention_period = 30

# Monitoring configuration
grafana_admin_password = "secure-password-change-me"
slack_webhook_url      = "https://hooks.slack.com/services/..."
alert_email_addresses  = ["alerts@fineprintai.com"]

# Security configuration
allowed_ingress_cidrs = ["0.0.0.0/0"]  # Restrict in production

# Feature flags
enable_disaster_recovery = true
enable_multi_region     = true
enable_monitoring       = true
enable_security_scanning = true
```

### 3. Deploy Infrastructure

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Plan deployment
terraform plan -var-file="terraform.tfvars"

# Apply infrastructure
terraform apply -var-file="terraform.tfvars"
```

### 4. Configure Kubernetes Access

```bash
# Update kubeconfig for EKS
aws eks update-kubeconfig --name fineprintai-production-cluster --region us-west-2

# Verify connection
kubectl get nodes

# Install necessary Kubernetes tools
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

## 🚀 CI/CD Pipeline Configuration

### 1. GitHub Secrets Setup

Configure the following secrets in your GitHub repository:

```bash
# AWS Credentials
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_ACCESS_KEY_ID_PROD
AWS_SECRET_ACCESS_KEY_PROD

# Container Registry
GITHUB_TOKEN

# Mobile App Store Credentials
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APP_STORE_CONNECT_KEY_ID
APP_STORE_CONNECT_ISSUER_ID
APP_STORE_CONNECT_PRIVATE_KEY
GOOGLE_SERVICE_ACCOUNT_KEY
EXPO_TOKEN

# Browser Extension Store Credentials
CHROME_EXTENSION_ID
CHROME_CLIENT_ID
CHROME_CLIENT_SECRET
CHROME_REFRESH_TOKEN
FIREFOX_API_KEY
FIREFOX_API_SECRET
EDGE_CLIENT_ID
EDGE_CLIENT_SECRET
EDGE_TENANT_ID
EDGE_PRODUCT_ID

# Security & Monitoring
SNYK_TOKEN
SENTRY_DSN
DATADOG_API_KEY

# Notifications
SLACK_WEBHOOK_URL
SLACK_INTERNAL_WEBHOOK_URL
PAGERDUTY_INTEGRATION_KEY
```

### 2. Trigger Deployments

The CI/CD pipelines automatically trigger on:
- **Push to `main`**: Production deployment
- **Push to `develop`**: Staging deployment
- **Pull requests**: Testing and validation

Manual deployment via GitHub Actions:

```bash
# Navigate to Actions tab in GitHub
# Select desired workflow
# Click "Run workflow"
# Choose parameters (environment, platform, etc.)
```

## 📱 Multi-Platform Deployment

### Web Application

The web application is automatically deployed through the CI/CD pipeline:

1. **Development**: Automatic deployment on `develop` branch
2. **Staging**: Manual approval required
3. **Production**: Blue-green deployment with health checks

Access URLs:
- Production: https://fineprintai.com
- Staging: https://staging.fineprintai.com
- Development: https://dev.fineprintai.com

### Mobile Applications

#### iOS App Store Deployment

```bash
# Manual deployment
cd mobile
eas build --platform ios --profile production
eas submit --platform ios --profile production

# Automated via GitHub Actions
# Workflow: .github/workflows/ci-cd-mobile.yml
```

#### Google Play Store Deployment

```bash
# Manual deployment
cd mobile
eas build --platform android --profile production
eas submit --platform android --profile production

# Automated via GitHub Actions
# Workflow: .github/workflows/ci-cd-mobile.yml
```

### Browser Extensions

#### Chrome Web Store

```bash
# Manual submission
cd extension
npm run build:chrome:production
npm run submit:chrome

# Automated via GitHub Actions
# Workflow: .github/workflows/ci-cd-extension.yml
```

#### Firefox Add-ons

```bash
# Manual submission
cd extension
npm run build:firefox:production
npm run submit:firefox

# Automated via GitHub Actions
# Workflow: .github/workflows/ci-cd-extension.yml
```

## 🏪 Store Submission Automation

### Automated Store Submission Workflow

Use the comprehensive store automation workflow:

```bash
# Submit to all platforms
gh workflow run store-automation.yml \
  -f platform=all \
  -f submission_type=production

# Submit mobile apps only
gh workflow run store-automation.yml \
  -f platform=mobile \
  -f submission_type=beta

# Submit extensions only
gh workflow run store-automation.yml \
  -f platform=extension \
  -f submission_type=production

# Emergency patch submission
gh workflow run store-automation.yml \
  -f platform=all \
  -f submission_type=emergency_patch \
  -f skip_approval=true
```

### Store Submission Status

Monitor submission status:

1. **GitHub Actions**: View workflow runs
2. **Slack Notifications**: Real-time updates
3. **Internal Dashboard**: https://dashboard.fineprintai.com/releases

## 📊 Monitoring & Observability

### Access Monitoring Services

- **Grafana**: https://grafana-production.fineprintai.com
- **Prometheus**: https://prometheus-production.fineprintai.com
- **AlertManager**: https://alertmanager-production.fineprintai.com
- **Jaeger**: https://jaeger-query-production.fineprintai.com

### Key Metrics to Monitor

#### Application Metrics
- Response time (95th percentile < 500ms)
- Error rate (< 0.1%)
- Throughput (requests per second)
- Active users

#### Infrastructure Metrics
- CPU utilization (< 70%)
- Memory utilization (< 80%)
- Disk utilization (< 85%)
- Network I/O

#### Business Metrics
- Document analysis success rate
- User engagement metrics
- Revenue metrics
- Compliance audit results

### Setting Up Alerts

Key alerts are pre-configured:

1. **Service Down**: Critical alert for service unavailability
2. **High Error Rate**: Warning when error rate > 5%
3. **High Latency**: Warning when 95th percentile > 1s
4. **Resource Exhaustion**: Critical when resources > 90%
5. **Security Incidents**: Critical for security events

## 🔒 Security & Compliance

### Security Scanning

Automated security scanning includes:

1. **SAST (Static Analysis)**: CodeQL, Semgrep
2. **DAST (Dynamic Analysis)**: OWASP ZAP
3. **Dependency Scanning**: Snyk, npm audit
4. **Container Scanning**: Trivy, Clair
5. **Infrastructure Scanning**: Checkov, tfsec

### Compliance Validation

Regular compliance checks for:

- **SOC 2**: Security controls and audit logging
- **ISO 27001**: Information security management
- **GDPR**: Data protection and privacy rights
- **CCPA**: California consumer privacy rights

### Security Hardening Checklist

- [ ] Pod Security Standards enforced
- [ ] Network policies implemented
- [ ] RBAC configured with least privilege
- [ ] All secrets encrypted at rest
- [ ] TLS 1.3 enforced for all communication
- [ ] Regular security patches applied
- [ ] Vulnerability scanning automated
- [ ] Security incident response plan tested

## 🚨 Disaster Recovery

### Backup Strategy

Automated backups are configured for:

1. **Database Backups**: Daily with 30-day retention
2. **Kubernetes Manifests**: Velero daily backups
3. **Application Data**: S3 with lifecycle policies
4. **Configuration**: Git-based with encryption

### Recovery Procedures

#### Database Recovery

```bash
# List available backups
aws backup list-recovery-points --backup-vault-name fineprintai-production-backup-vault

# Restore from backup
aws backup start-restore-job \
  --recovery-point-arn arn:aws:backup:... \
  --iam-role-arn arn:aws:iam::...:role/fineprintai-production-backup-role
```

#### Kubernetes Recovery

```bash
# List Velero backups
velero backup get

# Restore from backup
velero restore create --from-backup <backup-name>

# Monitor restore progress
velero restore get
```

#### Full Disaster Recovery

1. **RTO (Recovery Time Objective)**: 4 hours
2. **RPO (Recovery Point Objective)**: 1 hour
3. **Failover Process**: Automated DNS switching
4. **Data Synchronization**: Cross-region replication

### DR Testing

Automated DR testing runs monthly:

```bash
# Manual DR test
kubectl apply -f infrastructure/disaster-recovery/dr-test.yaml

# Verify DR environment
./infrastructure/scripts/verify-dr-environment.sh
```

## 🔧 Troubleshooting

### Common Issues and Solutions

#### Deployment Failures

**Issue**: Deployment fails with timeout
```bash
# Check pod status
kubectl get pods -n fineprintai-production

# Check events
kubectl get events -n fineprintai-production --sort-by='.lastTimestamp'

# Check logs
kubectl logs -f deployment/api -n fineprintai-production
```

**Solution**: Scale up resources or optimize startup time

#### Database Connection Issues

**Issue**: Cannot connect to database
```bash
# Check database status
aws rds describe-db-instances --db-instance-identifier fineprintai-production

# Test connection from pod
kubectl run -it --rm debug --image=postgres:16 --restart=Never -- psql -h <db-endpoint> -U fineprintai
```

**Solution**: Verify security groups and network policies

#### Certificate Issues

**Issue**: SSL certificate not working
```bash
# Check cert-manager status
kubectl get certificaterequests -A
kubectl get certificates -A

# Force certificate renewal
kubectl delete certificaterequest <cert-name>
```

**Solution**: Verify DNS configuration and cert-manager setup

### Performance Optimization

#### Application Performance

1. **Enable caching**: Redis for API responses
2. **Optimize queries**: Database indexing
3. **CDN configuration**: CloudFront for static assets
4. **Image optimization**: WebP format and compression

#### Infrastructure Performance

1. **Resource allocation**: Right-size containers
2. **Auto-scaling**: Configure HPA and VPA
3. **Load balancing**: Distribute traffic efficiently
4. **Network optimization**: Use availability zones

### Monitoring and Alerting Issues

#### Missing Metrics

```bash
# Check Prometheus targets
kubectl port-forward svc/prometheus-server 9090:80 -n monitoring
# Visit http://localhost:9090/targets
```

#### Alert Fatigue

1. Adjust alert thresholds
2. Implement alert grouping
3. Use alert inhibition rules
4. Regular alert review and cleanup

## 📞 Support and Escalation

### Support Channels

1. **Development Issues**: Create GitHub issue
2. **Infrastructure Issues**: Slack #infrastructure
3. **Security Incidents**: Slack #security-alerts
4. **Production Issues**: PagerDuty escalation

### Escalation Matrix

| Severity | Response Time | Escalation |
|----------|---------------|------------|
| Critical | 15 minutes | On-call engineer |
| High | 1 hour | Team lead |
| Medium | 4 hours | Next business day |
| Low | 24 hours | Backlog |

### Emergency Contacts

- **On-call Engineer**: PagerDuty
- **DevOps Team**: devops@fineprintai.com
- **Security Team**: security@fineprintai.com
- **Management**: management@fineprintai.com

---

## 📚 Additional Resources

- [Technical Architecture Documentation](../TECH_STACK.md)
- [Security Implementation Guide](../backend/shared/security/SECURITY_IMPLEMENTATION.md)
- [Testing Guide](../COMPREHENSIVE_TESTING_GUIDE.md)
- [Brand Strategy](../BRAND_STRATEGY.md)

For questions or support, contact the DevOps team at devops@fineprintai.com or join #infrastructure on Slack.

---

*Last updated: $(date)*
*Version: 1.0.0*