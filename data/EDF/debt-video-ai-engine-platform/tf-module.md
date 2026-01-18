# Video AI Engine Platform - Terraform Module

This Terraform module provisions the AWS infrastructure for the Video AI Engine Platform, a system that processes videos using AWS AI/ML services to detect objects, analyse faces, transcribe audio, and generate comprehensive reports with AI-powered script compliance checking.

## Architecture Overview (currently) - without CDN/UI/VPC

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              S3 Internal Bucket                                 │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ raw-videos/  │  │ transcoded-    │  │ label-files/ │  │ results/           │ │
│  │              │  │ videos/        │  │              │  │ (final reports)    │ │
│  └──────┬───────┘  └───────┬────────┘  └──────────────┘  └────────────────────┘ │
└─────────┼──────────────────┼────────────────────────────────────────────────────┘
          │                  │
          ▼                  │
┌─────────────────────┐      │
│ Lambda: transcode-  │      │
│ video (H.264)       │──────┘
└─────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         SQS-Based Throttling Layer                              │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────────────┐  │
│  │ SQS Queue       │    │ DynamoDB Table   │    │ SSM Parameter              │  │
│  │ (video-         │◀──▶│ (throttle        │◀──▶│ /dvai/rekognition-         │  │
│  │  processing)    │    │  counter)        │    │  concurrent-limit          │  │
│  └────────┬────────┘    └──────────────────┘    └────────────────────────────┘  │
└───────────┼─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────┐                          ┌─────────────────────┐
│ Lambda: submit-     │                          │ Lambda: generate-   │
│ video-for-          │                          │ report              │
│ processing          │                          │ (Bedrock/Claude)    │
└─────────┬───────────┘                          └─────────────────────┘
          │
    ┌─────┴─────┬───────────────┐
    │           │               │
    ▼           ▼               ▼
┌───────────┐ ┌────────────┐ ┌────────────┐
│Transcribe │ │Rekognition │ │Rekognition │
│           │ │Label Det.  │ │Face Det.   │
└───────────┘ └─────┬──────┘ └─────┬──────┘
                    │              │
                    ▼              ▼
          ┌──────────┐  ┌──────────┐
          │SNS:      │  │SNS:      │
          │object-   │  │facial-   │
          │detection │  │analysis  │
          └────┬─────┘  └────┬─────┘
               │             │
               ▼             ▼
          ┌──────────────────────────┐
          │Lambda: save-object-      │
          │labels-to-s3              │
          │  (decrements counter)    │
          ├──────────────────────────┤
          │Lambda: save-facial-      │
          │analysis-to-s3            │
          │  (decrements counter)    │
          └──────────────────────────┘
```

## Features

- **Video Processing Pipeline**: Automated workflow triggered by S3 uploads
- **Rekognition Throttling**: SQS queue + DynamoDB counter to respect AWS concurrent job limits (default 20)
- **Object Detection**: AWS Rekognition label detection with configurable inclusion list
- **Facial Analysis**: Age, gender, and emotion detection via AWS Rekognition
- **Audio Transcription**: Speech-to-text with speaker diarisation via AWS Transcribe
- **AI Script Compliance**: Amazon Bedrock (Claude) analysis for script adherence
- **Secure Storage**: Encrypted S3 buckets with versioning and public access blocks
- **Event-Driven Architecture**: SNS topics and SQS queues for decoupled, scalable processing

## Lambda Functions

| Function | Description |
|----------|-------------|
| `transcode-video` | Triggered on raw video upload; converts to H.264 format |
| `submit-video-for-processing` | Triggered by SQS queue; checks throttle counter, starts Rekognition and Transcribe jobs |
| `save-object-labels-to-s3` | Receives Rekognition label detection SNS notifications, saves to S3, decrements throttle counter |
| `save-facial-analysis-to-s3` | Receives Rekognition facial analysis SNS notifications, saves to S3, decrements throttle counter |
| `generate-report` | Aggregates all analysis data; uses Bedrock AI for script compliance checking |

## Usage

```hcl
module "video_ai" {
  source = "../module-video-ai/"

  region             = "eu-west-1"
  namespace          = "dvai"
  environment        = "dev"
  stage              = "sandbox"
  name               = "app"
  random_suffix      = "20251126120238726100000001"

  tags           = local.general_tags
  s3_object_tags = local.s3_object_tags  # Max 10 tags for S3 objects
}
```

## S3 Bucket Structure

### Internal Bucket
| Prefix | Purpose |
|--------|---------|
| `raw-videos/` | Uploaded video files (triggers processing) |
| `label-files/` | Rekognition label and facial analysis JSON |
| `transcript-output/` | AWS Transcribe transcription results |
| `results/` | Final aggregated report JSON files |

### Bucket Lifecycle Policies

The module configures S3 lifecycle policies to control retention and to clean up incomplete multipart uploads:

- **Internal bucket**: expire objects after 60 days, delete noncurrent versions after 60 days, abort incomplete multipart uploads after 7 days
- **CloudFront logs bucket**: expire objects after 60 days, delete noncurrent versions after 60 days, abort incomplete multipart uploads after 7 days
- **WAF logs bucket**: expire objects after 60 days, delete noncurrent versions after 60 days, abort incomplete multipart uploads after 7 days

### Lambda Builds Bucket
Stores packaged Lambda function code for deployment.

**Note:** This bucket is created per-developer by the infrastructure-initialisation repository (env-init) so CI can upload packages before CD runs.

### CDN Bucket
Stores UI static assets for delivery via CloudFront.

## SNS Topics

| Topic | Purpose |
|-------|---------|
| `processing-updates` | S3 event notifications for new files |
| `object-detection` | Rekognition label detection completion |
| `facial-analysis` | Rekognition face detection completion |
| `rekognition-job-notifications` | General Rekognition job status |

## ECR Repository

**Note:** ECR repositories and per-developer Lambda build buckets are now created by the infrastructure-initialisation repository (`*-env-init`). See the env-init project for developer and lambda lists.

| Repository | Purpose |
|------------|---------|
| `${namespace}-submit-api-request` | Docker image for the submit-api-request Lambda (FastAPI) |
| `${namespace}-transcode-video` | Docker image for the transcode-video Lambda (FFmpeg) |

## SSM Parameters

| Parameter | Description |
|-----------|-------------|
| `/${namespace}/inclusion-list` | JSON list of Rekognition labels to include in analysis |
| `/${namespace}/labels-with-bounding-box` | JSON list of labels that support bounding boxes |

## Security Features

- **S3 Encryption**: Server-side encryption with AWS KMS
- **Public Access Blocked**: All S3 buckets block public access
- **SNS Encryption**: Topics encrypted with AWS-managed SNS key
- **Least Privilege IAM**: Lambda functions have minimal required permissions

## Disabled Components

The following components are available but currently disabled (`.off` extension):
- `cdn.off` - CloudFront distribution for video delivery
- `cognito.off` - User authentication
- `dns.off` - Route 53 DNS configuration
- `ui.off` - ECS-based web UI
- `vpc.off` - VPC networking

To enable, rename the file to `.tf` and configure required variables.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.13 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.21.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | >= 3.7.0 |
| <a name="requirement_tls"></a> [tls](#requirement\_tls) | >= 4.1.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.21.0 |
| <a name="provider_aws.us-east-1"></a> [aws.us-east-1](#provider\_aws.us-east-1) | >= 6.21.0 |
| <a name="provider_random"></a> [random](#provider\_random) | >= 3.7.0 |
| <a name="provider_tls"></a> [tls](#provider\_tls) | >= 4.1.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_cdn_waf_private"></a> [cdn\_waf\_private](#module\_cdn\_waf\_private) | git::ssh://git@github.com/edfenergy/eis-terraform-modules.git//aws-waf | 3.0.9 |
| <a name="module_dynamo_db_table_mva_case_data"></a> [dynamo\_db\_table\_mva\_case\_data](#module\_dynamo\_db\_table\_mva\_case\_data) | ./dynamodb | n/a |
| <a name="module_dynamo_db_table_rekognition_throttle"></a> [dynamo\_db\_table\_rekognition\_throttle](#module\_dynamo\_db\_table\_rekognition\_throttle) | ./dynamodb | n/a |
| <a name="module_lambda_function_api_authorizer"></a> [lambda\_function\_api\_authorizer](#module\_lambda\_function\_api\_authorizer) | git::ssh://git@github.com/edfenergy/eit-terraform-modules.git//aws-lambda | v35.3.2 |
| <a name="module_lambda_function_generate_report"></a> [lambda\_function\_generate\_report](#module\_lambda\_function\_generate\_report) | git::ssh://git@github.com/edfenergy/eit-terraform-modules.git//aws-lambda | v35.3.2 |
| <a name="module_lambda_function_save_facial_analysis_to_s3"></a> [lambda\_function\_save\_facial\_analysis\_to\_s3](#module\_lambda\_function\_save\_facial\_analysis\_to\_s3) | git::ssh://git@github.com/edfenergy/eit-terraform-modules.git//aws-lambda | v35.3.2 |
| <a name="module_lambda_function_save_object_labels_to_s3"></a> [lambda\_function\_save\_object\_labels\_to\_s3](#module\_lambda\_function\_save\_object\_labels\_to\_s3) | git::ssh://git@github.com/edfenergy/eit-terraform-modules.git//aws-lambda | v35.3.2 |
| <a name="module_lambda_function_submit_api_request"></a> [lambda\_function\_submit\_api\_request](#module\_lambda\_function\_submit\_api\_request) | git::ssh://git@github.com/edfenergy/eit-terraform-modules.git//aws-lambda | v35.3.2 |
| <a name="module_lambda_function_submit_video_for_processing"></a> [lambda\_function\_submit\_video\_for\_processing](#module\_lambda\_function\_submit\_video\_for\_processing) | git::ssh://git@github.com/edfenergy/eit-terraform-modules.git//aws-lambda | v35.3.2 |
| <a name="module_lambda_function_transcode_video"></a> [lambda\_function\_transcode\_video](#module\_lambda\_function\_transcode\_video) | git::ssh://git@github.com/edfenergy/eit-terraform-modules.git//aws-lambda | v35.3.2 |
| <a name="module_this"></a> [this](#module\_this) | cloudposse/label/null | 0.25.0 |

## Resources

| Name | Type |
|------|------|
| [aws_acm_certificate.default](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/acm_certificate) | resource |
| [aws_acm_certificate_validation.default](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/acm_certificate_validation) | resource |
| [aws_api_gateway_account.main](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_account) | resource |
| [aws_api_gateway_authorizer.lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_authorizer) | resource |
| [aws_api_gateway_deployment.fastapi](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_deployment) | resource |
| [aws_api_gateway_integration.lambda_proxy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_integration) | resource |
| [aws_api_gateway_integration.proxy_options](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_integration) | resource |
| [aws_api_gateway_integration.root_integration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_integration) | resource |
| [aws_api_gateway_integration.root_options](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_integration) | resource |
| [aws_api_gateway_integration_response.proxy_options_200](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_integration_response) | resource |
| [aws_api_gateway_integration_response.root_options_200](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_integration_response) | resource |
| [aws_api_gateway_method.proxy_method](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method) | resource |
| [aws_api_gateway_method.proxy_options](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method) | resource |
| [aws_api_gateway_method.root_method](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method) | resource |
| [aws_api_gateway_method.root_options](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method) | resource |
| [aws_api_gateway_method_response.proxy_options_200](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method_response) | resource |
| [aws_api_gateway_method_response.root_options_200](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method_response) | resource |
| [aws_api_gateway_method_settings.fastapi_stage_all_methods](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_method_settings) | resource |
| [aws_api_gateway_resource.root_proxy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_resource) | resource |
| [aws_api_gateway_rest_api.fastapi_agw](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_rest_api) | resource |
| [aws_api_gateway_stage.fastapi_stage](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_stage) | resource |
| [aws_cloudfront_distribution.main](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution) | resource |
| [aws_cloudfront_function.spa_rewrite_to_index](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_function) | resource |
| [aws_cloudfront_function.strip_videos_prefix](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_function) | resource |
| [aws_cloudfront_key_group.video_signing](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_key_group) | resource |
| [aws_cloudfront_origin_access_control.ui](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control) | resource |
| [aws_cloudfront_origin_access_control.video](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control) | resource |
| [aws_cloudfront_public_key.video_signing](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_public_key) | resource |
| [aws_cloudwatch_dashboard.main](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_dashboard) | resource |
| [aws_cloudwatch_event_rule.keep_warm](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.keep_warm_target](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.api_gateway](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_metric_filter.submit_api_origin_verify_forbidden](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_metric_filter) | resource |
| [aws_cloudwatch_metric_alarm.api_gateway_4xx_errors](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.api_gateway_5xx_errors](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.api_gateway_high_integration_latency](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.api_gateway_high_latency](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.cloudfront_5xx_errors](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.cloudfront_cache_hit_rate_low](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.dynamodb_read_throttles](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.dynamodb_write_throttles](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.lambda_generate_report_errors](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.lambda_submit_video_errors](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.lambda_submit_video_throttles](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.lambda_transcode_video_errors](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.lambda_transcode_video_throttles](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.sqs_video_queue_depth](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.submit_api_origin_verify_forbidden_spike](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cloudwatch_metric_alarm.waf_blocked_requests_spike](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_iam_policy.rekognition_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_role.api_gateway_cloudwatch](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.rekognition](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy_attachment.api_gateway_cloudwatch](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.role_attachment](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_kms_alias.cloudwatch_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_alias.dynamodb](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_alias.internal](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_alias.sns](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_alias.ui](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_key.cloudwatch_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |
| [aws_kms_key.dynamodb](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |
| [aws_kms_key.internal](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |
| [aws_kms_key.sns](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |
| [aws_kms_key.ui](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |
| [aws_lambda_event_source_mapping.submit_video_sqs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) | resource |
| [aws_lambda_permission.allow_events](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.apigw_invoke](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.apigw_invoke_authorizer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.generate_report_s3](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_route53_record.cloudfront_alias](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.default_cert_validation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_s3_bucket.cloudfront_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket.internal](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket.ui](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket.waf_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket_acl.cloudfront_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_acl) | resource |
| [aws_s3_bucket_cors_configuration.internal_cors](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_cors_configuration) | resource |
| [aws_s3_bucket_lifecycle_configuration.cloudfront_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration) | resource |
| [aws_s3_bucket_lifecycle_configuration.internal](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration) | resource |
| [aws_s3_bucket_lifecycle_configuration.waf_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration) | resource |
| [aws_s3_bucket_notification.internal_bucket_notifications](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_notification) | resource |
| [aws_s3_bucket_ownership_controls.cloudfront_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_ownership_controls) | resource |
| [aws_s3_bucket_policy.internal](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_policy.ui](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_policy.waf_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_public_access_block.cloudfront_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_public_access_block.internal_access](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_public_access_block.ui](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_public_access_block.waf_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_server_side_encryption_configuration.cloudfront_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_server_side_encryption_configuration) | resource |
| [aws_s3_bucket_server_side_encryption_configuration.internal](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_server_side_encryption_configuration) | resource |
| [aws_s3_bucket_server_side_encryption_configuration.ui](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_server_side_encryption_configuration) | resource |
| [aws_s3_bucket_server_side_encryption_configuration.waf_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_server_side_encryption_configuration) | resource |
| [aws_s3_bucket_versioning.cloudfront_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_versioning) | resource |
| [aws_s3_bucket_versioning.internal_versioning](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_versioning) | resource |
| [aws_s3_bucket_versioning.ui](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_versioning) | resource |
| [aws_s3_bucket_versioning.waf_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_versioning) | resource |
| [aws_sns_topic.alarms](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic) | resource |
| [aws_sns_topic.facial_analysis](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic) | resource |
| [aws_sns_topic.objects_detection](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic) | resource |
| [aws_sns_topic.processing_updates](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic) | resource |
| [aws_sns_topic.rekognition_job_notifications](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic) | resource |
| [aws_sns_topic_subscription.alarms_email](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic_subscription) | resource |
| [aws_sns_topic_subscription.generate_report](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic_subscription) | resource |
| [aws_sns_topic_subscription.save_facial_analysis_to_s3](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic_subscription) | resource |
| [aws_sns_topic_subscription.save_object_labels_to_s3](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sns_topic_subscription) | resource |
| [aws_sqs_queue.video_processing](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue_policy.video_processing](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [aws_ssm_parameter.cloudfront_origin_secret](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.inclusion_list](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.labels_with_bounding_box](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.rekognition_concurrent_limit](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.video_signing_key_pair_id](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.video_signing_private_key](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [random_password.cloudfront_origin_secret](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/password) | resource |
| [tls_private_key.signed_url_key](https://registry.terraform.io/providers/hashicorp/tls/latest/docs/resources/private_key) | resource |
| [aws_caller_identity.self](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_cloudfront_cache_policy.caching_disabled](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_cache_policy) | data source |
| [aws_cloudfront_cache_policy.caching_optimized](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_cache_policy) | data source |
| [aws_cloudfront_origin_request_policy.all_viewer_except_host](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_origin_request_policy) | data source |
| [aws_cloudfront_origin_request_policy.cors_s3](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_origin_request_policy) | data source |
| [aws_ecr_image.submit_api_request](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ecr_image) | data source |
| [aws_ecr_image.transcode_video](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ecr_image) | data source |
| [aws_ecr_repository.submit_api_request](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ecr_repository) | data source |
| [aws_ecr_repository.transcode_video](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ecr_repository) | data source |
| [aws_route53_zone.workload_zone](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/route53_zone) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_additional_tag_map"></a> [additional\_tag\_map](#input\_additional\_tag\_map) | Additional key-value pairs to add to each map in `tags_as_list_of_maps`. Not added to `tags` or `id`.<br/>This is for some rare cases where resources want additional configuration of tags<br/>and therefore take a list of maps with tag key, value, and additional configuration. | `map(string)` | `{}` | no |
| <a name="input_alarm_email"></a> [alarm\_email](#input\_alarm\_email) | Email address to receive CloudWatch alarm notifications (leave empty to skip email subscription) | `string` | `""` | no |
| <a name="input_allowed_ips"></a> [allowed\_ips](#input\_allowed\_ips) | List of availability zones | `list(string)` | n/a | yes |
| <a name="input_attributes"></a> [attributes](#input\_attributes) | ID element. Additional attributes (e.g. `workers` or `cluster`) to add to `id`,<br/>in the order they appear in the list. New attributes are appended to the<br/>end of the list. The elements of the list are joined by the `delimiter`<br/>and treated as a single ID element. | `list(string)` | `[]` | no |
| <a name="input_bucket_raw_videos_prefix"></a> [bucket\_raw\_videos\_prefix](#input\_bucket\_raw\_videos\_prefix) | n/a | `string` | `"raw-videos"` | no |
| <a name="input_bucket_results_prefix"></a> [bucket\_results\_prefix](#input\_bucket\_results\_prefix) | n/a | `string` | `"results/"` | no |
| <a name="input_cognito_user_pool_client_id"></a> [cognito\_user\_pool\_client\_id](#input\_cognito\_user\_pool\_client\_id) | Shared Cognito User Pool App Client ID used for JWT validation in the API Gateway Lambda authorizer | `string` | n/a | yes |
| <a name="input_cognito_user_pool_id"></a> [cognito\_user\_pool\_id](#input\_cognito\_user\_pool\_id) | Shared Cognito User Pool ID used for API Gateway Cognito authorizer | `string` | n/a | yes |
| <a name="input_context"></a> [context](#input\_context) | Single object for setting entire context at once.<br/>See description of individual variables for details.<br/>Leave string and numeric variables as `null` to use default value.<br/>Individual variable settings (non-null) override settings in context object,<br/>except for attributes, tags, and additional\_tag\_map, which are merged. | `any` | <pre>{<br/>  "additional_tag_map": {},<br/>  "attributes": [],<br/>  "delimiter": null,<br/>  "descriptor_formats": {},<br/>  "enabled": true,<br/>  "environment": null,<br/>  "id_length_limit": null,<br/>  "label_key_case": null,<br/>  "label_order": [],<br/>  "label_value_case": null,<br/>  "labels_as_tags": [<br/>    "unset"<br/>  ],<br/>  "name": null,<br/>  "namespace": null,<br/>  "regex_replace_chars": null,<br/>  "stage": null,<br/>  "tags": {},<br/>  "tenant": null<br/>}</pre> | no |
| <a name="input_delimiter"></a> [delimiter](#input\_delimiter) | Delimiter to be used between ID elements.<br/>Defaults to `-` (hyphen). Set to `""` to use no delimiter at all. | `string` | `null` | no |
| <a name="input_descriptor_formats"></a> [descriptor\_formats](#input\_descriptor\_formats) | Describe additional descriptors to be output in the `descriptors` output map.<br/>Map of maps. Keys are names of descriptors. Values are maps of the form<br/>`{<br/>   format = string<br/>   labels = list(string)<br/>}`<br/>(Type is `any` so the map values can later be enhanced to provide additional options.)<br/>`format` is a Terraform format string to be passed to the `format()` function.<br/>`labels` is a list of labels, in order, to pass to `format()` function.<br/>Label values will be normalized before being passed to `format()` so they will be<br/>identical to how they appear in `id`.<br/>Default is `{}` (`descriptors` output will be empty). | `any` | `{}` | no |
| <a name="input_enabled"></a> [enabled](#input\_enabled) | Set to false to prevent the module from creating any resources | `bool` | `null` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | n/a | `string` | `"dev"` | no |
| <a name="input_id_length_limit"></a> [id\_length\_limit](#input\_id\_length\_limit) | Limit `id` to this many characters (minimum 6).<br/>Set to `0` for unlimited length.<br/>Set to `null` for keep the existing setting, which defaults to `0`.<br/>Does not affect `id_full`. | `number` | `null` | no |
| <a name="input_label_key_case"></a> [label\_key\_case](#input\_label\_key\_case) | Controls the letter case of the `tags` keys (label names) for tags generated by this module.<br/>Does not affect keys of tags passed in via the `tags` input.<br/>Possible values: `lower`, `title`, `upper`.<br/>Default value: `title`. | `string` | `null` | no |
| <a name="input_label_order"></a> [label\_order](#input\_label\_order) | The order in which the labels (ID elements) appear in the `id`.<br/>Defaults to ["namespace", "environment", "stage", "name", "attributes"].<br/>You can omit any of the 6 labels ("tenant" is the 6th), but at least one must be present. | `list(string)` | `null` | no |
| <a name="input_label_value_case"></a> [label\_value\_case](#input\_label\_value\_case) | Controls the letter case of ID elements (labels) as included in `id`,<br/>set as tag values, and output by this module individually.<br/>Does not affect values of tags passed in via the `tags` input.<br/>Possible values: `lower`, `title`, `upper` and `none` (no transformation).<br/>Set this to `title` and set `delimiter` to `""` to yield Pascal Case IDs.<br/>Default value: `lower`. | `string` | `null` | no |
| <a name="input_labels_as_tags"></a> [labels\_as\_tags](#input\_labels\_as\_tags) | Set of labels (ID elements) to include as tags in the `tags` output.<br/>Default is to include all labels.<br/>Tags with empty values will not be included in the `tags` output.<br/>Set to `[]` to suppress all generated tags.<br/>**Notes:**<br/>  The value of the `name` tag, if included, will be the `id`, not the `name`.<br/>  Unlike other `null-label` inputs, the initial setting of `labels_as_tags` cannot be<br/>  changed in later chained modules. Attempts to change it will be silently ignored. | `set(string)` | <pre>[<br/>  "default"<br/>]</pre> | no |
| <a name="input_name"></a> [name](#input\_name) | ID element. Usually the component or solution name, e.g. 'app' or 'jenkins'.<br/>This is the only ID element not also included as a `tag`.<br/>The "name" tag is set to the full `id` string. There is no tag with the value of the `name` input. | `string` | `null` | no |
| <a name="input_namespace"></a> [namespace](#input\_namespace) | ID element. Usually an abbreviation of your organization name, e.g. 'eg' or 'cp', to help ensure generated IDs are globally unique | `string` | `"dvai"` | no |
| <a name="input_random_suffix"></a> [random\_suffix](#input\_random\_suffix) | n/a | `string` | n/a | yes |
| <a name="input_regex_replace_chars"></a> [regex\_replace\_chars](#input\_regex\_replace\_chars) | Terraform regular expression (regex) string.<br/>Characters matching the regex will be removed from the ID elements.<br/>If not set, `"/[^a-zA-Z0-9-]/"` is used to remove all characters other than hyphens, letters and digits. | `string` | `null` | no |
| <a name="input_region"></a> [region](#input\_region) | AWS region | `string` | n/a | yes |
| <a name="input_s3_object_tags"></a> [s3\_object\_tags](#input\_s3\_object\_tags) | Tags to apply to S3 objects (max 10 tags supported) | `map(string)` | `{}` | no |
| <a name="input_stage"></a> [stage](#input\_stage) | ID element. Usually used to indicate role, e.g. 'prod', 'staging', 'source', 'build', 'test', 'deploy', 'release' | `string` | `null` | no |
| <a name="input_subdomain"></a> [subdomain](#input\_subdomain) | n/a | `string` | `"sandbox"` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Additional tags (e.g. `{'BusinessUnit': 'XYZ'}`).<br/>Neither the tag keys nor the tag values will be modified by this module. | `map(string)` | `{}` | no |
| <a name="input_tenant"></a> [tenant](#input\_tenant) | ID element \_(Rarely used, not included by default)\_. A customer identifier, indicating who this instance of a resource is for | `string` | `null` | no |
| <a name="input_top_level_domain"></a> [top\_level\_domain](#input\_top\_level\_domain) | n/a | `string` | `"cus-paycol-debt-video-ai-engine.aws.edfcloud.io"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_alarm_sns_topic_arn"></a> [alarm\_sns\_topic\_arn](#output\_alarm\_sns\_topic\_arn) | SNS topic ARN for CloudWatch alarms |
| <a name="output_api_gateway_log_group"></a> [api\_gateway\_log\_group](#output\_api\_gateway\_log\_group) | CloudWatch log group for API Gateway access logs |
| <a name="output_app_url"></a> [app\_url](#output\_app\_url) | Application URL (custom domain) |
| <a name="output_bucket_internal"></a> [bucket\_internal](#output\_bucket\_internal) | n/a |
| <a name="output_bucket_ui"></a> [bucket\_ui](#output\_bucket\_ui) | S3 bucket ID for React UI static assets |
| <a name="output_cloudfront_distribution_arn"></a> [cloudfront\_distribution\_arn](#output\_cloudfront\_distribution\_arn) | CloudFront distribution ARN |
| <a name="output_cloudfront_distribution_domain_name"></a> [cloudfront\_distribution\_domain\_name](#output\_cloudfront\_distribution\_domain\_name) | CloudFront distribution domain name |
| <a name="output_cloudfront_distribution_id"></a> [cloudfront\_distribution\_id](#output\_cloudfront\_distribution\_id) | CloudFront distribution ID |
| <a name="output_cloudfront_logs_bucket"></a> [cloudfront\_logs\_bucket](#output\_cloudfront\_logs\_bucket) | S3 bucket ID for CloudFront access logs |
| <a name="output_cloudwatch_dashboard_name"></a> [cloudwatch\_dashboard\_name](#output\_cloudwatch\_dashboard\_name) | Name of the CloudWatch dashboard |
| <a name="output_cloudwatch_dashboard_url"></a> [cloudwatch\_dashboard\_url](#output\_cloudwatch\_dashboard\_url) | URL to the CloudWatch dashboard |
| <a name="output_m_ecr_sub_api_req_repository_url"></a> [m\_ecr\_sub\_api\_req\_repository\_url](#output\_m\_ecr\_sub\_api\_req\_repository\_url) | ECR repository URL for submit-api-request Lambda |
| <a name="output_video_signing_key_pair_id"></a> [video\_signing\_key\_pair\_id](#output\_video\_signing\_key\_pair\_id) | CloudFront key pair ID for generating signed video URLs |
| <a name="output_video_signing_private_key_ssm_param"></a> [video\_signing\_private\_key\_ssm\_param](#output\_video\_signing\_private\_key\_ssm\_param) | SSM parameter name for video signing private key |
<!-- END_TF_DOCS -->
