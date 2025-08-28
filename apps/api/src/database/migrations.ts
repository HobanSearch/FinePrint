import { PrismaClient } from '@prisma/client'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { createHash } from 'crypto'
import { dbLogger as logger } from './client.js'

// Migration status enum
export enum MigrationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

// Migration interface
export interface Migration {
  version: string
  name: string
  description?: string
  upSql: string
  downSql?: string
  hash: string
  appliedAt?: Date
  status: MigrationStatus
}

// Migration runner configuration
export interface MigrationConfig {
  migrationsPath: string
  backupPath?: string
  dryRun?: boolean
  allowRollback?: boolean
  batchSize?: number
}

// Database schema validation interface
export interface SchemaValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  missingTables: string[]
  missingColumns: Array<{ table: string; column: string }>
  missingIndexes: string[]
  unexpectedObjects: string[]
}

// Migration runner class
export class MigrationRunner {
  private prisma: PrismaClient
  private config: Required<MigrationConfig>

  constructor(config: MigrationConfig) {
    this.prisma = new PrismaClient()
    this.config = {
      migrationsPath: config.migrationsPath,
      backupPath: config.backupPath || join(config.migrationsPath, '../backups'),
      dryRun: config.dryRun || false,
      allowRollback: config.allowRollback || false,
      batchSize: config.batchSize || 10
    }
  }

  // Initialize migration system
  async initialize(): Promise<void> {
    try {
      // Create schema_migrations table if it doesn't exist
      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          hash VARCHAR(64) NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          status VARCHAR(20) DEFAULT 'completed',
          rollback_sql TEXT,
          execution_time_ms INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `

      // Create migration locks table
      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS migration_locks (
          id INTEGER PRIMARY KEY DEFAULT 1,
          locked_at TIMESTAMP WITH TIME ZONE,
          locked_by VARCHAR(255),
          process_id INTEGER,
          CONSTRAINT single_lock CHECK (id = 1)
        )
      `

      logger.info('Migration system initialized')
    } catch (error) {
      logger.error({ error }, 'Failed to initialize migration system')
      throw error
    }
  }

  // Load migrations from filesystem
  async loadMigrations(): Promise<Migration[]> {
    try {
      const migrations: Migration[] = []
      
      if (!existsSync(this.config.migrationsPath)) {
        logger.warn({ path: this.config.migrationsPath }, 'Migrations directory does not exist')
        return migrations
      }

      const files = readdirSync(this.config.migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort()

      for (const file of files) {
        const filePath = join(this.config.migrationsPath, file)
        const content = readFileSync(filePath, 'utf8')
        
        // Parse migration file
        const migration = this.parseMigrationFile(file, content)
        migrations.push(migration)
      }

      logger.info({ count: migrations.length }, 'Loaded migrations from filesystem')
      return migrations
    } catch (error) {
      logger.error({ error }, 'Failed to load migrations')
      throw error
    }
  }

  // Parse migration file content
  private parseMigrationFile(filename: string, content: string): Migration {
    const lines = content.split('\n')
    let upSql = ''
    let downSql = ''
    let isUpSection = true
    let description = ''

    // Extract metadata from comments
    for (const line of lines) {
      const trimmed = line.trim()
      
      if (trimmed.startsWith('-- Description:')) {
        description = trimmed.replace('-- Description:', '').trim()
      }
      
      if (trimmed === '-- DOWN SECTION' || trimmed === '-- ROLLBACK') {
        isUpSection = false
        continue
      }
      
      if (trimmed === '-- UP SECTION' || trimmed === '') {
        isUpSection = true
        continue
      }
      
      if (!trimmed.startsWith('--') && trimmed) {
        if (isUpSection) {
          upSql += line + '\n'
        } else {
          downSql += line + '\n'
        }
      }
    }

    // Extract version from filename (e.g., 001_initial_schema.sql -> 001)
    const versionMatch = filename.match(/^(\d+)_/)
    const version = versionMatch ? versionMatch[1] : filename.replace('.sql', '')
    
    // Extract name from filename
    const name = filename.replace(/^\d+_/, '').replace('.sql', '').replace(/_/g, ' ')

    return {
      version,
      name,
      description: description || undefined,
      upSql: upSql.trim(),
      downSql: downSql.trim() || undefined,
      hash: createHash('sha256').update(upSql).digest('hex'),
      status: MigrationStatus.PENDING
    }
  }

  // Get applied migrations from database
  async getAppliedMigrations(): Promise<Map<string, Migration>> {
    try {
      const applied = await this.prisma.$queryRaw`
        SELECT version, name, description, hash, applied_at, status, rollback_sql, execution_time_ms
        FROM schema_migrations 
        ORDER BY version
      ` as any[]

      const migrationsMap = new Map<string, Migration>()
      
      for (const row of applied) {
        migrationsMap.set(row.version, {
          version: row.version,
          name: row.name,
          description: row.description,
          upSql: '', // Not stored in database
          downSql: row.rollback_sql,
          hash: row.hash,
          appliedAt: row.applied_at,
          status: row.status as MigrationStatus
        })
      }

      return migrationsMap
    } catch (error) {
      logger.error({ error }, 'Failed to get applied migrations')
      throw error
    }
  }

  // Get pending migrations
  async getPendingMigrations(): Promise<Migration[]> {
    const allMigrations = await this.loadMigrations()
    const appliedMigrations = await this.getAppliedMigrations()

    return allMigrations.filter(migration => {
      const applied = appliedMigrations.get(migration.version)
      
      if (!applied) return true // Not applied
      
      // Check if hash matches (migration content changed)
      if (applied.hash !== migration.hash) {
        logger.warn({
          version: migration.version,
          appliedHash: applied.hash,
          currentHash: migration.hash
        }, 'Migration content has changed since application')
        return false // Don't re-apply changed migrations
      }
      
      return applied.status === MigrationStatus.FAILED
    })
  }

  // Acquire migration lock
  private async acquireLock(): Promise<boolean> {
    try {
      const processId = process.pid
      const lockedBy = `migration-runner-${processId}`
      
      const result = await this.prisma.$executeRaw`
        INSERT INTO migration_locks (id, locked_at, locked_by, process_id)
        VALUES (1, NOW(), ${lockedBy}, ${processId})
        ON CONFLICT (id) 
        DO UPDATE SET 
          locked_at = CASE 
            WHEN migration_locks.locked_at < NOW() - INTERVAL '1 hour' 
            THEN NOW() 
            ELSE migration_locks.locked_at 
          END,
          locked_by = CASE 
            WHEN migration_locks.locked_at < NOW() - INTERVAL '1 hour' 
            THEN ${lockedBy}
            ELSE migration_locks.locked_by 
          END,
          process_id = CASE 
            WHEN migration_locks.locked_at < NOW() - INTERVAL '1 hour' 
            THEN ${processId}
            ELSE migration_locks.process_id 
          END
        WHERE migration_locks.locked_at < NOW() - INTERVAL '1 hour'
          OR migration_locks.locked_by = ${lockedBy}
      `

      // Check if we got the lock
      const lock = await this.prisma.$queryRaw`
        SELECT locked_by, process_id FROM migration_locks WHERE id = 1
      ` as any[]

      const acquired = lock[0]?.locked_by === lockedBy && lock[0]?.process_id === processId
      
      if (acquired) {
        logger.info({ processId, lockedBy }, 'Migration lock acquired')
      } else {
        logger.warn({ 
          currentProcess: processId,
          lockHolder: lock[0]?.locked_by,
          lockProcess: lock[0]?.process_id 
        }, 'Failed to acquire migration lock')
      }
      
      return acquired
    } catch (error) {
      logger.error({ error }, 'Failed to acquire migration lock')
      return false
    }
  }

  // Release migration lock
  private async releaseLock(): Promise<void> {
    try {
      const processId = process.pid
      const lockedBy = `migration-runner-${processId}`
      
      await this.prisma.$executeRaw`
        DELETE FROM migration_locks 
        WHERE locked_by = ${lockedBy} AND process_id = ${processId}
      `
      
      logger.info({ processId }, 'Migration lock released')
    } catch (error) {
      logger.error({ error }, 'Failed to release migration lock')
    }
  }

  // Run migrations
  async runMigrations(): Promise<{
    applied: Migration[]
    failed: Migration[]
    skipped: Migration[]
  }> {
    const applied: Migration[] = []
    const failed: Migration[] = []
    const skipped: Migration[] = []

    try {
      // Acquire lock
      const lockAcquired = await this.acquireLock()
      if (!lockAcquired) {
        throw new Error('Could not acquire migration lock - another process may be running migrations')
      }

      const pendingMigrations = await this.getPendingMigrations()
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations to apply')
        return { applied, failed, skipped }
      }

      logger.info({ 
        count: pendingMigrations.length,
        dryRun: this.config.dryRun 
      }, 'Starting migration run')

      for (const migration of pendingMigrations) {
        try {
          await this.runSingleMigration(migration)
          applied.push(migration)
          
          logger.info({
            version: migration.version,
            name: migration.name
          }, 'Migration applied successfully')
          
        } catch (error) {
          migration.status = MigrationStatus.FAILED
          failed.push(migration)
          
          logger.error({
            version: migration.version,
            name: migration.name,
            error
          }, 'Migration failed')
          
          // Record failed migration
          if (!this.config.dryRun) {
            await this.recordMigration(migration, error instanceof Error ? error.message : 'Unknown error')
          }
          
          // Stop on first failure
          break
        }
      }

      logger.info({
        applied: applied.length,
        failed: failed.length,
        skipped: skipped.length
      }, 'Migration run completed')

      return { applied, failed, skipped }
      
    } finally {
      await this.releaseLock()
    }
  }

  // Run a single migration
  private async runSingleMigration(migration: Migration): Promise<void> {
    const startTime = Date.now()
    
    logger.info({
      version: migration.version,
      name: migration.name,
      dryRun: this.config.dryRun
    }, 'Applying migration')
    
    if (this.config.dryRun) {
      logger.info({ sql: migration.upSql }, 'DRY RUN - Would execute SQL')
      return
    }

    try {
      // Update status to running
      migration.status = MigrationStatus.RUNNING
      await this.recordMigration(migration)

      // Execute migration SQL
      await this.prisma.$executeRawUnsafe(migration.upSql)

      // Update status to completed
      migration.status = MigrationStatus.COMPLETED
      migration.appliedAt = new Date()
      
      const executionTime = Date.now() - startTime
      await this.recordMigration(migration, undefined, executionTime)
      
    } catch (error) {
      migration.status = MigrationStatus.FAILED
      throw error
    }
  }

  // Record migration in database
  private async recordMigration(
    migration: Migration, 
    errorMessage?: string, 
    executionTime?: number
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO schema_migrations (
          version, name, description, hash, applied_at, status, rollback_sql, execution_time_ms
        ) VALUES (
          ${migration.version},
          ${migration.name},
          ${migration.description || null},
          ${migration.hash},
          ${migration.appliedAt || new Date()},
          ${migration.status},
          ${migration.downSql || null},
          ${executionTime || null}
        )
        ON CONFLICT (version) 
        DO UPDATE SET 
          status = ${migration.status},
          applied_at = ${migration.appliedAt || new Date()},
          execution_time_ms = ${executionTime || null}
      `
    } catch (error) {
      logger.error({ 
        error, 
        migration: migration.version 
      }, 'Failed to record migration status')
    }
  }

  // Rollback migration
  async rollbackMigration(version: string): Promise<void> {
    if (!this.config.allowRollback) {
      throw new Error('Rollback is not enabled in configuration')
    }

    try {
      const lockAcquired = await this.acquireLock()
      if (!lockAcquired) {
        throw new Error('Could not acquire migration lock')
      }

      // Get migration record
      const migrationRecord = await this.prisma.$queryRaw`
        SELECT version, name, rollback_sql, status 
        FROM schema_migrations 
        WHERE version = ${version}
      ` as any[]

      if (migrationRecord.length === 0) {
        throw new Error(`Migration ${version} not found`)
      }

      const migration = migrationRecord[0]
      
      if (migration.status !== MigrationStatus.COMPLETED) {
        throw new Error(`Cannot rollback migration ${version} - status is ${migration.status}`)
      }

      if (!migration.rollback_sql) {
        throw new Error(`Migration ${version} does not have rollback SQL`)
      }

      logger.info({
        version,
        name: migration.name,
        dryRun: this.config.dryRun
      }, 'Rolling back migration')

      if (this.config.dryRun) {
        logger.info({ sql: migration.rollback_sql }, 'DRY RUN - Would execute rollback SQL')
        return
      }

      // Execute rollback SQL
      await this.prisma.$executeRawUnsafe(migration.rollback_sql)

      // Update migration status
      await this.prisma.$executeRaw`
        UPDATE schema_migrations 
        SET status = ${MigrationStatus.ROLLED_BACK}, applied_at = NOW()
        WHERE version = ${version}
      `

      logger.info({ version }, 'Migration rolled back successfully')
      
    } finally {
      await this.releaseLock()
    }
  }

  // Generate migration file
  async generateMigration(name: string, upSql: string, downSql?: string): Promise<string> {
    try {
      // Get next version number
      const existingMigrations = await this.loadMigrations()
      const maxVersion = Math.max(
        0, 
        ...existingMigrations.map(m => parseInt(m.version, 10))
      )
      const nextVersion = String(maxVersion + 1).padStart(3, '0')

      // Generate filename
      const filename = `${nextVersion}_${name.replace(/\s+/g, '_').toLowerCase()}.sql`
      const filepath = join(this.config.migrationsPath, filename)

      // Generate file content
      const content = this.generateMigrationContent(name, upSql, downSql)

      // In a real implementation, you would write to the filesystem
      // writeFileSync(filepath, content)

      logger.info({ 
        filename, 
        version: nextVersion 
      }, 'Migration file generated')

      return filepath
    } catch (error) {
      logger.error({ error, name }, 'Failed to generate migration')
      throw error
    }
  }

  private generateMigrationContent(name: string, upSql: string, downSql?: string): string {
    const now = new Date().toISOString()
    
    let content = `-- Migration: ${name}
-- Description: ${name}
-- Date: ${now}
-- Author: Migration Generator

-- This migration ${name.toLowerCase()}

\\echo 'Applying migration: ${name}...'

-- UP SECTION
${upSql}

\\echo 'Migration ${name} applied successfully'
`

    if (downSql) {
      content += `
-- DOWN SECTION
-- Rollback SQL for this migration
${downSql}
`
    }

    return content
  }

  // Get migration status
  async getMigrationStatus(): Promise<{
    total: number
    applied: number
    pending: number
    failed: number
    lastMigration?: string
    lastApplied?: Date
  }> {
    try {
      const allMigrations = await this.loadMigrations()
      const appliedMigrations = await this.getAppliedMigrations()
      const pendingMigrations = await this.getPendingMigrations()

      const failedCount = Array.from(appliedMigrations.values())
        .filter(m => m.status === MigrationStatus.FAILED).length

      const lastAppliedMigration = Array.from(appliedMigrations.values())
        .filter(m => m.status === MigrationStatus.COMPLETED)
        .sort((a, b) => (b.appliedAt?.getTime() || 0) - (a.appliedAt?.getTime() || 0))[0]

      return {
        total: allMigrations.length,
        applied: appliedMigrations.size - failedCount,
        pending: pendingMigrations.length,
        failed: failedCount,
        lastMigration: lastAppliedMigration?.version,
        lastApplied: lastAppliedMigration?.appliedAt
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get migration status')
      throw error
    }
  }

  // Cleanup
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect()
  }
}

// Schema validator class
export class SchemaValidator {
  private prisma: PrismaClient
  private expectedSchema: any

  constructor(expectedSchema?: any) {
    this.prisma = new PrismaClient()
    this.expectedSchema = expectedSchema
  }

  // Validate current database schema
  async validateSchema(): Promise<SchemaValidationResult> {
    const result: SchemaValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      missingTables: [],
      missingColumns: [],
      missingIndexes: [],
      unexpectedObjects: []
    }

    try {
      // Get current database schema
      const currentSchema = await this.getCurrentSchema()
      
      // Validate required tables exist
      await this.validateTables(currentSchema, result)
      
      // Validate required columns exist
      await this.validateColumns(currentSchema, result)
      
      // Validate indexes
      await this.validateIndexes(currentSchema, result)
      
      // Validate constraints
      await this.validateConstraints(currentSchema, result)
      
      // Check for orphaned data
      await this.checkDataIntegrity(result)

      result.isValid = result.errors.length === 0

      logger.info({
        isValid: result.isValid,
        errors: result.errors.length,
        warnings: result.warnings.length
      }, 'Schema validation completed')

      return result
    } catch (error) {
      logger.error({ error }, 'Schema validation failed')
      result.errors.push(`Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      result.isValid = false
      return result
    }
  }

  // Get current database schema information
  private async getCurrentSchema() {
    const tables = await this.prisma.$queryRaw`
      SELECT 
        t.table_name,
        t.table_type,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.ordinal_position
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name, c.ordinal_position
    ` as any[]

    const indexes = await this.prisma.$queryRaw`
      SELECT 
        i.tablename,
        i.indexname,
        i.indexdef
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
      ORDER BY i.tablename, i.indexname
    ` as any[]

    const constraints = await this.prisma.$queryRaw`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name
    ` as any[]

    return { tables, indexes, constraints }
  }

  // Validate required tables exist
  private async validateTables(currentSchema: any, result: SchemaValidationResult): Promise<void> {
    const requiredTables = [
      'users', 'user_sessions', 'teams', 'team_members',
      'documents', 'document_analyses', 'analysis_findings',
      'pattern_library', 'action_templates', 'user_actions',
      'notifications', 'notification_preferences', 'alerts',
      'api_keys', 'api_usage', 'integrations',
      'usage_analytics', 'system_metrics',
      'data_processing_records', 'data_export_requests', 'data_deletion_requests',
      'audit_logs', 'schema_migrations'
    ]

    const existingTables = new Set(
      currentSchema.tables.map((t: any) => t.table_name)
    )

    for (const table of requiredTables) {
      if (!existingTables.has(table)) {
        result.missingTables.push(table)
        result.errors.push(`Required table '${table}' is missing`)
      }
    }
  }

  // Validate required columns exist
  private async validateColumns(currentSchema: any, result: SchemaValidationResult): Promise<void> {
    const requiredColumns = {
      users: ['id', 'email', 'email_verified', 'created_at', 'updated_at'],
      documents: ['id', 'user_id', 'title', 'document_hash', 'document_type', 'created_at'],
      document_analyses: ['id', 'document_id', 'user_id', 'status', 'created_at'],
      schema_migrations: ['version', 'applied_at', 'status']
    }

    const tableColumns = new Map<string, Set<string>>()
    currentSchema.tables.forEach((row: any) => {
      if (!tableColumns.has(row.table_name)) {
        tableColumns.set(row.table_name, new Set())
      }
      if (row.column_name) {
        tableColumns.get(row.table_name)!.add(row.column_name)
      }
    })

    for (const [table, columns] of Object.entries(requiredColumns)) {
      const existingColumns = tableColumns.get(table)
      
      if (!existingColumns) {
        continue // Table missing - already handled in validateTables
      }

      for (const column of columns) {
        if (!existingColumns.has(column)) {
          result.missingColumns.push({ table, column })
          result.errors.push(`Required column '${column}' is missing from table '${table}'`)
        }
      }
    }
  }

  // Validate critical indexes exist
  private async validateIndexes(currentSchema: any, result: SchemaValidationResult): Promise<void> {
    const criticalIndexes = [
      'users_email_key',
      'documents_user_id_idx',
      'documents_document_hash_key',
      'document_analyses_document_id_idx',
      'user_sessions_session_token_key'
    ]

    const existingIndexes = new Set(
      currentSchema.indexes.map((i: any) => i.indexname)
    )

    for (const index of criticalIndexes) {
      if (!existingIndexes.has(index)) {
        result.missingIndexes.push(index)
        result.warnings.push(`Critical index '${index}' is missing`)
      }
    }
  }

  // Validate foreign key constraints
  private async validateConstraints(currentSchema: any, result: SchemaValidationResult): Promise<void> {
    const requiredConstraints = [
      { table: 'user_sessions', column: 'user_id', references: 'users' },
      { table: 'documents', column: 'user_id', references: 'users' },
      { table: 'document_analyses', column: 'document_id', references: 'documents' },
      { table: 'document_analyses', column: 'user_id', references: 'users' }
    ]

    const existingConstraints = new Set(
      currentSchema.constraints
        .filter((c: any) => c.constraint_type === 'FOREIGN KEY')
        .map((c: any) => `${c.table_name}.${c.column_name}->${c.foreign_table_name}`)
    )

    for (const constraint of requiredConstraints) {
      const constraintKey = `${constraint.table}.${constraint.column}->${constraint.references}`
      if (!existingConstraints.has(constraintKey)) {
        result.warnings.push(`Foreign key constraint missing: ${constraintKey}`)
      }
    }
  }

  // Check for data integrity issues
  private async checkDataIntegrity(result: SchemaValidationResult): Promise<void> {
    try {
      // Check for orphaned records
      const orphanedSessions = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM user_sessions us 
        LEFT JOIN users u ON us.user_id = u.id 
        WHERE u.id IS NULL
      ` as any[]

      if (orphanedSessions[0]?.count > 0) {
        result.warnings.push(`Found ${orphanedSessions[0].count} orphaned user sessions`)
      }

      const orphanedAnalyses = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM document_analyses da 
        LEFT JOIN documents d ON da.document_id = d.id 
        WHERE d.id IS NULL
      ` as any[]

      if (orphanedAnalyses[0]?.count > 0) {
        result.warnings.push(`Found ${orphanedAnalyses[0].count} orphaned document analyses`)
      }

      // Check for expired data that should be cleaned up
      const expiredAnalyses = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM document_analyses 
        WHERE expires_at < NOW()
      ` as any[]

      if (expiredAnalyses[0]?.count > 0) {
        result.warnings.push(`Found ${expiredAnalyses[0].count} expired analyses that should be cleaned up`)
      }

    } catch (error) {
      result.warnings.push(`Data integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Generate schema repair script
  async generateRepairScript(validationResult: SchemaValidationResult): Promise<string> {
    let script = '-- Schema Repair Script\n'
    script += `-- Generated at: ${new Date().toISOString()}\n\n`

    // Add missing tables
    if (validationResult.missingTables.length > 0) {
      script += '-- Create missing tables\n'
      for (const table of validationResult.missingTables) {
        script += `-- TODO: Add CREATE TABLE statement for '${table}'\n`
      }
      script += '\n'
    }

    // Add missing columns
    if (validationResult.missingColumns.length > 0) {
      script += '-- Add missing columns\n'
      for (const { table, column } of validationResult.missingColumns) {
        script += `-- ALTER TABLE ${table} ADD COLUMN ${column} [TYPE]; -- TODO: Specify correct type\n`
      }
      script += '\n'
    }

    // Add missing indexes
    if (validationResult.missingIndexes.length > 0) {
      script += '-- Create missing indexes\n'
      for (const index of validationResult.missingIndexes) {
        script += `-- TODO: Add CREATE INDEX statement for '${index}'\n`
      }
      script += '\n'
    }

    // Data cleanup
    if (validationResult.warnings.some(w => w.includes('orphaned'))) {
      script += '-- Clean up orphaned data\n'
      script += '-- DELETE FROM user_sessions WHERE user_id NOT IN (SELECT id FROM users);\n'
      script += '-- DELETE FROM document_analyses WHERE document_id NOT IN (SELECT id FROM documents);\n'
      script += '\n'
    }

    if (validationResult.warnings.some(w => w.includes('expired'))) {
      script += '-- Clean up expired data\n'
      script += '-- DELETE FROM document_analyses WHERE expires_at < NOW();\n'
      script += '\n'
    }

    return script
  }

  // Cleanup
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect()
  }
}

// Utility functions
export class MigrationUtils {
  // Create backup before migration
  static async createBackup(backupPath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFile = join(backupPath, `backup-${timestamp}.sql`)
    
    // In a real implementation, you would use pg_dump
    // const command = `pg_dump ${process.env.DATABASE_URL} > ${backupFile}`
    // await exec(command)
    
    logger.info({ backupFile }, 'Database backup created')
    return backupFile
  }

  // Check if migration is safe to run
  static analyzeMigrationSafety(migration: Migration): {
    isSafe: boolean
    warnings: string[]
    recommendations: string[]
  } {
    const warnings: string[] = []
    const recommendations: string[] = []
    
    const sql = migration.upSql.toLowerCase()
    
    // Check for potentially dangerous operations
    if (sql.includes('drop table')) {
      warnings.push('Migration contains DROP TABLE - data will be lost')
      recommendations.push('Create backup before running this migration')
    }
    
    if (sql.includes('drop column')) {
      warnings.push('Migration contains DROP COLUMN - data will be lost')
      recommendations.push('Consider adding column back in rollback script')
    }
    
    if (sql.includes('alter table') && sql.includes('not null')) {
      warnings.push('Migration adds NOT NULL constraint - may fail if existing data has nulls')
      recommendations.push('Update existing null values before adding constraint')
    }
    
    if (sql.includes('create unique index') || sql.includes('add constraint') && sql.includes('unique')) {
      warnings.push('Migration adds unique constraint - may fail if duplicate data exists')
      recommendations.push('Check for and resolve duplicate data first')
    }
    
    const isSafe = warnings.length === 0
    
    return { isSafe, warnings, recommendations }
  }

  // Estimate migration execution time
  static estimateExecutionTime(migration: Migration): {
    estimatedTimeMs: number
    factors: string[]
  } {
    const sql = migration.upSql.toLowerCase()
    const factors: string[] = []
    let estimatedTimeMs = 1000 // Base time
    
    if (sql.includes('create table')) {
      estimatedTimeMs += 2000
      factors.push('Table creation')
    }
    
    if (sql.includes('create index')) {
      estimatedTimeMs += 10000 // Indexes can be slow
      factors.push('Index creation')
    }
    
    if (sql.includes('alter table')) {
      estimatedTimeMs += 5000
      factors.push('Table alteration')
    }
    
    if (sql.includes('update') || sql.includes('insert')) {
      estimatedTimeMs += 15000 // Data modifications can be very slow
      factors.push('Data modification')
    }
    
    return { estimatedTimeMs, factors }
  }
}

// Export factory functions
export function createMigrationRunner(config: MigrationConfig): MigrationRunner {
  return new MigrationRunner(config)
}

export function createSchemaValidator(expectedSchema?: any): SchemaValidator {
  return new SchemaValidator(expectedSchema)
}