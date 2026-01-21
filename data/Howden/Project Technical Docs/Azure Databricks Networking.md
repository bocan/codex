# Azure Databricks Networking Deep Dive
## Hub-Spoke Architecture and Enterprise Deployment Guide

**Version 1.0 | January 2026**

---

## Executive Summary

Azure Databricks presents unique networking challenges due to its managed control plane architecture and the need to balance security requirements with platform functionality. This document provides a comprehensive guide to deploying Databricks in enterprise hub-spoke topologies, covering VNet injection, Private Link configurations, connectivity patterns, and integration points with Azure AI Foundry. The goal is to enable secure, compliant Databricks deployments that align with Howden's existing network architecture.

---

## 1. Databricks Architecture Fundamentals

### 1.1 The Two-Plane Architecture

Understanding Databricks' split architecture is essential before touching any networking configuration.

#### Control Plane (Microsoft-Managed)

- Hosted in Databricks' Azure subscription
- Contains: Workspace UI, Cluster Manager, Job Scheduler, Notebooks storage, DBFS metadata
- You do NOT control this infrastructure
- Communicates with your data plane over secure channels

#### Data Plane (Your Subscription)

- Compute resources (driver and worker nodes) run HERE in YOUR VNet
- Processes your actual data
- Can be deployed into your own VNet ("VNet Injection")
- This is where your security controls apply

### 1.2 Default vs VNet-Injected Deployment

| Aspect | Default (Managed VNet) | VNet Injection |
|--------|------------------------|----------------|
| VNet ownership | Databricks-managed | Customer-owned |
| Network control | Limited | Full control |
| Private connectivity | Not possible | Fully supported |
| Hub-spoke integration | Not possible | Fully supported |
| Firewall/NVA inspection | Not possible | Supported |
| Compliance requirements | May not meet | Enterprise-ready |
| Setup complexity | Simple | Moderate to complex |

**For Howden's requirements: VNet Injection is mandatory.** Default deployment won't meet enterprise security posture or integrate with existing hub-spoke topology.

---

## 2. VNet Injection Deep Dive

### 2.1 Required Subnets

Databricks VNet injection requires TWO dedicated subnets. These cannot be shared with other resources.

| Subnet | Purpose | Minimum Size | Recommended Size |
|--------|---------|--------------|------------------|
| Container (Private) Subnet | Worker nodes | /26 (64 IPs) | /23 or larger |
| Host (Public) Subnet | Driver/host VMs | /26 (64 IPs) | /23 or larger |

#### Subnet Sizing Calculation

Each cluster node consumes:
- 1 IP from container subnet
- 1 IP from host subnet

**Formula:** Max concurrent nodes = (Subnet size - 5 reserved) × number of subnets

For a /23 subnet (512 IPs - 5 reserved = 507 usable):
- Maximum ~507 concurrent nodes per workspace
- Consider multiple workspaces for larger deployments

#### Critical Requirements

- **Subnet delegation:** Both subnets MUST be delegated to `Microsoft.Databricks/workspaces`
- **No other resources:** Delegated subnets cannot contain any other Azure resources
- **NSG association:** Databricks will associate its managed NSG (you can add rules, but don't remove default rules)
- **Naming:** No enforced naming convention, but use clear names like `snet-dbw-container-prod` and `snet-dbw-host-prod`

### 2.2 Network Security Groups

Databricks automatically creates and manages NSG rules. Understanding these is crucial.

#### Databricks-Managed Rules (Do Not Delete)

| Direction | Purpose | Source | Destination |
|-----------|---------|--------|-------------|
| Inbound | Worker-to-worker | Container subnet | Container subnet |
| Inbound | Control plane comms | Databricks control plane IPs | Host subnet |
| Outbound | Worker-to-worker | Container subnet | Container subnet |
| Outbound | Control plane | Host subnet | Databricks control plane |
| Outbound | Azure services | Both subnets | Various Azure services |

#### Adding Custom Rules

You CAN add custom NSG rules, but:
- Use priorities below 200 (Databricks rules start at 200)
- Never delete or modify Databricks-managed rules
- Test changes in non-production first - breaking rules will kill cluster operations

### 2.3 Subnet Delegation Details

```bash
# Delegate subnets to Databricks
az network vnet subnet update \
  --resource-group MyRG \
  --vnet-name SpokeVNet \
  --name snet-dbw-container \
  --delegations Microsoft.Databricks/workspaces

az network vnet subnet update \
  --resource-group MyRG \
  --vnet-name SpokeVNet \
  --name snet-dbw-host \
  --delegations Microsoft.Databricks/workspaces
```

---

## 3. Hub-Spoke Deployment Architecture

### 3.1 Recommended Topology for Howden

```
                    ┌─────────────────────────────────┐
                    │         Control Plane           │
                    │    (Databricks-managed Azure)   │
                    └───────────────┬─────────────────┘
                                    │ Private Link (recommended)
                                    │ or Service Endpoints
                    ┌───────────────┴─────────────────┐
                    │           Hub VNet              │
                    │  ┌─────────────────────────┐    │
                    │  │     Azure Firewall      │    │
                    │  └───────────┬─────────────┘    │
                    │  ┌───────────┴─────────────┐    │
                    │  │    ExpressRoute GW      │    │
                    │  └─────────────────────────┘    │
                    └───────────────┬─────────────────┘
                                    │ VNet Peering
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
┌─────────┴─────────┐    ┌─────────┴─────────┐    ┌─────────┴─────────┐
│  Databricks Spoke │    │   Data Spoke      │    │  AI Foundry Spoke │
│  ┌─────────────┐  │    │  ┌─────────────┐  │    │  ┌─────────────┐  │
│  │ Host Subnet │  │    │  │   ADLS Gen2 │  │    │  │ Azure OpenAI│  │
│  └─────────────┘  │    │  │   (PE)      │  │    │  │    (PE)     │  │
│  ┌─────────────┐  │    │  └─────────────┘  │    │  └─────────────┘  │
│  │Container Sub│  │    │  ┌─────────────┐  │    │  ┌─────────────┐  │
│  └─────────────┘  │    │  │  Azure SQL  │  │    │  │ AI Search   │  │
│  ┌─────────────┐  │    │  │    (PE)     │  │    │  │    (PE)     │  │
│  │ PE Subnet   │  │    │  └─────────────┘  │    │  └─────────────┘  │
│  └─────────────┘  │    └───────────────────┘    └───────────────────┘
└───────────────────┘
```

### 3.2 Traffic Flows

| Flow | Path | Controls |
|------|------|----------|
| Cluster → ADLS Gen2 | Databricks spoke → (optional FW) → Data spoke PE | NSG, Firewall rules, PE |
| Cluster → Internet | Databricks spoke → Hub FW → Internet | UDR, Firewall rules |
| Cluster → Control Plane | Via Private Link (backend) | Managed by Databricks |
| User → Workspace UI | Via Private Link (frontend) or public | Front-end PE or public endpoint |
| Cluster → AI Foundry | Databricks spoke → (optional FW) → AI spoke PE | NSG, Firewall rules, PE |
| On-Prem → Workspace | On-prem → ExpressRoute → Hub → Front-end PE | ExpressRoute, NSG |

### 3.3 Route Table Configuration

Force tunnelling through hub firewall requires careful UDR configuration.

#### Databricks Spoke Route Table

| Prefix | Next Hop | Purpose |
|--------|----------|---------|
| 0.0.0.0/0 | Azure Firewall IP | Force all egress through firewall |
| Hub VNet CIDR | VNet peering | Reach hub services |
| Data Spoke CIDR | VNet peering | Reach data services |
| AI Spoke CIDR | VNet peering | Reach AI Foundry services |

**Critical Gotcha:** If using forced tunnelling (0.0.0.0/0 to firewall), you MUST configure firewall rules to allow Databricks control plane communication, or use Private Link for the backend connection.

---

## 4. Private Link Configuration

### 4.1 Databricks Private Link Components

Databricks supports TWO types of Private Link connections:

#### Front-End Private Link (UI/API Access)

- Allows users to access workspace UI over private network
- Creates Private Endpoint in your VNet
- DNS: `adb-<workspace-id>.<region>.azuredatabricks.net` resolves to private IP

#### Back-End Private Link (Control Plane Connectivity)

- Secures communication between data plane (your clusters) and control plane
- Required for secure cluster provisioning without public endpoints
- Uses Browser Authentication Private Endpoint for web auth flow

### 4.2 Private DNS Zones Required

| Zone | Purpose |
|------|---------|
| `privatelink.azuredatabricks.net` | Workspace frontend access |
| `privatelink.databricks.azure.com` | Browser authentication |

### 4.3 Deployment Sequence

Private Link deployment order matters:

1. Create VNet and subnets (including PE subnet)
2. Deploy Databricks workspace with VNet injection (no PE yet)
3. Disable public network access on workspace
4. Create Private Endpoints (frontend and browser auth)
5. Configure Private DNS Zones and link to VNets
6. Test connectivity from private network

### 4.4 Private Endpoint Configuration

```bash
# Create frontend Private Endpoint
az network private-endpoint create \
  --resource-group MyRG \
  --name pe-dbw-frontend \
  --vnet-name SpokeVNet \
  --subnet snet-privateendpoints \
  --private-connection-resource-id "/subscriptions/.../workspaces/myworkspace" \
  --group-id databricks_ui_api \
  --connection-name dbw-frontend-connection

# Create browser auth Private Endpoint
az network private-endpoint create \
  --resource-group MyRG \
  --name pe-dbw-browser \
  --vnet-name SpokeVNet \
  --subnet snet-privateendpoints \
  --private-connection-resource-id "/subscriptions/.../workspaces/myworkspace" \
  --group-id browser_authentication \
  --connection-name dbw-browser-connection
```

---

## 5. Firewall and Egress Requirements

### 5.1 Required Outbound Destinations

When using Azure Firewall or NVA with forced tunnelling, these destinations MUST be allowed.

#### Databricks Control Plane

| Destination | Port | Purpose |
|-------------|------|---------|
| `*.azuredatabricks.net` | 443 | Workspace services |
| `*.databricks.azure.com` | 443 | Authentication services |

#### Azure Services

| Destination | Port | Purpose |
|-------------|------|---------|
| `*.blob.core.windows.net` | 443 | DBFS, logs, artifacts |
| `*.dfs.core.windows.net` | 443 | ADLS Gen2 access |
| `*.database.windows.net` | 1433 | Metastore (if using Azure SQL) |
| `*.vault.azure.net` | 443 | Key Vault (secrets, encryption) |
| `*.servicebus.windows.net` | 443 | Event Hubs (if used) |

#### Package Repositories (for library installation)

| Destination | Port | Purpose |
|-------------|------|---------|
| `*.pypi.org` | 443 | Python packages |
| `pypi.python.org` | 443 | Python packages |
| `files.pythonhosted.org` | 443 | Python packages |
| `*.maven.org` | 443 | Maven/Java packages |
| `*.cran.r-project.org` | 443 | R packages |
| `cdn.mysql.com` | 443 | MySQL JDBC driver |

#### Azure Firewall Application Rules Example

```bash
az network firewall application-rule create \
  --resource-group HubRG \
  --firewall-name AzureFirewall \
  --collection-name Databricks-Required \
  --priority 200 \
  --action Allow \
  --name Allow-Databricks \
  --protocols Https=443 \
  --source-addresses "10.1.0.0/16" \
  --fqdn-tags AzureDatabricks

az network firewall application-rule create \
  --resource-group HubRG \
  --firewall-name AzureFirewall \
  --collection-name Databricks-Packages \
  --priority 210 \
  --action Allow \
  --name Allow-PyPI \
  --protocols Https=443 \
  --source-addresses "10.1.0.0/16" \
  --target-fqdns "*.pypi.org" "pypi.python.org" "files.pythonhosted.org"
```

### 5.2 Service Tags for Network Rules

Azure Firewall supports these Service Tags for Databricks:

| Service Tag | Use |
|-------------|-----|
| `AzureDatabricks` | Control plane IPs |
| `Sql` | Azure SQL (metastore) |
| `Storage` | Azure Storage |
| `AzureKeyVault` | Key Vault |
| `EventHub` | Event Hubs |

---

## 6. Data Source Connectivity

### 6.1 Connecting to Azure Data Lake Storage Gen2

ADLS Gen2 is the primary data lake storage for Databricks workloads.

#### Connection Options

| Method | Security | Performance | Recommended For |
|--------|----------|-------------|-----------------|
| Private Endpoint | Highest | Excellent | Production workloads |
| Service Endpoint | High | Excellent | Simpler setups |
| Public endpoint + firewall | Medium | Good | Dev/test only |

#### Private Endpoint Configuration

1. Create Private Endpoint for ADLS Gen2 in data spoke
2. Configure Private DNS Zone `privatelink.dfs.core.windows.net`
3. Link DNS zone to Databricks spoke VNet
4. Test from Databricks notebook: `dbutils.fs.ls("abfss://container@account.dfs.core.windows.net/")`

#### Authentication Methods

| Method | Security | Complexity | Use Case |
|--------|----------|------------|----------|
| Unity Catalog | Highest | Low | Default recommendation |
| Service Principal | High | Medium | Automated workloads |
| Managed Identity | High | Medium | Azure-native approach |
| Account Key | Low | Low | Dev/test only - avoid in production |
| SAS Token | Medium | Low | Time-limited access |

### 6.2 Connecting to Azure SQL Database

For metastore or operational data access.

#### Network Configuration

1. Deploy Azure SQL with Private Endpoint
2. Configure Private DNS Zone `privatelink.database.windows.net`
3. Link to Databricks spoke VNet
4. Configure SQL firewall to deny public access

#### JDBC Connection String

```python
jdbc_url = "jdbc:sqlserver://myserver.database.windows.net:1433;database=mydb"
connection_properties = {
  "user": dbutils.secrets.get(scope="sql", key="username"),
  "password": dbutils.secrets.get(scope="sql", key="password"),
  "driver": "com.microsoft.sqlserver.jdbc.SQLServerDriver"
}

df = spark.read.jdbc(url=jdbc_url, table="schema.table", properties=connection_properties)
```

### 6.3 Connecting to Azure Synapse Analytics

#### Dedicated SQL Pool

Use JDBC similar to Azure SQL, or the optimised Synapse connector:

```python
df = spark.read \
  .format("com.databricks.spark.sqldw") \
  .option("url", "jdbc:sqlserver://mysynapse.sql.azuresynapse.net:1433;database=pool") \
  .option("tempDir", "abfss://temp@storageaccount.dfs.core.windows.net/temp") \
  .option("forwardSparkAzureStorageCredentials", "true") \
  .option("dbTable", "schema.table") \
  .load()
```

#### Serverless SQL Pool

Query via JDBC using on-demand endpoint.

---

## 7. Unity Catalog Networking

### 7.1 Unity Catalog Architecture

Unity Catalog is Databricks' unified governance solution. Understanding its networking is crucial.

#### Components

- **Metastore:** Central metadata repository (one per region)
- **Storage Credential:** Managed identity or service principal for storage access
- **External Location:** Registered storage paths
- **Catalog → Schema → Table:** Logical hierarchy

### 7.2 Network Requirements

Unity Catalog adds these networking considerations:

| Component | Network Requirement |
|-----------|---------------------|
| Metastore storage | Private Endpoint to ADLS Gen2 (managed by Databricks or customer-managed) |
| Storage credentials | Managed Identity needs network path to storage |
| External locations | Private Endpoint for each registered storage account |

### 7.3 Customer-Managed Storage

For regulated environments, you can bring your own storage for Unity Catalog:

1. Create dedicated ADLS Gen2 account
2. Configure Private Endpoint
3. Create storage credential with Managed Identity
4. Assign Storage Blob Data Contributor role
5. Register as metastore root storage

---

## 8. Integration with Azure AI Foundry

### 8.1 Common Integration Patterns

Databricks and AI Foundry complement each other in the modern data stack.

| Use Case | Integration Pattern |
|----------|---------------------|
| Feature engineering → Model training | Databricks prepares features → AI Foundry trains models |
| LLM-augmented ETL | Databricks calls Azure OpenAI for text processing |
| RAG pipelines | Databricks indexes data → AI Search → Azure OpenAI |
| MLflow model serving | Train in Databricks → Deploy to AI Foundry endpoints |

### 8.2 Network Connectivity to AI Foundry

#### Required Private Endpoints

| AI Service | Private DNS Zone | Purpose |
|------------|------------------|---------|
| Azure OpenAI | `privatelink.openai.azure.com` | LLM API calls |
| Azure AI Search | `privatelink.search.windows.net` | Vector search, RAG |
| Cognitive Services | `privatelink.cognitiveservices.azure.com` | Vision, Language, etc. |
| Azure ML | `privatelink.api.azureml.ms` | Model management |
| Azure ML | `privatelink.notebooks.azure.net` | Compute instances |

### 8.3 Calling Azure OpenAI from Databricks

#### Network Path

```
Databricks Cluster → NSG → (Hub Firewall if forced tunnel) → AI Spoke → Azure OpenAI PE
```

#### Code Example

```python
import openai
import os

# Using Azure OpenAI via Private Endpoint
openai.api_type = "azure"
openai.api_base = "https://my-openai.openai.azure.com/"  # Resolves to PE IP via Private DNS
openai.api_version = "2024-02-01"
openai.api_key = dbutils.secrets.get(scope="ai-foundry", key="openai-key")

response = openai.ChatCompletion.create(
    engine="gpt-4",
    messages=[{"role": "user", "content": "Summarize this data..."}]
)
```

### 8.4 Building RAG Pipelines

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Databricks                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ Data Lake   │───▶│ Embedding   │───▶│ Vector Generation   │  │
│  │ (ADLS Gen2) │    │ (OpenAI PE) │    │                     │  │
│  └─────────────┘    └─────────────┘    └──────────┬──────────┘  │
└──────────────────────────────────────────────────┬──────────────┘
                                                   │
                                                   ▼
                                    ┌─────────────────────────────┐
                                    │      AI Search (PE)         │
                                    │    Vector Index Storage     │
                                    └─────────────┬───────────────┘
                                                  │
┌─────────────────────────────────────────────────┴───────────────┐
│                      AI Foundry Endpoint                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Query     │───▶│ AI Search   │───▶│   Azure OpenAI      │  │
│  │             │    │  Retrieval  │    │   Generation        │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### Key Networking Considerations

- All components should use Private Endpoints
- DNS resolution must work from both Databricks and AI Foundry networks
- Shared Private DNS Zones linked to both spokes (or via hub)
- Consider latency: place AI services in same region as Databricks

---

## 9. Security Best Practices

### 9.1 Network Security Checklist

- [ ] Deploy with VNet injection - never use default managed VNet for production
- [ ] Enable Private Link for both frontend and backend
- [ ] Disable public network access on workspace
- [ ] Configure UDRs to force traffic through hub firewall
- [ ] Use Private Endpoints for all data sources
- [ ] Enable NSG flow logs for audit and troubleshooting
- [ ] Implement Network Watcher for monitoring

### 9.2 Data Security Checklist

- [ ] Enable Unity Catalog for centralised governance
- [ ] Use Managed Identities over service principals where possible
- [ ] Store secrets in Azure Key Vault, access via Databricks secret scopes
- [ ] Enable audit logging (workspace diagnostic settings)
- [ ] Configure IP access lists as additional control
- [ ] Enable customer-managed keys for encryption at rest

### 9.3 Cluster Security Checklist

- [ ] Use cluster policies to enforce configurations
- [ ] Disable public SSH to cluster nodes
- [ ] Enable credential passthrough where appropriate
- [ ] Configure init scripts securely (from DBFS or cloud storage)
- [ ] Use instance pools to reduce startup time and control costs

---

## 10. Common Gotchas and Troubleshooting

### 10.1 The Big Ones

#### 1. Cluster Fails to Start After VNet Injection

**Symptoms:** Clusters stuck in "Pending" or fail with network errors

**Common Causes:**
- NSG rules blocking control plane communication
- UDR forcing traffic to firewall without proper allow rules
- Subnet delegation missing
- Insufficient IP addresses in subnets

**Fix:** Check NSG flow logs, verify firewall rules allow Databricks Service Tag

#### 2. Private Link DNS Not Resolving

**Symptoms:** Workspace accessible via public IP but not private

**Common Causes:**
- Private DNS Zone not linked to VNet
- DNS forwarder not configured to use Azure DNS (168.63.129.16)
- On-prem DNS not forwarding to Azure

**Fix:** Verify DNS zone links, test with `nslookup` from within VNet

#### 3. Cannot Access Data Lake from Cluster

**Symptoms:** "Access Denied" or timeout when accessing ADLS Gen2

**Common Causes:**
- Private Endpoint not created for storage account
- Private DNS Zone for `dfs.core.windows.net` not linked
- Firewall blocking storage traffic
- Incorrect RBAC permissions

**Fix:** Verify PE exists, DNS resolves to private IP, RBAC assigned

#### 4. Forced Tunnelling Breaks Cluster Operations

**Symptoms:** Clusters fail after enabling 0.0.0.0/0 route to firewall

**Common Causes:**
- Firewall not allowing Databricks control plane traffic
- Missing application rules for package repositories
- Backend Private Link not configured

**Fix:** Either configure comprehensive firewall rules OR enable backend Private Link

#### 5. Unity Catalog External Location Access Fails

**Symptoms:** "Cannot access external location" errors

**Common Causes:**
- Storage credential doesn't have network path
- Private Endpoint missing for storage account
- Managed Identity not assigned correct role

**Fix:** Verify network connectivity, check RBAC, test with simpler storage access first

### 10.2 Troubleshooting Commands

#### Test DNS Resolution from Cluster

```python
%sh
nslookup mystorageaccount.dfs.core.windows.net
nslookup myworkspace.azuredatabricks.net
```

#### Check Effective Routes

```python
%sh
ip route show
```

#### Test Storage Connectivity

```python
dbutils.fs.ls("abfss://container@account.dfs.core.windows.net/")
```

#### Check NSG Flow Logs

Use Azure Monitor or Log Analytics to query NSG flow logs for denied traffic.

---

## 11. Deployment Checklist

### Phase 1: Foundation

- [ ] Reserve IP space in existing IPAM
- [ ] Create Databricks spoke VNet
- [ ] Create container and host subnets (sized appropriately)
- [ ] Delegate subnets to Microsoft.Databricks/workspaces
- [ ] Create Private Endpoint subnet
- [ ] Peer spoke to hub VNet
- [ ] Configure route tables (UDRs)

### Phase 2: Workspace Deployment

- [ ] Deploy Databricks workspace with VNet injection
- [ ] Verify cluster can start with default config
- [ ] Disable public network access
- [ ] Deploy frontend Private Endpoint
- [ ] Deploy browser authentication Private Endpoint
- [ ] Configure Private DNS Zones
- [ ] Test private workspace access

### Phase 3: Data Connectivity

- [ ] Deploy Private Endpoints for data sources (ADLS, SQL, etc.)
- [ ] Configure Private DNS Zones for data services
- [ ] Test data access from clusters
- [ ] Configure Unity Catalog
- [ ] Register external locations

### Phase 4: AI Integration

- [ ] Deploy Private Endpoints for AI services
- [ ] Configure DNS for AI services
- [ ] Test connectivity from Databricks to Azure OpenAI
- [ ] Implement initial RAG/LLM integration

### Phase 5: Operations

- [ ] Enable diagnostic logging
- [ ] Configure alerts for cluster failures
- [ ] Document network topology
- [ ] Train operations team
- [ ] Perform DR testing

---

## 12. Quick Reference: CLI Commands

### Create VNet-Injected Workspace

```bash
az databricks workspace create \
  --resource-group MyRG \
  --name my-databricks-workspace \
  --location uksouth \
  --sku premium \
  --vnet /subscriptions/.../virtualNetworks/SpokeVNet \
  --private-subnet snet-dbw-container \
  --public-subnet snet-dbw-host \
  --disable-public-ip true
```

### Disable Public Access

```bash
az databricks workspace update \
  --resource-group MyRG \
  --name my-databricks-workspace \
  --public-network-access Disabled
```

### Create Private Endpoint

```bash
az network private-endpoint create \
  --resource-group MyRG \
  --name pe-databricks-frontend \
  --vnet-name SpokeVNet \
  --subnet snet-privateendpoints \
  --private-connection-resource-id "/subscriptions/.../workspaces/my-databricks-workspace" \
  --group-id databricks_ui_api \
  --connection-name databricks-frontend
```

### Create Private DNS Zone

```bash
az network private-dns zone create \
  --resource-group MyRG \
  --name privatelink.azuredatabricks.net

az network private-dns link vnet create \
  --resource-group MyRG \
  --zone-name privatelink.azuredatabricks.net \
  --name link-to-spoke \
  --virtual-network SpokeVNet \
  --registration-enabled false
```

---

*This document provides the networking foundation for enterprise Databricks deployment. Combine with Howden's existing governance frameworks, security policies, and operational procedures. Remember: the existing platform team should own this infrastructure - our role is to enable and document, not to take over.*
