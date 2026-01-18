# Terraform Development Guide

This guide explains how to run Terraform commands for local development of the Video AI Engine Platform.

## Prerequisites

- Terraform v1.13 or higher
- AWS CLI configured with appropriate credentials
- AWS region set to `eu-west-1` (primary) or `us-east-1` (WAF/ACM/CloudFront global resources)

## Directory Structure

The Terraform configuration is organized as follows:

```
terraform/
├── bootstrap/          # Initial setup for the project
├── environments/       # Environment-specific context and variables
│   ├── sandbox/        # Sandbox environment (dev)
│   ├── secondary/      # Test environment
│   ├── primary/        # Production environment
│   └── {developer}/    # Developer-specific environments
├── module-video-ai/    # Main module containing all resources
├── module-video-ai-destroy/ # Module for destroying resources
├── main.tf             # Main entry point
├── variables.tf        # Variable definitions
└── context.auto.tfvars # Default context variables
```

## Running Terraform Locally

### 1. Apply Shared Resources (ECR Repositories)

The shared-resources folder deploys ECR repositories for Docker-based Lambdas (transcode-video, submit-api-request) per developer namespace. This only needs to be done once per environment or when adding new developers.

```bash
cd terraform/shared-resources
terraform init -backend-config=sandbox/backend.hcl -reconfigure
terraform plan -input=false -lock-timeout=15s -var-file=sandbox/sandbox.tfvars
terraform apply -input=false -lock-timeout=15s -var-file=sandbox/sandbox.tfvars
```

Replace `sandbox` with `secondary` or `primary` as needed.

### 2. Apply the main Terraform configuration

All Terraform commands are run from the root `terraform/` directory. Choose your environment:

- `sandbox` - Development environment
- `secondary` - Test environment
- `primary` - Production environment
- `chris`, `irfan`, `richard`, `steve` - Developer-specific sandboxes

```bash
cd terraform

# Initialize with environment-specific backend
terraform init -backend-config=environments/sandbox/backend.hcl -reconfigure

# Plan changes
terraform plan -input=false -lock-timeout=15s -var-file=environments/sandbox/sandbox.tfvars

# Apply changes
terraform apply -input=false -lock-timeout=15s -var-file=environments/sandbox/sandbox.tfvars
```

Replace `sandbox` with your target environment name in all three commands.

## Environment Naming Convention

- `sandbox` - Development environment (dev)
- `secondary` - Test environment (test)
- `primary` - Production environment (prod)
- `{developer}` - Developer-specific environments (e.g., `chris/`)

## Important Notes

1. **Region**: The primary AWS region is `eu-west-1`. WAF, ACM, and CloudFront resources use `us-east-1`.
2. **Variables**: Default values are set in `context.auto.tfvars`. Override as needed for specific environments.
3. **Tags**: All resources are tagged with standard EDF tags for compliance and cost tracking.
4. **Backend**: Terraform state is managed using remote backends configured in the bootstrap process.
5. **Security**: The WAF module is configured with IP allowlists and rate limiting for security.
6. **S3 Lifecycle**: Internal, CloudFront logs, and WAF logs buckets expire objects after 60 days, delete noncurrent versions after 60 days, and abort incomplete multipart uploads after 7 days.

## Best Practices

1. Always run `terraform plan` before `terraform apply`
2. Use environment-specific directories for different stages of development
3. Keep your Terraform version consistent with the project requirements
4. Ensure AWS credentials are properly configured before running commands