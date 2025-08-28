# Comprehensive Monitoring Module for Fine Print AI
terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

# Monitoring namespace
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
    labels = {
      name = "monitoring"
      "pod-security.kubernetes.io/enforce" = "restricted"
      "pod-security.kubernetes.io/audit"   = "restricted"
      "pod-security.kubernetes.io/warn"    = "restricted"
    }
  }
}

# Prometheus Operator via Helm
resource "helm_release" "prometheus_operator" {
  name       = "prometheus-operator"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = "55.5.0"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [
    yamlencode({
      # Prometheus configuration
      prometheus = {
        prometheusSpec = {
          serviceMonitorSelectorNilUsesHelmValues = false
          podMonitorSelectorNilUsesHelmValues     = false
          ruleSelectorNilUsesHelmValues          = false
          
          retention    = "30d"
          retentionSize = "50GiB"
          
          storageSpec = {
            volumeClaimTemplate = {
              spec = {
                storageClassName = "gp3"
                accessModes      = ["ReadWriteOnce"]
                resources = {
                  requests = {
                    storage = "100Gi"
                  }
                }
              }
            }
          }

          resources = {
            requests = {
              memory = "2Gi"
              cpu    = "1000m"
            }
            limits = {
              memory = "4Gi"
              cpu    = "2000m"
            }
          }

          # Enable remote write for long-term storage
          remoteWrite = var.prometheus_remote_write_enabled ? [
            {
              url = var.prometheus_remote_write_url
              basicAuth = {
                username = {
                  name = "prometheus-remote-write"
                  key  = "username"
                }
                password = {
                  name = "prometheus-remote-write"
                  key  = "password"
                }
              }
            }
          ] : []

          # Additional scrape configs
          additionalScrapeConfigs = [
            {
              job_name = "fineprintai-api"
              kubernetes_sd_configs = [
                {
                  role = "endpoints"
                  namespaces = {
                    names = ["fineprintai-${var.environment}"]
                  }
                }
              ]
              relabel_configs = [
                {
                  source_labels = ["__meta_kubernetes_service_name"]
                  action        = "keep"
                  regex         = "api-service"
                }
              ]
            },
            {
              job_name = "fineprintai-worker"
              kubernetes_sd_configs = [
                {
                  role = "endpoints"
                  namespaces = {
                    names = ["fineprintai-${var.environment}"]
                  }
                }
              ]
              relabel_configs = [
                {
                  source_labels = ["__meta_kubernetes_service_name"]
                  action        = "keep"
                  regex         = "worker-service"
                }
              ]
            }
          ]
        }

        # Ingress for Prometheus UI
        ingress = {
          enabled = true
          annotations = {
            "kubernetes.io/ingress.class"                    = "nginx"
            "cert-manager.io/cluster-issuer"                = "letsencrypt-prod"
            "nginx.ingress.kubernetes.io/auth-type"         = "basic"
            "nginx.ingress.kubernetes.io/auth-secret"       = "prometheus-basic-auth"
            "nginx.ingress.kubernetes.io/auth-realm"        = "Authentication Required"
          }
          hosts = [
            {
              host = "prometheus-${var.environment}.${var.domain}"
              paths = [
                {
                  path     = "/"
                  pathType = "Prefix"
                }
              ]
            }
          ]
          tls = [
            {
              secretName = "prometheus-tls"
              hosts      = ["prometheus-${var.environment}.${var.domain}"]
            }
          ]
        }
      }

      # Grafana configuration
      grafana = {
        adminPassword = var.grafana_config.admin_password
        
        persistence = {
          enabled = true
          size    = "20Gi"
          storageClassName = "gp3"
        }

        resources = {
          requests = {
            memory = "512Mi"
            cpu    = "250m"
          }
          limits = {
            memory = "1Gi"
            cpu    = "500m"
          }
        }

        # Grafana configuration
        grafana.ini = {
          server = {
            root_url = "https://${var.grafana_config.domain}"
          }
          security = {
            admin_user     = "admin"
            admin_password = var.grafana_config.admin_password
          }
          "auth.generic_oauth" = {
            enabled = true
            name    = "OAuth"
            # OAuth configuration would go here
          }
        }

        # Dashboard providers
        dashboardProviders = {
          "dashboardproviders.yaml" = {
            apiVersion = 1
            providers = [
              {
                name            = "default"
                orgId           = 1
                folder          = ""
                type            = "file"
                disableDeletion = false
                editable        = true
                options = {
                  path = "/var/lib/grafana/dashboards/default"
                }
              }
            ]
          }
        }

        # Custom dashboards
        dashboards = {
          default = {
            fineprintai-overview = {
              gnetId    = 12019  # Node Exporter dashboard
              revision  = 2
              datasource = "Prometheus"
            }
            fineprintai-api = {
              json = file("${path.module}/dashboards/api-dashboard.json")
            }
            fineprintai-ai-workloads = {
              json = file("${path.module}/dashboards/ai-workloads-dashboard.json")
            }
          }
        }

        # Ingress for Grafana
        ingress = {
          enabled = true
          annotations = {
            "kubernetes.io/ingress.class"           = "nginx"
            "cert-manager.io/cluster-issuer"       = "letsencrypt-prod"
          }
          hosts = [var.grafana_config.domain]
          tls = [
            {
              secretName = "grafana-tls"
              hosts      = [var.grafana_config.domain]
            }
          ]
        }
      }

      # AlertManager configuration
      alertmanager = {
        alertmanagerSpec = {
          storage = {
            volumeClaimTemplate = {
              spec = {
                storageClassName = "gp3"
                accessModes      = ["ReadWriteOnce"]
                resources = {
                  requests = {
                    storage = "10Gi"
                  }
                }
              }
            }
          }

          resources = {
            requests = {
              memory = "256Mi"
              cpu    = "100m"
            }
            limits = {
              memory = "512Mi"
              cpu    = "200m"
            }
          }
        }

        config = {
          global = {
            smtp_smarthost = "localhost:587"
            smtp_from      = "alerts@${var.domain}"
          }

          route = {
            group_by        = ["alertname", "cluster", "service"]
            group_wait      = "10s"
            group_interval  = "10s"
            repeat_interval = "1h"
            receiver        = "web.hook"
            routes = [
              {
                match = {
                  alertname = "Watchdog"
                }
                receiver = "null"
              },
              {
                match = {
                  severity = "critical"
                }
                receiver = "critical-alerts"
              }
            ]
          }

          receivers = [
            {
              name = "null"
            },
            {
              name = "web.hook"
              webhook_configs = [
                {
                  url = "http://localhost:5001/"
                }
              ]
            },
            {
              name = "critical-alerts"
              slack_configs = var.alert_channels.slack.webhook_url != "" ? [
                {
                  api_url   = var.alert_channels.slack.webhook_url
                  channel   = "#alerts"
                  title     = "🚨 Critical Alert"
                  text      = "{{ range .Alerts }}{{ .Annotations.summary }}\n{{ .Annotations.description }}{{ end }}"
                  username  = "AlertManager"
                }
              ] : []
              
              pagerduty_configs = var.alert_channels.pagerduty.integration_key != "" ? [
                {
                  routing_key = var.alert_channels.pagerduty.integration_key
                  description = "{{ .CommonAnnotations.summary }}"
                }
              ] : []

              email_configs = length(var.alert_channels.email.addresses) > 0 ? [
                {
                  to       = join(",", var.alert_channels.email.addresses)
                  subject  = "🚨 Critical Alert: {{ .GroupLabels.alertname }}"
                  body     = "{{ range .Alerts }}{{ .Annotations.summary }}\n{{ .Annotations.description }}{{ end }}"
                }
              ] : []
            }
          ]
        }

        # Ingress for AlertManager
        ingress = {
          enabled = true
          annotations = {
            "kubernetes.io/ingress.class"           = "nginx"
            "cert-manager.io/cluster-issuer"       = "letsencrypt-prod"
            "nginx.ingress.kubernetes.io/auth-type" = "basic"
            "nginx.ingress.kubernetes.io/auth-secret" = "alertmanager-basic-auth"
          }
          hosts = ["alertmanager-${var.environment}.${var.domain}"]
          tls = [
            {
              secretName = "alertmanager-tls"
              hosts      = ["alertmanager-${var.environment}.${var.domain}"]
            }
          ]
        }
      }

      # Node Exporter
      nodeExporter = {
        enabled = true
      }

      # kube-state-metrics
      kubeStateMetrics = {
        enabled = true
      }
    })
  ]

  depends_on = [kubernetes_namespace.monitoring]
}

# Loki for log aggregation
resource "helm_release" "loki" {
  name       = "loki"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki-stack"
  version    = "2.9.11"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [
    yamlencode({
      loki = {
        enabled = true
        persistence = {
          enabled = true
          size    = "50Gi"
          storageClassName = "gp3"
        }
        config = {
          auth_enabled = false
          server = {
            http_listen_port = 3100
          }
          ingester = {
            lifecycler = {
              address = "127.0.0.1"
              ring = {
                kvstore = {
                  store = "inmemory"
                }
                replication_factor = 1
              }
            }
            chunk_idle_period      = "1h"
            max_chunk_age          = "1h"
            chunk_target_size      = 1048576
            chunk_retain_period    = "30s"
            max_transfer_retries   = 0
          }
          schema_config = {
            configs = [
              {
                from         = "2020-10-24"
                store        = "boltdb-shipper"
                object_store = "filesystem"
                schema       = "v11"
                index = {
                  prefix = "index_"
                  period = "24h"
                }
              }
            ]
          }
          storage_config = {
            boltdb_shipper = {
              active_index_directory = "/loki/boltdb-shipper-active"
              cache_location         = "/loki/boltdb-shipper-cache"
              cache_ttl             = "24h"
              shared_store          = "filesystem"
            }
            filesystem = {
              directory = "/loki/chunks"
            }
          }
          limits_config = {
            reject_old_samples       = true
            reject_old_samples_max_age = "168h"
          }
          chunk_store_config = {
            max_look_back_period = "0s"
          }
          table_manager = {
            retention_deletes_enabled = false
            retention_period         = "0s"
          }
          compactor = {
            working_directory = "/loki/boltdb-shipper-compactor"
            shared_store     = "filesystem"
          }
        }
      }
      
      promtail = {
        enabled = true
        config = {
          server = {
            http_listen_port = 3101
          }
          clients = [
            {
              url = "http://loki:3100/loki/api/v1/push"
            }
          ]
          scrape_configs = [
            {
              job_name = "kubernetes-pods"
              kubernetes_sd_configs = [
                {
                  role = "pod"
                }
              ]
              relabel_configs = [
                {
                  source_labels = ["__meta_kubernetes_pod_annotation_prometheus_io_scrape"]
                  action        = "keep"
                  regex         = "true"
                },
                {
                  source_labels = ["__meta_kubernetes_pod_annotation_prometheus_io_path"]
                  action        = "replace"
                  target_label  = "__metrics_path__"
                  regex         = "(.+)"
                }
              ]
            }
          ]
        }
      }

      fluent-bit = {
        enabled = false  # Using promtail instead
      }

      grafana = {
        enabled   = false  # Already enabled in prometheus-operator
        sidecar = {
          datasources = {
            enabled = true
          }
        }
      }
    })
  ]

  depends_on = [helm_release.prometheus_operator]
}

# Jaeger for distributed tracing
resource "helm_release" "jaeger" {
  name       = "jaeger"
  repository = "https://jaegertracing.github.io/helm-charts"
  chart      = "jaeger"
  version    = "0.71.11"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [
    yamlencode({
      provisionDataStore = {
        cassandra = false
        elasticsearch = true
      }

      storage = {
        type = "elasticsearch"
        elasticsearch = {
          scheme = "http"
          host   = "elasticsearch"
          port   = 9200
          user   = ""
          password = ""
        }
      }

      agent = {
        enabled = true
        daemonset = {
          useHostNetwork = true
          useHostPort    = true
        }
      }

      collector = {
        enabled = true
        service = {
          type = "ClusterIP"
        }
        ingress = {
          enabled = true
          annotations = {
            "kubernetes.io/ingress.class"     = "nginx"
            "cert-manager.io/cluster-issuer" = "letsencrypt-prod"
          }
          hosts = [
            {
              host = "jaeger-${var.environment}.${var.domain}"
              paths = ["/"]
            }
          ]
          tls = [
            {
              secretName = "jaeger-tls"
              hosts      = ["jaeger-${var.environment}.${var.domain}"]
            }
          ]
        }
      }

      query = {
        enabled = true
        ingress = {
          enabled = true
          annotations = {
            "kubernetes.io/ingress.class"     = "nginx"
            "cert-manager.io/cluster-issuer" = "letsencrypt-prod"
          }
          hosts = [
            {
              host = "jaeger-query-${var.environment}.${var.domain}"
              paths = ["/"]
            }
          ]
          tls = [
            {
              secretName = "jaeger-query-tls"
              hosts      = ["jaeger-query-${var.environment}.${var.domain}"]
            }
          ]
        }
      }
    })
  ]

  depends_on = [helm_release.elasticsearch]
}

# Elasticsearch for Jaeger storage
resource "helm_release" "elasticsearch" {
  name       = "elasticsearch"
  repository = "https://helm.elastic.co"
  chart      = "elasticsearch"
  version    = "7.17.3"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [
    yamlencode({
      replicas = var.environment == "production" ? 3 : 1
      
      minimumMasterNodes = var.environment == "production" ? 2 : 1

      resources = {
        requests = {
          cpu    = "500m"
          memory = "2Gi"
        }
        limits = {
          cpu    = "1000m"
          memory = "4Gi"
        }
      }

      volumeClaimTemplate = {
        accessModes = ["ReadWriteOnce"]
        storageClassName = "gp3"
        resources = {
          requests = {
            storage = "50Gi"
          }
        }
      }

      esConfig = {
        "elasticsearch.yml" = |
          cluster.name: "fineprintai"
          network.host: 0.0.0.0
          discovery.zen.minimum_master_nodes: ${var.environment == "production" ? 2 : 1}
          discovery.zen.ping.unicast.hosts: elasticsearch-master-headless
      }
    })
  ]

  depends_on = [kubernetes_namespace.monitoring]
}

# Basic auth secret for Prometheus
resource "kubernetes_secret" "prometheus_basic_auth" {
  metadata {
    name      = "prometheus-basic-auth"
    namespace = kubernetes_namespace.monitoring.metadata[0].name
  }

  type = "Opaque"

  data = {
    auth = base64encode("admin:${bcrypt(var.basic_auth_password)}")
  }
}

# Basic auth secret for AlertManager
resource "kubernetes_secret" "alertmanager_basic_auth" {
  metadata {
    name      = "alertmanager-basic-auth"
    namespace = kubernetes_namespace.monitoring.metadata[0].name
  }

  type = "Opaque"

  data = {
    auth = base64encode("admin:${bcrypt(var.basic_auth_password)}")
  }
}

# Remote write secret for Prometheus (if enabled)
resource "kubernetes_secret" "prometheus_remote_write" {
  count = var.prometheus_remote_write_enabled ? 1 : 0

  metadata {
    name      = "prometheus-remote-write"
    namespace = kubernetes_namespace.monitoring.metadata[0].name
  }

  type = "Opaque"

  data = {
    username = base64encode(var.prometheus_remote_write_username)
    password = base64encode(var.prometheus_remote_write_password)
  }
}

# Custom PrometheusRule for Fine Print AI specific alerts
resource "kubernetes_manifest" "fineprintai_alerts" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "PrometheusRule"
    metadata = {
      name      = "fineprintai-alerts"
      namespace = kubernetes_namespace.monitoring.metadata[0].name
      labels = {
        prometheus = "kube-prometheus"
        role       = "alert-rules"
      }
    }
    spec = {
      groups = [
        {
          name = "fineprintai.rules"
          rules = [
            {
              alert = "FinePrintAIHighErrorRate"
              expr  = "rate(http_requests_total{job=~\"fineprintai-.*\",status=~\"5..\"}[5m]) > 0.1"
              for   = "5m"
              labels = {
                severity = "warning"
              }
              annotations = {
                summary     = "High error rate detected"
                description = "Error rate is above 10% for {{ $labels.job }}"
              }
            },
            {
              alert = "FinePrintAIHighLatency"
              expr  = "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=~\"fineprintai-.*\"}[5m])) > 1"
              for   = "10m"
              labels = {
                severity = "warning"
              }
              annotations = {
                summary     = "High latency detected"
                description = "95th percentile latency is above 1s for {{ $labels.job }}"
              }
            },
            {
              alert = "FinePrintAIServiceDown"
              expr  = "up{job=~\"fineprintai-.*\"} == 0"
              for   = "1m"
              labels = {
                severity = "critical"
              }
              annotations = {
                summary     = "Service is down"
                description = "{{ $labels.job }} service is down"
              }
            },
            {
              alert = "FinePrintAIHighCPUUsage"
              expr  = "rate(container_cpu_usage_seconds_total{namespace=\"fineprintai-${var.environment}\"}[5m]) > 0.8"
              for   = "10m"
              labels = {
                severity = "warning"
              }
              annotations = {
                summary     = "High CPU usage"
                description = "CPU usage is above 80% for {{ $labels.pod }}"
              }
            },
            {
              alert = "FinePrintAIHighMemoryUsage"
              expr  = "container_memory_usage_bytes{namespace=\"fineprintai-${var.environment}\"} / container_spec_memory_limit_bytes > 0.9"
              for   = "10m"
              labels = {
                severity = "warning"
              }
              annotations = {
                summary     = "High memory usage"
                description = "Memory usage is above 90% for {{ $labels.pod }}"
              }
            },
            {
              alert = "FinePrintAIDatabaseConnectionsHigh"
              expr  = "postgres_stat_activity_count{datname=\"fineprintai\"} > 80"
              for   = "5m"
              labels = {
                severity = "warning"
              }
              annotations = {
                summary     = "High database connections"
                description = "Database connections are above 80"
              }
            }
          ]
        }
      ]
    }
  }

  depends_on = [helm_release.prometheus_operator]
}

# ServiceMonitor for Fine Print AI services
resource "kubernetes_manifest" "fineprintai_service_monitor" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "ServiceMonitor"
    metadata = {
      name      = "fineprintai-services"
      namespace = kubernetes_namespace.monitoring.metadata[0].name
      labels = {
        release = "prometheus-operator"
      }
    }
    spec = {
      selector = {
        matchLabels = {
          "app.kubernetes.io/part-of" = "fineprintai"
        }
      }
      namespaceSelector = {
        matchNames = ["fineprintai-${var.environment}"]
      }
      endpoints = [
        {
          port     = "metrics"
          interval = "30s"
          path     = "/metrics"
        }
      ]
    }
  }

  depends_on = [helm_release.prometheus_operator]
}

# Outputs
output "monitoring_namespace" {
  description = "Monitoring namespace name"
  value       = kubernetes_namespace.monitoring.metadata[0].name
}

output "prometheus_url" {
  description = "Prometheus URL"
  value       = "https://prometheus-${var.environment}.${var.domain}"
}

output "grafana_url" {
  description = "Grafana URL"
  value       = "https://${var.grafana_config.domain}"
}

output "alertmanager_url" {
  description = "AlertManager URL"
  value       = "https://alertmanager-${var.environment}.${var.domain}"
}

output "jaeger_url" {
  description = "Jaeger URL"
  value       = "https://jaeger-query-${var.environment}.${var.domain}"
}