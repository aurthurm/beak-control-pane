import { getHeader } from 'h3'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'
import { renderPrometheusText } from '../utils/metrics-store'

/**
 * Prometheus-style metrics. When `BCP_METRICS_TOKEN` is set, require `Authorization: Bearer <token>`
 * or skip auth in dev. Otherwise follows `AUTH_ENFORCE_API` staff session rules when enabled.
 */
export default defineEventHandler(async (event) => {
  const token = process.env.BCP_METRICS_TOKEN?.trim()
  if (token) {
    const sent = getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (sent !== token) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  } else {
    await requireStaffApiWhenEnforced(event)
  }

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return renderPrometheusText()
})
