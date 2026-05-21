<script setup lang="ts">
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import PortalShell from './components/PortalShell.vue'
import { formatDate, toneForStatus } from './shared'

definePageMeta({ layout: 'default' })

const route = useRoute()
const organizationId = computed(() => (typeof route.query.organizationId === 'string' ? route.query.organizationId : null))
const { data: summary, pending, error } = usePortalSummary(organizationId)

useSeoMeta({
  title: 'Portal licenses',
})

const rows = computed(() => summary.value?.licenses ?? [])

const metrics = computed(() => {
  const items = rows.value
  return [
    { label: 'Licenses', value: items.length, detail: 'Current inventory in scope' },
    { label: 'Expiring soon', value: items.filter((item) => item.remainingDays !== null && item.remainingDays <= 30).length, detail: 'Needs attention within 30 days' },
    { label: 'Recently seen', value: items.filter((item) => item.latestSeenAt).length, detail: 'Licenses with recent activity' },
  ]
})
</script>

<template>
  <PortalShell
    title="Licenses"
    subtitle="License keys, activation capacity, and expiry pressure for the active customer."
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
        <CardTitle>License inventory</CardTitle>
        <CardDescription>
          {{ rows.length }} licenses available in the active customer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="rows.length" class="grid gap-4 lg:grid-cols-2">
          <article v-for="row in rows" :key="row.id" class="rounded-2xl border border-border/70 bg-background/70 p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="text-lg font-semibold">
                  {{ row.productName }}
                </div>
                <div class="text-sm text-muted-foreground">
                  {{ row.tenantName }} · {{ row.mode }}
                </div>
              </div>
              <Badge :variant="toneForStatus(row.status)">
                {{ row.status }}
              </Badge>
            </div>
            <div class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div class="rounded-xl border border-border/70 bg-background/80 p-3">
                <div class="text-muted-foreground">Valid until</div>
                <div class="font-medium">{{ row.validToLabel }}</div>
                <div class="text-muted-foreground">Grace until {{ row.graceUntilLabel }}</div>
              </div>
              <div class="rounded-xl border border-border/70 bg-background/80 p-3">
                <div class="text-muted-foreground">Activations</div>
                <div class="font-medium">{{ row.activeActivations }} / {{ row.maxActivations }}</div>
                <div class="text-muted-foreground">{{ row.activationsTotal }} tracked bindings</div>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {{ row.licenseKey }}
              </Badge>
              <Badge v-if="row.remainingDays !== null && row.remainingDays <= 30" variant="warning">
                {{ row.remainingDays }} days left
              </Badge>
              <Badge v-if="row.latestSeenAt" variant="outline">
                Seen {{ formatDate(row.latestSeenAt) }}
              </Badge>
            </div>
          </article>
        </div>

        <div v-else class="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center">
          <div class="text-sm font-medium">
            No licenses yet
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            Licenses issued for this customer will show up here with activation usage and expiry windows.
          </p>
        </div>
      </CardContent>
    </Card>
    <Card v-else class="border-border/70 bg-card/90">
      <CardContent class="px-6 py-10 text-center text-sm text-muted-foreground">
        Loading licenses…
      </CardContent>
    </Card>
  </PortalShell>
</template>
