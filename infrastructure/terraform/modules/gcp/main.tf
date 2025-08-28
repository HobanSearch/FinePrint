# GCP Infrastructure Module for Fine Print AI
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

# Local variables
locals {
  cluster_name = "${var.project_name}-${var.environment}-gke"
  network_name = "${var.project_name}-${var.environment}-network"
  subnet_name  = "${var.project_name}-${var.environment}-subnet"
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "container.googleapis.com",
    "compute.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "storage.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "artifactregistry.googleapis.com"
  ])

  project = var.project_id
  service = each.value

  disable_dependent_services = true
}

# VPC Network
resource "google_compute_network" "vpc" {
  name                    = local.network_name
  auto_create_subnetworks = false
  mtu                     = 1460

  depends_on = [google_project_service.apis]
}

# Subnet
resource "google_compute_subnetwork" "subnet" {
  name          = local.subnet_name
  ip_cidr_range = "10.0.0.0/16"
  network       = google_compute_network.vpc.id
  region        = var.region

  # Enable private Google access
  private_ip_google_access = true

  # Secondary IP ranges for GKE
  secondary_ip_range {
    range_name    = "gke-pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "gke-services"
    ip_cidr_range = "10.2.0.0/16"
  }
}

# Firewall rules
resource "google_compute_firewall" "allow_internal" {
  name    = "${var.project_name}-${var.environment}-allow-internal"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = ["10.0.0.0/8"]
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "${var.project_name}-${var.environment}-allow-ssh"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ssh"]
}

resource "google_compute_firewall" "allow_http_https" {
  name    = "${var.project_name}-${var.environment}-allow-http-https"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["http-server", "https-server"]
}

# GKE Cluster
resource "google_container_cluster" "primary" {
  name     = local.cluster_name
  location = var.region
  
  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name

  # GKE Autopilot vs Standard
  enable_autopilot = false

  # Initial node count (will be removed after node pools are created)
  remove_default_node_pool = true
  initial_node_count       = 1

  # Kubernetes version
  min_master_version = var.kubernetes_version

  # Networking configuration
  ip_allocation_policy {
    cluster_secondary_range_name  = "gke-pods"
    services_secondary_range_name = "gke-services"
  }

  # Enable network policy
  network_policy {
    enabled = true
  }

  # Enable Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Enable binary authorization
  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }

  # Cluster features
  addons_config {
    http_load_balancing {
      disabled = false
    }

    horizontal_pod_autoscaling {
      disabled = false
    }

    network_policy_config {
      disabled = false
    }

    dns_cache_config {
      enabled = true
    }

    gcp_filestore_csi_driver_config {
      enabled = true
    }

    gcs_fuse_csi_driver_config {
      enabled = true
    }
  }

  # Monitoring and logging
  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
    
    managed_prometheus {
      enabled = true
    }
  }

  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  # Security configuration
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }

  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  # Master authorized networks
  master_authorized_networks_config {
    cidr_blocks {
      cidr_block   = "0.0.0.0/0"
      display_name = "All networks"
    }
  }

  # Resource labels
  resource_labels = var.labels

  depends_on = [
    google_project_service.apis,
    google_compute_subnetwork.subnet
  ]
}

# Node pools
resource "google_container_node_pool" "node_pools" {
  for_each = var.node_pools

  name     = each.key
  cluster  = google_container_cluster.primary.name
  location = var.region

  # Node count configuration
  initial_node_count = each.value.initial_node_count

  autoscaling {
    min_node_count = each.value.min_count
    max_node_count = each.value.max_count
  }

  # Node configuration
  node_config {
    machine_type = each.value.machine_type
    disk_size_gb = 100
    disk_type    = "pd-ssd"
    image_type   = "COS_CONTAINERD"

    # GPU configuration (if specified)
    dynamic "guest_accelerator" {
      for_each = can(each.value.accelerator_type) ? [1] : []
      content {
        type  = each.value.accelerator_type
        count = each.value.accelerator_count
      }
    }

    # Service account
    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    # Node labels
    labels = merge(
      var.labels,
      {
        "node-pool" = each.key
      }
    )

    # Node taints (if specified)
    dynamic "taint" {
      for_each = can(each.value.taints) ? each.value.taints : []
      content {
        key    = taint.value.key
        value  = taint.value.value
        effect = taint.value.effect
      }
    }

    # Security configuration
    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    # Workload Identity
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  # Node pool management
  management {
    auto_repair  = true
    auto_upgrade = true
  }

  # Upgrade settings
  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }

  depends_on = [google_container_cluster.primary]
}

# Service account for GKE nodes
resource "google_service_account" "gke_nodes" {
  account_id   = "${var.project_name}-${var.environment}-gke-nodes"
  display_name = "GKE Node Service Account"
}

resource "google_project_iam_member" "gke_nodes" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/storage.objectViewer",
    "roles/artifactregistry.reader"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

# Cloud SQL PostgreSQL instance
resource "google_sql_database_instance" "postgres" {
  count = var.enable_cloud_sql ? 1 : 0

  name             = "${var.project_name}-${var.environment}-postgres"
  database_version = var.database_config.database_version
  region           = var.region

  settings {
    tier                        = var.database_config.tier
    disk_size                   = var.database_config.disk_size
    disk_type                   = "PD_SSD"
    disk_autoresize            = true
    disk_autoresize_limit      = 500

    # Backup configuration
    backup_configuration {
      enabled                        = var.database_config.backup_enabled
      start_time                     = var.database_config.backup_start_time
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = 30
      }
    }

    # IP configuration
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      require_ssl     = true
    }

    # Maintenance window
    maintenance_window {
      day          = 7
      hour         = 4
      update_track = "stable"
    }

    # Database flags
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }
  }

  deletion_protection = var.environment == "production"

  depends_on = [google_project_service.apis]
}

# Private service connection for Cloud SQL
resource "google_compute_global_address" "private_ip_address" {
  count = var.enable_cloud_sql ? 1 : 0

  name          = "${var.project_name}-${var.environment}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  count = var.enable_cloud_sql ? 1 : 0

  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address[0].name]
}

# Cloud SQL database
resource "google_sql_database" "database" {
  count = var.enable_cloud_sql ? 1 : 0

  name     = "fineprintai"
  instance = google_sql_database_instance.postgres[0].name
}

# Cloud SQL user
resource "random_password" "db_password" {
  count = var.enable_cloud_sql ? 1 : 0

  length  = 32
  special = true
}

resource "google_sql_user" "users" {
  count = var.enable_cloud_sql ? 1 : 0

  name     = "fineprintai"
  instance = google_sql_database_instance.postgres[0].name
  password = random_password.db_password[0].result
}

# Memorystore Redis instance
resource "google_redis_instance" "redis" {
  count = var.enable_memorystore ? 1 : 0

  name           = "${var.project_name}-${var.environment}-redis"
  memory_size_gb = var.redis_config.memory_size_gb
  tier           = var.redis_config.tier
  
  location_id             = "${var.region}-a"
  alternative_location_id = "${var.region}-b"
  
  authorized_network = google_compute_network.vpc.id
  
  redis_version = "REDIS_7_0"
  display_name  = "${var.project_name} ${var.environment} Redis"

  auth_enabled   = true
  transit_encryption_mode = "SERVER_CLIENT"

  labels = var.labels

  depends_on = [google_project_service.apis]
}

# Cloud Storage buckets
resource "google_storage_bucket" "buckets" {
  for_each = var.storage_buckets

  name     = "${var.project_name}-${var.environment}-${each.key}"
  location = each.value.location

  storage_class = each.value.storage_class

  # Versioning
  versioning {
    enabled = each.value.versioning
  }

  # Lifecycle management
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  # Uniform bucket-level access
  uniform_bucket_level_access = true

  # Labels
  labels = var.labels

  depends_on = [google_project_service.apis]
}

# Load Balancer (Global HTTP(S) Load Balancer)
resource "google_compute_global_address" "lb_ip" {
  count = var.enable_load_balancer ? 1 : 0

  name = "${var.project_name}-${var.environment}-lb-ip"
}

# SSL Certificate
resource "google_compute_managed_ssl_certificate" "ssl_cert" {
  count = var.enable_load_balancer && length(var.ssl_certificate_domains) > 0 ? 1 : 0

  name = "${var.project_name}-${var.environment}-ssl-cert"

  managed {
    domains = var.ssl_certificate_domains
  }
}

# Artifact Registry for container images
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "${var.project_name}-${var.environment}"
  description   = "Docker repository for ${var.project_name} ${var.environment}"
  format        = "DOCKER"

  labels = var.labels

  depends_on = [google_project_service.apis]
}

# IAM bindings for Workload Identity
resource "google_service_account" "workload_identity" {
  for_each = toset(["api", "worker", "websocket"])

  account_id   = "${var.project_name}-${var.environment}-${each.key}"
  display_name = "${var.project_name} ${var.environment} ${each.key} service account"
}

resource "google_service_account_iam_binding" "workload_identity" {
  for_each = google_service_account.workload_identity

  service_account_id = each.value.name
  role               = "roles/iam.workloadIdentityUser"

  members = [
    "serviceAccount:${var.project_id}.svc.id.goog[fineprintai-${var.environment}/${each.key}]"
  ]
}

# Outputs
output "cluster_name" {
  description = "GKE cluster name"
  value       = google_container_cluster.primary.name
}

output "cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = google_container_cluster.primary.endpoint
  sensitive   = true
}

output "cluster_ca_certificate" {
  description = "GKE cluster CA certificate"
  value       = google_container_cluster.primary.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

output "database_endpoint" {
  description = "Cloud SQL instance connection name"
  value       = var.enable_cloud_sql ? google_sql_database_instance.postgres[0].connection_name : null
  sensitive   = true
}

output "database_private_ip" {
  description = "Cloud SQL instance private IP"
  value       = var.enable_cloud_sql ? google_sql_database_instance.postgres[0].private_ip_address : null
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis instance endpoint"
  value       = var.enable_memorystore ? google_redis_instance.redis[0].host : null
  sensitive   = true
}

output "load_balancer_ip" {
  description = "Load balancer IP address"
  value       = var.enable_load_balancer ? google_compute_global_address.lb_ip[0].address : null
}

output "artifact_registry_url" {
  description = "Artifact Registry URL"
  value       = google_artifact_registry_repository.repo.name
}

output "bucket_names" {
  description = "Created storage bucket names"
  value       = { for k, v in google_storage_bucket.buckets : k => v.name }
}