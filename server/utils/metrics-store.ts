type Counters = Record<string, number>

const g = globalThis as unknown as { __bcpMetrics?: Counters }
function counters(): Counters {
  if (!g.__bcpMetrics) {
    g.__bcpMetrics = {}
  }
  return g.__bcpMetrics
}

export function bumpMetric(name: string, delta = 1): void {
  const c = counters()
  c[name] = (c[name] ?? 0) + delta
}

export function renderPrometheusText(): string {
  const c = counters()
  const lines: string[] = ['# HELP bcp_http_events_total Internal counters', '# TYPE bcp_http_events_total counter']
  for (const [k, v] of Object.entries(c).sort(([a], [b]) => a.localeCompare(b))) {
    const safe = k.replace(/[^a-zA-Z0-9_:]/g, '_')
    lines.push(`bcp_http_events_total{name="${safe}"} ${v}`)
  }
  return `${lines.join('\n')}\n`
}
