# Azure Databricks Platform Engineering
## Architecture, Best Practices, Resilience, and Operational Excellence

**Version 1.0 | January 2026**

---

## Executive Summary

Azure Databricks is a unified analytics platform built on Apache Spark, jointly developed by Microsoft and Databricks. While it abstracts much of the underlying infrastructure complexity, getting it right at enterprise scale requires careful architectural decisions around workspace design, compute management, data governance, resilience, and operational practices. This guide provides platform engineers and architects with the knowledge needed to design, deploy, and operate Databricks in production environments like Howden's.

---

## 1. Understanding the Databricks Architecture

### 1.1 The Control Plane / Data Plane Split

This is the fundamental concept that shapes every architectural decision.

#### Control Plane (Databricks-Managed)

| Component | What It Does | Your Control |
|-----------|--------------|--------------|
| Workspace Application | Web UI, notebooks, job scheduler | Configuration only |
| Cluster Manager | Provisions and manages compute | Policy-based control |
| Unity Catalog Metastore | Centralised metadata and governance | Full administrative control |
| MLflow Tracking Server | Experiment tracking, model registry | Full usage control |
| Repos Service | Git integration, CI/CD | Configuration only |
| Secrets Management | Databricks-native secret scopes | Full control (or use Key Vault) |

#### Data Plane (Your Subscription)

| Component | What It Does | Your Control |
|-----------|--------------|--------------|
| Cluster VMs | Driver and worker nodes | Full infrastructure control |
| DBFS Storage | Workspace file storage | Managed, but you control access |
| Your Data Lake | Actual data storage (ADLS Gen2) | Full control |
| Network Infrastructure | VNets, NSGs, firewalls | Full control (with VNet injection) |

**Key Insight:** Your data never leaves your subscription. The control plane orchestrates, but compute and data stay in your environment.

### 1.2 Workspace Concepts

A workspace is your primary unit of organisation. Understanding the hierarchy:

```
Account (Databricks Account Console)
└── Workspace 1 (UK South - Production)
│   ├── Unity Catalog (shared or dedicated metastore)
│   ├── Clusters (interactive and job clusters)
│   ├── Jobs (scheduled workflows)
│   ├── Notebooks & Repos
│   └── SQL Warehouses
└── Workspace 2 (UK South - Development)
└── Workspace 3 (UK West - DR)
```

---

## 2. Workspace Strategy and Design

### 2.1 Single vs Multiple Workspaces

One of the first architectural decisions. There's no single right answer.

| Pattern | Pros | Cons | Recommended When |
|---------|------|------|------------------|
| Single workspace | Simple management, unified view | Blast radius, noisy neighbours, complex RBAC | Small teams, non-critical workloads |
| Workspace per environment | Clear separation, easier promotion | Management overhead, Unity Catalog complexity | Most enterprise deployments |
| Workspace per team/domain | Strong isolation, team autonomy | Significant overhead, data sharing challenges | Large organisations, strict compliance |
| Workspace per region | DR capability, data residency | Sync complexity, cost | Regulated industries, global operations |

#### Recommended Pattern for Howden

Given insurance industry requirements (regulatory compliance, data sensitivity, operational criticality):

```
Production Environment
├── dbw-prod-uksouth (Primary)
├── dbw-prod-ukwest (DR - warm standby)

Non-Production
├── dbw-dev-uksouth (Development)
├── dbw-uat-uksouth (UAT/Staging)
```

### 2.2 Workspace Sizing Considerations

| Factor | Consideration |
|--------|---------------|
| Concurrent users | Each workspace supports thousands, but consider noisy neighbour effects |
| Cluster count | Soft limit ~100 concurrent clusters per workspace (can be increased) |
| Job concurrency | Default 1000 concurrent runs per workspace |
| Storage | DBFS root storage grows with usage - plan for lifecycle management |
| Unity Catalog | One metastore per region, shared across workspaces |

### 2.3 Naming Conventions

Establish these early - retrofitting is painful.

```
Workspaces:    dbw-{env}-{region}[-{team}]
               dbw-prod-uksouth, dbw-dev-uksouth-dataeng

Clusters:      {env}-{purpose}-{size}
               prod-etl-large, dev-interactive-small

Jobs:          {domain}_{pipeline}_{frequency}
               finance_daily_reconciliation_daily

SQL Warehouses: sql-{env}-{purpose}
                sql-prod-reporting, sql-dev-adhoc
```

---

## 3. Compute Management

### 3.1 Cluster Types

| Type | Use Case | Lifecycle | Cost Model |
|------|----------|-----------|------------|
| All-Purpose (Interactive) | Development, exploration, ad-hoc analysis | Long-running, manual termination | Expensive - charges while idle |
| Job Cluster | Production workloads, scheduled jobs | Created per job, auto-terminates | Cost-effective for batch |
| SQL Warehouse | BI queries, SQL analytics | Serverless or classic | Per-query or provisioned |
| Instance Pool | Pre-warmed VMs for faster startup | Persistent pool of idle VMs | Reduced startup time, idle cost |

### 3.2 Cluster Configuration Best Practices

#### Right-Sizing Principles

| Workload Type | Driver | Workers | Instance Type | Autoscaling |
|---------------|--------|---------|---------------|-------------|
| Light ETL | Standard_DS3_v2 | 2-4 | Standard_DS3_v2 | Yes (2-8) |
| Heavy ETL | Standard_DS4_v2 | 4-8 | Standard_DS4_v2 | Yes (4-16) |
| ML Training | Standard_DS4_v2 | 4-16 | Standard_NC6s_v3 (GPU) | Limited |
| Interactive | Standard_DS3_v2 | 2-4 | Standard_DS3_v2 | Yes (2-8) |
| Streaming | Standard_DS4_v2 | 4-8 | Standard_DS4_v2 | No (fixed) |

#### Autoscaling Configuration

```json
{
  "autoscale": {
    "min_workers": 2,
    "max_workers": 8
  },
  "autotermination_minutes": 30,
  "spark_conf": {
    "spark.databricks.cluster.profile": "serverless",
    "spark.databricks.repl.allowedLanguages": "python,sql"
  }
}
```

**Gotcha:** Autoscaling down is slow (5-10 minutes) because Spark needs to gracefully migrate data. Don't expect instant cost savings.

### 3.3 Instance Pools

Instance pools pre-allocate VMs, dramatically reducing cluster startup time.

| Without Pool | With Pool |
|--------------|-----------|
| 5-10 minutes startup | 30-60 seconds startup |
| Cold VM provisioning | Pre-warmed VMs ready |
| Variable startup time | Consistent startup time |

#### Pool Configuration

```json
{
  "instance_pool_name": "prod-general-pool",
  "node_type_id": "Standard_DS3_v2",
  "min_idle_instances": 2,
  "max_capacity": 20,
  "idle_instance_autotermination_minutes": 30,
  "preloaded_spark_versions": ["13.3.x-scala2.12"]
}
```

**Cost Trade-off:** You pay for idle instances in the pool, but save on startup time and improve developer experience. Calculate break-even based on cluster start frequency.

### 3.4 Cluster Policies

Cluster policies are your governance mechanism. They enforce standards and prevent runaway costs.

#### Essential Policies

```json
{
  "name": "Production ETL Policy",
  "definition": {
    "spark_version": {
      "type": "regex",
      "pattern": "13\\.[0-9]+\\.x-scala2\\.12",
      "defaultValue": "13.3.x-scala2.12"
    },
    "node_type_id": {
      "type": "allowlist",
      "values": ["Standard_DS3_v2", "Standard_DS4_v2"],
      "defaultValue": "Standard_DS3_v2"
    },
    "autotermination_minutes": {
      "type": "range",
      "minValue": 10,
      "maxValue": 60,
      "defaultValue": 30
    },
    "custom_tags.CostCenter": {
      "type": "fixed",
      "value": "DataPlatform"
    },
    "custom_tags.Environment": {
      "type": "fixed",
      "value": "Production"
    }
  }
}
```

#### Policy Governance Model

| Environment | Who Can Create | Policy Enforcement |
|-------------|----------------|-------------------|
| Production | Platform team only | Strict - no exceptions |
| UAT | Platform team + leads | Strict - matches production |
| Development | All developers | Relaxed - cost guardrails only |

---

## 4. Unity Catalog and Data Governance

### 4.1 Why Unity Catalog Matters

Unity Catalog is Databricks' answer to data governance. It replaces the legacy Hive metastore with a unified, account-level catalog.

| Legacy (Hive Metastore) | Unity Catalog |
|-------------------------|---------------|
| Workspace-scoped | Account-scoped |
| No fine-grained access | Row/column-level security |
| Limited audit | Full audit logging |
| No data lineage | Built-in lineage tracking |
| Credential sprawl | Centralised storage credentials |

### 4.2 Unity Catalog Architecture

```
Account
└── Metastore (one per region)
    ├── Catalog: prod_data
    │   ├── Schema: finance
    │   │   ├── Table: transactions
    │   │   ├── Table: accounts
    │   │   └── View: daily_summary
    │   └── Schema: claims
    │       ├── Table: claims_raw
    │       └── Table: claims_processed
    ├── Catalog: dev_data
    │   └── ...
    └── External Locations
        ├── adls://datalake/bronze
        ├── adls://datalake/silver
        └── adls://datalake/gold
```

### 4.3 Governance Best Practices

#### Catalog Strategy

| Pattern | Structure | Use Case |
|---------|-----------|----------|
| Environment catalogs | prod_data, dev_data, uat_data | Clear environment separation |
| Domain catalogs | finance, claims, underwriting | Domain-driven design |
| Medallion catalogs | bronze, silver, gold | Data quality tiers |
| Hybrid | prod_finance, prod_claims | Large organisations |

**Recommended for Howden:** Environment-based top level with domain schemas:

```
prod_data.finance.transactions
prod_data.claims.claims_raw
dev_data.finance.transactions (isolated copy)
```

#### Access Control

Unity Catalog uses a hierarchical permission model:

| Level | Permissions | Inheritance |
|-------|-------------|-------------|
| Metastore | CREATE CATALOG, admin | None |
| Catalog | USE CATALOG, CREATE SCHEMA | Down to schemas |
| Schema | USE SCHEMA, CREATE TABLE | Down to tables |
| Table/View | SELECT, MODIFY | None |

```sql
-- Grant production read access to analysts
GRANT USE CATALOG ON CATALOG prod_data TO analysts;
GRANT USE SCHEMA ON SCHEMA prod_data.finance TO analysts;
GRANT SELECT ON TABLE prod_data.finance.transactions TO analysts;

-- Grant developers full access to dev
GRANT ALL PRIVILEGES ON CATALOG dev_data TO developers;
```

### 4.4 Storage Credentials and External Locations

Centralise storage access through Unity Catalog:

```sql
-- Create storage credential using managed identity
CREATE STORAGE CREDENTIAL datalake_credential
WITH (AZURE_MANAGED_IDENTITY = '/subscriptions/.../managedIdentities/dbw-identity');

-- Create external location
CREATE EXTERNAL LOCATION bronze_zone
URL 'abfss://bronze@datalake.dfs.core.windows.net/'
WITH (STORAGE CREDENTIAL datalake_credential);

-- Grant access
GRANT READ FILES ON EXTERNAL LOCATION bronze_zone TO data_engineers;
```

---

## 5. Job Orchestration and Workflows

### 5.1 Databricks Workflows

Databricks Workflows is the native orchestration tool. It's improved significantly and is now viable for most use cases.

#### Job Types

| Type | Use Case | Trigger |
|------|----------|---------|
| Single Task | Simple, single notebook/script | Schedule, manual, API |
| Multi-Task | Complex DAGs, dependencies | Schedule, manual, API |
| Continuous | Streaming workloads | Always running |

#### Multi-Task Job Example

```
┌─────────────┐
│  Ingest     │
│  (Task 1)   │
└──────┬──────┘
       │
       ▼
┌──────┴──────┐
│             │
▼             ▼
┌─────────┐ ┌─────────┐
│Transform│ │ Quality │
│(Task 2) │ │ Check   │
└────┬────┘ │(Task 3) │
     │      └────┬────┘
     │           │
     └─────┬─────┘
           │
           ▼
     ┌─────────┐
     │  Load   │
     │(Task 4) │
     └─────────┘
```

### 5.2 Job Configuration Best Practices

#### Cluster Strategy for Jobs

| Approach | Startup Time | Cost | Isolation | Recommended For |
|----------|--------------|------|-----------|-----------------|
| New job cluster | 5-10 min | Lowest | Full | Batch jobs, production |
| Existing cluster | Instant | Higher | Shared | Development, testing |
| Instance pool | 30-60 sec | Medium | Full | Frequent jobs, SLA-bound |

#### Retry and Alerting

```json
{
  "max_retries": 2,
  "min_retry_interval_millis": 60000,
  "retry_on_timeout": true,
  "email_notifications": {
    "on_failure": ["platform-team@howden.com"],
    "on_start": [],
    "on_success": []
  },
  "webhook_notifications": {
    "on_failure": [{"id": "slack-webhook-id"}]
  }
}
```

### 5.3 External Orchestration Integration

For complex enterprise workflows, you may need external orchestration.

| Tool | Integration Method | Best For |
|------|-------------------|----------|
| Azure Data Factory | Databricks activity | Azure-native, simple pipelines |
| Apache Airflow | Databricks operator | Complex DAGs, multi-system |
| Azure DevOps | REST API / CLI | CI/CD-triggered jobs |
| Prefect / Dagster | REST API | Modern data orchestration |

**Recommendation:** Start with Databricks Workflows. Only introduce external orchestration if you need cross-system dependencies or existing tool integration.

---

## 6. Delta Lake and the Medallion Architecture

### 6.1 Delta Lake Fundamentals

Delta Lake is the storage layer that makes Databricks reliable. Understand it deeply.

#### Key Capabilities

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| ACID Transactions | Atomic writes, consistent reads | No corrupted data, reliable pipelines |
| Schema Enforcement | Validates data against schema | Prevents bad data entering tables |
| Schema Evolution | Safely add/modify columns | Adapt to changing requirements |
| Time Travel | Query historical versions | Audit, debugging, rollback |
| Z-Ordering | Optimise data layout | Faster queries on specific columns |
| Auto-Optimize | Background compaction | Reduced maintenance burden |
| Liquid Clustering | Dynamic data organisation | Modern alternative to partitioning |

### 6.2 Medallion Architecture

The standard pattern for data lakehouse organisation.

```
┌─────────────────────────────────────────────────────────────────┐
│                         BRONZE (Raw)                             │
│  • Exact copy of source data                                    │
│  • Append-only, no transformations                              │
│  • Full history preserved                                       │
│  • Schema: matches source (may be messy)                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SILVER (Cleansed)                         │
│  • Cleaned and conformed data                                   │
│  • Deduplication, null handling                                 │
│  • Standardised schemas                                         │
│  • Business keys established                                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                         GOLD (Curated)                           │
│  • Business-level aggregations                                  │
│  • Dimensional models, feature stores                           │
│  • Ready for BI and ML consumption                              │
│  • Performance-optimised                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Delta Table Best Practices

#### Table Properties

```sql
CREATE TABLE prod_data.finance.transactions (
  transaction_id STRING,
  account_id STRING,
  amount DECIMAL(18,2),
  transaction_date DATE,
  created_at TIMESTAMP
)
USING DELTA
PARTITIONED BY (transaction_date)
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true',
  'delta.logRetentionDuration' = 'interval 30 days',
  'delta.deletedFileRetentionDuration' = 'interval 7 days'
);
```

#### Partitioning Guidelines

| Data Size | Partition Strategy |
|-----------|-------------------|
| < 1TB | No partitioning, use Z-ordering |
| 1-10TB | Single column (date typically) |
| > 10TB | Consider Liquid Clustering |

**Gotcha:** Over-partitioning is worse than under-partitioning. Aim for partitions > 1GB each.

#### Z-Ordering vs Liquid Clustering

| Aspect | Z-Ordering | Liquid Clustering |
|--------|------------|-------------------|
| Configuration | Manual OPTIMIZE command | Table property, automatic |
| Maintenance | Requires scheduled jobs | Self-maintaining |
| Flexibility | Fixed columns | Adaptive |
| Availability | GA | GA (since DBR 13.3) |

```sql
-- Z-Ordering (traditional)
OPTIMIZE prod_data.finance.transactions
ZORDER BY (account_id, transaction_date);

-- Liquid Clustering (modern approach)
ALTER TABLE prod_data.finance.transactions
CLUSTER BY (account_id, transaction_date);
```

### 6.4 Maintenance Operations

#### Essential Maintenance Jobs

```python
# Weekly maintenance job
tables = ["bronze.raw_transactions", "silver.transactions", "gold.daily_summary"]

for table in tables:
    # Optimize and Z-order
    spark.sql(f"OPTIMIZE {table}")

    # Vacuum old files (default 7 day retention)
    spark.sql(f"VACUUM {table}")

    # Analyze for query optimisation
    spark.sql(f"ANALYZE TABLE {table} COMPUTE STATISTICS")
```

#### Vacuum Safety

```sql
-- Check what would be deleted (dry run)
VACUUM prod_data.finance.transactions DRY RUN;

-- Actually delete (respects retention period)
VACUUM prod_data.finance.transactions;

-- Override retention (DANGEROUS - breaks time travel)
SET spark.databricks.delta.retentionDurationCheck.enabled = false;
VACUUM prod_data.finance.transactions RETAIN 0 HOURS;
```

**Warning:** VACUUM with 0 hours retention permanently destroys time travel capability. Never do this in production without explicit approval.

---

## 7. Resilience and High Availability

### 7.1 Understanding Failure Modes

| Component | Failure Mode | Impact | Mitigation |
|-----------|--------------|--------|------------|
| Control Plane | Regional Azure outage | No UI, no cluster management | DR workspace in another region |
| Worker Node | VM failure | Task failure, retry | Spot instance tolerance, retry config |
| Driver Node | VM failure | Job failure | Job retry, checkpointing |
| DBFS | Storage unavailable | Workspace degraded | Multi-region storage, backups |
| Unity Catalog | Metastore unavailable | No data access | Regional metastore redundancy |
| Data Lake | ADLS outage | Data unavailable | RA-GRS replication |

### 7.2 Cluster-Level Resilience

#### Spot Instance Strategy

Spot instances offer 60-90% cost savings but can be reclaimed.

```json
{
  "azure_attributes": {
    "first_on_demand": 1,
    "availability": "SPOT_WITH_FALLBACK_AZURE",
    "spot_bid_max_price": -1
  },
  "num_workers": 4
}
```

| Setting | Behaviour |
|---------|-----------|
| `first_on_demand: 1` | Driver always on-demand (critical) |
| `SPOT_WITH_FALLBACK_AZURE` | Workers try spot, fall back to on-demand |
| `spot_bid_max_price: -1` | Pay up to on-demand price |

#### Spark Configuration for Resilience

```python
spark.conf.set("spark.task.maxFailures", "4")  # Retry failed tasks
spark.conf.set("spark.stage.maxConsecutiveAttempts", "4")  # Retry failed stages
spark.conf.set("spark.speculation", "true")  # Launch speculative tasks for slow executors
```

### 7.3 Job-Level Resilience

#### Idempotent Job Design

Design jobs to be safely re-runnable:

```python
# WRONG - appends duplicates on retry
df.write.mode("append").saveAsTable("target_table")

# RIGHT - merge for idempotency
spark.sql("""
  MERGE INTO target_table t
  USING source_data s
  ON t.id = s.id
  WHEN MATCHED THEN UPDATE SET *
  WHEN NOT MATCHED THEN INSERT *
""")
```

#### Checkpointing for Long Jobs

```python
# Enable checkpointing for streaming
spark.conf.set("spark.sql.streaming.checkpointLocation",
               "abfss://checkpoints@storage.dfs.core.windows.net/job_name")

# For batch, use Delta's built-in transactionality
# Write to staging, then atomic swap
df.write.mode("overwrite").saveAsTable("staging_table")
spark.sql("ALTER TABLE target_table SWAP WITH staging_table")
```

### 7.4 Data Resilience

#### Delta Table Recovery

```python
# View table history
spark.sql("DESCRIBE HISTORY prod_data.finance.transactions").show()

# Restore to previous version
spark.sql("RESTORE TABLE prod_data.finance.transactions TO VERSION AS OF 42")

# Restore to timestamp
spark.sql("""
  RESTORE TABLE prod_data.finance.transactions
  TO TIMESTAMP AS OF '2025-01-15 10:00:00'
""")
```

#### Clone for Safe Testing

```sql
-- Shallow clone (metadata only, shares files) - fast, for testing
CREATE TABLE dev_data.finance.transactions_test
SHALLOW CLONE prod_data.finance.transactions;

-- Deep clone (full copy) - for backups
CREATE TABLE backup.finance.transactions_20250119
DEEP CLONE prod_data.finance.transactions;
```

---

## 8. Disaster Recovery

### 8.1 DR Strategy Options

| Strategy | RTO | RPO | Cost | Complexity |
|----------|-----|-----|------|------------|
| Backup/Restore | Hours | Hours-Days | Low | Low |
| Warm Standby | 30-60 min | Minutes | Medium | Medium |
| Hot Standby | Minutes | Near-zero | High | High |
| Active-Active | Near-zero | Near-zero | Highest | Highest |

**Recommended for Howden:** Warm Standby with automated failover capability.

### 8.2 DR Architecture

```
Primary Region (UK South)                 DR Region (UK West)
┌────────────────────────┐               ┌────────────────────────┐
│  dbw-prod-uksouth      │               │  dbw-prod-ukwest       │
│  (Active)              │               │  (Warm Standby)        │
├────────────────────────┤               ├────────────────────────┤
│  • Running clusters    │               │  • Workspace deployed  │
│  • Active jobs         │               │  • No running clusters │
│  • User access         │               │  • Jobs defined (off)  │
└───────────┬────────────┘               └───────────┬────────────┘
            │                                        │
            ▼                                        ▼
┌────────────────────────┐               ┌────────────────────────┐
│  ADLS Gen2 (Primary)   │──────────────▶│  ADLS Gen2 (Secondary) │
│  adlsproduksouth       │   RA-GRS      │  adlsprodukwest        │
│                        │   Replication │                        │
└────────────────────────┘               └────────────────────────┘
            │                                        │
            └──────────────────┬─────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   Unity Catalog     │
                    │   (Account-level)   │
                    │   Regional Metastore│
                    └─────────────────────┘
```

### 8.3 What Needs to Be Replicated

| Component | Replication Method | Frequency |
|-----------|-------------------|-----------|
| Data (Delta tables) | ADLS RA-GRS or deep clone | Continuous (RA-GRS) or daily |
| Unity Catalog metadata | Automatic (regional metastore) | Real-time |
| Notebooks/Repos | Git (source of truth) | On commit |
| Job definitions | Terraform/ARM/API export | On change (CI/CD) |
| Cluster policies | Terraform/ARM | On change |
| Secrets | Replicate Key Vault | On change |
| User permissions | Unity Catalog + SCIM | Real-time |

### 8.4 Failover Procedure

#### Automated Failover Checklist

```bash
#!/bin/bash
# DR Failover Script - Execute from Azure DevOps or Automation Account

# 1. Verify primary is actually down (avoid split-brain)
PRIMARY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://adb-xxx.azuredatabricks.net/api/2.0/clusters/list)
if [ "$PRIMARY_HEALTH" == "200" ]; then
    echo "Primary appears healthy. Aborting failover."
    exit 1
fi

# 2. Promote DR storage to primary (if using RA-GRS)
az storage account failover --name adlsprodukwest

# 3. Update DNS to point to DR workspace
az network dns record-set cname set-record \
    --resource-group dns-rg \
    --zone-name howden.com \
    --record-set-name databricks \
    --cname adb-dr.ukwest.azuredatabricks.net

# 4. Enable scheduled jobs in DR workspace
python enable_dr_jobs.py --workspace dr-workspace-url

# 5. Notify operations
curl -X POST $SLACK_WEBHOOK -d '{"text":"DR failover complete. Databricks now running in UK West."}'
```

### 8.5 DR Testing

Test DR quarterly at minimum. Document and automate:

| Test Type | Frequency | Scope |
|-----------|-----------|-------|
| Runbook review | Monthly | Documentation check |
| Component failover | Quarterly | Single component (e.g., storage) |
| Full DR test | Annually | Complete failover and failback |

---

## 9. Security Best Practices

### 9.1 Identity and Access Management

#### Authentication Hierarchy

| Method | Use Case | Security Level |
|--------|----------|----------------|
| Azure AD SSO | Interactive users | Highest |
| Service Principal | Automated jobs, CI/CD | High |
| Personal Access Token | Legacy, CLI, testing | Medium (time-limited) |
| Azure Managed Identity | Azure service integration | Highest |

#### SCIM Provisioning

Automate user/group sync from Azure AD:

```
Azure AD → SCIM → Databricks Account → Workspaces
```

Benefits:
- Automatic user provisioning/deprovisioning
- Group membership sync
- No manual user management

### 9.2 Data Security

#### Encryption

| Layer | Encryption | Key Management |
|-------|------------|----------------|
| Data at rest (ADLS) | AES-256 | Microsoft-managed or CMK |
| Data at rest (DBFS) | AES-256 | Microsoft-managed or CMK |
| Data in transit | TLS 1.2+ | Microsoft-managed |
| Notebook/secret storage | AES-256 | Databricks-managed or CMK |

#### Customer-Managed Keys

For regulated industries, enable CMK:

```bash
az databricks workspace update \
    --resource-group MyRG \
    --name my-workspace \
    --key-source Microsoft.Keyvault \
    --key-name databricks-cmk \
    --key-vault https://myvault.vault.azure.net \
    --key-version xxx
```

### 9.3 Network Security

| Control | Implementation |
|---------|----------------|
| VNet injection | Deploy data plane in your VNet |
| Private Link | Private endpoints for UI and backend |
| NSG | Control traffic at subnet level |
| Firewall | Centralised egress control |
| IP Access Lists | Restrict workspace access by IP |

### 9.4 Audit and Compliance

#### Diagnostic Logging

Enable and export all logs:

```bash
az monitor diagnostic-settings create \
    --resource "/subscriptions/.../databricks/workspaces/myworkspace" \
    --name "send-to-log-analytics" \
    --logs '[{"category": "accounts", "enabled": true},
             {"category": "clusters", "enabled": true},
             {"category": "jobs", "enabled": true},
             {"category": "notebook", "enabled": true},
             {"category": "secrets", "enabled": true},
             {"category": "sqlPermissions", "enabled": true},
             {"category": "unityCatalog", "enabled": true}]' \
    --workspace "/subscriptions/.../logAnalytics/workspaces/central-logs"
```

#### Key Audit Events

| Event Category | What to Monitor |
|----------------|-----------------|
| Authentication | Failed logins, unusual locations |
| Data access | Sensitive table queries, bulk exports |
| Admin actions | Permission changes, cluster policy modifications |
| Job execution | Failed jobs, long-running jobs |
| Secret access | Who accessed what secrets when |

---

## 10. Cost Management

### 10.1 Cost Drivers

| Component | Cost Factor | Optimisation Lever |
|-----------|-------------|-------------------|
| DBU consumption | Cluster runtime × VM tier | Right-sizing, auto-termination |
| VM compute | Instance type × hours | Spot instances, pools |
| Storage | Data volume | Lifecycle policies, vacuum |
| Data transfer | Egress volume | Keep compute near data |
| SQL Warehouse | Query volume (serverless) | Query optimisation |

### 10.2 DBU Pricing Tiers

| Workload | DBU Rate | Typical Use |
|----------|----------|-------------|
| Jobs Compute | Lowest | Production batch |
| All-Purpose Compute | ~2× Jobs | Interactive development |
| SQL (Serverless) | Per query | BI, ad-hoc SQL |
| SQL (Pro) | Per DBU | Heavy SQL workloads |

**Key Insight:** A job cluster costs roughly half the DBUs of an interactive cluster for the same work.

### 10.3 Cost Optimisation Strategies

#### Quick Wins

| Strategy | Effort | Savings |
|----------|--------|---------|
| Auto-termination (30 min) | Low | 20-40% |
| Spot instances (workers) | Low | 60-90% on compute |
| Job clusters (not interactive) | Low | ~50% DBU |
| Instance pools | Medium | Startup time, not direct cost |
| Right-size clusters | Medium | 20-50% |

#### Advanced Optimisation

```python
# Analyse cluster utilisation
cluster_metrics = spark.sql("""
  SELECT
    cluster_id,
    avg(cpu_utilization) as avg_cpu,
    avg(memory_utilization) as avg_mem,
    sum(dbu_usage) as total_dbu
  FROM system.billing.usage
  WHERE usage_date >= current_date - 30
  GROUP BY cluster_id
  HAVING avg_cpu < 30 OR avg_mem < 30
""")
# These clusters are oversized - rightsize them
```

### 10.4 Tagging and Chargeback

Implement consistent tagging for cost allocation:

```json
{
  "custom_tags": {
    "CostCenter": "DataPlatform",
    "Environment": "Production",
    "Team": "DataEngineering",
    "Project": "ClaimsAnalytics"
  }
}
```

Query costs by tag:

```python
costs_by_team = spark.sql("""
  SELECT
    tags.Team,
    sum(usage_quantity * list_price) as total_cost
  FROM system.billing.usage
  WHERE usage_date >= current_date - 30
  GROUP BY tags.Team
  ORDER BY total_cost DESC
""")
```

---

## 11. Operational Excellence

### 11.1 Monitoring Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Workspace | Databricks System Tables | DBU, cluster metrics, audit |
| Infrastructure | Azure Monitor | VM health, network, storage |
| Application | Custom logging + Log Analytics | Job success, data quality |
| Alerting | Azure Monitor Alerts / PagerDuty | Incident notification |
| Dashboards | Databricks SQL / Grafana | Operational visibility |

### 11.2 System Tables (Game Changer)

Databricks System Tables provide unprecedented visibility:

```sql
-- Billing usage
SELECT * FROM system.billing.usage;

-- Cluster metrics
SELECT * FROM system.compute.clusters;

-- Audit logs
SELECT * FROM system.access.audit;

-- Query history (SQL Warehouse)
SELECT * FROM system.query.history;
```

#### Essential Monitoring Queries

```sql
-- Daily DBU consumption trend
SELECT
  usage_date,
  sku_name,
  sum(usage_quantity) as dbu
FROM system.billing.usage
WHERE usage_date >= current_date - 30
GROUP BY usage_date, sku_name
ORDER BY usage_date;

-- Failed jobs in last 24 hours
SELECT
  job_id,
  job_name,
  run_id,
  result_state,
  error_message
FROM system.workflow.job_run_timeline
WHERE start_time >= current_timestamp - INTERVAL 24 HOURS
  AND result_state = 'FAILED';

-- Longest running queries
SELECT
  query_id,
  user_name,
  duration_ms / 1000 as duration_sec,
  query_text
FROM system.query.history
WHERE start_time >= current_date - 7
ORDER BY duration_ms DESC
LIMIT 20;
```

### 11.3 Alerting Strategy

| Condition | Severity | Response |
|-----------|----------|----------|
| Job failure (production) | High | Immediate page |
| Cluster start failure | Medium | Investigate within 1 hour |
| High DBU spike (>200% normal) | Low | Review next business day |
| Storage >80% capacity | Medium | Plan expansion |
| Long-running query (>1 hour) | Low | Review query optimisation |

### 11.4 Runbooks

Document operational procedures:

| Runbook | Trigger | Key Steps |
|---------|---------|-----------|
| Job Failure Triage | Alert: job failed | Check logs → Identify error → Retry or escalate |
| Cluster Won't Start | User report | Check NSG → Check quota → Check pool → Escalate |
| Performance Degradation | Monitoring alert | Check cluster size → Check data skew → Optimise |
| DR Failover | Primary outage confirmed | Execute failover script → Verify → Notify |
| Cost Spike Investigation | Budget alert | Query system tables → Identify cause → Take action |

---

## 12. CI/CD and Infrastructure as Code

### 12.1 What to Version Control

| Component | Tool | Repository |
|-----------|------|------------|
| Notebooks | Databricks Repos (Git) | `databricks-notebooks` |
| Job definitions | Databricks Asset Bundles / Terraform | `databricks-infrastructure` |
| Cluster policies | Terraform | `databricks-infrastructure` |
| Unity Catalog objects | Terraform / SQL scripts | `databricks-governance` |
| Infrastructure | Terraform / Bicep | `azure-infrastructure` |

### 12.2 Databricks Asset Bundles

Asset Bundles are the modern way to deploy Databricks resources:

```yaml
# databricks.yml
bundle:
  name: claims-pipeline

workspace:
  host: https://adb-xxx.azuredatabricks.net

resources:
  jobs:
    claims_daily_job:
      name: "Claims Daily Processing"
      schedule:
        quartz_cron_expression: "0 0 6 * * ?"
        timezone_id: "Europe/London"
      tasks:
        - task_key: ingest
          notebook_task:
            notebook_path: /Repos/prod/claims/01_ingest
          new_cluster:
            spark_version: "13.3.x-scala2.12"
            node_type_id: "Standard_DS3_v2"
            num_workers: 2

environments:
  dev:
    workspace:
      host: https://adb-dev.azuredatabricks.net
  prod:
    workspace:
      host: https://adb-prod.azuredatabricks.net
```

Deploy with:

```bash
databricks bundle deploy --environment prod
```

### 12.3 Terraform for Databricks

```hcl
# Provider configuration
terraform {
  required_providers {
    databricks = {
      source = "databricks/databricks"
    }
    azurerm = {
      source = "hashicorp/azurerm"
    }
  }
}

# Cluster policy
resource "databricks_cluster_policy" "production" {
  name = "Production ETL Policy"
  definition = jsonencode({
    "spark_version" : {
      "type" : "regex",
      "pattern" : "13\\.[0-9]+\\.x-scala2\\.12"
    },
    "autotermination_minutes" : {
      "type" : "range",
      "minValue" : 10,
      "maxValue" : 60,
      "defaultValue" : 30
    }
  })
}

# Unity Catalog objects
resource "databricks_catalog" "prod" {
  name    = "prod_data"
  comment = "Production data catalog"
}

resource "databricks_schema" "finance" {
  catalog_name = databricks_catalog.prod.name
  name         = "finance"
  comment      = "Finance domain data"
}
```

### 12.4 CI/CD Pipeline Structure

```yaml
# Azure DevOps Pipeline
stages:
  - stage: Validate
    jobs:
      - job: Lint
        steps:
          - script: databricks bundle validate

  - stage: DeployDev
    dependsOn: Validate
    jobs:
      - job: Deploy
        steps:
          - script: databricks bundle deploy --environment dev

  - stage: Test
    dependsOn: DeployDev
    jobs:
      - job: IntegrationTests
        steps:
          - script: pytest tests/integration

  - stage: DeployProd
    dependsOn: Test
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: Production
        environment: production
        strategy:
          runOnce:
            deploy:
              steps:
                - script: databricks bundle deploy --environment prod
```

---

## 13. Common Gotchas and Lessons Learned

### 13.1 The Big Ones

#### 1. Cluster Startup Time Kills Developer Productivity

**Problem:** 5-10 minute cluster starts frustrate developers.

**Solution:** Instance pools for interactive clusters. Accept the idle cost for productivity gains.

#### 2. Small File Problem

**Problem:** Many small files (< 128MB) destroy query performance.

**Solution:** Auto-optimize, scheduled OPTIMIZE jobs, proper partition sizing.

```sql
-- Check for small file problem
SELECT
  count(*) as num_files,
  sum(size) / count(*) / 1024 / 1024 as avg_file_mb
FROM (DESCRIBE DETAIL prod_data.finance.transactions)
```

#### 3. Notebook State Confusion

**Problem:** Notebooks retain state between runs, causing irreproducible results.

**Solution:** Always use `dbutils.notebook.exit()`, design for job cluster (clean state), use `%run` carefully.

#### 4. Unity Catalog Permission Inheritance

**Problem:** Users can't access tables despite having "correct" permissions.

**Solution:** Permissions inherit down but require USE CATALOG and USE SCHEMA at each level.

```sql
-- This won't work
GRANT SELECT ON TABLE catalog.schema.table TO user;

-- Need all three
GRANT USE CATALOG ON CATALOG catalog TO user;
GRANT USE SCHEMA ON SCHEMA catalog.schema TO user;
GRANT SELECT ON TABLE catalog.schema.table TO user;
```

#### 5. Job Cluster vs Interactive Performance

**Problem:** Same notebook runs slower as a job.

**Solution:** Job clusters start cold. Use instance pools or accept startup time. Pre-warming scripts can help.

#### 6. Delta VACUUM Destroys Time Travel

**Problem:** VACUUM with short retention breaks the ability to query historical versions.

**Solution:** Default 7-day retention exists for a reason. Only shorten with explicit approval and understanding of consequences.

#### 7. Streaming + Auto-Scaling = Pain

**Problem:** Autoscaling doesn't work well with Structured Streaming.

**Solution:** Use fixed cluster sizes for streaming workloads. Scale manually based on throughput metrics.

#### 8. Cost Surprises from Interactive Clusters

**Problem:** Developers leave clusters running overnight/weekend.

**Solution:** Aggressive auto-termination (30 min max), cluster policies enforcing this, cost dashboards with accountability.

### 13.2 Debugging Checklist

| Symptom | First Things to Check |
|---------|----------------------|
| Cluster won't start | NSG rules, subnet capacity, quota, instance pool health |
| Job fails immediately | Permissions, missing libraries, init script errors |
| Job fails mid-run | Data issues, memory (check Spark UI), network timeouts |
| Slow queries | Data skew, small files, missing statistics, cluster size |
| Can't access table | Unity Catalog permissions (all levels), storage credential |
| Notebook works, job fails | Notebook state, library versions, cluster config differences |

---

## 14. Platform Team Operating Model

### 14.1 Responsibilities Matrix

| Function | Platform Team | Data Engineers | Data Scientists |
|----------|---------------|----------------|-----------------|
| Workspace provisioning | Own | Request | Request |
| Cluster policies | Own | Input | Input |
| Unity Catalog admin | Own | Schema ownership | Consumer |
| Network/security | Own | N/A | N/A |
| Job orchestration | Enable | Own | Own |
| Cost management | Monitor/alert | Awareness | Awareness |
| Data quality | Framework | Implement | Implement |
| Incident response | First responder | Escalation | N/A |

### 14.2 Self-Service Model

Enable teams while maintaining governance:

| Capability | Self-Service Level | Platform Guardrails |
|------------|-------------------|---------------------|
| Create clusters | Yes, within policy | Cluster policies enforce standards |
| Create jobs | Yes | Must use approved cluster policies |
| Create tables | Yes, in assigned schemas | Unity Catalog permissions |
| Access data | Request via catalog | Approval workflow |
| Install libraries | Yes, cluster-scoped | Blocked: global installs |
| Create SQL Warehouses | Request | Platform-provisioned only |

### 14.3 Support Model

| Tier | Scope | Response Time | Handled By |
|------|-------|---------------|------------|
| L1 | How-to questions, access requests | 4 hours | Self-service docs / ServiceNow |
| L2 | Job failures, performance issues | 2 hours | Platform team |
| L3 | Infrastructure issues, outages | 30 min | Platform team + Azure support |

---

## 15. Quick Reference Card

### Essential CLI Commands

```bash
# Workspace info
databricks workspace list /

# Cluster operations
databricks clusters list
databricks clusters start --cluster-id xxx
databricks clusters delete --cluster-id xxx

# Job operations
databricks jobs list
databricks jobs run-now --job-id xxx
databricks runs list --job-id xxx

# Unity Catalog
databricks unity-catalog catalogs list
databricks unity-catalog schemas list --catalog-name prod_data

# Asset Bundles
databricks bundle validate
databricks bundle deploy --environment prod
databricks bundle destroy --environment dev
```

### Key Configurations

```python
# Cluster Spark config for production
{
    "spark.sql.shuffle.partitions": "auto",
    "spark.databricks.delta.optimizeWrite.enabled": "true",
    "spark.databricks.delta.autoCompact.enabled": "true",
    "spark.sql.adaptive.enabled": "true"
}

# Recommended auto-termination
"autotermination_minutes": 30  # Interactive
"autotermination_minutes": 10  # Job clusters (cleanup)
```

### Critical Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Cluster CPU | >80% sustained | >95% sustained |
| Cluster memory | >85% | >95% |
| Job duration vs baseline | +50% | +100% |
| Daily DBU vs budget | +20% | +50% |
| Storage growth | +10% monthly | +25% monthly |

---

*This guide provides the platform engineering foundation for Azure Databricks. For Howden's implementation, adapt patterns to existing governance frameworks and work collaboratively with the existing team. The goal is enablement, not takeover - document decisions, transfer knowledge, and build sustainable capability.*
