# Fine Print AI - Terraform Variables

# General Configuration
variable "name_prefix" {
  description = "Name prefix for all resources"
  type        = string
  default     = "fineprintai"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-west-2"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "fineprintai.com"
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# EKS Configuration
variable "kubernetes_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.29"
}

# RDS Configuration
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "db_allocated_storage" {
  description = "Initial allocated storage for RDS (GB)"
  type        = number
  default     = 100
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage for RDS (GB)"
  type        = number
  default     = 1000
}

variable "db_backup_retention_period" {
  description = "RDS backup retention period (days)"
  type        = number
  default     = 7
}

variable "db_backup_window" {
  description = "RDS backup window"
  type        = string
  default     = "03:00-04:00"
}

variable "db_maintenance_window" {
  description = "RDS maintenance window"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r7g.large"
}

variable "redis_num_nodes" {
  description = "Number of Redis nodes"
  type        = number
  default     = 2
}

# Monitoring Configuration
variable "enable_monitoring" {
  description = "Enable detailed monitoring"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

# Security Configuration
variable "enable_encryption" {
  description = "Enable encryption at rest"
  type        = bool
  default     = true
}

variable "enable_backup" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

# Cost Optimization
variable "enable_spot_instances" {
  description = "Enable spot instances for worker nodes"
  type        = bool
  default     = true
}

variable "auto_scaling_enabled" {
  description = "Enable cluster auto scaling"
  type        = bool
  default     = true
}

# Environment-specific configurations
variable "environment_config" {
  description = "Environment-specific configuration overrides"
  type = map(object({
    node_groups = map(object({
      desired_size   = number
      max_size       = number
      min_size       = number
      instance_types = list(string)
    }))
    db_instance_class = string
    redis_node_type   = string
  }))
  
  default = {
    dev = {
      node_groups = {
        general = {
          desired_size   = 2
          max_size       = 4
          min_size       = 1
          instance_types = ["t3.medium"]
        }
        ai_workloads = {
          desired_size   = 1
          max_size       = 2
          min_size       = 0
          instance_types = ["g4dn.xlarge"]
        }
      }
      db_instance_class = "db.t3.micro"
      redis_node_type   = "cache.t3.micro"
    }
    
    staging = {
      node_groups = {
        general = {
          desired_size   = 2
          max_size       = 6
          min_size       = 2
          instance_types = ["t3.medium", "t3.large"]
        }
        ai_workloads = {
          desired_size   = 1
          max_size       = 3
          min_size       = 1
          instance_types = ["g4dn.xlarge"]
        }
      }
      db_instance_class = "db.r6g.large"
      redis_node_type   = "cache.r7g.large"
    }
    
    prod = {
      node_groups = {
        general = {
          desired_size   = 3
          max_size       = 10
          min_size       = 3
          instance_types = ["t3.large", "t3.xlarge"]
        }
        ai_workloads = {
          desired_size   = 2
          max_size       = 5
          min_size       = 2
          instance_types = ["g4dn.xlarge", "g4dn.2xlarge"]
        }
      }
      db_instance_class = "db.r6g.xlarge"
      redis_node_type   = "cache.r7g.xlarge"
    }
  }
}

# Feature flags
variable "features" {
  description = "Feature flags for optional components"
  type = object({
    enable_gpu_nodes      = bool
    enable_istio         = bool
    enable_argocd        = bool
    enable_cert_manager  = bool
    enable_external_dns  = bool
    enable_velero        = bool
  })
  
  default = {
    enable_gpu_nodes      = true
    enable_istio         = false
    enable_argocd        = true
    enable_cert_manager  = true
    enable_external_dns  = true
    enable_velero        = true
  }
}

# Tags
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}