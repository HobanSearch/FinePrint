"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerraformGenerator = void 0;
const logger_1 = require("@/utils/logger");
const logger = (0, logger_1.createContextLogger)('TerraformGenerator');
class TerraformGenerator {
    async generate(template, variables = {}) {
        logger.info(`Generating Terraform configuration for template: ${template.name}`);
        try {
            const files = {};
            files['main.tf'] = await this.generateMainConfig(template);
            files['variables.tf'] = await this.generateVariables(template.variables);
            files['outputs.tf'] = await this.generateOutputs(template.outputs);
            files['terraform.tfvars'] = await this.generateTfVars(variables);
            files['versions.tf'] = await this.generateVersions();
            files['backend.tf'] = await this.generateBackend();
            const moduleFiles = await this.generateModules(template);
            Object.assign(files, moduleFiles);
            logger.info('Terraform configuration generated successfully');
            return files;
        }
        catch (error) {
            logger.error('Failed to generate Terraform configuration:', error);
            throw error;
        }
    }
    async generateMainConfig(template) {
        let config = `# ${template.name}\n# ${template.description}\n\n`;
        config += this.generateLocals();
        config += this.generateDataSources(template);
        for (const resource of template.resources) {
            config += await this.generateResource(resource);
        }
        return config;
    }
    async generateResource(resource) {
        let resourceBlock = `\nresource "${resource.type}" "${resource.name}" {\n`;
        for (const [key, value] of Object.entries(resource.properties)) {
            resourceBlock += `  ${key} = ${this.formatValue(value)}\n`;
        }
        if (resource.dependencies && resource.dependencies.length > 0) {
            const deps = resource.dependencies.map(dep => `${dep}`).join(', ');
            resourceBlock += `  depends_on = [${deps}]\n`;
        }
        if (this.isTaggableResource(resource.type)) {
            resourceBlock += this.generateTags();
        }
        resourceBlock += '}\n';
        return resourceBlock;
    }
    async generateVariables(variables) {
        let config = '# Variables\n\n';
        for (const variable of variables) {
            config += `variable "${variable.name}" {\n`;
            config += `  description = "${variable.description}"\n`;
            config += `  type        = ${this.mapVariableType(variable.type)}\n`;
            if (variable.default !== undefined) {
                config += `  default     = ${this.formatValue(variable.default)}\n`;
            }
            if (variable.required) {
                config += `  # Required variable\n`;
            }
            config += '}\n\n';
        }
        return config;
    }
    async generateOutputs(outputs) {
        let config = '# Outputs\n\n';
        for (const output of outputs) {
            config += `output "${output.name}" {\n`;
            config += `  description = "${output.description}"\n`;
            config += `  value       = ${output.value}\n`;
            if (output.sensitive) {
                config += `  sensitive   = true\n`;
            }
            config += '}\n\n';
        }
        return config;
    }
    async generateTfVars(variables) {
        let config = '# Terraform Variables\n\n';
        for (const [key, value] of Object.entries(variables)) {
            config += `${key} = ${this.formatValue(value)}\n`;
        }
        return config;
    }
    async generateVersions() {
        return `# Terraform and Provider Versions

terraform {
  required_version = ">= 1.0"
  
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
    
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
    
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}
`;
    }
    async generateBackend() {
        return `# Backend Configuration

terraform {
  backend "s3" {
    bucket         = var.terraform_state_bucket
    key            = "\${var.environment}/\${var.project_name}/terraform.tfstate"
    region         = var.aws_region
    encrypt        = true
    dynamodb_table = var.terraform_lock_table
  }
}
`;
    }
    generateLocals() {
        return `# Local Values
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    CreatedBy   = "fineprintai-devops-agent"
    CreatedAt   = timestamp()
  }
  
  name_prefix = "\${var.project_name}-\${var.environment}"
}

`;
    }
    generateDataSources(template) {
        let config = '# Data Sources\n';
        config += `
data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_region" "current" {}

`;
        return config;
    }
    generateTags() {
        return `  tags = merge(local.common_tags, {\n    Name = "\${local.name_prefix}-\${var.resource_suffix}"\n  })\n`;
    }
    async generateModules(template) {
        const modules = {};
        modules['modules/vpc/main.tf'] = await this.generateVpcModule();
        modules['modules/vpc/variables.tf'] = await this.generateVpcModuleVariables();
        modules['modules/vpc/outputs.tf'] = await this.generateVpcModuleOutputs();
        modules['modules/eks/main.tf'] = await this.generateEksModule();
        modules['modules/eks/variables.tf'] = await this.generateEksModuleVariables();
        modules['modules/eks/outputs.tf'] = await this.generateEksModuleOutputs();
        modules['modules/rds/main.tf'] = await this.generateRdsModule();
        modules['modules/rds/variables.tf'] = await this.generateRdsModuleVariables();
        modules['modules/rds/outputs.tf'] = await this.generateRdsModuleOutputs();
        return modules;
    }
    async generateVpcModule() {
        return `# VPC Module

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name = "\${var.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "\${var.name_prefix}-igw"
  })
}

resource "aws_subnet" "public" {
  count = length(var.availability_zones)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "\${var.name_prefix}-public-\${count.index + 1}"
    Type = "public"
  })
}

resource "aws_subnet" "private" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "\${var.name_prefix}-private-\${count.index + 1}"
    Type = "private"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.tags, {
    Name = "\${var.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_nat_gateway" "main" {
  count = var.enable_nat_gateway ? length(aws_subnet.public) : 0

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.tags, {
    Name = "\${var.name_prefix}-nat-\${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_eip" "nat" {
  count = var.enable_nat_gateway ? length(aws_subnet.public) : 0

  domain = "vpc"

  tags = merge(var.tags, {
    Name = "\${var.name_prefix}-nat-eip-\${count.index + 1}"
  })
}

resource "aws_route_table" "private" {
  count = var.enable_nat_gateway ? length(aws_subnet.private) : 0

  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = merge(var.tags, {
    Name = "\${var.name_prefix}-private-rt-\${count.index + 1}"
  })
}

resource "aws_route_table_association" "private" {
  count = var.enable_nat_gateway ? length(aws_subnet.private) : 0

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}
`;
    }
    formatValue(value) {
        if (typeof value === 'string') {
            return `"${value}"`;
        }
        else if (typeof value === 'boolean') {
            return value.toString();
        }
        else if (typeof value === 'number') {
            return value.toString();
        }
        else if (Array.isArray(value)) {
            const items = value.map(item => this.formatValue(item)).join(', ');
            return `[${items}]`;
        }
        else if (typeof value === 'object' && value !== null) {
            const pairs = Object.entries(value)
                .map(([k, v]) => `    ${k} = ${this.formatValue(v)}`)
                .join('\n');
            return `{\n${pairs}\n  }`;
        }
        return `"${value}"`;
    }
    mapVariableType(type) {
        const typeMap = {
            'string': 'string',
            'number': 'number',
            'boolean': 'bool',
            'array': 'list(string)',
            'object': 'map(any)',
        };
        return typeMap[type] || 'string';
    }
    isTaggableResource(resourceType) {
        const taggableResources = [
            'aws_instance',
            'aws_vpc',
            'aws_subnet',
            'aws_security_group',
            'aws_s3_bucket',
            'aws_rds_instance',
            'aws_eks_cluster',
            'aws_iam_role',
        ];
        return taggableResources.includes(resourceType);
    }
    async generateVpcModuleVariables() {
        return `# VPC Module Variables

variable "name_prefix" {
  description = "Name prefix for resources"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
`;
    }
    async generateVpcModuleOutputs() {
        return `# VPC Module Outputs

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "internet_gateway_id" {
  description = "ID of the Internet Gateway"
  value       = aws_internet_gateway.main.id
}

output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = aws_nat_gateway.main[*].id
}
`;
    }
    async generateEksModule() {
        return `# EKS Module - Placeholder
# Full implementation would include EKS cluster, node groups, etc.
`;
    }
    async generateEksModuleVariables() {
        return `# EKS Module Variables - Placeholder`;
    }
    async generateEksModuleOutputs() {
        return `# EKS Module Outputs - Placeholder`;
    }
    async generateRdsModule() {
        return `# RDS Module - Placeholder
# Full implementation would include RDS instance, subnet group, etc.
`;
    }
    async generateRdsModuleVariables() {
        return `# RDS Module Variables - Placeholder`;
    }
    async generateRdsModuleOutputs() {
        return `# RDS Module Outputs - Placeholder`;
    }
}
exports.TerraformGenerator = TerraformGenerator;
//# sourceMappingURL=terraform-generator.js.map