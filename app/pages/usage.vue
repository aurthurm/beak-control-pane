<script setup lang="ts">
import type { WorkspaceDashboard } from '~/types/workspace-dashboard'
import ConsolePageHeader from '~/components/ConsolePageHeader.vue'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatDateTime, formatRelative, usageStatusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  Cpu,
  Database,
  Filter,
  GitBranch,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Users,
} from 'lucide-vue-next'

type UsageRow = WorkspaceDashboard['usage'][number]

definePageMeta({ layout: 'console' })

useSeoMeta({
  title: `${site.brand.name} | Usage`,
  description: 'Measured usage versus licensed limits across subscribers and products.',
})

const search = ref('')
const productFilter = ref<string>('__all__')
const tenantFilter = ref<string>('__all__')
const periodFilter = ref<string>('')
const issuesOnly = ref(false)

const detailOpen = ref(false)
const selectedRow = ref<UsageRow | null>(null)

const route = useRoute()
const router = useRouter()

const { data, pending, refresh } = await useWorkspaceDashboard()

const periodOptions = computed(() => {
  const keys = [...new Set((data.value?.usage ?? []).map((u) => u.periodKey).filter(Boolean))]
  keys.sort()
  return keys
})

watch(
  periodOptions,
  (keys) => {
    if (!keys.length) {
      return
    }
    if (periodFilter.value === '__all__') {
      return
    }
    if (!periodFilter.value || !keys.includes(periodFilter.value)) {
      periodFilter.value = keys[keys.length - 1] ?? ''
    }
  },
  { immediate: true },
)

const latestPeriodKey = computed(() => {
  const keys = periodOptions.value
  return keys.length ? keys[keys.length - 1]! : ''
})

const productOptions = computed(() => {
  const map = new Map<string, string>()
  for (const u of data.value?.usage ?? []) {
    if (u.productId) {
      map.set(u.productId, u.productName)
    }
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
})

const tenantOptions = computed(() => {
  const map = new Map<string, string>()
  for (const u of data.value?.usage ?? []) {
    map.set(u.subscriberId, u.subscriberName)
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
})

const usageReady = computed(() => (data.value?.usage?.length ?? 0) > 0)

watch(
  [
    () => route.query.subscriber,
    () => route.query.product,
    usageReady,
  ],
  () => {
    if (!usageReady.value) {
      return
    }

    const rawTenant = route.query.subscriber
    const rawProduct = route.query.product
    const tenantQ = typeof rawTenant === 'string' ? rawTenant : Array.isArray(rawTenant) ? rawTenant[0] : undefined
    const productQ = typeof rawProduct === 'string' ? rawProduct : Array.isArray(rawProduct) ? rawProduct[0] : undefined
    const tid = tenantQ?.trim() || undefined
    const pid = productQ?.trim() || undefined

    tenantFilter.value =
      tid && tenantOptions.value.some(([id]) => id === tid) ? tid : '__all__'
    productFilter.value =
      pid && productOptions.value.some(([id]) => id === pid) ? pid : '__all__'
  },
  { immediate: true },
)

const workspaceScopeActive = computed(
  () =>
    tenantFilter.value !== '__all__' ||
    productFilter.value !== '__all__',
)

const workspaceScopeDescription = computed(() => {
  const parts: string[] = []
  if (tenantFilter.value !== '__all__') {
    const name = tenantOptions.value.find(([id]) => id === tenantFilter.value)?.[1] ?? tenantFilter.value
    parts.push(`Subscriber: ${name}`)
  }
  if (productFilter.value !== '__all__') {
    const name = productOptions.value.find(([id]) => id === productFilter.value)?.[1] ?? productFilter.value
    parts.push(`Product: ${name}`)
  }
  return parts.join(' · ')
})

function clearWorkspaceScope() {
  tenantFilter.value = '__all__'
  productFilter.value = '__all__'
  void router.replace({ path: '/usage', query: {} })
}

const query = computed(() => search.value.trim().toLowerCase())

const scopeRows = computed(() => {
  const rows = data.value?.usage ?? []
  return rows.filter((row) => {
    if (periodFilter.value !== '__all__' && row.periodKey !== periodFilter.value) {
      return false
    }
    if (productFilter.value !== '__all__' && row.productId !== productFilter.value) {
      return false
    }
    if (tenantFilter.value !== '__all__' && row.subscriberId !== tenantFilter.value) {
      return false
    }
    if (issuesOnly.value && row.status === 'normal') {
      return false
    }
    if (!query.value) {
      return true
    }
    return [row.metric, row.metricLabel, row.period, row.status, row.subscriberName, row.productName, row.source].some((f) =>
      f.toLowerCase().includes(query.value),
    )
  })
})

const rowsForSummary = computed(() => {
  const rows = data.value?.usage ?? []
  const pk = periodFilter.value === '__all__' ? latestPeriodKey.value : periodFilter.value

  if (!pk) {
    return []
  }

  return rows.filter((row) => {
    if (row.periodKey !== pk) {
      return false
    }
    if (productFilter.value !== '__all__' && row.productId !== productFilter.value) {
      return false
    }
    if (tenantFilter.value !== '__all__' && row.subscriberId !== tenantFilter.value) {
      return false
    }
    if (issuesOnly.value && row.status === 'normal') {
      return false
    }
    if (!query.value) {
      return true
    }
    return [row.metric, row.metricLabel, row.period, row.status, row.subscriberName, row.productName, row.source].some((f) =>
      f.toLowerCase().includes(query.value),
    )
  })
})

const summary = computed(() => {
  const rows = rowsForSummary.value
  const sumMetric = (m: string) => rows.filter((r) => r.metric === m).reduce((a, r) => a + r.value, 0)
  const branchesSites = rows
    .filter((r) => r.metric === 'branches' || r.metric === 'sites')
    .reduce((a, r) => a + r.value, 0)
  const throughputMetrics = ['lab_tests_per_month', 'pos_orders_per_month', 'transactions_per_month']
  const throughput = rows.filter((r) => throughputMetrics.includes(r.metric)).reduce((a, r) => a + r.value, 0)

  const exceededTenants = new Set(rows.filter((r) => r.status === 'exceeded').map((r) => r.subscriberId))

  return {
    activeUsers: sumMetric('users'),
    branchesSites,
    storageGb: sumMetric('storage_gb'),
    apiCalls: sumMetric('api_calls_per_month'),
    throughput,
    tenantsOverLimit: exceededTenants.size,
  }
})

function formatMetricValue(metric: string, value: number) {
  if (metric === 'storage_gb') {
    return `${value.toLocaleString()} GB`
  }
  return value.toLocaleString()
}

function openDetail(row: UsageRow) {
  selectedRow.value = row
  detailOpen.value = true
}

const detailMetrics = computed(() => {
  if (!selectedRow.value || !data.value) {
    return []
  }
  const { subscriberId, productId, periodKey } = selectedRow.value
  return data.value.usage
    .filter((u) => u.subscriberId === subscriberId && u.productId === productId && u.periodKey === periodKey)
    .slice()
    .sort((a, b) => a.metricLabel.localeCompare(b.metricLabel))
})

const trendPoints = computed(() => {
  if (!selectedRow.value || !data.value) {
    return []
  }
  const { subscriberId, productId, metric } = selectedRow.value
  return data.value.usage
    .filter((u) => u.subscriberId === subscriberId && u.productId === productId && u.metric === metric)
    .slice()
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
})

const recalcPending = ref(false)

async function recalculate() {
  recalcPending.value = true
  try {
    await $fetch('/api/usage/recalculate', { method: 'POST' })
    await refresh()
  } finally {
    recalcPending.value = false
  }
}

function exportCsv() {
  const rows = scopeRows.value
  const headers = [
    'Subscriber',
    'Product',
    'Limit key',
    'Current usage',
    'Limit',
    'Utilization %',
    'Status',
    'Period',
    'Last updated',
    'Enforcement',
    'Source',
  ]
  const esc = (v: string | number) => {
    const s = String(v)
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        esc(r.subscriberName),
        esc(r.productName),
        esc(r.metricLabel),
        esc(r.value),
        esc(r.limitValue),
        esc(r.utilizationPercent),
        esc(r.status),
        esc(r.period),
        esc(r.recordedAt),
        esc(r.enforcement),
        esc(r.source),
      ].join(','),
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `usage-report-${periodFilter.value === '__all__' || !periodFilter.value ? 'all-periods' : periodFilter.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function utilizationFill(row: UsageRow) {
  if (row.limitValue <= 0) {
    return 0
  }
  return Math.min(100, Math.round((row.value / row.limitValue) * 1000) / 10)
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Usage' },
      ]"
    >
      <template #actions>
        <Button variant="outline" size="sm" :disabled="pending || recalcPending" @click="recalculate">
          <RefreshCw class="size-4" :class="pending || recalcPending ? 'animate-spin' : ''" />
          Recalculate
        </Button>
        <Button variant="outline" size="sm" :disabled="!scopeRows.length" @click="exportCsv">
          <ArrowDownToLine class="size-4" />
          Export CSV
        </Button>
        <Button variant="outline" size="sm" :disabled="pending" @click="refresh">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
      </template>
    </ConsolePageHeader>

    <div class="flex-1 space-y-6 p-4 lg:p-6">
      <Alert class="border-primary/25 bg-primary/5">
        <Activity class="size-4" />
        <AlertTitle>Usage tracking</AlertTitle>
        <AlertDescription>
          This page shows metered usage against product-linked limits for the selected billing period. Rows are written to
          <code class="rounded bg-muted px-1 py-0.5 text-xs">usage_records</code> by the usage ingest pipeline and then
          recalculated against entitlement limits.
        </AlertDescription>
      </Alert>

      <Alert v-if="workspaceScopeActive" class="border-border/80 bg-muted/30">
        <Filter class="size-4" />
        <AlertTitle class="flex flex-wrap items-center justify-between gap-2">
          <span>Scoped view</span>
          <Button variant="outline" size="sm" class="shrink-0" @click="clearWorkspaceScope"> Full workspace </Button>
        </AlertTitle>
        <AlertDescription>
          {{ workspaceScopeDescription }}. Narrowed from the subscriber hub, entitlements, or a direct link — use
          <span class="font-medium">Full workspace</span> or change filters below to widen the view.
        </AlertDescription>
      </Alert>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">Active users</CardTitle>
            <Users class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-semibold tabular-nums">{{ summary.activeUsers.toLocaleString() }}</p>
            <p class="text-xs text-muted-foreground">Sum of <span class="font-medium">users</span> in scope</p>
          </CardContent>
        </Card>
        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">Branches &amp; sites</CardTitle>
            <GitBranch class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-semibold tabular-nums">{{ summary.branchesSites.toLocaleString() }}</p>
            <p class="text-xs text-muted-foreground"><span class="font-medium">branches</span> + <span class="font-medium">sites</span></p>
          </CardContent>
        </Card>
        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">Storage</CardTitle>
            <Database class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-semibold tabular-nums">{{ summary.storageGb.toLocaleString() }} GB</p>
            <p class="text-xs text-muted-foreground">Sum of <span class="font-medium">storage_gb</span></p>
          </CardContent>
        </Card>
        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">API calls</CardTitle>
            <Cpu class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-semibold tabular-nums">{{ summary.apiCalls.toLocaleString() }}</p>
            <p class="text-xs text-muted-foreground">This period, in scope</p>
          </CardContent>
        </Card>
        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">Tests / orders</CardTitle>
            <ShoppingCart class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-semibold tabular-nums">{{ summary.throughput.toLocaleString() }}</p>
            <p class="text-xs text-muted-foreground">Lab tests + POS orders in scope</p>
          </CardContent>
        </Card>
        <Card
          class="border-border/70 bg-card/90 shadow-sm"
          :class="summary.tenantsOverLimit > 0 ? 'border-destructive/40' : ''"
        >
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">Subscribers over limit</CardTitle>
            <AlertTriangle class="size-4" :class="summary.tenantsOverLimit > 0 ? 'text-destructive' : 'text-muted-foreground'" />
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-semibold tabular-nums">{{ summary.tenantsOverLimit }}</p>
            <p class="text-xs text-muted-foreground">Distinct subscribers with any exceeded limit</p>
          </CardContent>
        </Card>
      </div>

      <p v-if="periodFilter === '__all__' && latestPeriodKey" class="text-xs text-muted-foreground">
        Portfolio totals above use the latest period ({{ latestPeriodKey }}) so values are not summed across multiple months.
      </p>

      <Card class="overflow-hidden border-border/70 bg-card/90 shadow-sm backdrop-blur-sm">
        <CardHeader class="flex flex-col gap-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="space-y-1">
              <CardTitle>Usage by limit</CardTitle>
              <CardDescription>
                Filter by product, subscriber, and period, compare current usage to caps, and open a row for trends and sources.
              </CardDescription>
            </div>
            <div class="relative w-full lg:max-w-xs">
              <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="search" class="pl-9" placeholder="Search table…" />
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <Package class="size-4 shrink-0 text-muted-foreground" />
              <NativeSelect v-model="productFilter" class="h-9 min-w-[11rem]">
                <NativeSelectOption value="__all__">All products</NativeSelectOption>
                <NativeSelectOption v-for="[id, name] in productOptions" :key="id" :value="id">{{ name }}</NativeSelectOption>
              </NativeSelect>
            </div>
            <div class="flex items-center gap-2">
              <Users class="size-4 shrink-0 text-muted-foreground" />
              <NativeSelect v-model="tenantFilter" class="h-9 min-w-[11rem]">
                <NativeSelectOption value="__all__">All subscribers</NativeSelectOption>
                <NativeSelectOption v-for="[id, name] in tenantOptions" :key="id" :value="id">{{ name }}</NativeSelectOption>
              </NativeSelect>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Period</span>
              <NativeSelect v-model="periodFilter" class="h-9 min-w-[9rem]">
                <NativeSelectOption v-for="p in periodOptions" :key="p" :value="p">{{ p }}</NativeSelectOption>
                <NativeSelectOption value="__all__">All periods</NativeSelectOption>
              </NativeSelect>
            </div>
            <div class="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox id="usage-issues-only" v-model="issuesOnly" />
              <Label for="usage-issues-only" class="cursor-pointer font-normal">Warnings &amp; exceeded only</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <ScrollArea class="h-[min(70vh,720px)] w-full">
            <Table>
              <TableHeader>
                <TableRow class="hover:bg-transparent">
                  <TableHead>Subscriber</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Limit key</TableHead>
                  <TableHead class="min-w-[200px]">Utilization</TableHead>
                  <TableHead class="text-right">Usage</TableHead>
                  <TableHead class="text-right">Limit</TableHead>
                  <TableHead class="text-right">%</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="row in scopeRows"
                  :key="row.id"
                  class="cursor-pointer"
                  :class="row.status === 'exceeded' ? 'bg-destructive/5' : row.status === 'warning' ? 'bg-amber-500/5' : ''"
                  @click="openDetail(row)"
                >
                  <TableCell>
                    <div class="font-medium">{{ row.subscriberName }}</div>
                  </TableCell>
                  <TableCell>{{ row.productName }}</TableCell>
                  <TableCell>
                    <div class="font-medium">{{ row.metricLabel }}</div>
                    <div class="text-xs capitalize text-muted-foreground">{{ row.metric.replaceAll('_', ' ') }}</div>
                  </TableCell>
                  <TableCell>
                    <div class="relative h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        class="pointer-events-none absolute inset-y-0 z-10 w-px bg-amber-500/90"
                        :style="{ left: `${Math.min(100, row.warningThresholdPercent)}%` }"
                      />
                      <div
                        class="h-full rounded-full transition-all"
                        :class="
                          row.status === 'exceeded'
                            ? 'bg-destructive'
                            : row.status === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-primary'
                        "
                        :style="{ width: `${utilizationFill(row)}%` }"
                      />
                    </div>
                    <div class="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>0</span>
                      <span class="text-amber-600 dark:text-amber-400">Warn {{ row.warningThresholdPercent }}%</span>
                      <span>100%</span>
                    </div>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">{{ formatMetricValue(row.metric, row.value) }}</TableCell>
                  <TableCell class="text-right tabular-nums text-muted-foreground">
                    {{ formatMetricValue(row.metric, row.limitValue) }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">{{ row.utilizationPercent }}%</TableCell>
                  <TableCell>
                    <Badge :variant="usageStatusVariant(row.status)" class="capitalize">{{ row.status }}</Badge>
                  </TableCell>
                  <TableCell>{{ row.period }}</TableCell>
                  <TableCell class="text-muted-foreground">
                    <span :title="formatDateTime(row.recordedAt)">{{ formatRelative(row.recordedAt) }}</span>
                  </TableCell>
                </TableRow>
                <TableRow v-if="!scopeRows.length">
                  <TableCell colspan="10" class="h-24 text-center text-muted-foreground"> No usage rows match your filters. </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>

    <Sheet v-model:open="detailOpen">
      <SheetContent class="w-full overflow-y-auto p-0 sm:max-w-xl">
        <div class="flex min-h-full flex-col bg-gradient-to-b from-background via-background to-muted/20">
          <div class="border-b border-border/60 px-5 py-5 sm:px-6 sm:py-6">
            <SheetHeader class="space-y-2">
              <SheetTitle class="text-xl leading-tight">{{ selectedRow?.metricLabel }}</SheetTitle>
              <SheetDescription class="text-sm">
                {{ selectedRow?.subscriberName }} · {{ selectedRow?.productName }} · {{ selectedRow?.period }}
              </SheetDescription>
            </SheetHeader>

            <div v-if="selectedRow" class="mt-5 rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="space-y-1">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current limit</p>
                  <p class="text-sm font-medium text-foreground">
                    {{ formatMetricValue(selectedRow.metric, selectedRow.value) }} of
                    {{ formatMetricValue(selectedRow.metric, selectedRow.limitValue) }}
                  </p>
                </div>
                <Badge :variant="usageStatusVariant(selectedRow.status)" class="capitalize">{{ selectedRow.status }}</Badge>
              </div>

              <div class="mt-4 space-y-2">
                <div class="relative h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    class="pointer-events-none absolute inset-y-0 z-10 w-px bg-amber-500/90"
                    :style="{ left: `${Math.min(100, selectedRow.warningThresholdPercent)}%` }"
                  />
                  <div
                    class="h-full rounded-full transition-all"
                    :class="
                      selectedRow.status === 'exceeded'
                        ? 'bg-destructive'
                        : selectedRow.status === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-primary'
                    "
                    :style="{ width: `${utilizationFill(selectedRow)}%` }"
                  />
                </div>
                <div class="flex justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span class="text-amber-600 dark:text-amber-400">Warn {{ selectedRow.warningThresholdPercent }}%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="selectedRow" class="flex flex-1 flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6">
            <div class="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Details</p>
              <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt class="text-muted-foreground">Enforcement</dt>
                  <dd class="font-medium capitalize">{{ selectedRow.enforcement }}</dd>
                </div>
                <div>
                  <dt class="text-muted-foreground">Raw status</dt>
                  <dd class="font-medium">{{ selectedRow.rawStatus }}</dd>
                </div>
                <div class="col-span-2">
                  <dt class="text-muted-foreground">Source</dt>
                  <dd class="break-all font-mono text-xs">{{ selectedRow.source }}</dd>
                </div>
              </dl>
            </div>

            <div class="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Trend (same subscriber · product · limit)
              </p>
              <ul class="mt-3 space-y-2">
                <li v-for="p in trendPoints" :key="p.id" class="flex justify-between gap-3 rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-sm">
                  <span class="text-muted-foreground">{{ p.period }}</span>
                  <span class="tabular-nums font-medium"
                    >{{ formatMetricValue(p.metric, p.value) }}
                    <span class="font-normal text-muted-foreground">/ {{ formatMetricValue(p.metric, p.limitValue) }}</span></span
                  >
                </li>
                <li v-if="trendPoints.length < 2" class="rounded-xl border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">
                  Add historical rows to see multi-period trends.
                </li>
              </ul>
            </div>

            <div class="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                All limits for this subscriber · product · period
              </p>
              <ul class="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                <li v-for="m in detailMetrics" :key="m.id" class="rounded-xl border border-border/50 bg-background/70 p-3">
                  <div class="flex justify-between gap-2">
                    <span class="font-medium">{{ m.metricLabel }}</span>
                    <Badge :variant="usageStatusVariant(m.status)" class="shrink-0 capitalize">{{ m.status }}</Badge>
                  </div>
                  <div class="mt-2 relative h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      class="pointer-events-none absolute inset-y-0 z-10 w-px bg-amber-500/80"
                      :style="{ left: `${Math.min(100, m.warningThresholdPercent)}%` }"
                    />
                    <div
                      class="h-full rounded-full"
                      :class="m.status === 'exceeded' ? 'bg-destructive' : m.status === 'warning' ? 'bg-amber-500' : 'bg-primary'"
                      :style="{ width: `${utilizationFill(m)}%` }"
                    />
                  </div>
                  <div class="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>{{ formatMetricValue(m.metric, m.value) }} / {{ formatMetricValue(m.metric, m.limitValue) }}</span>
                    <span class="capitalize">{{ m.enforcement }} · {{ m.source }}</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>
