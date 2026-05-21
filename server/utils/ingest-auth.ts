import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { requirePlatformStaff } from './auth-guards'

/**
 * Reads `BCP_INGEST_SECRET` or legacy `BCP_API_SECRET`.
 * When set, machine clients must send `Authorization: Bearer <secret>` or `x-bcp-api-key: <secret>`.
 * When `AUTH_ENFORCE_API=true`, a valid platform staff session is also accepted (browser console).
 * When no ingest secret is configured and staff API is not enforced, requests are allowed (local dev).
 */
export function getIngestSecret(): string {
  return (process.env.BCP_INGEST_SECRET ?? process.env.BCP_API_SECRET ?? '').trim()
}

export function getCronSecret(): string {
  return (process.env.BCP_CRON_SECRET ?? '').trim()
}

export function extractApiKeyFromEvent(event: H3Event): string | null {
  const header = getHeader(event, 'x-bcp-api-key')?.trim()
  if (header) {
    return header
  }
  const auth = getHeader(event, 'authorization')?.trim()
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  return null
}

/** Cron jobs / Nitro tasks call with header `x-bcp-cron-secret`. */
export function requireCronSecretIfConfigured(event: H3Event): void {
  const cron = getCronSecret()
  if (!cron) {
    return
  }
  const sent = getHeader(event, 'x-bcp-cron-secret')?.trim()
  if (sent !== cron) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or missing cron secret' })
  }
}

/**
 * Machine ingest routes (usage report, flag evaluate, activations from SDK) + optional staff session.
 */
export async function requireIngestSecretOrStaffApi(event: H3Event): Promise<void> {
  const ingest = getIngestSecret()
  const key = extractApiKeyFromEvent(event)
  if (ingest && key === ingest) {
    return
  }

  const config = useRuntimeConfig(event)
  if (config.authEnforceApi) {
    await requirePlatformStaff(event)
    return
  }

  if (ingest) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or missing ingest API key' })
  }
}

/**
 * Like {@link requireIngestSecretOrStaffApi} but also accepts {@link requireCronSecretIfConfigured} when secret matches.
 */
export async function requireIngestCronOrStaffApi(event: H3Event): Promise<void> {
  const cron = getCronSecret()
  if (cron && getHeader(event, 'x-bcp-cron-secret')?.trim() === cron) {
    return
  }
  await requireIngestSecretOrStaffApi(event)
}
