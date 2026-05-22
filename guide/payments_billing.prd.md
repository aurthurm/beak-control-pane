# Payments & Billing PRD
## Beak Control Plane

**Version:** 1.0  
**Author:** Aurthur Musendame  
**Date:** 2026-05-22

---

# 1. Purpose

BCP is not the customer-facing payment surface. It is the internal control plane that records, normalizes, and governs subscriptions after payment happens elsewhere.

The purpose of this module is to answer:

- What product did the customer buy?
- Through which payment channel or provider?
- What is the external reference for that purchase?
- Is the subscription active, expired, unpaid, canceled, or manual?
- What entitlements, licenses, activations, and usage limits should apply now?

---

# 2. Objectives

## 2.1 Primary

- Track every customer subscription in one internal system of record.
- Support online, manual, bank, and contract-based billing flows.
- Normalize all subscription sources into one subscription model.
- Trigger entitlement recomputation when subscription state changes.
- Generate or reissue licenses from subscription state.
- Enforce product-specific limits and activation rules.

## 2.2 Secondary

- Support multiple payment providers over time.
- Support offline customers who never interact with an online checkout.
- Support staff-driven subscription creation and updates.
- Provide auditability for finance, support, and sales teams.

---

# 3. Scope

## In scope

- Provider tracking
- Subscription lifecycle tracking
- Manual subscription creation
- Webhook-driven subscription sync
- Billing event normalization
- Entitlement recomputation
- License issuance and reissue
- Subscription-linked usage enforcement
- Audit logging

## Out of scope

- Customer-hosted checkout experience
- Customer self-service billing portal as the only source of truth
- Tax engine
- Invoicing engine
- Dunning automation beyond basic status tracking
- General ledger/accounting

---

# 4. Users

## Internal

- Admins
- Support engineers
- Sales team
- Finance operators

## External

- Customers do not use BCP directly for payment
- Customers pay through external platforms or offline channels

---

# 5. Core Concepts

| Concept | Meaning |
|---|---|
| Product | The application being sold, such as Beak LIMS or POS |
| Plan | The commercial tier within a product |
| Subscription | The active commercial relationship for a tenant and product |
| Provider | The source of billing truth, such as Stripe, manual contract, or bank transfer |
| Provider reference | External identifier such as provider subscription ID, invoice number, receipt number, or bank slip reference |
| Entitlement | Effective access computed from the subscription and plan |
| License | Signed access package derived from the entitlement |
| Activation | A device/site/installation binding under a license |
| Usage limit | A plan-defined cap that must be enforced against usage rows |

---

# 6. Requirements

## 6.1 Subscription recording

- Store one normalized subscription row per tenant and product relationship.
- Allow creating subscriptions from:
  - provider webhook
  - staff manual entry
  - bank payment confirmation
  - contract registration
- Store commercial metadata needed for later support and audit.

### Minimum stored fields

- tenant
- product
- plan
- provider
- provider reference
- status
- renewal date
- end date
- amount
- currency
- notes or metadata

## 6.2 Provider tracking

- Record where the subscription came from.
- Distinguish online provider subscriptions from manual or offline subscriptions.
- Preserve the external source reference for reconciliation.
- Allow future providers without changing the subscription model.

## 6.3 Lifecycle tracking

- Track states such as:
  - active
  - trialing
  - past due
  - unpaid
  - canceled
  - expired
  - suspended
  - manual
- Subscription state changes must trigger entitlement recomputation.
- Subscription changes that affect entitlements must trigger license reissue when required.

## 6.4 Entitlement flow

- Every subscription must resolve to a product-specific entitlement.
- Entitlements must be computed from the plan and any allowed overrides.
- Limits inside the plan are the source of truth for usage enforcement.
- Unknown or unsupported limit keys must not be silently accepted.

## 6.5 License flow

- BCP must generate signed licenses from the subscription and entitlement state.
- Licenses must support online and offline validation.
- License regeneration must happen when the underlying entitlement changes.

## 6.6 Usage enforcement

- Usage rows must be tied to a product-specific limit key.
- Usage must be measured against plan-defined limits only.
- Any usage row that cannot be matched to a known limit must be rejected or flagged.
- Over-limit conditions must be auditable.

## 6.7 Manual/offline billing

- Staff must be able to register bank payments or physical contract payments.
- Manual subscriptions must be fully usable in the entitlement and licensing pipeline.
- A manual subscription must still have:
  - a tenant
  - a product
  - a plan
  - a status
  - a source reference

---

# 7. Supported Billing Modes

## 7.1 Online provider

Examples:

- Stripe
- future providers such as Paynow

Responsibilities:

- create or sync subscriptions
- receive webhooks
- normalize event payloads
- update subscription state

## 7.2 Manual / contract

Examples:

- bank transfer
- cash payment
- cheque
- signed contract

Responsibilities:

- staff enters the subscription
- staff records payment reference
- system tracks status and validity
- system still issues licenses and entitlements

## 7.3 Hybrid

- Subscription originates from one provider but is managed internally by BCP after ingest.
- Useful for migrations, special contracts, or partially automated billing.

---

# 8. Data Model Expectations

## Subscription record

- tenantId
- productId
- planId
- provider
- providerRef
- status
- renewalAt
- endsAt
- providerMetadataJson
- manualContract flag

## Billing event record

- provider event id
- provider type
- tenantId
- subscriptionId
- event type
- amount
- currency
- raw payload
- normalized payload
- processing status
- processing logs

## Reconciliation outputs

- updated subscription row
- recomputed entitlement row
- reissued license rows where required
- audit log entries

---

# 9. System Workflows

## 9.1 Online payment flow

1. Customer pays on an external online provider.
2. Provider sends a webhook to BCP.
3. BCP normalizes the event.
4. BCP updates the matching subscription.
5. BCP recomputes entitlements.
6. BCP reissues licenses if needed.

## 9.2 Manual payment flow

1. Customer pays via bank or offline channel.
2. Staff confirms payment in BCP.
3. Staff creates or updates the subscription.
4. BCP recomputes entitlements.
5. BCP generates or refreshes licenses.

## 9.3 Renewal / expiry flow

1. Renewal or expiry date changes.
2. BCP updates subscription status.
3. Entitlements are recomputed.
4. Licenses are revalidated or reissued.
5. Usage and access rules remain aligned.

---

# 10. Operational Rules

- BCP is the system of record for internal subscription state.
- External providers are sources of truth for payment events only.
- Manual records are valid and must behave like provider-backed subscriptions.
- Customers never need direct access to BCP to complete payment.
- Provider choice must not change the downstream entitlement model.
- Product limits are defined in plans, not invented by usage data.

---

# 11. Security And Audit

- All subscription changes must be auditable.
- Billing provider webhooks must be verified where supported.
- Staff actions must be attributable to a user account.
- Sensitive provider secrets must never be exposed in UI payloads.
- Signed licenses must remain independently verifiable.

---

# 12. Success Criteria

The billing and payments module is successful when:

- a subscription can be recorded regardless of payment channel
- every subscription is tied to a tenant, product, and plan
- entitlements are recomputed automatically after billing changes
- licenses are created or updated from subscription state
- usage is enforced against plan-defined limits
- finance and support can trace the origin of every subscription

---

# 13. Non-Goals

- Building a customer checkout frontend inside BCP
- Replacing accounting software
- Acting as the payment processor itself
- Supporting every possible billing workflow before v1

