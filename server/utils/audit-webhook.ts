const USAGE_ALERT_ACTIONS = new Set(['usage.warning_threshold', 'usage.limit_exceeded'])

/**
 * POST JSON to `BCP_ALERT_WEBHOOK_URL` when usage thresholds fire (fire-and-forget).
 */
export function notifyUsageAuditWebhook(payload: {
  action: string
  tenantId: string | null
  resourceId: string
  details: unknown
}): void {
  const url = process.env.BCP_ALERT_WEBHOOK_URL?.trim()
  if (!url || !USAGE_ALERT_ACTIONS.has(payload.action)) {
    return
  }

  const body = JSON.stringify({
    type: 'bcp.usage_alert',
    action: payload.action,
    tenantId: payload.tenantId,
    resourceId: payload.resourceId,
    details: payload.details,
    at: new Date().toISOString(),
  })

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'beak-control-pane/audit' },
    body,
  }).catch(() => {
    /* ignore network errors */
  })
}
