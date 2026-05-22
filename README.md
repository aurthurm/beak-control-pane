# Beak Control Plane

Beak Control Plane is the Nuxt 4 admin and portal application for managing Beak products, subscribers, subscriptions, licenses, activations, usage, billing events, runtime flags, and entitlement data.

<img width="1864" height="950" alt="image" src="https://github.com/user-attachments/assets/8ffde870-5410-4d7c-94d0-5580e69e6247" />

The product model is split into two separate concepts:

- `organization` is the workspace boundary for the control plane itself.
- `subscriber` is the managed customer/account boundary for commercial product data.

This repository includes:

- The staff console for internal operations.
- The subscriber portal for account users.
- The public and authenticated API surface.
- The `@beak/bcp-sdk` package for entitlement, usage, and runtime-flag calls.

## What It Does

The control plane manages the commercial side of Beak products:

- Products and plans
- Features, add-ons, and limit keys
- Subscribers and subscriptions
- Entitlements and licenses
- Activation records
- Usage ingestion and recalculation
- Billing events and provider webhooks
- Runtime feature flags
- Audit logs and operational history
- Staff access, invites, and subscriber portal access

## Stack

- Nuxt 4
- Vue 3
- Tailwind CSS v4
- shadcn-nuxt / Reka UI
- SQLite via Drizzle ORM and libSQL
- jose for license signing and verification
- Stripe for billing/webhook integrations

## Project Layout

- `app/` - Nuxt UI, pages, layouts, components, and composables
- `server/` - API handlers, database bootstrap, migrations, and domain logic
- `packages/bcp-sdk/` - client SDK for subscriber entitlement, usage, and runtime flags
- `tests/` - Vitest coverage for core business logic and schema helpers
- `data/` - local SQLite database file

## Key Surfaces

### Staff Console

- `/` - workspace dashboard
- `/products` - product catalog, plans, feature flags, limits, and add-ons
- `/subscribers` - subscriber directory
- `/subscribers/[id]` - subscriber detail, subscriptions, entitlements, and status management
- `/subscribers/[id]/subscription/[subscriptionId]` - subscription detail and edits
- `/subscribers/[id]/license/[licenseId]` - license detail, export, and activations
- `/subscriptions` - subscription index
- `/subscriptions/[id]` - subscription detail
- `/licenses` - issued licenses
- `/usage` - usage records and recalculation
- `/feature-flags` - runtime rollout flags
- `/audit-logs` - operational history
- `/admin/login` - staff login
- `/admin/invites` - admin invite management

### Subscriber Portal

- `/portal` - subscriber account hub
- `/portal/licenses` - portal license list
- `/portal/subscriptions` - portal subscription list
- `/portal/entitlements` - entitlement view
- `/portal/usage` - usage view
- `/portal/join` - invite acceptance / onboarding flow
- `/portal/login` - portal login
- `/portal/signup` - subscriber signup flow

### Public and Utility APIs

- `GET /api/licenses/public-key` - public key export for offline license verification
- `GET /api/portal/summary` - portal summary payload
- `POST /api/usage/report` - usage ingest
- `POST /api/runtime-flags/evaluate` - runtime flag evaluation for a subscriber/product context
- `GET /api/entitlements/:subscriber/:product` - latest entitlement for a subscriber/product pair

## Local Setup

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Start with a fresh local SQLite database. The app now bootstraps schema only and does not seed demo rows.
4. Run `pnpm dev`.

The default dev server is configured for `http://0.0.0.0:3001`.

### Environment Variables

The important variables are:

- `DB_FILE_NAME` - SQLite/libSQL file URL, defaulting to `file:./data/beak-control-pane.db`
- `AUTH_COOKIE_NAME` - session cookie name
- `AUTH_SESSION_DAYS` - session lifetime in days
- `AUTH_ENFORCE_CONSOLE` - require auth for the staff console
- `AUTH_ENFORCE_PORTAL` - require auth for the portal
- `AUTH_ENFORCE_API` - require auth for staff API routes
- `STRIPE_SECRET_KEY` - Stripe API key for billing flows
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `BCP_LICENSE_KEY_ID` - key identifier for signed licenses
- `BCP_LICENSE_PRIVATE_KEY_PEM` - PKCS#8 ES256 private key PEM
- `BCP_LICENSE_PUBLIC_KEY_PEM` - SPKI ES256 public key PEM

See `.env.example` for the full set and inline notes.

Note: the example env file still includes placeholders for admin credentials, but the current bootstrap path does not seed demo users automatically.

## Database

The schema lives in [`server/db/schema.ts`](server/db/schema.ts) and is created through the bootstrap path in [`server/db/bootstrap.ts`](server/db/bootstrap.ts).

Important notes:

- The app does not depend on seeded demo data.
- Bootstrap creates the schema and runs compatibility migrations only.
- If you want to reset local state, delete `data/beak-control-pane.db` and restart the app.

### Domain Tables

- `organizations` - workspace boundary for staff console data
- `products` - catalog products owned by an organization
- `plans` - product billing plans
- `features` - product features
- `plan_features` - plan-to-feature links
- `plan_limits` - plan limit values
- `product_limit_keys` - reusable product limit keys
- `product_addon_keys` - reusable product add-on keys
- `plan_addons` - plan-to-add-on links
- `tenants` - physical table name for subscribers
- `subscriptions` - subscriber subscriptions
- `entitlements` - computed entitlement payloads
- `licenses` - signed license payloads
- `activations` - license activation records
- `usage_records` - metered usage rows
- `billing_events` - raw and normalized billing provider events
- `audit_logs` - operational audit trail
- `runtime_feature_flags` - rollout and targeting flags
- `users`, `sessions`, `organization_memberships`, `org_invites`, `admin_invites` - auth and invite tables
- `enterprise_contracts` - named custom agreements and overrides

### Resetting Local Data

If you need a clean dev database:

```bash
rm -f data/beak-control-pane.db
pnpm dev
```

## SDK

`packages/bcp-sdk` contains the consumer SDK used by subscriber apps and internal tooling.

Build it with:

```bash
pnpm build:sdk
```

The SDK supports:

- Fetching entitlements for a `subscriberId` and `productId`
- Reporting usage for a subscriber/product pair
- Evaluating runtime flags for a subscriber context
- Providing the ingest secret when required by the server

Example:

```ts
import { BcpClient } from '@beak/bcp-sdk'

const client = new BcpClient({
  baseUrl: 'https://control-plane.example.com',
  subscriberId: 'sub_123',
  productId: 'prd_beak_lims',
})

const entitlement = await client.refresh()
const flags = await client.evaluateRuntimeFlags({
  environment: 'production',
})
```

## Authentication

Authentication is session-based and can be enforced separately for:

- The staff console
- The subscriber portal
- The API surface

The example env file still includes admin credential placeholders, but the current codebase does not auto-create users from them.

Login entry points:

- Staff: `/admin/login`
- Portal: `/portal/login`

## Billing and Licensing

Licenses are signed with ES256 JWS payloads. The public key can be fetched from:

- `GET /api/licenses/public-key`

Typical flows:

- Create or issue a license via `POST /api/licenses`
- Export a license from a license detail page
- Reissue licenses during billing or subscription changes
- Verify signatures offline using the public key and the SDK or your own verifier

Stripe integration is used for:

- Checkout and portal operations
- Webhook ingestion
- Subscription lifecycle updates
- Billing event normalization

## Usage and Runtime Flags

Usage can be reported through `POST /api/usage/report`, then recalculated on demand or through the scheduled Nitro task.

Runtime flags are subscriber-aware and support:

- Global rollout
- Percentage rollout
- Subscriber allowlists
- Environment-specific values
- Rule overlays

## Development Scripts

- `pnpm dev` - start the Nuxt app in development mode
- `pnpm build` - build the application
- `pnpm preview` - preview the production build
- `pnpm build:sdk` - build the SDK package
- `pnpm db:generate` - generate Drizzle migrations
- `pnpm db:push` - push the current schema to the local database
- `pnpm db:migrate` - run Drizzle migrations
- `pnpm db:studio` - open Drizzle Studio
- `pnpm test` - run the Vitest suite
- `pnpm test:watch` - run Vitest in watch mode

## Testing

The test suite focuses on the actual domain logic that powers the app:

- runtime flag evaluation and mapping
- subscription pricing and list-item mapping
- entitlement enrichment and limit handling
- product helpers and subscriber resolution
- schema migration behavior
- auth crypto and license signing

Run it with:

```bash
pnpm test
```

## Troubleshooting

- If the app fails against a local SQLite file, delete `data/beak-control-pane.db` and restart.
- If license issuance fails, confirm both PEM environment variables are present and valid.
- If Stripe webhooks fail locally, use Stripe CLI and forward to `/api/billing/stripe/webhook`.
- If you change the schema, run `pnpm db:push` or `pnpm db:migrate` depending on the workflow you are using.

## License Verification

The app exposes the public verification key for offline consumers:

- `GET /api/licenses/public-key`

Use the matching private key only on the server side where licenses are created or reissued.
