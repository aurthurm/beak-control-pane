# 🏗️ `ARCHITECTURE.md`

```md
# Beak Control Plane (BCP)
## Architecture Document

---

# 1. Tech Stack

- Framework: Nuxt
- Language: TypeScript
- UI: shadcn-vue
- Styling: Tailwind CSS v4
- Database: SQLite via libSQL
- ORM: Drizzle ORM
- Billing: Provider abstraction (Stripe first)
- Auth: cookie/session-based app auth
- Deployment: Node server / Nuxt Nitro

---

# 2. Architecture Style

- Modular Monolith
- Domain-driven structure
- Provider-based integrations

---

# 3. High-Level Architecture

```

```
       ┌─────────────────────┐
       │     Nuxt App        │
       │  (UI + API server)  │
       └─────────┬───────────┘
                 │
     ┌───────────┼────────────┐
     │           │            │
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Billing  │ │ Entitle  │ │ License  │
│ Gateway  │ │ Engine   │ │ Service  │
└────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │
     └────────────┼────────────┘
                  │
            ┌─────▼─────┐
            │ SQLite    │
            │  libSQL   │
            └───────────┘
```

---

# 4. Folder Structure

```
```

server/
  api/
  core/
  db/
  utils/
app/
  components/
  pages/
  composables/

````

---

# 5. Billing Architecture

## 5.1 Provider Interface

```ts
interface BillingProvider {
  createCustomer()
  createSubscription()
  cancelSubscription()
  getSubscription()
  verifyWebhook()
}
````

---

## 5.2 Providers

* Stripe (initial)
* Paynow (future)
* Manual contracts

---

## 5.3 Event Normalization

All billing events converted to:

```ts
type NormalizedEvent = {
  type: string
  tenantId: string
  data: any
}
```

---

# 6. Entitlement Engine

## Inputs

* plan
* add-ons
* overrides
* billing state

## Output

```json
{
  "features": {},
  "limits": {},
  "expiry": ""
}
```

---

# 7. License Service

## Format

* Signed JWT/JWS

## Contains

* tenant
* product
* features
* limits
* expiry

## Validation

* public key verification
* expiry enforcement

---

# 8. Activation Service

Tracks:

* device ID
* installation ID
* site ID

---

# 9. Usage Service

Tracks:

* users
* API usage
* storage

---

# 10. Database Design

## Core Tables

* products
* plans
* features
* plan_features
* plan_limits
* tenants
* subscriptions
* entitlements
* licenses
* activations
* usage_records
* billing_events

---

# 11. API Design

## Entitlements

GET /api/entitlements/:tenant/:product

## Licensing

POST /api/licenses

## Activation

POST /api/activations

---

# 12. Security

* JWT / JWS license signing
* role-based access
* session cookies for staff and customer portal access
* audit logging
* webhook verification

---

# 13. Deployment

* Node server
* SQLite/libSQL database

---

# 14. Future Enhancements

* microservices split
* event-driven architecture
* feature flag system
* multi-region deployment

---

# 15. Key Design Principle

**Entitlements are the source of truth**

Everything else derives from:

* billing
* contracts
* overrides

---

# 16. Summary

This architecture enables:

* multi-product control
* pluggable billing
* offline licensing
* scalable growth

``
