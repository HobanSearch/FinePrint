# Backup and Disaster Recovery Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "backup_config" {
  description = "Backup configuration"
  type = object({
    retention_days        = number
    backup_window        = string
    cross_region_backup  = bool
  })
  default = {
    retention_days       = 30
    backup_window       = "03:00-04:00"
    cross_region_backup = false
  }
}

variable "dr_config" {
  description = "Disaster recovery configuration"
  type = object({
    rto_minutes           = number
    rpo_minutes           = number
    enable_cross_cloud_dr = bool
  })
  default = {
    rto_minutes           = 240  # 4 hours
    rpo_minutes           = 60   # 1 hour
    enable_cross_cloud_dr = false
  }
}

variable "backup_resources" {
  description = "Resources to backup"
  type = object({
    databases              = bool
    kubernetes_manifests   = bool
    application_data       = bool
    configuration         = bool
  })
  default = {
    databases              = true
    kubernetes_manifests   = true
    application_data       = true
    configuration         = true
  }
}

variable "cluster_oidc_issuer_url" {
  description = "OIDC issuer URL for the EKS cluster"
  type        = string
  default     = ""
}

variable "rds_instance_arns" {
  description = "List of RDS instance ARNs to backup"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}