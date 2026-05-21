# Beak Control Plane (BCP)
## Product Requirements Document (PRD)

**Version:** 1.0  
**Author:** Aurthur Musendame  
**Date:** 2026-04-19  

---

# 1. Overview

## 1.1 Vision
Beak Control Plane (BCP) is a centralized platform that manages:

- subscriptions
- billing (multi-provider)
- entitlements
- licensing (online + offline)
- feature access
- usage tracking

…across all Beak Insights products (Beak LIMS, POS, Bitlimbs, Bitcos, etc.)

---

## 1.2 Problem

- Each application requires its own billing and licensing logic
- No unified customer/subscriber view
- Difficult to enforce feature tiers and limits consistently
- Offline customers (labs, hospitals) cannot rely on SaaS billing

---

## 1.3 Goals

### Primary
- Single control plane for all products
- Generic billing provider support (Stripe + others)
- Entitlement-driven access model
- Offline + online license support
- Unified customer management

### Secondary
- Enterprise contract support
- Self-service customer portal
- Multi-product subscriptions

---

# 2. Users

## Internal
- Admins
- Support engineers
- Sales team

## External
- Customers (self-service portal)
- Enterprise clients

---

# 3. Core Concepts

| Concept | Description |
|--------|------------|
| Product | Application (Beak LIMS, POS) |
| Plan | Tier (Starter, Pro, Enterprise) |
| Feature | Module (Reports, Inventory, HL7) |
| Limit | Quantitative restriction |
| Entitlement | Allowed access |
| License | Signed entitlement package |
| Activation | License usage binding |
| Tenant | Customer organization |

---

# 4. Modules

---

## 4.1 Product Catalog

### Features
- Create products
- Define plans
- Attach features to plans
- Define limits per plan
- Support add-ons

---

## 4.2 Customer Management

### Features
- Create tenants
- Assign products
- Manage users
- View subscriptions
- Multi-product dashboard

---

## 4.3 Billing Gateway (Provider-Agnostic)

### Requirements
- Support multiple billing providers
- Provider abstraction layer
- Normalize billing events

### Supported Modes
- Online provider (Stripe, Paynow)
- Manual contracts
- Offline licensing
- Hybrid

---

## 4.4 Entitlement Engine (CORE)

### Responsibilities
- Compute effective entitlements from:
  - plan
  - add-ons
  - overrides
- Handle:
  - expiry
  - grace periods
  - limits
  - feature flags

---

## 4.5 License Management

### Features
- Generate signed licenses
- Support:
  - online fetch
  - offline file export/import
- Include:
  - features
  - limits
  - expiry

---

## 4.6 Activation Management

### Features
- Track:
  - devices
  - sites
  - installations
- Enforce activation limits

---

## 4.7 Usage Tracking

### Features
- Track:
  - users
  - API usage
  - storage
- Detect overuse
- Trigger alerts

---

## 4.8 Feature Flags

### Features
- Enable/disable features per tenant
- Beta rollout
- Gradual rollout

---

# 5. License Modes

## Online
- API-based entitlement fetch

## Hybrid
- Cached license + periodic refresh

## Offline
- Signed license file
- Local validation

---

# 6. API Requirements

## Entitlements
GET /api/entitlements/{tenant}/{product}

## Licensing
POST /api/licenses/generate

## Activation
POST /api/activations

---

# 7. SDK Requirements

Apps must support:

- isFeatureEnabled()
- getLimit()
- isExpired()
- canAddUser()
- daysRemaining()

---

# 8. Security

- RSA/ECDSA license signing
- Public key verification in apps
- Audit logging
- Token expiration

---

# 9. UI Requirements

### Sections

- Products
- Plans
- Features
- Customers
- Subscriptions
- Licenses
- Activations
- Usage
- Feature Flags
- Audit Logs

---

# 10. Key Flows

## Subscription Flow
1. User subscribes
2. Billing provider processes
3. Event received
4. Entitlements computed
5. License generated

## Upgrade Flow
1. Plan updated
2. Entitlements recalculated
3. License updated

## Offline Flow
1. Admin generates license
2. User imports license
3. App validates locally

---

# 11. Non-Functional Requirements

- Multi-tenant
- High availability
- Offline support
- Extensible
- Auditable
- Scalable

---

# 12. Roadmap

## Phase 1
- Catalog
- Customers
- Entitlements

## Phase 2
- Billing integration
- Licensing

## Phase 3
- Activation
- Usage tracking

## Phase 4
- Feature flags
- Enterprise contracts

---

# 13. Strategic Value

BCP becomes:

- the commercial backbone of all Beak products
- a potential standalone SaaS platform
