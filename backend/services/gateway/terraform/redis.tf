# ElastiCache Redis for Kong Gateway rate limiting and session storage

# Redis subnet group
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = data.aws_subnets.private.ids

  tags = local.common_tags
}

# Redis parameter group
resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7.x"
  name   = "${local.name_prefix}-redis"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "60"
  }

  tags = local.common_tags
}

# Security group for Redis
resource "aws_security_group" "redis" {
  name_prefix = "${local.name_prefix}-redis"
  vpc_id      = data.aws_vpc.main.id
  
  description = "Security group for Redis cluster"

  ingress {
    description = "Redis port from EKS nodes"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.main.cidr_block]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis"
  })
}

# Redis replication group
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id         = "${local.name_prefix}-redis"
  description                  = "Redis cluster for Kong Gateway"
  
  node_type                    = var.redis_node_type
  port                         = 6379
  parameter_group_name         = aws_elasticache_parameter_group.redis.name
  subnet_group_name            = aws_elasticache_subnet_group.redis.name
  security_group_ids           = [aws_security_group.redis.id]
  
  num_cache_clusters           = 2
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  
  engine_version              = "7.0"
  auto_minor_version_upgrade  = true
  
  # Authentication
  auth_token                  = random_password.redis_auth_token.result
  transit_encryption_enabled  = true
  at_rest_encryption_enabled  = true
  
  # Backup configuration
  snapshot_retention_limit    = 7
  snapshot_window            = "03:00-05:00"
  maintenance_window         = "sun:01:00-sun:03:00"
  
  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }
  
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "engine-log"
  }

  tags = local.common_tags
}

# Random password for Redis authentication
resource "random_password" "redis_auth_token" {
  length  = 32
  special = true
}

# Store Redis password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth" {
  name        = "${local.name_prefix}-redis-auth"
  description = "Redis authentication token for Kong Gateway"
  
  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id = aws_secretsmanager_secret.redis_auth.id
  secret_string = jsonencode({
    password = random_password.redis_auth_token.result
    endpoint = aws_elasticache_replication_group.redis.primary_endpoint_address
    port     = aws_elasticache_replication_group.redis.port
  })
}

# CloudWatch log groups for Redis
resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/redis/${local.name_prefix}/slow-log"
  retention_in_days = 14
  
  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "redis_engine" {
  name              = "/aws/elasticache/redis/${local.name_prefix}/engine-log"
  retention_in_days = 14
  
  tags = local.common_tags
}

# CloudWatch alarms for Redis
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.name_prefix}-redis-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors redis cpu utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis.id
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${local.name_prefix}-redis-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors redis memory utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis.id
  }

  tags = local.common_tags
}

# Data sources for VPC and subnets
data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = ["fineprintai-vpc"]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  
  filter {
    name   = "tag:Type"
    values = ["private"]
  }
}