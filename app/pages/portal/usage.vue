<script setup lang="ts">
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import PortalShell from './components/PortalShell.vue'
import { formatCompactNumber, formatDate, toneForStatus } from './shared'

definePageMeta({ layout: 'default' })

const route = useRoute()
const organizationId = computed(() => (typeof route.query.organizationId === 'string' ? route.query.organizationId : null))
const { data: summary, pending, error } = usePortalSummary(organizationId)

useSeoMeta({
  title: 'Portal usage',
})

const rows = computed(() => summary.value?.usage ?? [])

const metrics = computed(() => {
  const items = rows.value
  return [
    { label: 'Usage rows', value: items.length, detail: 'Metered signals currently visible' },
    { label: 'Over limit', value: items.filter((item) => item.uiStatus !== 'normal').length, detail: 'Rows requiring attention' },
    { label: 'Products', value: new Set(items.map((item) => item.productName)).size, detail: 'Products reporting usage' },
  ]
})
</script>

<template>
  <PortalShell
    title="Usage"
    subtitle="Usage signals are shown with their limits so customers can spot risk before it becomes a problem."
    :summary="summary ?? null"
    :pending="pending"
    :error="error ? 'Unable to load portal data.' : null"
  >
    <section v-if="summary" class="grid gap-3 sm:grid-cols-3">
      <div v-for="metric in metrics" :key="metric.label" class="rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-sm">
        <div class="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {{ metric.label }}
        </div>
        <div class="mt-1 text-2xl font-semibold">
          {{ metric.value }}
        </div>
        <div class="mt-1 text-sm text-muted-foreground">
          {{ metric.detail }}
        </div>
      </div>
    </section>

    <Card v-if="summary" class="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>Usage records</CardTitle>
        <CardDescription>
          {{ rows.length }} usage rows connected to the active customer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="rows.length" class="overflow-hidden rounded-2xl border border-border/70">
          <table class="w-full text-left text-sm">
            <thead class="bg-muted/60 text-muted-foreground">
              <tr>
                <th class="px-4 py-3 font-medium">Metric</th>
                <th class="px-4 py-3 font-medium">Scope</th>
                <th class="px-4 py-3 font-medium">Value</th>
                <th class="px-4 py-3 font-medium">Limit</th>
                <th class="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" class="border-t border-border/70 bg-background/70">
                <td class="px-4 py-4 align-top">
                  <div class="font-medium">
                    {{ row.metricLabel }}
                  </div>
                  <div class="text-muted-foreground">
                    {{ row.period }}
                  </div>
                </td>
                <td class="px-4 py-4 align-top">
                  <div>{{ row.tenantName }}</div>
                  <div class="text-muted-foreground">{{ row.productName }}</div>
                </td>
                <td class="px-4 py-4 align-top">
                  <div class="font-medium">{{ formatCompactNumber(row.value) }}</div>
                  <div class="text-muted-foreground">Recorded {{ formatDate(row.recordedAt) }}</div>
                </td>
                <td class="px-4 py-4 align-top">
                  <div class="font-medium">{{ formatCompactNumber(row.limitValue) }}</div>
                  <div class="text-muted-foreground">{{ row.warningThresholdPercent }}% warning threshold</div>
                </td>
                <td class="px-4 py-4 align-top">
                  <Badge :variant="toneForStatus(row.uiStatus)">
                    {{ row.uiStatus }}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center">
          <div class="text-sm font-medium">
            No usage records yet
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            Usage will appear here once the product reports meter data or the billing pipeline creates records.
          </p>
        </div>
      </CardContent>
    </Card>
    <Card v-else class="border-border/70 bg-card/90">
      <CardContent class="px-6 py-10 text-center text-sm text-muted-foreground">
        Loading usage…
      </CardContent>
    </Card>
  </PortalShell>
</template>
