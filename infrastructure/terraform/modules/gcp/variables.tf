# GCP Module Variables

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-west1"
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

variable "node_pools" {
  description = "Node pool configurations"
  type = map(object({
    machine_type         = string
    min_count           = number
    max_count           = number
    initial_node_count  = number
    accelerator_type    = optional(string)
    accelerator_count   = optional(number)
    taints             = optional(list(object({
      key    = string
      value  = string
      effect = string
    })))
  }))
  default = {
    general = {
      machine_type        = "e2-standard-2"
      min_count          = 2
      max_count          = 6
      initial_node_count = 2
    }
  }
}

variable "enable_cloud_sql" {
  description = "Enable Cloud SQL PostgreSQL"
  type        = bool
  default     = true
}

variable "database_config" {
  description = "Database configuration"
  type = object({
    database_version   = string
    tier              = string
    disk_size         = number
    backup_enabled    = bool
    backup_start_time = string
  })
  default = {
    database_version   = "POSTGRES_16"
    tier              = "db-custom-2-8192"
    disk_size         = 20
    backup_enabled    = true
    backup_start_time = "03:00"
  }
}

variable "enable_memorystore" {
  description = "Enable Memorystore Redis"
  type        = bool
  default     = true
}

variable "redis_config" {
  description = "Redis configuration"
  type = object({
    memory_size_gb = number
    tier          = string
  })
  default = {
    memory_size_gb = 1
    tier          = "BASIC"
  }
}

variable "storage_buckets" {
  description = "Storage bucket configurations"
  type = map(object({
    location      = string
    storage_class = string
    versioning    = bool
  }))
  default = {
    documents = {
      location      = "US"
      storage_class = "STANDARD"
      versioning    = true
    }
  }
}

variable "enable_load_balancer" {
  description = "Enable Global HTTP(S) Load Balancer"
  type        = bool
  default     = true
}

variable "ssl_certificate_domains" {
  description = "Domains for SSL certificate"
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels to apply to all resources"
  type        = map(string)
  default     = {}
}