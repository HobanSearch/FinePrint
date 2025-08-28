# Kubernetes resources for Kong Gateway deployment

# Namespace
resource "kubernetes_namespace" "gateway" {
  metadata {
    name = "fineprintai-gateway"
    
    labels = {
      "app.kubernetes.io/name"       = "fineprintai-gateway"
      "app.kubernetes.io/component"  = "api-gateway"
      "app.kubernetes.io/managed-by" = "terraform"
      "environment"                  = var.environment
    }
    
    annotations = {
      "description" = "Fine Print AI API Gateway namespace with Kong"
    }
  }
}

# Service Account
resource "kubernetes_service_account" "kong" {
  metadata {
    name      = "kong-serviceaccount"
    namespace = kubernetes_namespace.gateway.metadata[0].name
    
    labels = {
      app = "kong-gateway"
    }
  }
}

# Cluster Role
resource "kubernetes_cluster_role" "kong" {
  metadata {
    name = "kong-clusterrole"
  }

  rule {
    api_groups = [""]
    resources  = ["services", "endpoints"]
    verbs      = ["get", "list", "watch"]
  }

  rule {
    api_groups = [""]
    resources  = ["secrets"]
    verbs      = ["get", "list"]
  }

  rule {
    api_groups = ["extensions", "networking.k8s.io"]
    resources  = ["ingresses"]
    verbs      = ["get", "list", "watch"]
  }
}

# Cluster Role Binding
resource "kubernetes_cluster_role_binding" "kong" {
  metadata {
    name = "kong-clusterrolebinding"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.kong.metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account.kong.metadata[0].name
    namespace = kubernetes_namespace.gateway.metadata[0].name
  }
}

# Kong ConfigMap with declarative configuration
resource "kubernetes_config_map" "kong_config" {
  metadata {
    name      = "kong-config"
    namespace = kubernetes_namespace.gateway.metadata[0].name
    
    labels = {
      app       = "kong-gateway"
      component = "config"
    }
  }

  data = {
    "kong.yml" = templatefile("${path.module}/../kong/kong.yml", {
      redis_host = aws_elasticache_replication_group.redis.primary_endpoint_address
      redis_port = aws_elasticache_replication_group.redis.port
    })
  }
}

# JWT Secrets
resource "kubernetes_secret" "kong_jwt_secrets" {
  metadata {
    name      = "kong-jwt-secrets"
    namespace = kubernetes_namespace.gateway.metadata[0].name
  }

  type = "Opaque"

  data = {
    "free-secret"                = random_password.jwt_free.result
    "starter-secret"            = random_password.jwt_starter.result
    "professional-secret"       = random_password.jwt_professional.result
    "team-secret"               = random_password.jwt_team.result
    "enterprise-public-key"     = tls_private_key.enterprise_jwt.public_key_pem
  }
}

# SSL Certificates Secret
resource "kubernetes_secret" "kong_ssl_certs" {
  metadata {
    name      = "kong-ssl-certs"
    namespace = kubernetes_namespace.gateway.metadata[0].name
  }

  type = "kubernetes.io/tls"

  data = {
    "tls.crt" = tls_self_signed_cert.kong.cert_pem
    "tls.key" = tls_private_key.kong.private_key_pem
  }
}

# Kong Deployment
resource "kubernetes_deployment" "kong" {
  metadata {
    name      = "kong-gateway"
    namespace = kubernetes_namespace.gateway.metadata[0].name
    
    labels = {
      app       = "kong-gateway"
      component = "api-gateway"
      version   = "3.7.1"
    }
  }

  spec {
    replicas = var.gateway_replicas

    strategy {
      type = "RollingUpdate"
      rolling_update {
        max_surge       = "1"
        max_unavailable = "0"
      }
    }

    selector {
      match_labels = {
        app = "kong-gateway"
      }
    }

    template {
      metadata {
        labels = {
          app       = "kong-gateway"
          component = "api-gateway"
          version   = "3.7.1"
        }
        
        annotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "8100"
          "prometheus.io/path"   = "/metrics"
        }
      }

      spec {
        service_account_name = kubernetes_service_account.kong.metadata[0].name
        
        security_context {
          run_as_non_root = true
          run_as_user     = 100
          fs_group        = 101
        }

        container {
          name  = "kong"
          image = "fineprintai/kong-gateway:latest"
          
          port {
            container_port = 8000
            name           = "proxy"
            protocol       = "TCP"
          }
          
          port {
            container_port = 8443
            name           = "proxy-ssl"
            protocol       = "TCP"
          }
          
          port {
            container_port = 8001
            name           = "admin"
            protocol       = "TCP"
          }
          
          port {
            container_port = 8444
            name           = "admin-ssl"
            protocol       = "TCP"
          }
          
          port {
            container_port = 8100
            name           = "status"
            protocol       = "TCP"
          }

          env {
            name  = "KONG_DATABASE"
            value = "off"
          }
          
          env {
            name  = "KONG_DECLARATIVE_CONFIG"
            value = "/etc/kong/declarative/kong.yml"
          }
          
          env {
            name  = "KONG_PROXY_LISTEN"
            value = "0.0.0.0:8000, 0.0.0.0:8443 ssl"
          }
          
          env {
            name  = "KONG_ADMIN_LISTEN"
            value = "0.0.0.0:8001, 0.0.0.0:8444 ssl"
          }
          
          env {
            name  = "KONG_STATUS_LISTEN"
            value = "0.0.0.0:8100"
          }
          
          env {
            name  = "KONG_LOG_LEVEL"
            value = "info"
          }
          
          env {
            name  = "KONG_PLUGINS"
            value = "bundled,custom-auth,custom-rate-limit,custom-circuit-breaker"
          }

          env {
            name = "KONG_JWT_FREE_SECRET"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.kong_jwt_secrets.metadata[0].name
                key  = "free-secret"
              }
            }
          }

          env {
            name = "KONG_JWT_STARTER_SECRET"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.kong_jwt_secrets.metadata[0].name
                key  = "starter-secret"
              }
            }
          }

          resources {
            requests = {
              cpu    = "500m"
              memory = "512Mi"
            }
            limits = {
              cpu    = "2"
              memory = "2Gi"
            }
          }

          volume_mount {
            name       = "kong-config"
            mount_path = "/etc/kong/declarative"
            read_only  = true
          }

          volume_mount {
            name       = "kong-ssl-certs"
            mount_path = "/etc/kong/ssl"
            read_only  = true
          }

          liveness_probe {
            http_get {
              path = "/status"
              port = 8100
            }
            initial_delay_seconds = 30
            timeout_seconds       = 10
            period_seconds        = 30
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/status/ready"
              port = 8100
            }
            initial_delay_seconds = 10
            timeout_seconds       = 5
            period_seconds        = 10
            failure_threshold     = 3
          }

          lifecycle {
            pre_stop {
              exec {
                command = ["/bin/sh", "-c", "kong quit --wait=15"]
              }
            }
          }
        }

        # Health service container
        container {
          name  = "health-service"
          image = "fineprintai/gateway-health:latest"
          
          port {
            container_port = 8003
            name           = "health"
            protocol       = "TCP"
          }
          
          port {
            container_port = 9090
            name           = "metrics"
            protocol       = "TCP"
          }

          env {
            name  = "NODE_ENV"
            value = "production"
          }
          
          env {
            name  = "KONG_ADMIN_URL"
            value = "http://localhost:8001"
          }
          
          env {
            name  = "REDIS_URL"
            value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
          }
          
          env {
            name  = "METRICS_PORT"
            value = "9090"
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }

          liveness_probe {
            http_get {
              path = "/health/live"
              port = 8003
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/health/ready"
              port = 8003
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }
        }

        volume {
          name = "kong-config"
          config_map {
            name = kubernetes_config_map.kong_config.metadata[0].name
          }
        }

        volume {
          name = "kong-ssl-certs"
          secret {
            secret_name = kubernetes_secret.kong_ssl_certs.metadata[0].name
          }
        }

        affinity {
          pod_anti_affinity {
            preferred_during_scheduling_ignored_during_execution {
              weight = 100
              pod_affinity_term {
                label_selector {
                  match_expressions {
                    key      = "app"
                    operator = "In"
                    values   = ["kong-gateway"]
                  }
                }
                topology_key = "kubernetes.io/hostname"
              }
            }
          }
        }

        toleration {
          key      = "gateway-node"
          operator = "Equal"
          value    = "true"
          effect   = "NoSchedule"
        }
      }
    }
  }
}

# Kong Proxy Service (LoadBalancer)
resource "kubernetes_service" "kong_proxy" {
  metadata {
    name      = "kong-proxy"
    namespace = kubernetes_namespace.gateway.metadata[0].name
    
    labels = {
      app       = "kong-gateway"
      component = "proxy"
    }
    
    annotations = {
      "service.beta.kubernetes.io/aws-load-balancer-type"                              = "nlb"
      "service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled" = "true"
      "service.beta.kubernetes.io/aws-load-balancer-backend-protocol"                  = "tcp"
      "external-dns.alpha.kubernetes.io/hostname"                                      = var.domain_name
    }
  }

  spec {
    type = "LoadBalancer"
    
    port {
      name        = "proxy"
      port        = 80
      target_port = 8000
      protocol    = "TCP"
    }
    
    port {
      name        = "proxy-ssl"
      port        = 443
      target_port = 8443
      protocol    = "TCP"
    }

    selector = {
      app = "kong-gateway"
    }

    session_affinity = "None"
  }
}

# Kong Admin Service (ClusterIP)
resource "kubernetes_service" "kong_admin" {
  metadata {
    name      = "kong-admin"
    namespace = kubernetes_namespace.gateway.metadata[0].name
    
    labels = {
      app       = "kong-gateway"
      component = "admin"
    }
  }

  spec {
    type = "ClusterIP"
    
    port {
      name        = "admin"
      port        = 8001
      target_port = 8001
      protocol    = "TCP"
    }
    
    port {
      name        = "admin-ssl"
      port        = 8444
      target_port = 8444
      protocol    = "TCP"
    }

    selector = {
      app = "kong-gateway"
    }
  }
}

# Kong Health Service
resource "kubernetes_service" "kong_health" {
  metadata {
    name      = "kong-health"
    namespace = kubernetes_namespace.gateway.metadata[0].name
    
    labels = {
      app       = "kong-gateway"
      component = "health"
    }
  }

  spec {
    type = "ClusterIP"
    
    port {
      name        = "health"
      port        = 8003
      target_port = 8003
      protocol    = "TCP"
    }
    
    port {
      name        = "metrics"
      port        = 9090
      target_port = 9090
      protocol    = "TCP"
    }
    
    port {
      name        = "status"
      port        = 8100
      target_port = 8100
      protocol    = "TCP"
    }

    selector = {
      app = "kong-gateway"
    }
  }
}

# Horizontal Pod Autoscaler
resource "kubernetes_horizontal_pod_autoscaler_v2" "kong" {
  metadata {
    name      = "kong-gateway-hpa"
    namespace = kubernetes_namespace.gateway.metadata[0].name
  }

  spec {
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.kong.metadata[0].name
    }

    min_replicas = 2
    max_replicas = 10

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 70
        }
      }
    }

    metric {
      type = "Resource"
      resource {
        name = "memory"
        target {
          type                = "Utilization"
          average_utilization = 80
        }
      }
    }
  }
}

# Pod Disruption Budget
resource "kubernetes_pod_disruption_budget_v1" "kong" {
  metadata {
    name      = "kong-gateway-pdb"
    namespace = kubernetes_namespace.gateway.metadata[0].name
  }

  spec {
    min_available = "50%"
    
    selector {
      match_labels = {
        app = "kong-gateway"
      }
    }
  }
}