# Backup and Disaster Recovery Module for Fine Print AI
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

locals {
  backup_schedule = var.backup_config.backup_window
  retention_days  = var.backup_config.retention_days
}

# Backup namespace
resource "kubernetes_namespace" "backup" {
  metadata {
    name = "backup-system"
    labels = {
      name = "backup-system"
    }
  }
}

# Velero for Kubernetes backup and disaster recovery
resource "helm_release" "velero" {
  name       = "velero"
  repository = "https://vmware-tanzu.github.io/helm-charts"
  chart      = "velero"
  version    = "5.1.4"
  namespace  = kubernetes_namespace.backup.metadata[0].name

  values = [
    yamlencode({
      image = {
        repository = "velero/velero"
        tag        = "v1.12.1"
        pullPolicy = "IfNotPresent"
      }

      resources = {
        requests = {
          cpu    = "500m"
          memory = "128Mi"
        }
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }

      # Backup storage location configuration
      configuration = {
        backupStorageLocation = [
          {
            name     = "aws-backup"
            provider = "aws"
            bucket   = aws_s3_bucket.velero_backup.bucket
            config = {
              region = data.aws_region.current.name
              prefix = "velero"
            }
          }
        ]

        volumeSnapshotLocation = [
          {
            name     = "aws-snapshots"
            provider = "aws"
            config = {
              region = data.aws_region.current.name
            }
          }
        ]

        defaultBackupStorageLocation    = "aws-backup"
        defaultVolumeSnapshotLocations  = "aws-snapshots"
        defaultBackupTTL               = "${local.retention_days * 24}h"

        # Upload progress monitoring
        uploaderType = "restic"
      }

      # Service account configuration
      serviceAccount = {
        server = {
          create = true
          name   = "velero"
          annotations = {
            "eks.amazonaws.com/role-arn" = aws_iam_role.velero.arn
          }
        }
      }

      # Initialize Velero with restic
      initContainers = [
        {
          name            = "velero-plugin-for-aws"
          image           = "velero/velero-plugin-for-aws:v1.8.2"
          imagePullPolicy = "IfNotPresent"
          volumeMounts = [
            {
              mountPath = "/target"
              name      = "plugins"
            }
          ]
        }
      ]

      # Backup schedules
      schedules = {
        daily = {
          disabled = false
          schedule = "0 2 * * *"  # Daily at 2 AM
          template = {
            ttl              = "${local.retention_days * 24}h"
            includedNamespaces = ["fineprintai-${var.environment}"]
            snapshotVolumes    = true
            storageLocation    = "aws-backup"
            volumeSnapshotLocations = ["aws-snapshots"]
          }
        }
        
        weekly = {
          disabled = false
          schedule = "0 1 * * 0"  # Weekly on Sunday at 1 AM
          template = {
            ttl              = "672h"  # 4 weeks
            includedNamespaces = ["fineprintai-${var.environment}"]
            snapshotVolumes    = true
            storageLocation    = "aws-backup"
            volumeSnapshotLocations = ["aws-snapshots"]
          }
        }

        monthly = {
          disabled = var.environment != "production"
          schedule = "0 0 1 * *"  # Monthly on the 1st at midnight
          template = {
            ttl              = "8760h"  # 1 year
            includedNamespaces = ["fineprintai-${var.environment}"]
            snapshotVolumes    = true
            storageLocation    = "aws-backup"
            volumeSnapshotLocations = ["aws-snapshots"]
          }
        }
      }

      # Metrics and monitoring
      metrics = {
        enabled = true
        scrapeInterval = "30s"
        scrapeTimeout  = "10s"
        
        serviceMonitor = {
          enabled = true
          additionalLabels = {
            release = "prometheus-operator"
          }
        }
      }
    })
  ]

  depends_on = [
    aws_s3_bucket.velero_backup,
    aws_iam_role.velero
  ]
}

# AWS backup resources
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# S3 bucket for Velero backups
resource "aws_s3_bucket" "velero_backup" {
  bucket = "${var.project_name}-${var.environment}-velero-backup-${random_id.bucket_suffix.hex}"

  tags = {
    Name        = "${var.project_name}-${var.environment}-velero-backup"
    Environment = var.environment
    Purpose     = "Backup"
  }
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket_versioning" "velero_backup" {
  bucket = aws_s3_bucket.velero_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "velero_backup" {
  bucket = aws_s3_bucket.velero_backup.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "velero_backup" {
  bucket = aws_s3_bucket.velero_backup.id

  rule {
    id     = "backup_lifecycle"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }

    expiration {
      days = local.retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

resource "aws_s3_bucket_public_access_block" "velero_backup" {
  bucket = aws_s3_bucket.velero_backup.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM role for Velero
resource "aws_iam_role" "velero" {
  name = "${var.project_name}-${var.environment}-velero-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${replace(var.cluster_oidc_issuer_url, "https://", "")}"
        }
        Condition = {
          StringEquals = {
            "${replace(var.cluster_oidc_issuer_url, "https://", "")}:sub" = "system:serviceaccount:${kubernetes_namespace.backup.metadata[0].name}:velero"
            "${replace(var.cluster_oidc_issuer_url, "https://", "")}:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-velero-role"
    Environment = var.environment
  }
}

resource "aws_iam_policy" "velero" {
  name        = "${var.project_name}-${var.environment}-velero-policy"
  description = "Policy for Velero backup operations"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeVolumes",
          "ec2:DescribeSnapshots",
          "ec2:CreateTags",
          "ec2:CreateVolume",
          "ec2:CreateSnapshot",
          "ec2:DeleteSnapshot"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:PutObject",
          "s3:AbortMultipartUpload",
          "s3:ListMultipartUploadParts"
        ]
        Resource = "${aws_s3_bucket.velero_backup.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.velero_backup.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "velero" {
  role       = aws_iam_role.velero.name
  policy_arn = aws_iam_policy.velero.arn
}

# Database backup using AWS Backup
resource "aws_backup_vault" "main" {
  name        = "${var.project_name}-${var.environment}-backup-vault"
  kms_key_arn = aws_kms_key.backup.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-backup-vault"
    Environment = var.environment
  }
}

resource "aws_kms_key" "backup" {
  description             = "KMS key for backup encryption"
  deletion_window_in_days = 7

  tags = {
    Name        = "${var.project_name}-${var.environment}-backup-key"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "backup" {
  name          = "alias/${var.project_name}-${var.environment}-backup"
  target_key_id = aws_kms_key.backup.key_id
}

# Backup plan
resource "aws_backup_plan" "main" {
  name = "${var.project_name}-${var.environment}-backup-plan"

  rule {
    rule_name         = "daily_backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 2 ? * * *)"  # Daily at 2 AM

    lifecycle {
      cold_storage_after = 30
      delete_after       = local.retention_days
    }

    recovery_point_tags = {
      BackupType  = "Daily"
      Environment = var.environment
    }
  }

  rule {
    rule_name         = "weekly_backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 1 ? * SUN *)"  # Weekly on Sunday at 1 AM

    lifecycle {
      cold_storage_after = 30
      delete_after       = 2160  # 90 days
    }

    recovery_point_tags = {
      BackupType  = "Weekly"
      Environment = var.environment
    }
  }

  dynamic "rule" {
    for_each = var.environment == "production" ? [1] : []
    content {
      rule_name         = "monthly_backup"
      target_vault_name = aws_backup_vault.main.name
      schedule          = "cron(0 0 1 * ? *)"  # Monthly on 1st at midnight

      lifecycle {
        cold_storage_after = 30
        delete_after       = 8760  # 1 year
      }

      recovery_point_tags = {
        BackupType  = "Monthly"
        Environment = var.environment
      }
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-backup-plan"
    Environment = var.environment
  }
}

# IAM role for AWS Backup
resource "aws_iam_role" "backup" {
  name = "${var.project_name}-${var.environment}-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-backup-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "backup_restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# Backup selection for RDS
resource "aws_backup_selection" "rds" {
  count = length(var.rds_instance_arns) > 0 ? 1 : 0

  iam_role_arn = aws_iam_role.backup.arn
  name         = "${var.project_name}-${var.environment}-rds-backup"
  plan_id      = aws_backup_plan.main.id

  resources = var.rds_instance_arns

  condition {
    string_equals {
      key   = "aws:ResourceTag/Environment"
      value = var.environment
    }
  }
}

# Cross-region backup (for production)
resource "aws_backup_region_settings" "cross_region" {
  count = var.dr_config.enable_cross_cloud_dr && var.environment == "production" ? 1 : 0

  resource_type_opt_in_preference = {
    "Aurora"          = true
    "DocumentDB"      = true
    "DynamoDB"        = true
    "EBS"            = true
    "EC2"            = true
    "EFS"            = true
    "FSx"            = true
    "Neptune"        = true
    "RDS"            = true
    "Storage Gateway" = true
    "VirtualMachine"  = true
  }

  resource_type_management_preference = {
    "DynamoDB" = true
    "EFS"      = true
  }
}

# CloudWatch alarms for backup monitoring
resource "aws_cloudwatch_metric_alarm" "backup_job_failed" {
  alarm_name          = "${var.project_name}-${var.environment}-backup-job-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "NumberOfBackupJobsFailed"
  namespace           = "AWS/Backup"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors failed backup jobs"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    BackupVaultName = aws_backup_vault.main.name
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-backup-alarm"
    Environment = var.environment
  }
}

# SNS topic for backup alerts
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-backup-alerts"

  tags = {
    Name        = "${var.project_name}-${var.environment}-backup-alerts"
    Environment = var.environment
  }
}

# Disaster Recovery runbook
resource "kubernetes_config_map" "dr_runbook" {
  metadata {
    name      = "disaster-recovery-runbook"
    namespace = kubernetes_namespace.backup.metadata[0].name
  }

  data = {
    "dr-runbook.md" = templatefile("${path.module}/templates/dr-runbook.md.tpl", {
      project_name = var.project_name
      environment  = var.environment
      rto_minutes  = var.dr_config.rto_minutes
      rpo_minutes  = var.dr_config.rpo_minutes
      backup_bucket = aws_s3_bucket.velero_backup.bucket
      backup_vault  = aws_backup_vault.main.name
    })
    
    "backup-restore-procedures.md" = templatefile("${path.module}/templates/backup-restore.md.tpl", {
      project_name = var.project_name
      environment  = var.environment
      velero_namespace = kubernetes_namespace.backup.metadata[0].name
    })
  }
}

# Automated disaster recovery testing
resource "kubernetes_cron_job" "dr_test" {
  count = var.environment == "staging" ? 1 : 0

  metadata {
    name      = "dr-test"
    namespace = kubernetes_namespace.backup.metadata[0].name
  }

  spec {
    concurrency_policy            = "Forbid"
    failed_jobs_history_limit     = 3
    schedule                      = "0 3 * * 0"  # Weekly on Sunday at 3 AM
    successful_jobs_history_limit = 3

    job_template {
      metadata {
        labels = {
          app = "dr-test"
        }
      }

      spec {
        template {
          metadata {
            labels = {
              app = "dr-test"
            }
          }

          spec {
            restart_policy = "OnFailure"

            container {
              name  = "dr-test"
              image = "velero/velero:v1.12.1"

              command = ["/bin/sh"]
              args = [
                "-c",
                <<-EOF
                # Test backup restoration
                velero restore create --from-backup $(velero backup get -o json | jq -r '.items | sort_by(.metadata.creationTimestamp) | .[-1].metadata.name') --namespace-mappings fineprintai-${var.environment}:fineprintai-dr-test
                
                # Wait for restore to complete
                sleep 300
                
                # Verify restoration
                kubectl get pods -n fineprintai-dr-test
                
                # Cleanup test namespace
                kubectl delete namespace fineprintai-dr-test || true
                EOF
              ]

              env {
                name  = "VELERO_NAMESPACE"
                value = kubernetes_namespace.backup.metadata[0].name
              }
            }

            service_account_name = "velero"
          }
        }
      }
    }
  }
}

# Backup verification script
resource "kubernetes_config_map" "backup_verification" {
  metadata {
    name      = "backup-verification"
    namespace = kubernetes_namespace.backup.metadata[0].name
  }

  data = {
    "verify-backups.sh" = templatefile("${path.module}/scripts/verify-backups.sh", {
      environment = var.environment
      namespace   = kubernetes_namespace.backup.metadata[0].name
    })
  }
}

# Outputs
output "backup_namespace" {
  description = "Backup system namespace"
  value       = kubernetes_namespace.backup.metadata[0].name
}

output "backup_vault_name" {
  description = "AWS Backup vault name"
  value       = aws_backup_vault.main.name
}

output "velero_bucket_name" {
  description = "Velero backup S3 bucket name"
  value       = aws_s3_bucket.velero_backup.bucket
}

output "backup_schedule" {
  description = "Backup schedule configuration"
  value = {
    daily   = "0 2 * * *"
    weekly  = "0 1 * * 0"
    monthly = var.environment == "production" ? "0 0 1 * *" : "disabled"
  }
}

output "dr_metrics" {
  description = "Disaster recovery metrics"
  value = {
    rto_minutes = var.dr_config.rto_minutes
    rpo_minutes = var.dr_config.rpo_minutes
    retention_days = local.retention_days
  }
}