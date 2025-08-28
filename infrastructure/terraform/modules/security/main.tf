# Security and Compliance Module for Fine Print AI
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

# Security namespace for security tools
resource "kubernetes_namespace" "security" {
  metadata {
    name = "security-system"
    labels = {
      name = "security-system"
      "pod-security.kubernetes.io/enforce" = "restricted"
      "pod-security.kubernetes.io/audit"   = "restricted"
      "pod-security.kubernetes.io/warn"    = "restricted"
    }
  }
}

# AWS Security Configuration
resource "aws_guardduty_detector" "main" {
  count = var.aws_config != null && var.aws_config.enable_guardduty ? 1 : 0

  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-guardduty"
    Environment = var.environment
  }
}

# AWS Security Hub
resource "aws_securityhub_account" "main" {
  count = var.aws_config != null && var.aws_config.enable_security_hub ? 1 : 0

  control_finding_generator = "SECURITY_CONTROL"
  enable_default_standards  = true
}

# AWS Config
resource "aws_config_configuration_recorder" "main" {
  count = var.aws_config != null && var.aws_config.enable_config ? 1 : 0

  name     = "${var.project_name}-${var.environment}-config"
  role_arn = aws_iam_role.config[0].arn

  recording_group {
    all_supported = true
    include_global_resource_types = true
  }

  depends_on = [aws_config_delivery_channel.main]
}

resource "aws_config_delivery_channel" "main" {
  count = var.aws_config != null && var.aws_config.enable_config ? 1 : 0

  name           = "${var.project_name}-${var.environment}-config"
  s3_bucket_name = aws_s3_bucket.config[0].bucket
  s3_key_prefix  = "config"

  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }
}

resource "aws_s3_bucket" "config" {
  count = var.aws_config != null && var.aws_config.enable_config ? 1 : 0

  bucket        = "${var.project_name}-${var.environment}-config-${random_id.config_bucket.hex}"
  force_destroy = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-config"
    Environment = var.environment
  }
}

resource "random_id" "config_bucket" {
  byte_length = 4
}

# CloudTrail for audit logging
resource "aws_cloudtrail" "main" {
  count = var.aws_config != null && var.aws_config.enable_cloudtrail ? 1 : 0

  name                         = "${var.project_name}-${var.environment}-cloudtrail"
  s3_bucket_name              = aws_s3_bucket.cloudtrail[0].bucket
  s3_key_prefix               = "cloudtrail"
  include_global_service_events = true
  is_multi_region_trail       = true
  enable_logging              = true

  event_selector {
    read_write_type                 = "All"
    include_management_events       = true
    exclude_management_event_sources = []

    data_resource {
      type   = "AWS::S3::Object"
      values = ["arn:aws:s3:::*/*"]
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-cloudtrail"
    Environment = var.environment
  }
}

resource "aws_s3_bucket" "cloudtrail" {
  count = var.aws_config != null && var.aws_config.enable_cloudtrail ? 1 : 0

  bucket        = "${var.project_name}-${var.environment}-cloudtrail-${random_id.cloudtrail_bucket.hex}"
  force_destroy = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-cloudtrail"
    Environment = var.environment
  }
}

resource "random_id" "cloudtrail_bucket" {
  byte_length = 4
}

# IAM roles for AWS Config
resource "aws_iam_role" "config" {
  count = var.aws_config != null && var.aws_config.enable_config ? 1 : 0

  name = "${var.project_name}-${var.environment}-config-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "config" {
  count = var.aws_config != null && var.aws_config.enable_config ? 1 : 0

  role       = aws_iam_role.config[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/ConfigRole"
}

# Kubernetes Security Policies
resource "kubernetes_manifest" "pod_security_policy" {
  manifest = {
    apiVersion = "policy/v1beta1"
    kind       = "PodSecurityPolicy"
    metadata = {
      name = "${var.project_name}-${var.environment}-restricted"
      namespace = kubernetes_namespace.security.metadata[0].name
    }
    spec = {
      privileged = false
      allowPrivilegeEscalation = false
      requiredDropCapabilities = ["ALL"]
      volumes = [
        "configMap",
        "emptyDir",
        "projected",
        "secret",
        "downwardAPI",
        "persistentVolumeClaim"
      ]
      runAsUser = {
        rule = "MustRunAsNonRoot"
      }
      seLinux = {
        rule = "RunAsAny"
      }
      fsGroup = {
        rule = "RunAsAny"
      }
    }
  }
}

# Network Policies
resource "kubernetes_network_policy" "default_deny" {
  metadata {
    name      = "default-deny-all"
    namespace = "fineprintai-${var.environment}"
  }

  spec {
    pod_selector {}
    policy_types = ["Ingress", "Egress"]
  }
}

resource "kubernetes_network_policy" "allow_api_to_db" {
  metadata {
    name      = "allow-api-to-db"
    namespace = "fineprintai-${var.environment}"
  }

  spec {
    pod_selector {
      match_labels = {
        "app.kubernetes.io/component" = "api"
      }
    }

    policy_types = ["Egress"]

    egress {
      to {
        pod_selector {
          match_labels = {
            "app.kubernetes.io/name" = "postgresql"
          }
        }
      }
      ports {
        protocol = "TCP"
        port     = "5432"
      }
    }

    egress {
      to {
        pod_selector {
          match_labels = {
            "app.kubernetes.io/name" = "redis"
          }
        }
      }
      ports {
        protocol = "TCP"
        port     = "6379"
      }
    }
  }
}

resource "kubernetes_network_policy" "allow_ingress_to_api" {
  metadata {
    name      = "allow-ingress-to-api"
    namespace = "fineprintai-${var.environment}"
  }

  spec {
    pod_selector {
      match_labels = {
        "app.kubernetes.io/component" = "api"
      }
    }

    policy_types = ["Ingress"]

    ingress {
      from {
        namespace_selector {
          match_labels = {
            name = "ingress-nginx"
          }
        }
      }
      ports {
        protocol = "TCP"
        port     = "8000"
      }
    }
  }
}

# Falco for runtime security monitoring
resource "kubernetes_manifest" "falco_daemonset" {
  manifest = {
    apiVersion = "apps/v1"
    kind       = "DaemonSet"
    metadata = {
      name      = "falco"
      namespace = kubernetes_namespace.security.metadata[0].name
      labels = {
        app = "falco"
      }
    }
    spec = {
      selector = {
        matchLabels = {
          app = "falco"
        }
      }
      template = {
        metadata = {
          labels = {
            app = "falco"
          }
        }
        spec = {
          serviceAccount = kubernetes_service_account.falco.metadata[0].name
          hostNetwork    = true
          hostPID        = true
          containers = [
            {
              name  = "falco"
              image = "falcosecurity/falco:0.36.2"
              args = [
                "/usr/bin/falco",
                "--cri=/run/containerd/containerd.sock",
                "--k8s-api=https://kubernetes.default.svc.cluster.local",
                "--k8s-api-cert=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt",
                "--k8s-api-token-file=/var/run/secrets/kubernetes.io/serviceaccount/token"
              ]
              securityContext = {
                privileged = true
              }
              volumeMounts = [
                {
                  name      = "boot-filesystem"
                  mountPath = "/host/boot"
                  readOnly  = true
                },
                {
                  name      = "lib-modules"
                  mountPath = "/host/lib/modules"
                  readOnly  = true
                },
                {
                  name      = "usr-filesystem"
                  mountPath = "/host/usr"
                  readOnly  = true
                },
                {
                  name      = "etc-filesystem"
                  mountPath = "/host/etc"
                  readOnly  = true
                },
                {
                  name      = "containerd-socket"
                  mountPath = "/run/containerd/containerd.sock"
                  readOnly  = true
                }
              ]
            }
          ]
          volumes = [
            {
              name = "boot-filesystem"
              hostPath = {
                path = "/boot"
              }
            },
            {
              name = "lib-modules"
              hostPath = {
                path = "/lib/modules"
              }
            },
            {
              name = "usr-filesystem"
              hostPath = {
                path = "/usr"
              }
            },
            {
              name = "etc-filesystem"
              hostPath = {
                path = "/etc"
              }
            },
            {
              name = "containerd-socket"
              hostPath = {
                path = "/run/containerd/containerd.sock"
              }
            }
          ]
        }
      }
    }
  }
}

resource "kubernetes_service_account" "falco" {
  metadata {
    name      = "falco"
    namespace = kubernetes_namespace.security.metadata[0].name
  }
}

resource "kubernetes_cluster_role" "falco" {
  metadata {
    name = "falco"
  }

  rule {
    api_groups = ["extensions", ""]
    resources  = ["nodes", "namespaces", "pods", "replicationcontrollers", "replicasets", "services", "daemonsets", "deployments", "events", "configmaps"]
    verbs      = ["get", "list", "watch"]
  }

  rule {
    api_groups     = ["apps"]
    resources      = ["daemonsets", "deployments", "replicasets", "statefulsets"]
    verbs          = ["get", "list", "watch"]
  }

  rule {
    non_resource_urls = ["/healthz", "/healthz/*"]
    verbs             = ["get"]
  }
}

resource "kubernetes_cluster_role_binding" "falco" {
  metadata {
    name = "falco"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.falco.metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account.falco.metadata[0].name
    namespace = kubernetes_namespace.security.metadata[0].name
  }
}

# OPA Gatekeeper for policy enforcement
resource "kubernetes_manifest" "gatekeeper_system" {
  manifest = {
    apiVersion = "v1"
    kind       = "Namespace"
    metadata = {
      name = "gatekeeper-system"
      labels = {
        name = "gatekeeper-system"
        "pod-security.kubernetes.io/enforce" = "restricted"
        "pod-security.kubernetes.io/audit"   = "restricted"
        "pod-security.kubernetes.io/warn"    = "restricted"
      }
    }
  }
}

# Certificate management with cert-manager
resource "kubernetes_manifest" "cert_manager_namespace" {
  manifest = {
    apiVersion = "v1"
    kind       = "Namespace"
    metadata = {
      name = "cert-manager"
      labels = {
        name = "cert-manager"
        "cert-manager.io/disable-validation" = "true"
      }
    }
  }
}

# Compliance scanning with kube-bench
resource "kubernetes_job" "kube_bench" {
  metadata {
    name      = "kube-bench"
    namespace = kubernetes_namespace.security.metadata[0].name
  }

  spec {
    template {
      metadata {
        labels = {
          app = "kube-bench"
        }
      }

      spec {
        host_pid = true
        
        container {
          name  = "kube-bench"
          image = "aquasec/kube-bench:v0.6.15"
          
          command = ["kube-bench"]
          args    = ["--version", "1.28"]
          
          volume_mount {
            name       = "var-lib-etcd"
            mount_path = "/var/lib/etcd"
            read_only  = true
          }
          
          volume_mount {
            name       = "var-lib-kubelet"
            mount_path = "/var/lib/kubelet"
            read_only  = true
          }
          
          volume_mount {
            name       = "var-lib-kube-scheduler"
            mount_path = "/var/lib/kube-scheduler"
            read_only  = true
          }
          
          volume_mount {
            name       = "var-lib-kube-controller-manager"
            mount_path = "/var/lib/kube-controller-manager"
            read_only  = true
          }
          
          volume_mount {
            name       = "etc-systemd"
            mount_path = "/etc/systemd"
            read_only  = true
          }
          
          volume_mount {
            name       = "lib-systemd"
            mount_path = "/lib/systemd/"
            read_only  = true
          }
          
          volume_mount {
            name       = "etc-kubernetes"
            mount_path = "/etc/kubernetes"
            read_only  = true
          }
          
          volume_mount {
            name       = "etc-cni-netd"
            mount_path = "/etc/cni/net.d/"
            read_only  = true
          }
        }
        
        restart_policy = "Never"
        
        volume {
          name = "var-lib-etcd"
          host_path {
            path = "/var/lib/etcd"
          }
        }
        
        volume {
          name = "var-lib-kubelet"
          host_path {
            path = "/var/lib/kubelet"
          }
        }
        
        volume {
          name = "var-lib-kube-scheduler"
          host_path {
            path = "/var/lib/kube-scheduler"
          }
        }
        
        volume {
          name = "var-lib-kube-controller-manager"
          host_path {
            path = "/var/lib/kube-controller-manager"
          }
        }
        
        volume {
          name = "etc-systemd"
          host_path {
            path = "/etc/systemd"
          }
        }
        
        volume {
          name = "lib-systemd"
          host_path {
            path = "/lib/systemd"
          }
        }
        
        volume {
          name = "etc-kubernetes"
          host_path {
            path = "/etc/kubernetes"
          }
        }
        
        volume {
          name = "etc-cni-netd"
          host_path {
            path = "/etc/cni/net.d/"
          }
        }
      }
    }
  }
}

# Secret scanning with truffleHog
resource "kubernetes_config_map" "trufflehog_config" {
  metadata {
    name      = "trufflehog-config"
    namespace = kubernetes_namespace.security.metadata[0].name
  }

  data = {
    "trufflehog.yaml" = yamlencode({
      # TruffleHog configuration
      rules = [
        {
          description = "AWS Access Key ID"
          regex       = "AKIA[0-9A-Z]{16}"
          keywords    = ["aws", "amazon"]
        },
        {
          description = "Generic API Key"
          regex       = "[a-zA-Z0-9]{32,}"
          keywords    = ["api", "key", "token", "secret"]
        }
      ]
    })
  }
}

# RBAC for security namespace
resource "kubernetes_role" "security_admin" {
  metadata {
    namespace = kubernetes_namespace.security.metadata[0].name
    name      = "security-admin"
  }

  rule {
    api_groups = [""]
    resources  = ["pods", "services", "endpoints", "persistentvolumeclaims", "events", "configmaps", "secrets"]
    verbs      = ["*"]
  }

  rule {
    api_groups = ["apps"]
    resources  = ["deployments", "daemonsets", "replicasets", "statefulsets"]
    verbs      = ["*"]
  }
}

resource "kubernetes_role_binding" "security_admin" {
  metadata {
    name      = "security-admin"
    namespace = kubernetes_namespace.security.metadata[0].name
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role.security_admin.metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = "security-admin"
    namespace = kubernetes_namespace.security.metadata[0].name
  }
}

resource "kubernetes_service_account" "security_admin" {
  metadata {
    name      = "security-admin"
    namespace = kubernetes_namespace.security.metadata[0].name
  }
}

# Compliance reports ConfigMap
resource "kubernetes_config_map" "compliance_reports" {
  metadata {
    name      = "compliance-reports"
    namespace = kubernetes_namespace.security.metadata[0].name
  }

  data = {
    "compliance-standards.yaml" = yamlencode({
      standards = var.compliance_standards
      policies = var.security_policies
      last_scan = timestamp()
    })
  }
}

# Outputs
output "security_namespace" {
  description = "Security namespace name"
  value       = kubernetes_namespace.security.metadata[0].name
}

output "compliance_standards" {
  description = "Enabled compliance standards"
  value       = var.compliance_standards
}

output "security_policies" {
  description = "Applied security policies"
  value       = var.security_policies
}

output "audit_log_locations" {
  description = "Audit log storage locations"
  value = {
    aws_cloudtrail = var.aws_config != null && var.aws_config.enable_cloudtrail ? aws_s3_bucket.cloudtrail[0].bucket : null
    aws_config     = var.aws_config != null && var.aws_config.enable_config ? aws_s3_bucket.config[0].bucket : null
  }
  sensitive = true
}