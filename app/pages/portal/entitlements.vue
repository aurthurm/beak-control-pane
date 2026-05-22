<script setup lang="ts">
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import PortalShell from './components/PortalShell.vue'
import { formatDate } from './shared'

definePageMeta({ layout: 'default' })

const route = useRoute()
const organizationId = computed(() => (typeof route.query.organizationId === 'string' ? route.query.organizationId : null))
const { data: summary, pending, error } = usePortalSummary(organizationId)

useSeoMeta({
  title: 'Portal entitlements',
})

const rows = computed(() => summary.value?.entitlements ?? [])

const metrics = computed(() => {
  const items = rows.value
  return [
    { label: 'Entitlement snapshots', value: items.length, detail: 'Current effective snapshots' },
    { label: 'Modules enabled', value: items.reduce((total, item) => total + item.enabledModuleCount, 0), detail: 'Enabled across all snapshots' },
    { label: 'Tracked limits', value: items.reduce((total, item) => total + item.limitCount, 0), detail: 'Limit values currently visible' },
  ]
})
</script>

<template>
  <PortalShell
    title="Entitlements"
    subtitle="A readable snapshot of modules and limits currently effective for the active subscriber."
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
        <CardTitle>Effective entitlements</CardTitle>
        <CardDescription>
          {{ rows.length }} entitlement snapshots are visible for the active subscriber.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="rows.length" class="space-y-4">
          <article v-for="row in rows" :key="row.id" class="rounded-2xl border border-border/70 bg-background/70 p-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div class="text-lg font-semibold">
                  {{ row.productName }}
                </div>
                <div class="text-sm text-muted-foreground">
                  {{ row.subscriberName }} · computed {{ row.computedAtLabel }}
                </div>
              </div>
              <Badge variant="outline">
                {{ row.primarySource }}
              </Badge>
            </div>

            <div class="mt-4 grid gap-3 lg:grid-cols-2">
              <div class="rounded-xl border border-border/70 bg-background/80 p-3">
                <div class="text-sm font-medium">Modules</div>
                <div class="mt-1 text-sm text-muted-foreground">
                  {{ row.enabledModuleCount }} of {{ row.moduleCount }} enabled
                </div>
                <ul v-if="row.modulePreview.length" class="mt-3 space-y-1 text-sm">
                  <li v-for="item in row.modulePreview" :key="item" class="text-muted-foreground">
                    {{ item }}
                  </li>
                </ul>
              </div>
              <div class="rounded-xl border border-border/70 bg-background/80 p-3">
                <div class="text-sm font-medium">Limits</div>
                <div class="mt-1 text-sm text-muted-foreground">
                  {{ row.limitCount }} tracked limit values
                </div>
                <ul v-if="row.limitPreview.length" class="mt-3 space-y-1 text-sm">
                  <li v-for="item in row.limitPreview" :key="item" class="text-muted-foreground">
                    {{ item }}
                  </li>
                </ul>
              </div>
            </div>
            <div class="mt-3 text-xs text-muted-foreground">
              Computed {{ formatDate(row.computedAt) }}
            </div>
          </article>
        </div>

        <div v-else class="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center">
          <div class="text-sm font-medium">
            No entitlements yet
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            Entitlement snapshots will show here once the billing and entitlement pipeline has produced records.
          </p>
        </div>
      </CardContent>
    </Card>
    <Card v-else class="border-border/70 bg-card/90">
      <CardContent class="px-6 py-10 text-center text-sm text-muted-foreground">
        Loading entitlements…
      </CardContent>
    </Card>
  </PortalShell>
</template>
