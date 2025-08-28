# Fine Print AI - Terraform Infrastructure
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "s3" {
    bucket  = "fineprintai-terraform-state"
    key     = "infrastructure/terraform.tfstate"
    region  = "us-west-2"
    encrypt = true
    
    dynamodb_table = "fineprintai-terraform-locks"
  }
}

# Local variables
locals {
  name_prefix = var.name_prefix
  environment = var.environment
  region      = var.aws_region
  
  common_tags = {
    Project     = "fineprintai"
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "fineprintai-team"
  }

  # Kubernetes cluster configuration
  cluster_name = "${local.name_prefix}-${local.environment}-cluster"
  
  # VPC configuration
  vpc_cidr = var.vpc_cidr
  availability_zones = data.aws_availability_zones.available.names
  
  # Database configuration
  db_name = "fineprintai"
  db_username = "postgres"
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Random password for RDS
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"
  
  name_prefix        = local.name_prefix
  environment       = local.environment
  vpc_cidr          = local.vpc_cidr
  availability_zones = local.availability_zones
  
  tags = local.common_tags
}

# EKS Cluster Module
module "eks" {
  source = "./modules/eks"
  
  name_prefix = local.name_prefix
  environment = local.environment
  
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  node_subnet_ids = module.vpc.private_subnet_ids
  
  cluster_version = var.kubernetes_version
  
  node_groups = {
    general = {
      desired_size = 3
      max_size     = 10
      min_size     = 2
      
      instance_types = ["t3.medium", "t3.large"]
      capacity_type  = "ON_DEMAND"
      
      k8s_labels = {
        role = "general"
      }
      
      taints = []
    }
    
    ai_workloads = {
      desired_size = 2
      max_size     = 5
      min_size     = 1
      
      instance_types = ["g4dn.xlarge", "g4dn.2xlarge"]
      capacity_type  = "SPOT"
      
      k8s_labels = {
        role = "ai"
        "node.kubernetes.io/instance-type" = "gpu"
      }
      
      taints = [
        {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
    }
  }
  
  tags = local.common_tags
}

# RDS PostgreSQL Module
module "rds" {
  source = "./modules/rds"
  
  name_prefix = local.name_prefix
  environment = local.environment
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.database_subnet_ids
  
  db_instance_class = var.db_instance_class
  db_name          = local.db_name
  db_username      = local.db_username
  db_password      = random_password.db_password.result
  
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  
  backup_retention_period = var.db_backup_retention_period
  backup_window          = var.db_backup_window
  maintenance_window     = var.db_maintenance_window
  
  performance_insights_enabled = true
  monitoring_interval         = 60
  
  tags = local.common_tags
}

# ElastiCache Redis Module
module "redis" {
  source = "./modules/redis"
  
  name_prefix = local.name_prefix
  environment = local.environment
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  
  node_type         = var.redis_node_type
  num_cache_nodes   = var.redis_num_nodes
  parameter_group   = "default.redis7"
  engine_version    = "7.0"
  
  tags = local.common_tags
}

# S3 Buckets Module
module "s3" {
  source = "./modules/s3"
  
  name_prefix = local.name_prefix
  environment = local.environment
  
  buckets = {
    application-data = {
      versioning_enabled = true
      lifecycle_enabled  = true
      encryption_enabled = true
      public_access_blocked = true
    }
    
    model-storage = {
      versioning_enabled = true
      lifecycle_enabled  = true
      encryption_enabled = true
      public_access_blocked = true
    }
    
    backups = {
      versioning_enabled = true
      lifecycle_enabled  = true
      encryption_enabled = true
      public_access_blocked = true
      lifecycle_rules = [
        {
          id     = "delete_old_backups"
          status = "Enabled"
          expiration_days = 90
        }
      ]
    }
  }
  
  tags = local.common_tags
}

# Application Load Balancer Module
module "alb" {
  source = "./modules/alb"
  
  name_prefix = local.name_prefix
  environment = local.environment
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.public_subnet_ids
  
  certificate_domain = var.domain_name
  
  tags = local.common_tags
}

# Route53 DNS Module
module "route53" {
  source = "./modules/route53"
  
  domain_name = var.domain_name
  environment = local.environment
  
  alb_dns_name    = module.alb.dns_name
  alb_zone_id     = module.alb.zone_id
  
  tags = local.common_tags
}

# IAM Roles and Policies Module
module "iam" {
  source = "./modules/iam"
  
  name_prefix = local.name_prefix
  environment = local.environment
  
  cluster_name = module.eks.cluster_name
  
  tags = local.common_tags
}

# Secrets Manager
resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${local.name_prefix}-${local.environment}-db-credentials"
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-${local.environment}-db-credentials"
  })
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = local.db_username
    password = random_password.db_password.result
    engine   = "postgres"
    host     = module.rds.endpoint
    port     = module.rds.port
    dbname   = local.db_name
  })
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "application_logs" {
  name              = "/aws/eks/${local.cluster_name}/application"
  retention_in_days = 30
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-${local.environment}-app-logs"
  })
}

resource "aws_cloudwatch_log_group" "cluster_logs" {
  name              = "/aws/eks/${local.cluster_name}/cluster"
  retention_in_days = 7
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-${local.environment}-cluster-logs"
  })
}

# Parameter Store for configuration
resource "aws_ssm_parameter" "cluster_endpoint" {
  name  = "/${local.name_prefix}/${local.environment}/cluster/endpoint"
  type  = "String"
  value = module.eks.cluster_endpoint
  
  tags = local.common_tags
}

resource "aws_ssm_parameter" "cluster_name" {
  name  = "/${local.name_prefix}/${local.environment}/cluster/name"
  type  = "String"
  value = module.eks.cluster_name
  
  tags = local.common_tags
}

resource "aws_ssm_parameter" "rds_endpoint" {
  name  = "/${local.name_prefix}/${local.environment}/rds/endpoint"
  type  = "String"
  value = module.rds.endpoint
  
  tags = local.common_tags
}

resource "aws_ssm_parameter" "redis_endpoint" {
  name  = "/${local.name_prefix}/${local.environment}/redis/endpoint"
  type  = "String"
  value = module.redis.primary_endpoint
  
  tags = local.common_tags
}

# Output values
output "cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "Endpoint of the EKS cluster"
  value       = module.eks.cluster_endpoint
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = module.redis.primary_endpoint
}

output "s3_buckets" {
  description = "Created S3 buckets"
  value       = module.s3.bucket_names
}

output "load_balancer_dns" {
  description = "Load balancer DNS name"
  value       = module.alb.dns_name
}