# Azure Databricks Platform Discovery
## Day 1 Questions for Howden

**Purpose:** Establish current state, identify gaps, understand constraints, and build rapport with existing team.

**Approach:** These are conversation starters, not an interrogation checklist. Let answers flow naturally and dig deeper where you sense pain or uncertainty. Remember: light touch, they retain ownership.

---

## 1. Workspace & Environment Strategy

### Current State

- How many Databricks workspaces do you currently have?
- How are they organised? (By environment? Team? Project? Region?)
- Which Azure regions are you deployed in?
- What SKU are you using? (Standard / Premium)
  - *If Standard: Are you aware of the Premium features you're missing? (Unity Catalog, SCIM, audit logs, etc.)*
- Do you have any non-production workspaces? How do they relate to production?

### Governance

- Who can create workspaces today? Is there a process?
- Do you have naming conventions documented?
- How do you handle workspace access requests?

### What We're Really Trying to Learn

- Is this organic sprawl or planned architecture?
- Are they aware of workspace-level blast radius?
- Is there a DR workspace or any regional redundancy?

---

## 2. Compute & Cluster Management

### Current State

- What types of clusters are people using? (Interactive vs job clusters)
- Do you have cluster policies in place? Can I see them?
- Are you using instance pools? For what?
- What's your typical cluster startup time? Is it a pain point?
- What VM sizes are commonly used? Who decides?

### Cost Awareness

- Do you have auto-termination configured? What's the typical setting?
- Are you using spot instances anywhere?
- Do you have visibility into DBU consumption by team/project?
- Have you had any cost surprises? What caused them?

### Governance

- Can anyone spin up any cluster, or are there guardrails?
- How do you handle requests for larger/GPU clusters?

### What We're Really Trying to Learn

- Is compute governance in place or wild west?
- Are they burning money on idle interactive clusters?
- Do they understand the job cluster vs interactive cost difference?
- Is startup time frustrating developers?

---

## 3. Unity Catalog & Data Governance

### Current State

- Are you using Unity Catalog or legacy Hive metastore?
  - *If Hive: Is Unity Catalog migration planned? What's blocking it?*
  - *If Unity Catalog: How long have you been on it? How's it going?*
- How is your catalog structured? (By environment? Domain? Both?)
- Who owns catalog/schema administration?
- How do users request access to data?

### Permissions & Security

- How are permissions managed? (Unity Catalog grants? Azure AD groups?)
- Do you have any row-level or column-level security requirements?
- Are there any sensitive data classifications? How are they enforced?
- Do you use dynamic views for data masking?

### External Data

- How do you manage storage credentials?
- How many external locations do you have registered?
- Is there a process for registering new external data sources?

### What We're Really Trying to Learn

- Is data governance mature or an afterthought?
- Are they on Unity Catalog (good) or stuck on Hive (migration needed)?
- Is there a data access request workflow or is it ad-hoc/tribal?
- Any compliance requirements driving governance needs?

---

## 4. Data Architecture

### Storage

- Where does your data live? (ADLS Gen2? Multiple storage accounts?)
- How is storage organised? (Medallion architecture? Something else?)
- Do you have bronze/silver/gold layers or equivalent?
- How do you handle data lifecycle? (Retention, archival, deletion)

### Delta Lake

- Are you using Delta Lake? For everything or just some tables?
- Do you have regular OPTIMIZE jobs running?
- What's your VACUUM retention policy?
- Have you had any issues with small files?
- Are you using any newer features? (Liquid Clustering, Deletion Vectors)

### Data Quality

- Do you have data quality checks in place? What tooling?
- How do you handle data quality failures? (Alert? Block pipeline? Log and continue?)
- Is there any data observability tooling? (Monte Carlo, Great Expectations, etc.)

### What We're Really Trying to Learn

- Is there a coherent data architecture or organic growth?
- Are they maintaining Delta tables properly or heading for performance issues?
- Is data quality a priority or an afterthought?

---

## 5. Jobs & Orchestration

### Current State

- How are jobs orchestrated? (Databricks Workflows? ADF? Airflow? Other?)
- Roughly how many production jobs are running?
- What's your typical job frequency? (Real-time? Hourly? Daily? Weekly?)
- Do you have any streaming workloads?

### Reliability

- How do you monitor job success/failure?
- What's your alerting setup? Who gets paged?
- What's your retry strategy?
- How do you handle failed jobs? Is there a runbook?

### CI/CD

- How do jobs get deployed to production?
- Is there a promotion process? (Dev → UAT → Prod)
- Are job definitions in source control?
- Are you using Databricks Asset Bundles? Terraform? Manual deployment?

### What We're Really Trying to Learn

- Is deployment mature (IaC, CI/CD) or manual/tribal?
- Is there operational rigour or are failures handled ad-hoc?
- Any single points of failure in the orchestration?

---

## 6. Security & Networking

### Network Architecture

- Are workspaces deployed with VNet injection or using managed VNet?
- Is Private Link enabled? (Frontend and/or backend?)
- How does Databricks fit into your hub-spoke topology?
- Is traffic forced through a firewall? Any issues with that?

### Authentication & Identity

- How do users authenticate? (Azure AD SSO?)
- Is SCIM provisioning configured for user/group sync?
- How are service principals managed for automation?
- Do you have any service accounts or shared credentials? (Please say no)

### Secrets Management

- Where are secrets stored? (Databricks secret scopes? Key Vault? Both?)
- If Key Vault: Is it Key Vault-backed secret scopes or direct access?
- Who can create/manage secrets?

### Compliance

- Are there any specific compliance requirements? (FCA, PRA, GDPR, SOX?)
- Is audit logging enabled and being shipped somewhere?
- Do you have any data residency requirements?

### What We're Really Trying to Learn

- Is the network architecture enterprise-grade or default/insecure?
- Are they meeting regulatory requirements?
- Any security debt that needs addressing?

---

## 7. Resilience & DR

### Current State

- Do you have a DR strategy for Databricks? Is it documented?
- Is there a DR workspace in another region?
- What's your target RTO/RPO for the data platform?
- Has DR ever been tested?

### Backup & Recovery

- How are notebooks/code backed up? (Git? DBFS? Both?)
- Can you restore a Delta table to a previous point in time if needed?
- What's your Delta log retention configuration?
- Do you have deep clones or other backups of critical tables?

### Incident History

- Have you had any significant outages? What happened?
- What would happen right now if UK South went down?

### What We're Really Trying to Learn

- Is DR a documented strategy or a hope-for-the-best situation?
- Have they actually tested recovery, or is it theoretical?
- What's the real blast radius of a regional outage?

---

## 8. Observability & Operations

### Monitoring

- What monitoring do you have in place? (Azure Monitor? Databricks System Tables? Custom?)
- Do you have dashboards? Who looks at them?
- Are you using Databricks System Tables? Which ones?

### Logging

- Where do logs go? (Log Analytics? Splunk? Other?)
- Are diagnostic settings enabled on workspaces?
- Can you trace a failed job from alert to root cause?

### Operational Processes

- Is there an on-call rotation for the data platform?
- Do you have runbooks for common issues?
- What's the escalation path when something breaks?

### What We're Really Trying to Learn

- Is there operational maturity or firefighting?
- Can they actually diagnose issues, or is it black-box troubleshooting?
- Is there sustainable operational capacity?

---

## 9. Cost Management

### Visibility

- Do you have visibility into Databricks costs? At what granularity?
- Are resources tagged consistently? What tags?
- Is there chargeback to teams/projects?
- Do you use Azure Cost Management, Databricks Account Console, or something else?

### Optimisation

- Have you done any cost optimisation exercises?
- Are there any known areas of waste?
- What's the monthly spend roughly? Is it stable, growing, unpredictable?

### Budget

- Is there a budget for the data platform?
- Are there alerts when spending exceeds thresholds?

### What We're Really Trying to Learn

- Is cost understood and managed, or a mystery?
- Are there quick wins we can demonstrate early?
- Is cost a sensitive topic or openly discussed?

---

## 10. Team & Skills

### Current Team

- Who's responsible for the Databricks platform today?
- How many people? What are their backgrounds?
- Is it a dedicated platform team or shared responsibility?
- What's the split between platform work and feature delivery?

### Skills & Gaps

- Where does the team feel confident?
- Where do they feel they need help?
- Any training or certifications completed?
- What would they want to learn if they had time?

### Ways of Working

- How does the platform team interact with data engineers/scientists?
- Is there a ticketing system for platform requests?
- How are decisions made? Is there a technical lead or architecture function?

### What We're Really Trying to Learn

- Who are our allies? Who might be resistant?
- What skills exist vs what needs building?
- Is there capacity for improvement, or is everyone underwater?
- Where can we add value without stepping on toes?

---

## 11. Integration Points

### Data Sources

- What are the main data sources feeding into Databricks?
- How is data ingested? (ADF? Autoloader? Custom?)
- Are there any real-time/streaming sources?
- Any problematic sources? (Unreliable, poor quality, undocumented?)

### Downstream Consumers

- What consumes data from the platform? (BI tools? Applications? AI/ML?)
- How do they connect? (SQL Warehouse? Direct ADLS access? JDBC?)
- Who are the main consumer teams?

### AI Foundry / ML

- Are you using Azure AI Foundry or planning to?
- Any Azure OpenAI, AI Search, or Cognitive Services integration?
- Is there an ML workflow? (Training in Databricks? MLflow? Model serving?)
- How do models get deployed?

### What We're Really Trying to Learn

- What's the scope of the data platform's responsibility?
- Are there integration pain points we should know about?
- What's the AI/ML maturity and ambition?

---

## 12. Priorities & Pain Points

### Open Questions

These are the most important questions. Ask them directly and listen carefully:

1. **What's keeping you up at night regarding the data platform?**

2. **If you could fix one thing tomorrow, what would it be?**

3. **What's working well that we should be careful not to break?**

4. **What have you tried before that didn't work?**

5. **What does success look like for this engagement from your perspective?**

6. **Is there anything you're worried we might recommend that you really don't want to do?**

### What We're Really Trying to Learn

- What do THEY think the priorities are?
- Where can we get early wins to build trust?
- What landmines should we avoid?
- Are their priorities aligned with what we've been asked to deliver?

---

## Post-Discovery: Outputs to Produce

After day 1 discovery, we should be able to draft:

1. **Current State Summary** - One-pager on what exists today
2. **Gap Analysis** - Where they are vs best practice
3. **Risk Register** - Issues that need addressing (prioritised)
4. **Quick Wins** - Things we can improve immediately to build credibility
5. **Recommended Workstreams** - Logical groupings of improvement work
6. **Questions for Follow-up** - Things we couldn't answer in day 1

---

## Notes for Approach

### Do

- Listen more than talk
- Acknowledge what's working, not just what's broken
- Ask "why" to understand constraints and history
- Take notes on who knows what (knowledge mapping)
- Look for allies and champions
- Frame findings as opportunities, not criticisms

### Don't

- Criticise previous decisions without understanding context
- Promise specific solutions before understanding the problem
- Make the existing team feel incompetent or defensive
- Assume you know better before you've listened
- Rush to recommendations

### Remember

The goal is **understanding**, not **solutioning**.

We're building a relationship as much as gathering information. The existing team needs to feel heard and respected. They know things we don't, and they'll be running this long after we're gone.

---

*"Seek first to understand, then to be understood."*
