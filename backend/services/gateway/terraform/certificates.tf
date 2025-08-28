# TLS certificates and secrets for Kong Gateway

# Random passwords for JWT secrets
resource "random_password" "jwt_free" {
  length  = 32
  special = true
}

resource "random_password" "jwt_starter" {
  length  = 32
  special = true
}

resource "random_password" "jwt_professional" {
  length  = 32
  special = true
}

resource "random_password" "jwt_team" {
  length  = 32
  special = true
}

# RSA key pair for enterprise JWT
resource "tls_private_key" "enterprise_jwt" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

# Self-signed certificate for Kong (development/internal)
resource "tls_private_key" "kong" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "kong" {
  private_key_pem = tls_private_key.kong.private_key_pem

  subject {
    common_name  = "*.fineprintai.com"
    organization = "Fine Print AI"
  }

  validity_period_hours = 8760 # 1 year

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]

  dns_names = [
    "fineprintai.com",
    "*.fineprintai.com",
    "api.fineprintai.com",
    "admin.fineprintai.com",
    "kong-proxy.fineprintai-gateway.svc.cluster.local",
    "kong-admin.fineprintai-gateway.svc.cluster.local",
  ]
}

# ACM certificate for production (if not provided)
resource "aws_acm_certificate" "main" {
  count = var.certificate_arn == "" ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# Route 53 records for ACM certificate validation
resource "aws_route53_record" "cert_validation" {
  count = var.certificate_arn == "" ? length(aws_acm_certificate.main[0].domain_validation_options) : 0

  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = tolist(aws_acm_certificate.main[0].domain_validation_options)[count.index].resource_record_name
  type    = tolist(aws_acm_certificate.main[0].domain_validation_options)[count.index].resource_record_type
  records = [tolist(aws_acm_certificate.main[0].domain_validation_options)[count.index].resource_record_value]
  ttl     = 60
}

# ACM certificate validation
resource "aws_acm_certificate_validation" "main" {
  count = var.certificate_arn == "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = aws_route53_record.cert_validation[*].fqdn

  timeouts {
    create = "10m"
  }
}

# Data source for Route 53 zone (only if we're creating certificate)
data "aws_route53_zone" "main" {
  count = var.certificate_arn == "" ? 1 : 0

  name         = var.domain_name
  private_zone = false
}

# Store JWT secrets in AWS Secrets Manager
resource "aws_secretsmanager_secret" "jwt_secrets" {
  name        = "${local.name_prefix}-jwt-secrets"
  description = "JWT secrets for Kong Gateway authentication"
  
  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jwt_secrets" {
  secret_id = aws_secretsmanager_secret.jwt_secrets.id
  secret_string = jsonencode({
    free_secret                = random_password.jwt_free.result
    starter_secret            = random_password.jwt_starter.result
    professional_secret       = random_password.jwt_professional.result
    team_secret               = random_password.jwt_team.result
    enterprise_private_key    = tls_private_key.enterprise_jwt.private_key_pem
    enterprise_public_key     = tls_private_key.enterprise_jwt.public_key_pem
  })
}

# Store Kong SSL certificates in AWS Secrets Manager
resource "aws_secretsmanager_secret" "kong_ssl" {
  name        = "${local.name_prefix}-ssl-certs"
  description = "SSL certificates for Kong Gateway"
  
  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "kong_ssl" {
  secret_id = aws_secretsmanager_secret.kong_ssl.id
  secret_string = jsonencode({
    certificate = tls_self_signed_cert.kong.cert_pem
    private_key = tls_private_key.kong.private_key_pem
  })
}

# SNS topic for certificate expiration alerts
resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
  
  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "email_alerts" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "devops@fineprintai.com"
}

# CloudWatch alarm for certificate expiration
resource "aws_cloudwatch_metric_alarm" "cert_expiration" {
  count = var.certificate_arn == "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-cert-expiration"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "DaysToExpiry"
  namespace           = "AWS/CertificateManager"
  period              = "86400" # 24 hours
  statistic           = "Average"
  threshold           = "30" # 30 days
  alarm_description   = "Certificate expires in less than 30 days"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    CertificateArn = aws_acm_certificate.main[0].arn
  }

  tags = local.common_tags
}

# Outputs for certificate information
output "certificate_arn" {
  description = "ACM certificate ARN"
  value       = var.certificate_arn != "" ? var.certificate_arn : (length(aws_acm_certificate.main) > 0 ? aws_acm_certificate.main[0].arn : "")
}

output "jwt_secrets_arn" {
  description = "JWT secrets ARN in Secrets Manager"
  value       = aws_secretsmanager_secret.jwt_secrets.arn
  sensitive   = true
}

output "kong_ssl_arn" {
  description = "Kong SSL certificates ARN in Secrets Manager"
  value       = aws_secretsmanager_secret.kong_ssl.arn
  sensitive   = true
}