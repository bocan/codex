# Azure Networking Best Practice
## A Comprehensive Reference Guide

**Version 1.0 | January 2026**

---

## Executive Summary

This document provides a rapid-ramp guide for experienced AWS networking professionals transitioning to Azure. It maps familiar AWS concepts to their Azure equivalents, highlights critical differences in behaviour and architecture, and documents gotchas that frequently catch even senior engineers. The goal is functional Azure networking expertise within a single intensive study session.

---

## 1. Core Concept Mapping: AWS to Azure

### 1.1 Fundamental Building Blocks

Azure and AWS share similar network virtualisation concepts but implement them quite differently. Understanding these mappings is your foundation.

| AWS Concept | Azure Equivalent | Key Differences |
|-------------|------------------|-----------------|
| VPC | Virtual Network (VNet) | VNets are regional by default. No concept of "default VNet" - must be explicitly created. |
| Subnet | Subnet | Subnets span all AZs in a region by default. No AZ-specific subnets. |
| Internet Gateway | Implicit (automatic) | No explicit IGW needed. Public IPs provide internet access automatically. |
| NAT Gateway | NAT Gateway | Must be associated with a public IP. Charged per hour + data processed. |
| Route Table | Route Table | System routes auto-created. User-defined routes (UDRs) override them. |
| Security Group | Network Security Group (NSG) | Stateful. Can attach to subnet OR NIC. Evaluated by priority number. |
| NACL | No direct equivalent | Use NSGs at subnet level. All traffic is stateful. |
| VPC Peering | VNet Peering | Non-transitive. Global VNet Peering available across regions. |
| Transit Gateway | Azure Virtual WAN / Hub | Virtual WAN is the closest equivalent. Also consider hub-spoke with NVAs. |
| Direct Connect | ExpressRoute | Private connectivity. Multiple SKUs: Local, Standard, Premium. |
| VPN Gateway | VPN Gateway | Site-to-site, point-to-site, VNet-to-VNet. Various SKUs affect throughput. |
| PrivateLink | Private Link / Private Endpoint | Very similar. Creates NIC in your VNet with private IP for PaaS services. |
| Interface Endpoint | Private Endpoint | Same concept - private connectivity to PaaS via private IP. |
| Gateway Endpoint | Service Endpoint | Route-based (no private IP). Limited to Azure services. Simpler but less secure. |
| Elastic IP | Public IP Address | Static or dynamic. Standard SKU required for zone redundancy. |
| ENI | Network Interface (NIC) | Similar concept. VMs can have multiple NICs. |

---

## 2. VNet Architecture Deep Dive

### 2.1 Address Space and Subnets

VNets require a CIDR block (or multiple) at creation. Unlike AWS, you can add additional address spaces to an existing VNet without recreation.

#### Critical Differences from AWS

- **Subnets are regional, not AZ-specific.** A single subnet spans all availability zones. This is a fundamental architectural difference.
- **Azure reserves 5 IPs per subnet** (first 4 + last). AWS reserves 5 total, but Azure's .1, .2, .3 are gateway/DNS/DNS.
- **No "default" VNet.** You must explicitly create all networking infrastructure.
- **VNets cannot span regions.** Use VNet peering for cross-region connectivity.

#### Reserved IP Addresses

| IP Address | Purpose | AWS Equivalent |
|------------|---------|----------------|
| x.x.x.0 | Network address | Same |
| x.x.x.1 | Default gateway | Same (.1) |
| x.x.x.2 | Azure DNS mapping | No equivalent (.2 is DNS in AWS too) |
| x.x.x.3 | Azure DNS mapping | No AWS equivalent |
| x.x.x.255 | Broadcast | Same |

### 2.2 Special-Purpose Subnets

Azure requires dedicated subnets for certain services. These must use specific names:

| Subnet Name | Purpose | Min CIDR |
|-------------|---------|----------|
| GatewaySubnet | VPN/ExpressRoute gateways | /27 (recommended /27 or larger) |
| AzureFirewallSubnet | Azure Firewall | /26 |
| AzureFirewallManagementSubnet | Azure Firewall forced tunnelling | /26 |
| AzureBastionSubnet | Azure Bastion host | /26 (recommended /26 or larger) |
| RouteServerSubnet | Azure Route Server | /27 |

---

## 3. Routing in Azure

### 3.1 System Routes vs User-Defined Routes

Azure automatically creates system routes. Unlike AWS where you build routes explicitly, Azure's default behaviour is more permissive.

#### Default System Routes (Auto-Created)

| Destination | Next Hop | Notes |
|-------------|----------|-------|
| VNet address space | VNet | All subnets can communicate by default |
| 0.0.0.0/0 | Internet | Default internet route (can be overridden) |
| 10.0.0.0/8 | None | Dropped if not in your VNet space |
| 172.16.0.0/12 | None | Dropped if not in your VNet space |
| 192.168.0.0/16 | None | Dropped if not in your VNet space |
| 100.64.0.0/10 | None | Carrier-grade NAT - dropped |

#### User-Defined Routes (UDRs)

UDRs override system routes. Create a Route Table resource, add routes, then associate with subnets.

**Next Hop Types:** Virtual network gateway | Virtual network | Internet | Virtual appliance | None

#### Critical Gotcha: The None Route

In AWS, you might leave RFC1918 space unrouted. Azure's "None" next hop actively drops traffic. This is useful for security but catches people out when they expect traffic to flow to on-premises.

### 3.2 Routing Behaviour Differences

| Scenario | AWS Behaviour | Azure Behaviour |
|----------|---------------|-----------------|
| Default inter-subnet | Allowed via local route | Allowed via VNet system route |
| Default internet egress | Requires IGW + route | Automatic if public IP attached |
| Route priority | Most specific wins | UDR > BGP > System (then most specific) |
| Overlapping routes | Most specific wins | Priority: UDR > BGP > System route |
| Peered VNet routes | Explicit routes needed | Automatically added as system routes |

---

## 4. Network Security

### 4.1 Network Security Groups (NSGs)

NSGs are Azure's primary network filtering mechanism. Think of them as stateful Security Groups that can also attach at the subnet level.

#### Key Characteristics

- **Stateful** - return traffic automatically allowed
- **Can attach to:** Subnet OR Network Interface (NIC)
- **Evaluated by priority number** (100-4096, lower = higher priority)
- **Default rules cannot be deleted** but CAN be overridden with lower priority number
- **Allow and Deny rules supported** (unlike AWS SGs which are allow-only)

#### Default Rules (Cannot Delete)

| Priority | Name | Direction | Action |
|----------|------|-----------|--------|
| 65000 | AllowVnetInBound | Inbound | Allow VNet traffic |
| 65001 | AllowAzureLoadBalancerInBound | Inbound | Allow LB health probes |
| 65500 | DenyAllInBound | Inbound | Deny all other inbound |
| 65000 | AllowVnetOutBound | Outbound | Allow VNet traffic |
| 65001 | AllowInternetOutBound | Outbound | Allow internet egress |
| 65500 | DenyAllOutBound | Outbound | Deny all other outbound |

#### Major Gotcha: NSG Processing Order

When NSGs are applied at BOTH subnet and NIC levels, traffic is evaluated twice:

- **Inbound:** Subnet NSG first → then NIC NSG
- **Outbound:** NIC NSG first → then Subnet NSG

Traffic must be allowed by BOTH to flow. This trips people up constantly.

### 4.2 Application Security Groups (ASGs)

ASGs allow you to group NICs logically and reference them in NSG rules. Similar to using tags in AWS security group rules, but more native.

```
Source: MyWebServers-ASG → Destination: MyAppServers-ASG → Port: 8080
```

### 4.3 Service Tags

Service Tags are Azure-managed IP prefixes for Azure services. Use these instead of hardcoding IPs:

- Internet, VirtualNetwork, AzureLoadBalancer, AzureCloud, Storage, Sql, AzureActiveDirectory, etc.

---

## 5. Connectivity Options

### 5.1 VNet Peering

Connects VNets with low-latency, high-bandwidth private connectivity over the Azure backbone.

#### Critical Points

- **Non-transitive:** VNet A↔B and B↔C does NOT mean A↔C
- **Address spaces cannot overlap**
- **Peering must be created in BOTH directions** (each side creates their own peering)
- **Global VNet Peering** works across regions (charged differently)
- **"Allow gateway transit"** enables spoke VNets to use hub's VPN/ExpressRoute

### 5.2 VPN Gateway

Encrypted tunnels over public internet. Site-to-site, point-to-site, and VNet-to-VNet configurations.

| SKU | Tunnels | Throughput | Use Case |
|-----|---------|------------|----------|
| VpnGw1 | 30 S2S | 650 Mbps | Small workloads |
| VpnGw2 | 30 S2S | 1 Gbps | Medium workloads |
| VpnGw3 | 30 S2S | 1.25 Gbps | Larger workloads |
| VpnGw4 | 100 S2S | 5 Gbps | High throughput |
| VpnGw5 | 100 S2S | 10 Gbps | Maximum throughput |

**Gotcha:** Gateway creation takes 30-45 minutes. Plan accordingly for any changes.

### 5.3 ExpressRoute

Private, dedicated connectivity to Azure. Does NOT traverse the public internet.

- **Private Peering:** Access VNets (most common)
- **Microsoft Peering:** Access Microsoft 365 and Azure PaaS public endpoints
- **ExpressRoute Global Reach:** Connect on-prem sites via Azure backbone

### 5.4 Private Link and Private Endpoints

Brings Azure PaaS services into your VNet with a private IP. Traffic stays on the Azure backbone.

#### Key Concepts

- **Private Endpoint:** A NIC in your subnet with private IP mapped to a specific PaaS resource
- **Private Link Service:** Expose YOUR services behind a Standard Load Balancer to other VNets
- **DNS is critical:** Must configure private DNS zones to resolve service FQDNs to private IPs

**Gotcha:** Without proper DNS config, clients resolve to public IP even with Private Endpoint deployed!

### 5.5 Service Endpoints vs Private Endpoints

| Aspect | Service Endpoint | Private Endpoint |
|--------|------------------|------------------|
| IP Address | Still uses public IP of service | Private IP in your VNet |
| DNS | No change needed | Requires Private DNS Zone |
| Traffic Path | Optimised route, stays on backbone | Through private IP, stays on backbone |
| Access from On-Prem | No (VNet only) | Yes (if VNet reachable) |
| Security | Allow/deny by VNet/subnet | NSG on endpoint subnet |
| Cost | Free | Per hour + data processing |

---

## 6. DNS in Azure

### 6.1 Azure DNS Options

DNS in Azure is more nuanced than AWS. Understanding the hierarchy is crucial:

| Component | Purpose | Scope |
|-----------|---------|-------|
| Azure-provided DNS | Default name resolution in VNet | VNet-internal, no customisation |
| Azure DNS (public zones) | Host public DNS zones | Internet-facing, like Route 53 public |
| Azure Private DNS Zones | Private name resolution | Linked VNets only, like Route 53 private |
| Custom DNS servers | Your own DNS (AD DS, etc.) | Full control, more complexity |

### 6.2 Private DNS Zones

Critical for Private Endpoints. Must link zones to VNets for resolution.

#### Standard Azure Private DNS Zone Names

Azure services expect specific zone names for Private Endpoint DNS:

```
privatelink.blob.core.windows.net (Storage Blob)
privatelink.database.windows.net (Azure SQL)
privatelink.vaultcore.azure.net (Key Vault)
privatelink.azurecr.io (Container Registry)
privatelink.openai.azure.com (Azure OpenAI)
privatelink.cognitiveservices.azure.com (Cognitive Services)
```

**Gotcha:** When linking Private DNS to VNets with "auto-registration", VMs register their names. Can conflict with Private Endpoint records if using wrong zone.

### 6.3 DNS Resolution Flow

Understanding how Azure resolves DNS prevents many headaches:

1. VM queries configured DNS server (Azure-provided: 168.63.129.16, or custom)
2. If Azure DNS: checks Private DNS Zones linked to VNet
3. If no match: forwards to public Azure DNS recursive resolver
4. If custom DNS: your server must forward to 168.63.129.16 for Azure resolution

---

## 7. Hub-Spoke Architecture (Best Practice)

### 7.1 The Golden Path Pattern

For enterprise Azure deployments like Howden's, hub-spoke is the standard pattern.

#### Hub VNet Contains

- Azure Firewall or third-party NVA for centralised inspection
- VPN Gateway and/or ExpressRoute Gateway
- Azure Bastion for secure VM access
- Shared services (AD DS, DNS forwarders)

#### Spoke VNets Contain

- Workload subnets (apps, databases, etc.)
- Peered to hub with "Use Remote Gateway" enabled
- UDRs force traffic through hub firewall (0.0.0.0/0 → Firewall IP)

### 7.2 Traffic Flow Patterns

| Traffic Flow | Path | Controlled By |
|--------------|------|---------------|
| Spoke → Internet | Spoke → Hub Firewall → Internet | UDR + Firewall rules |
| Spoke → Spoke | Spoke A → Hub Firewall → Spoke B | UDR + Firewall rules |
| Spoke → On-Prem | Spoke → Hub Gateway → On-prem | UDR + Gateway |
| On-Prem → Spoke | On-prem → Hub Gateway → (opt. FW) → Spoke | Gateway BGP + UDRs |

### 7.3 Azure Virtual WAN Alternative

For very large deployments, Azure Virtual WAN provides managed hub infrastructure:

- Microsoft manages the hub routing and gateway infrastructure
- "Any-to-any" connectivity between branches, VNets, and users
- Built-in support for ExpressRoute, S2S VPN, P2S VPN
- Secured Virtual Hub integrates Azure Firewall

---

## 8. Common Gotchas and Pitfalls

### 8.1 The Big Ones

#### 1. NSG Default Deny Isn't What You Think

The default DenyAllInBound rule has priority 65500. If you create an allow rule with priority 65500 or higher, it won't work. Always use priorities below 65000.

#### 2. Peering Doesn't Mean Routing

Peering creates connectivity but routes must exist. When adding peering to existing VNets, check that route tables don't block the new peered traffic.

#### 3. Gateway Transit Requires Both Sides

Hub needs "Allow gateway transit" enabled. Spoke needs "Use remote gateway" enabled. Miss either and spoke can't reach on-prem.

#### 4. Private Endpoints Need DNS Configuration

Creating a Private Endpoint doesn't automatically make it work. You MUST configure DNS (usually via Private DNS Zone) or clients will still resolve to public IPs.

#### 5. Azure Firewall's SNAT Behaviour

Azure Firewall SNATs traffic by default. If destination is in VNet/peered VNet/on-prem ranges, it doesn't SNAT. This causes asymmetric routing issues if not understood.

#### 6. Service Endpoints Don't Work from On-Premises

Service Endpoints only work for resources IN the VNet. On-prem clients cannot use them - use Private Endpoints instead.

#### 7. The 168.63.129.16 Address

This is Azure's "magic" IP for platform services (DHCP, DNS, health probes, Instance Metadata). Never block it in NSGs or firewalls - you'll break things badly.

#### 8. Standard vs Basic Load Balancer

Basic LB doesn't support Availability Zones, VNet peering backends, or Standard Public IPs. Always use Standard for production.

### 8.2 Subnet Delegation Surprises

Some Azure services require subnet delegation. Once delegated, you cannot put other resources in that subnet:

- Azure Container Instances
- Azure App Service VNet Integration
- Azure NetApp Files
- Azure SQL Managed Instance (requires empty subnet)

---

## 9. Best Practices Checklist

### 9.1 Design Phase

- Plan IP address space carefully - consider future growth and on-prem overlap
- Use hub-spoke topology for enterprise deployments
- Reserve /27 minimum for GatewaySubnet (Microsoft recommends /27)
- Document NSG rules with comments - your future self will thank you
- Plan for Private Endpoints from day one - retrofitting is painful

### 9.2 Security

- Apply NSGs at subnet level as baseline, NIC level for exceptions
- Use Application Security Groups for dynamic, logical groupings
- Enable NSG Flow Logs for visibility and compliance
- Use Service Tags instead of hardcoded IPs for Azure services
- Deploy Azure Firewall or NVA for centralised egress control

### 9.3 Operations

- Enable Network Watcher in every region
- Use Connection Monitor for proactive connectivity testing
- Enable diagnostic logging on VPN/ExpressRoute Gateways
- Use Azure Policy to enforce networking standards
- Tag all networking resources for cost allocation

### 9.4 Resilience

- Use zone-redundant gateways where available
- Use Standard SKU Public IPs (zone-redundant by default)
- For ExpressRoute: use two circuits in different peering locations
- VPN as backup to ExpressRoute for hybrid connectivity
- Test failover scenarios - don't wait for an outage

---

## 10. Quick Reference: CLI Commands

Equivalent commands for common tasks:

### Create VNet

```bash
az network vnet create -g MyRG -n MyVNet \
  --address-prefix 10.0.0.0/16 \
  --subnet-name default --subnet-prefix 10.0.0.0/24
```

### Create NSG and Rule

```bash
az network nsg create -g MyRG -n MyNSG

az network nsg rule create -g MyRG --nsg-name MyNSG -n AllowSSH \
  --priority 100 \
  --source-address-prefixes '*' \
  --destination-port-ranges 22 \
  --access Allow --protocol Tcp
```

### Create Route Table

```bash
az network route-table create -g MyRG -n MyRouteTable

az network route-table route create -g MyRG \
  --route-table-name MyRouteTable -n ToFirewall \
  --address-prefix 0.0.0.0/0 \
  --next-hop-type VirtualAppliance \
  --next-hop-ip-address 10.0.1.4
```

### Create VNet Peering

```bash
az network vnet peering create -g MyRG -n HubToSpoke \
  --vnet-name HubVNet \
  --remote-vnet SpokeVNet \
  --allow-vnet-access
```

### Create Private Endpoint

```bash
az network private-endpoint create -g MyRG -n MyPE \
  --vnet-name MyVNet --subnet default \
  --private-connection-resource-id <resource-id> \
  --group-id blob \
  --connection-name MyConnection
```

---

## 11. AI Foundry Specific Networking Considerations

Given Howden's AI Foundry work, here are Azure OpenAI and Cognitive Services networking specifics:

### Private Endpoint Zones for AI Services

```
privatelink.openai.azure.com
privatelink.cognitiveservices.azure.com
```

### Network Isolation Options

1. **Private Endpoints** - Recommended for production. AI service gets private IP in your VNet.
2. **Service Endpoints** - Simpler but limited. Only works from VNet, not on-prem.
3. **Firewall Rules** - Allow specific VNets/IPs. Not as secure as Private Endpoints.

### Key Considerations

- AI Foundry deployments should use Private Endpoints for data plane access
- Management plane (Azure Portal, ARM) still uses public endpoints unless using Azure Private Link for ARM
- Consider capacity - AI services have regional quotas
- Outbound connectivity from AI services may be needed for custom skills/plugins

---

*This document provides a comprehensive foundation for Azure networking. For Howden's specific architecture, combine these patterns with their existing infrastructure and governance requirements. Remember: light touch, golden paths, and let the existing team retain ownership.*
