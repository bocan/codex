# Customer Debt Video AI Analysis (dvai)

A video analysis platform that uses AWS AI/ML services to process videos, detect objects and faces, transcribe audio, and generate comprehensive reports. The system is designed to help analyse customer interaction videos for vulnerability assessment and compliance checking.

> **Note:** Currently, please use the `dev` branch for any new development.

## Table of Contents

- [Customer Debt Video AI Analysis (dvai)](#customer-debt-video-ai-analysis-dvai)
  - [Table of Contents](#table-of-contents)
  - [Architecture Overview](#architecture-overview)
    - [Frontend Architecture (CloudFront CDN)](#frontend-architecture-cloudfront-cdn)
    - [Video Processing Pipeline](#video-processing-pipeline)
  - [Key Features](#key-features)
  - [Project Structure](#project-structure)
  - [Components](#components)
    - [UI (`ui/`)](#ui-ui)
    - [Lambda Functions](#lambda-functions)
    - [Terraform Infrastructure](#terraform-infrastructure)
  - [Processing Pipeline](#processing-pipeline)
    - [Rekognition Throttling](#rekognition-throttling)
  - [Script Compliance Checking](#script-compliance-checking)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Running the UI Locally](#running-the-ui-locally)
    - [Deploying Infrastructure](#deploying-infrastructure)
    - [Running Lambda Tests](#running-lambda-tests)
  - [E2E Tests](#e2e-tests)
    - [Environment Variables](#environment-variables)
  - [CI/CD](#cicd)
    - [Branch → Environment Mapping](#branch--environment-mapping)
    - [Pipeline Steps](#pipeline-steps)
  - [Environment Variables](#environment-variables-1)
    - [Lambda Functions](#lambda-functions-1)
  - [License](#license)

## Architecture Overview

### Frontend Architecture (CloudFront CDN)

```
                                    ┌─────────────────────────────────────┐
                                    │           Custom Domain             │
                                    │  (*.cus-paycol-debt-video-ai...)    │
                                    └──────────────────┬──────────────────┘
                                                       │
                                                       ▼
                                    ┌─────────────────────────────────────┐
                                    │          AWS WAF (Private)          │
                                    │       (IP allowlist + rate limit)   │
                                    └──────────────────┬──────────────────┘
                                                       │
                                                       ▼
                                    ┌─────────────────────────────────────┐
                                    │      CloudFront Distribution        │
                                    │     (Single entry point, HTTPS)     │
                                    └──────────────────┬──────────────────┘
                                                       │
                       ┌───────────────────────────────┼───────────────────────────────┐
                       │                               │                               │
                       ▼                               ▼                               ▼
            ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
            │    UI S3 Bucket     │     │    API Gateway      │     │  Internal S3 Bucket │
            │  (React SPA assets) │     │    (/api/* path)    │     │ (/videos/* → raw-   │
            │   Default origin    │     │   + Lambda Authzr   │     │  videos/, signed)   │
            └─────────────────────┘     └──────────┬──────────┘     └─────────────────────┘
                                                   │
                              ┌────────────────────┴────────────────────┐
                              │                                         │
                              ▼                                         ▼
                   ┌─────────────────────┐               ┌─────────────────────┐
                   │   api-authorizer    │               │  submit-api-request │
                   │ Lambda (JWT/Cognito)│               │   Lambda (FastAPI)  │
                   └─────────────────────┘               └─────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │  Cognito User Pool  │
                   │  (Shared, EDF SSO)  │
                   └─────────────────────┘
```

### Video Processing Pipeline

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                         S3 Internal Bucket (KMS Encrypted)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ raw-videos/  │  │ transcoded-  │  │ label-files/ │  │ transcript-  │  │ results/    │  │
│  │              │  │ videos/      │  │              │  │ output/      │  │             │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
└─────────┼─────────────────┼───────────────────────────────────────────────────────────────┘
          │                 │
          ▼                 │
┌────────────────────────┐  │
│ transcode-video Lambda │  │
│ (H.264 conversion)     │  │
└────────────┬───────────┘  │
             │              │
             ▼              │
    transcoded-videos/ ─────┘
             │
             ▼
┌────────────────────────┐     ┌─────────────────────────┐
│ SQS Queue              │────▶│ DynamoDB Throttle Table │
│ (video-processing)     │     │ (tracks active jobs)    │
└────────────┬───────────┘     └─────────────────────────┘
             │                           ▲
             ▼                           │ decrement
┌────────────────────────┐               │
│ submit-video-for-      │───────────────┘
│ processing Lambda      │
└────────────┬───────────┘
             │
             ├───────────────────────────┬────────────────────────────────┐
             │                           │                                │
             ▼                           ▼                                ▼
┌───────────────────┐         ┌───────────────────┐          ┌───────────────────┐
│  AWS Transcribe   │         │ AWS Rekognition   │          │ AWS Rekognition   │
│  (Speech-to-Text) │         │ (Label Detection) │          │ (Face Detection)  │
└─────────┬─────────┘         └─────────┬─────────┘          └─────────┬─────────┘
          │                             │                              │
          ▼                             ▼                              ▼
┌───────────────────┐         ┌───────────────────┐          ┌───────────────────┐
│ transcript-output/│         │ save-object-labels│          │ save-facial-      │
│ (S3)              │         │ -to-s3 Lambda     │          │ analysis-to-s3    │
└─────────┬─────────┘         └─────────┬─────────┘          └─────────┬─────────┘
          │                             │                              │
          │                             ▼                              │
          │                   ┌───────────────────┐                    │
          │                   │   label-files/    │                    │
          │                   │   (S3)            │◀───────────────────┘
          │                   └─────────┬─────────┘
          │                             │
          ▼                             ▼
┌─────────────────────────────────────────────────────┐
│              generate-report Lambda                 │
│  (Uses AWS Bedrock/Claude for script analysis)      │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
               ┌───────────────────┐
               │  results/ (S3)    │
               │  report.json      │
               └───────────────────┘
```

## Key Features

- **Video Upload**: Upload MP4 videos through a web interface
- **Speech Transcription**: Automatic transcription with speaker diarization using AWS Transcribe
- **Object Detection**: Identify objects in video frames using AWS Rekognition
- **Facial Analysis**: Detect faces with age estimation, gender, and emotion analysis
- **Script Compliance Checking**: AI-powered analysis of transcripts to verify customer service scripts were followed
- **Vulnerability Assessment**: Automatic flagging of customer vulnerabilities mentioned in conversations
- **Interactive Report Viewer**: Web UI to review analysis results with synchronized video playback

## Project Structure

```
├── e2e-tests/              # Playwright end-to-end tests
├── lambdas/                # AWS Lambda functions
├── scripts/                # Utility scripts for development
├── terraform/              # Infrastructure as Code
│   ├── bootstrap/          # Initial AWS setup
│   ├── environments/       # Environment-specific configs (sandbox, primary, secondary, developer)
│   ├── module-video-ai/    # Main infrastructure module
│   └── shared-resources/   # Cross-environment shared resources
└── ui/                     # React/Vite web application (SPA)
```

## Components

### UI (`ui/`)

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack Query (React Query)
- **Authentication**: AWS Amplify with Cognito Hosted UI (OAuth code flow)
- **Routing**: React Router
- **Features**:
  - Cognito SSO authentication via EDF's shared Cognito User Pool
  - Case listing with filtering, sorting, and pagination
  - Video player with timestamp synchronization
  - Transcript panel with clickable timestamps
  - Checklist review interface with AI-assisted decisions
  - Admin controls for case assignment and user management

### Lambda Functions

| Function | Purpose |
|----------|---------|
| **transcode-video** | Triggered when a raw video is uploaded. Transcodes to H.264 format for consistent processing. |
| **submit-video-for-processing** | Triggered by SQS queue. Checks throttle counter, starts AWS Transcribe and Rekognition jobs (label + face detection). Returns message to queue if at capacity. |
| **save-object-labels-to-s3** | Receives SNS notification when Rekognition label detection completes. Saves results to S3 and decrements throttle counter. |
| **save-facial-analysis-to-s3** | Receives SNS notification when Rekognition face detection completes. Saves results to S3 and decrements throttle counter. |
| **generate-report** | Triggered when all analysis files are available. Uses AWS Bedrock (Claude) to analyze transcript against a script checklist. Generates comprehensive JSON report. |
| **submit-api-request** | FastAPI backend Lambda handling video uploads, case management, and signed URL generation. |
| **api-authorizer** | API Gateway TOKEN authorizer that validates Cognito JWTs. Verifies token signature via JWKS, checks issuer/audience, and returns IAM policies for allow/deny. |

### Terraform Infrastructure

The `terraform/module-video-ai/` module provisions:

- **S3 Buckets**: Internal (processing + video storage), UI (React assets), Lambda builds, CloudFront logs, and WAF logs
- **S3 Lifecycle**: Internal, CloudFront logs, and WAF logs buckets expire objects after 60 days, delete noncurrent versions after 60 days, and abort incomplete multipart uploads after 7 days
- **DynamoDB Tables**: Case metadata table (with GSIs for querying by user, assignment, status) and Rekognition throttle counter
- **KMS Keys**: Encryption for internal bucket (with CloudFront, Transcribe, and Rekognition access)
- **CloudFront Distribution**: Single entry point with 3 origins (UI bucket, API Gateway, Internal bucket for videos)
- **AWS WAF**: IP allowlist + rate limiting (CLOUDFRONT scope) - uses EDF private WAF module
- **API Gateway + Lambda**: FastAPI backend for video upload and case management
- **Route 53**: Custom domain with alias to CloudFront distribution
- **ACM Certificate**: SSL/TLS for custom domain (provisioned in us-east-1)
- **SNS Topics**: Event notifications for processing pipeline
- **SNS Subscriptions**: Lambda function subscriptions to SNS topics
- **Lambda Functions**: All processing Lambdas with IAM permissions
- **SSM Parameters**: Configuration for inclusion lists, bounding box labels, and CloudFront signing keys
- **API Gateway Authorizer**: Lambda TOKEN authorizer for JWT validation against shared Cognito User Pool
- **VPC**: Network infrastructure *(disabled by default)*
- **IAM Roles**: Service permissions for Rekognition and Lambda

## Processing Pipeline

1. **Upload**: User uploads MP4 video via the web UI to `raw-videos/` prefix
2. **Transcode**: S3 `ObjectCreated` event triggers `transcode-video` Lambda to convert to H.264
3. **Queue**: Output to `transcoded-videos/` sends notification to SQS queue (throttling buffer)
4. **Throttle Check**: `submit-video-for-processing` Lambda checks DynamoDB counter against limit (default: 20 concurrent Rekognition jobs, configurable via SSM Parameter Store)
   - If capacity available: increments counter by 2 and proceeds
   - If at capacity: raises exception, message returns to queue after 120s visibility timeout
5. **Analysis** (parallel):
   - AWS Transcribe generates transcript with speaker labels
   - AWS Rekognition detects objects/labels in video
   - AWS Rekognition performs facial analysis
6. **Save Results**: SNS notifications trigger Lambdas to save Rekognition results to S3 and **decrement the throttle counter**
7. **Report Generation**: When all files are available, `generate-report` Lambda:
   - Transforms transcript data
   - Processes object labels (filtered by inclusion list)
   - Processes facial analysis data
   - Uses Claude AI to check script compliance and identify vulnerabilities
8. **Delivery**: Transcoded video served directly from internal S3 bucket via CloudFront with signed URLs

### Rekognition Throttling

AWS Rekognition has a default limit of 20 concurrent video analysis jobs. The pipeline uses SQS-based throttling to stay within this limit:

- **SQS Queue**: Buffers incoming video processing requests
- **DynamoDB Counter**: Tracks active Rekognition jobs atomically
- **SSM Parameter**: `/dvai/rekognition-concurrent-limit` controls the threshold (update when AWS increases quota)
- **CloudWatch Alarm**: Alerts when queue depth exceeds 50 messages

## Script Compliance Checking

The system checks transcripts for the following script items:

- Customer Name
- Customer Address
- Boiler Number
- Issues topping up meter *(vulnerability flag)*
- Issues reaching top-up point *(vulnerability flag)*
- Issues managing bills *(vulnerability flag)*
- Health conditions *(vulnerability flag)*
- Reliance on medical equipment *(vulnerability flag)*
- Mobility concerns *(vulnerability flag)*
- Children living at the home *(vulnerability flag)*
- Adults age 75+ living at the home *(vulnerability flag)*

Items marked with *(vulnerability flag)* are assessed for customer vulnerability.

## Getting Started

### Prerequisites

- AWS CLI configured with appropriate credentials
- Docker (for Lambda deployment)
- Node.js 18+ (for frontend)
- Python 3.13+ (for backend and Lambdas)
- Terraform 1.13+
- asdf (for tool version management)
- pre-commit (for code quality checks)

### Running the UI Locally

The UI is a single-page React application. Authentication uses AWS Cognito Hosted UI, which requires running on a registered callback URL.

```bash
cd ui
npm install
npm run dev   # Starts on http://localhost:5000
```

> **Note**: Local development requires `http://localhost:5000` to be registered as a callback URL in the Cognito User Pool app client. The app will redirect to the Cognito Hosted UI for authentication.

### Deploying Infrastructure

> Ensure the env-init repository has been applied first so per-developer ECR repositories and Lambda build buckets exist (see `cus-paycol-debt-video-ai-engine-env-init/20_shared_resources/lambda_ecr_init.tf`).

All Terraform is run from the root `terraform/` directory, with environment-specific configuration in `environments/`:

```bash
cd terraform

# Initialize with environment-specific backend (sandbox, secondary, primary, or developer name)
terraform init -backend-config=environments/sandbox/backend.hcl -reconfigure

# Plan changes
terraform plan -input=false -lock-timeout=15s -var-file=environments/sandbox/sandbox.tfvars

# Apply changes
terraform apply -input=false -lock-timeout=15s -var-file=environments/sandbox/sandbox.tfvars
```

Available environments: `sandbox` (dev), `secondary` (test), `primary` (prod), or developer-specific (`chris`, `irfan`, `richard`, `steve`).

### Running Lambda Tests

The Lambda functions have a comprehensive test suite using pytest. Tests are run via a Makefile in the `lambdas/` directory.

```bash
cd lambdas

# Run all tests with coverage report
make test

# Run tests without reinstalling dependencies (faster, after first run)
make test-quick

# Clean up virtual environment and cache files
make clean

# Run linter
make lint

# Format code
make format
```

## E2E Tests

End-to-end tests are implemented using Playwright and cover the full video upload and processing workflow.

Todo: These tests don't work in the EDF environement yet.

```bash
cd e2e-tests
npm install
npx playwright test
```

### Environment Variables

Copy `.env.example` to `.env` and configure:
- `USERNAME` - Cognito test user username
- `PASSWORD` - Cognito test user password

## CI/CD

The project uses GitHub Actions for continuous integration and deployment.

### Branch → Environment Mapping

| Branch | Environment | AWS Account |
|--------|-------------|-------------|
| `main` | Primary | Production |
| `test` | Secondary | Staging |
| `dev` | Sandbox | Development |
| `{developer}/dev` (e.g., `chris/dev`, `irfan/dev`) | Developer namespace | Development (isolated state) |

### Pipeline Steps

1. **Pre-commit checks**: Linting, formatting, Terraform validation
2. **Lambda tests**: Run pytest suite with coverage
3. **Lambda packaging**: Build zip packages for non-Docker Lambdas (including api-authorizer)
4. **Docker build**: Build and push Docker images to ECR (transcode-video, submit-api-request)
5. **Terraform plan**: Preview infrastructure changes
6. **Terraform apply**: Deploy infrastructure changes (push only, not PRs)
7. **UI build & deploy**: Build React app and sync to S3 UI bucket
8. **CloudFront invalidation**: Invalidate CDN cache for updated assets

## Environment Variables

### Lambda Functions

Key environment variables are configured via Terraform and SSM Parameter Store:

| Variable | Description |
|----------|-------------|
| `OUTPUT_BUCKET` | Destination bucket for processed files |
| `SNS_TOPIC_ARN_Label` | SNS topic for label detection notifications |
| `SNS_TOPIC_ARN_Face` | SNS topic for face detection notifications |
| `COGNITO_USER_POOL_ID` | Shared Cognito User Pool ID (api-authorizer) |
| `COGNITO_CLIENT_ID` | Cognito App Client ID for JWT validation (api-authorizer) |
| `REKOG_ROLE_ARN` | IAM role ARN for Rekognition |
| `INCLUSION_LIST_PARAMETER` | SSM parameter name for object inclusion list |
| `LABELS_WITH_BB_PARAMETER` | SSM parameter for labels with bounding box support |

## License

Proprietary - EDF Energy
