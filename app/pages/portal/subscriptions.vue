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
  title: 'Portal subscriptions',
})

const rows = computed(() => summary.value?.subscriptions ?? [])

const metrics = computed(() => {
  const items = rows.value
  return [
    { label: 'Subscriptions', value: items.length, detail: 'Current records in scope' },
    { label: 'Manual contracts', value: items.filter((item) => item.manualContract).length, detail: 'Subscriptions with custom terms' },
    { label: 'Paused', value: items.filter((item) => item.isPaused).length, detail: 'Subscriptions currently paused' },
  ]
})
</script>

<template>
    <PortalShell
      title="Subscriptions"
    subtitle="Current plans, renewal timing, and billing posture for the active subscriber."
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
        <CardTitle>Billing subscriptions</CardTitle>
        <CardDescription>
          {{ rows.length }} subscriptions tied to the active subscriber.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="rows.length" class="overflow-hidden rounded-2xl border border-border/70">
          <table class="w-full text-left text-sm">
            <thead class="bg-muted/60 text-muted-foreground">
              <tr>
                <th class="px-4 py-3 font-medium">Subscription</th>
                <th class="px-4 py-3 font-medium">Plan</th>
                <th class="px-4 py-3 font-medium">Renewal</th>
                <th class="px-4 py-3 font-medium">Amount</th>
                <th class="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" class="border-t border-border/70 bg-background/70">
                <td class="px-4 py-4 align-top">
                  <div class="font-medium">
                    {{ row.productName }}
                  </div>
                  <div class="text-muted-foreground">
                    {{ row.subscriberName }}
                  </div>
                </td>
                <td class="px-4 py-4 align-top">
                  <div class="font-medium">
                    {{ row.planName }}
                  </div>
                  <div class="text-muted-foreground">
                    {{ row.billingInterval }}
                  </div>
                </td>
                <td class="px-4 py-4 align-top">
                  <div>{{ row.renewalAtLabel }}</div>
                  <div class="text-muted-foreground">
                    Ends {{ row.endsAtLabel }}
                  </div>
                </td>
                <td class="px-4 py-4 align-top">
                  <div class="font-medium">
                    {{ row.amountLabel }}
                  </div>
                  <div class="text-muted-foreground">
                    {{ row.autoRenew ? 'Auto-renew on' : 'Auto-renew off' }}
                  </div>
                </td>
                <td class="px-4 py-4 align-top">
                  <div class="flex flex-col gap-2">
                    <Badge :variant="toneForStatus(row.status)">
                      {{ row.status }}
                    </Badge>
                    <Badge v-if="row.manualContract" variant="outline">
                      Manual contract
                    </Badge>
                    <Badge v-if="row.isPaused" variant="warning">
                      Paused
                    </Badge>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center">
          <div class="text-sm font-medium">
            No subscriptions yet
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            Once the subscriber has an active plan, it will appear here with renewal and billing details.
          </p>
        </div>
      </CardContent>
    </Card>
    <Card v-else class="border-border/70 bg-card/90">
      <CardContent class="px-6 py-10 text-center text-sm text-muted-foreground">
        Loading subscriptions…
      </CardContent>
    </Card>
  </PortalShell>
</template>
