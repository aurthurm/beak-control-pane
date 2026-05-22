# Beak Control Plane

Nuxt 4 control plane for Beak product billing, licensing, entitlements, and customer portal access.

<img width="1864" height="950" alt="image" src="https://github.com/user-attachments/assets/60195d42-dc2e-4578-8a26-15a93d1c2e24" />

## Stack

- Nuxt 4
- Vue 3
- shadcn-vue via `shadcn-nuxt`
- Tailwind CSS v4
- SQLite via Drizzle ORM and libSQL

## Setup

1. Copy `.env.example` to `.env`
2. Install dependencies with `pnpm install`
3. Configure **license signing** (required for `POST /api/licenses` and Stripe-driven reissues): set `BCP_LICENSE_PRIVATE_KEY_PEM` and `BCP_LICENSE_PUBLIC_KEY_PEM` (EC P-256 PKCS#8 / SPKI PEM). See comments in `.env.example`.
4. Optional **Stripe**: set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Webhook URL: `https://<host>/api/billing/stripe/webhook` (use Stripe CLI for local testing).
5. Optional **auth**: set `ADMIN_EMAIL` / `ADMIN_PASSWORD` and optionally `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` to seed platform admin accounts on DB bootstrap. Use `/admin/login` for staff and `/portal/login` for customer users. Auth enforcement defaults to enabled in production; you can override with `AUTH_ENFORCE_CONSOLE`, `AUTH_ENFORCE_PORTAL`, and `AUTH_ENFORCE_API` in `.env`.
6. Run `pnpm db:push`
7. Run `pnpm dev`

### Public license verification key

- `GET /api/licenses/public-key` — JWKS-style list with `kid` and PEM for offline verification.

### Customer portal

- `/portal` — customer-scoped account hub for subscriptions, licenses, usage, and entitlements.

### Workspace SDK

- `packages/bcp-sdk` — `pnpm build:sdk` (or `pnpm --filter @beak/bcp-sdk build`) builds the consumer SDK.

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm build:sdk`
- `pnpm preview`
- `pnpm db:push`
- `pnpm db:studio`
