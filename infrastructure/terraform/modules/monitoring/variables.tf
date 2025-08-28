# Monitoring Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "domain" {
  description = "Domain name for monitoring services"
  type        = string
}

variable "kubernetes_clusters" {
  description = "Kubernetes clusters to monitor"
  type = map(object({
    endpoint       = string
    ca_certificate = string
    region         = string
  }))
  default = {}
}

variable "grafana_config" {
  description = "Grafana configuration"
  type = object({
    admin_password = string
    domain         = string
  })
}

variable "alert_channels" {
  description = "Alert channel configurations"
  type = object({
    slack = object({
      webhook_url = string
    })
    pagerduty = object({
      integration_key = string
    })
    email = object({
      addresses = list(string)
    })
  })
  default = {
    slack = {
      webhook_url = ""
    }
    pagerduty = {
      integration_key = ""
    }
    email = {
      addresses = []
    }
  }
}

variable "basic_auth_password" {
  description = "Basic auth password for monitoring services"
  type        = string
  sensitive   = true
  default     = "changeme"
}

variable "prometheus_remote_write_enabled" {
  description = "Enable Prometheus remote write"
  type        = bool
  default     = false
}

variable "prometheus_remote_write_url" {
  description = "Prometheus remote write URL"
  type        = string
  default     = ""
}

variable "prometheus_remote_write_username" {
  description = "Prometheus remote write username"
  type        = string
  sensitive   = true
  default     = ""
}

variable "prometheus_remote_write_password" {
  description = "Prometheus remote write password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "retention_days" {
  description = "Data retention in days"
  type        = number
  default     = 30
}

variable "enable_jaeger" {
  description = "Enable Jaeger tracing"
  type        = bool
  default     = true
}

variable "enable_loki" {
  description = "Enable Loki log aggregation"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}