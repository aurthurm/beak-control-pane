# Beak Control Plane SaaS PRD
## Platform Tenancy, Billing, and Workspace Access

**Version:** 1.0  
**Author:** Aurthur Musendame  
**Date:** 2026-05-22

---

# 1. Purpose

Beak Control Plane (BCP) must evolve from an internal control tool into a multi-tenant SaaS platform.

In this model:

- product owners and founders create their own BCP workspace
- each workspace is billed for using the platform itself
- each workspace can create its own staff members
- all data and actions are scoped to the workspace tenant
- the platform owner keeps a special seeded tenant with full operational access

This SaaS layer is separate from the product-subscription domain BCP already manages for its customers.

---

# 2. Core SaaS Model

## 2.1 Tenant definition

The SaaS tenant is the workspace that owns a BCP account.

Implementation alignment:

- SaaS tenant/workspace maps to the existing `organization` boundary
- tenant members map to organization memberships
- tenant-scoped permissions determine what the workspace can see and do

## 2.2 Important naming distinction

BCP already uses the word `tenant` for customer accounts inside the control plane.

To avoid confusion:

- **SaaS tenant/workspace** = the BCP account that pays for and uses the platform
- **Managed customer tenant** = the customer account BCP tracks for product subscriptions, licenses, usage, and entitlements

The SaaS layer must keep these two concepts separate.

---

# 3. Objectives

## 3.1 Primary

- Allow a founder or product owner to create a BCP workspace
- Scope all console data and operations to the active workspace
- Allow each workspace to create and manage its own staff members
- Sell BCP as a paid platform with tiered subscriptions
- Keep a seeded owner tenant for the platform operator

## 3.2 Secondary

- Support invitation-based workspace onboarding
- Support manual or enterprise sales onboarding
- Support online and offline platform billing
- Allow the platform owner to manage all workspaces centrally

---

# 4. Users and Roles

## 4.1 Platform roles

- `platform_admin`: full cross-workspace operational access
- `support`: limited cross-workspace assistance
- `customer`: normal authenticated user

## 4.2 Workspace roles

- `owner`: full control of the workspace, billing, and staff
- `admin`: manage most workspace settings and staff
- `member`: limited workspace access based on granted permissions

## 4.3 Intended behavior

- platform admins can see and manage all workspaces
- workspace owners can manage their own workspace only
- members never see data outside their workspace

---

# 5. Scope of the SaaS Layer

## 5.1 Must be tenant-scoped

The following must be isolated per workspace:

- products
- plans
- customers
- subscriptions
- licenses
- activations
- usage
- entitlement records
- audit logs
- feature flags
- billing configuration
- exports and reports

## 5.2 Must remain global or platform-owned

- platform identity and seeded operator accounts
- workspace provisioning rules
- platform plan catalog
- system health and infrastructure settings
- cross-tenant support and admin operations

---

# 6. Workspace Onboarding

## 6.1 Self-service signup

- A founder can create a new workspace account
- The creator becomes the workspace owner
- The workspace is created in an active state unless billing requires a trial or pending state

## 6.2 Invitation flow

- Workspace owners and admins can invite staff by email
- Invites create workspace membership, not customer records
- Invite acceptance must bind the user to the correct workspace

## 6.3 Enterprise/manual onboarding

- The platform owner can provision a workspace manually
- This must support direct contract sales, migration, or assisted setup
- The workspace must still receive a proper owner and billing record

---

# 7. Platform Billing and Tiers

## 7.1 Billing purpose

Platform billing is for using BCP itself.

It is separate from:

- the products BCP manages
- the product subscriptions BCP tracks for customers

## 7.2 Tier model

Platform tiers should be capability-first and quota-based.

Recommended structure:

- `starter`
- `growth`
- `business`
- `enterprise`

## 7.3 What tiers should control

Each platform tier can unlock or limit:

- number of staff seats
- number of managed products
- number of managed customer tenants
- number of subscriptions tracked
- audit-log retention
- export/reporting features
- billing modes available
- automation and webhook access
- API access depth
- branded portal and advanced settings
- usage analytics and alerts

## 7.4 Tier design rule

- platform tiers must not be confused with product plans
- platform tiers control access to BCP features
- product plans continue to control customer entitlements for the products BCP manages

## 7.5 Supported billing modes

- online checkout for standard SaaS signup
- invoice/manual billing for enterprise customers
- offline or assisted setup for special accounts

---

# 8. Billing and Provider Tracking

## 8.1 Platform subscription record

Each workspace must have a platform subscription record with:

- workspace id
- platform plan id
- provider
- provider reference
- status
- renewal date
- end date
- seat count
- amount and currency
- billing metadata

## 8.2 Provider abstraction

The platform must support more than one billing source over time.

Examples:

- Stripe
- future online providers
- manual invoice
- bank transfer
- contract billing

## 8.3 Subscription lifecycle

- creating a workspace may start a trial or paid subscription
- renewal and cancellation must affect workspace access
- payment failures must move the workspace into a restricted or grace state
- tier changes must recompute feature access immediately

---

# 9. Feature Gating

## 9.1 Platform features

The SaaS platform must gate access to features based on the tenant plan.

Examples:

- create products
- create plans and limits
- manage customer tenants
- manage subscriptions and licenses
- access usage analytics
- export audit logs
- configure billing providers
- use advanced automation
- manage feature flags

## 9.2 Enforcement

- feature gating must be enforced in the UI
- feature gating must be enforced in the API
- feature gating must be enforced in server-side policy checks

## 9.3 Quota enforcement

If a tier includes a quota, the system must:

- display the quota clearly
- prevent overage where required
- or route the workspace into an upgrade flow

---

# 10. Seeded Owner Tenant

## 10.1 Purpose

BCP must be seeded with a special internal tenant that owns the platform.

This tenant is used for:

- platform administration
- support operations
- tenant provisioning
- migrations
- policy overrides

## 10.2 Behavior

- it has cross-tenant visibility
- it can manage all workspaces
- it can manage billing configurations
- it can create and inspect support accounts
- it should not be treated as a normal customer workspace

---

# 11. Data Model Expectations

## 11.1 SaaS workspace model

The workspace layer should continue to use:

- organization
- organization membership
- active organization selection

## 11.2 Workspace membership model

Workspace staff should be represented as:

- a user record
- an organization membership
- a role within the workspace

## 11.3 Managed customer model

The current customer/account records that BCP manages for products should remain separate from SaaS workspaces.

This means:

- workspace controls the platform access
- managed customer tenants remain the records used for product subscriptions, licenses, and usage

---

# 12. Non-Goals

- replacing the product subscription model that BCP already manages
- making customers pay through BCP for the products they buy from Beak
- removing the internal platform admin tenant
- collapsing SaaS tenant accounts and managed customer accounts into one table
- building a full accounting system
- building a full tax and invoicing engine

---

# 13. Success Criteria

The SaaS layer is complete when:

- a founder can create a BCP workspace and log in
- the workspace can invite and manage staff
- all data is scoped to that workspace
- the workspace can buy a BCP platform tier
- upgrading or downgrading the tier changes available features
- the internal owner tenant can still manage all workspaces
- the current product-management functionality continues to work inside each workspace

