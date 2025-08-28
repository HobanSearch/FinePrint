# Security Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_config" {
  description = "AWS security configuration"
  type = object({
    enable_guardduty     = bool
    enable_security_hub  = bool
    enable_config        = bool
    enable_cloudtrail    = bool
    enable_vpc_flow_logs = bool
  })
  default = null
}

variable "gcp_config" {
  description = "GCP security configuration"
  type = object({
    enable_security_center      = bool
    enable_cloud_armor         = bool
    enable_binary_authorization = bool
    enable_audit_logs          = bool
  })
  default = null
}

variable "azure_config" {
  description = "Azure security configuration"
  type = object({
    enable_security_center = bool
    enable_sentinel        = bool
    enable_policy          = bool
    enable_activity_logs   = bool
  })
  default = null
}

variable "compliance_standards" {
  description = "Compliance standards to adhere to"
  type        = list(string)
  default     = ["SOC2", "ISO27001", "GDPR", "CCPA"]
}

variable "security_policies" {
  description = "Security policies configuration"
  type = object({
    password_policy = object({
      min_length        = number
      require_uppercase = bool
      require_lowercase = bool
      require_numbers   = bool
      require_symbols   = bool
    })
    network_policy = object({
      default_deny          = bool
      allowed_ingress_cidrs = list(string)
    })
    encryption_policy = object({
      encryption_at_rest    = bool
      encryption_in_transit = bool
      key_rotation_days     = number
    })
  })
  default = {
    password_policy = {
      min_length        = 12
      require_uppercase = true
      require_lowercase = true
      require_numbers   = true
      require_symbols   = true
    }
    network_policy = {
      default_deny          = true
      allowed_ingress_cidrs = ["0.0.0.0/0"]
    }
    encryption_policy = {
      encryption_at_rest    = true
      encryption_in_transit = true
      key_rotation_days     = 90
    }
  }
}