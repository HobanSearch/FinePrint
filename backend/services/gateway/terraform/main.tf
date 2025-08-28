# Fine Print AI Gateway Infrastructure
# Terraform configuration for Kong Gateway and supporting services

terraform {
  required_version = ">= 1.5"
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
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    bucket  = "fineprintai-terraform-state"
    key     = "gateway/terraform.tfstate"
    region  = "us-west-2"
    encrypt = true
    
    dynamodb_table = "fineprintai-terraform-locks"
  }
}

# Provider configurations
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "FinePrintAI"
      Component   = "Gateway"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", var.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.cluster.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", var.cluster_name]
    }
  }
}

# Data sources
data "aws_eks_cluster" "cluster" {
  name = var.cluster_name
}

data "aws_eks_cluster_auth" "cluster" {
  name = var.cluster_name
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Local values
locals {
  name_prefix = "fineprintai-gateway"
  common_tags = {
    Project     = "FinePrintAI"
    Component   = "Gateway"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "fineprintai-cluster"
}

variable "gateway_replicas" {
  description = "Number of Kong gateway replicas"
  type        = number
  default     = 3
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "domain_name" {
  description = "Domain name for the API gateway"
  type        = string
  default     = "api.fineprintai.com"
}

variable "certificate_arn" {
  description = "ACM certificate ARN for SSL"
  type        = string
  default     = ""
}

# Outputs
output "gateway_endpoint" {
  description = "Kong Gateway endpoint"
  value       = kubernetes_service.kong_proxy.status[0].load_balancer[0].ingress[0].hostname
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "namespace" {
  description = "Kubernetes namespace"
  value       = kubernetes_namespace.gateway.metadata[0].name
}