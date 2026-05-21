<script setup lang="ts">
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
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
import { formatCurrency, formatDate } from '~/lib/formatters'
import { ExternalLink, FileSearch, RefreshCw, RotateCcw, Search } from 'lucide-vue-next'

const props = defineProps<{
  customerId: string
}>()

type BillingListResponse = {
  events: Array<{
    id: string
    provider: string
    eventType: string
    tenantId: string
    tenantName: string
    subscriptionId: string | null
    subscriptionLabel: string | null
    status: string
    amountCents: number
    currency: string
    occurredAt: string
    processedAt: string
    retryCount: number
  }>
  providers: string[]
  eventTypes: string[]
}

type BillingDetailEvent = BillingListResponse['events'][number] & {
  payloadJson: string
  normalizedJson: string
  processingLogsJson: string
  errorJson: string
  impactedRecordsJson: string
}

const providerFilter = ref('all')
const typeFilter = ref('all')
const statusFilter = ref('all')
const search = ref('')

const queryParams = computed(() => ({
  tenant: props.customerId,
  provider: providerFilter.value,
  eventType: typeFilter.value,
  status: statusFilter.value,
  q: search.value.trim() || undefined,
}))

const { data, pending, refresh } = await useFetch<BillingListResponse>('/api/billing/events', {
  query: queryParams,
})

const billingTotalCents = computed(() => (data.value?.events ?? []).reduce((acc, e) => acc + e.amountCents, 0))
const currencyHint = computed(() => data.value?.events[0]?.currency ?? 'USD')

const detailOpen = ref(false)
const detailLoading = ref(false)
const detailEvent = ref<BillingDetailEvent | null>(null)
const actionLoading = ref(false)

const prettyJson = (raw: string) => {
  if (!raw || !raw.trim()) return '—'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

const parseJsonArray = <T,>(raw: string): T[] => {
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

const statusVariant = (status: string) => {
  const s = status.toLowerCase()
  if (s === 'failed') return 'destructive' as const
  if (s === 'ignored') return 'secondary' as const
  if (s === 'received') return 'outline' as const
  return 'default' as const
}

const subscriptionPath = (subscriptionId: string) =>
  `/customers/${encodeURIComponent(props.customerId)}/subscription/${encodeURIComponent(subscriptionId)}`

const openDetail = async (id: string) => {
  detailOpen.value = true
  detailLoading.value = true
  detailEvent.value = null
  try {
    const res = await $fetch<{ event: BillingDetailEvent }>(`/api/billing/events/${id}`)
    detailEvent.value = res.event
  } finally {
    detailLoading.value = false
  }
}

const syncDashboard = async () => {
  await refreshNuxtData('bcp-workspace-dashboard')
}

const retryEvent = async () => {
  if (!detailEvent.value) return
  actionLoading.value = true
  try {
    await $fetch(`/api/billing/events/${detailEvent.value.id}/retry`, { method: 'POST' })
    await refresh()
    await syncDashboard()
    await openDetail(detailEvent.value.id)
  } finally {
    actionLoading.value = false
  }
}

const ignoreEvent = async () => {
  if (!detailEvent.value) return
  actionLoading.value = true
  try {
    await $fetch(`/api/billing/events/${detailEvent.value.id}/ignore`, { method: 'POST' })
    await refresh()
    await syncDashboard()
    await openDetail(detailEvent.value.id)
  } finally {
    actionLoading.value = false
  }
}

watch(detailOpen, (open) => {
  if (!open) {
    detailEvent.value = null
  }
})
</script>

<template>
  <Card class="overflow-hidden border-border/70 bg-card/90 shadow-sm">
    <CardHeader class="flex flex-col gap-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <CardTitle class="text-lg">Billing events</CardTitle>
          <CardDescription>
            Provider stream for this customer — inspect payloads, normalization, retries, and subscription impact.
            Total recorded
            {{ formatCurrency(billingTotalCents, currencyHint) }}
            across {{ data?.events?.length ?? 0 }} event(s) matching filters.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" class="shrink-0" :disabled="pending" @click="refresh">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
      </div>
      <div class="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div class="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="flex flex-col gap-1.5">
            <Label for="cbill-provider" class="text-xs font-medium text-muted-foreground">Provider</Label>
            <NativeSelect id="cbill-provider" v-model="providerFilter">
              <NativeSelectOption value="all">All providers</NativeSelectOption>
              <NativeSelectOption v-for="p in data?.providers ?? []" :key="p" :value="p">{{ p }}</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="cbill-type" class="text-xs font-medium text-muted-foreground">Event type</Label>
            <NativeSelect id="cbill-type" v-model="typeFilter">
              <NativeSelectOption value="all">All types</NativeSelectOption>
              <NativeSelectOption v-for="t in data?.eventTypes ?? []" :key="t" :value="t">{{ t }}</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="cbill-status" class="text-xs font-medium text-muted-foreground">Status</Label>
            <NativeSelect id="cbill-status" v-model="statusFilter">
              <NativeSelectOption value="all">All statuses</NativeSelectOption>
              <NativeSelectOption value="received">Received</NativeSelectOption>
              <NativeSelectOption value="processed">Processed</NativeSelectOption>
              <NativeSelectOption value="failed">Failed</NativeSelectOption>
              <NativeSelectOption value="ignored">Ignored</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-medium text-muted-foreground">Search</span>
            <div class="relative">
              <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="search" class="pl-9" placeholder="Event ID, type, subscription…" />
            </div>
          </div>
        </div>
      </div>
    </CardHeader>
    <CardContent class="p-0">
      <div v-if="pending && !data" class="p-6 text-sm text-muted-foreground">Loading billing events…</div>
      <ScrollArea v-else-if="data?.events?.length" class="h-[min(65vh,640px)] w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="whitespace-nowrap">Event ID</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Event type</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Status</TableHead>
              <TableHead class="whitespace-nowrap">Occurred</TableHead>
              <TableHead class="whitespace-nowrap">Processed</TableHead>
              <TableHead class="text-right">Retries</TableHead>
              <TableHead class="text-right">Amount</TableHead>
              <TableHead class="text-right">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="event in data?.events ?? []" :key="event.id">
              <TableCell class="font-mono text-xs">{{ event.id }}</TableCell>
              <TableCell>
                <Badge variant="secondary">{{ event.provider }}</Badge>
              </TableCell>
              <TableCell class="max-w-[200px] truncate font-medium" :title="event.eventType">
                {{ event.eventType }}
              </TableCell>
              <TableCell>
                <template v-if="event.subscriptionId">
                  <div class="max-w-[200px] truncate text-sm" :title="event.subscriptionLabel ?? ''">
                    {{ event.subscriptionLabel ?? event.subscriptionId }}
                  </div>
                  <NuxtLink
                    :to="subscriptionPath(event.subscriptionId)"
                    class="inline-flex items-center gap-0.5 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {{ event.subscriptionId }}
                    <ExternalLink class="size-3 shrink-0 opacity-70" />
                  </NuxtLink>
                </template>
                <span v-else class="text-sm text-muted-foreground">—</span>
              </TableCell>
              <TableCell>
                <Badge :variant="statusVariant(event.status)">{{ event.status }}</Badge>
              </TableCell>
              <TableCell class="whitespace-nowrap text-sm">{{ formatDate(event.occurredAt) }}</TableCell>
              <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
                {{ event.processedAt ? formatDate(event.processedAt) : '—' }}
              </TableCell>
              <TableCell class="text-right tabular-nums">{{ event.retryCount }}</TableCell>
              <TableCell class="text-right text-sm tabular-nums">
                {{ formatCurrency(event.amountCents, event.currency) }}
              </TableCell>
              <TableCell class="text-right">
                <Button variant="outline" size="sm" @click="openDetail(event.id)">
                  <FileSearch class="size-4" />
                  Inspect
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <p v-else class="p-6 text-sm text-muted-foreground">No billing events for this customer.</p>
    </CardContent>
  </Card>

  <Sheet v-model:open="detailOpen">
    <SheetContent side="right" class="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl lg:max-w-2xl">
      <SheetHeader class="border-b border-border/60 pb-4 text-left">
        <SheetTitle>Billing event</SheetTitle>
        <SheetDescription v-if="detailEvent" class="font-mono text-xs">
          {{ detailEvent.id }}
        </SheetDescription>
        <SheetDescription v-else>Loading…</SheetDescription>
      </SheetHeader>

      <div v-if="detailLoading" class="p-6 text-sm text-muted-foreground">Loading event…</div>

      <template v-else-if="detailEvent">
        <div class="flex flex-wrap gap-2 border-b border-border/60 px-6 py-4">
          <Badge :variant="statusVariant(detailEvent.status)">{{ detailEvent.status }}</Badge>
          <Badge variant="secondary">{{ detailEvent.provider }}</Badge>
          <span class="text-sm text-muted-foreground">{{ formatDate(detailEvent.occurredAt) }}</span>
        </div>

        <div class="flex flex-wrap gap-2 px-6 py-3">
          <Button v-if="detailEvent.status === 'failed'" size="sm" :disabled="actionLoading" @click="retryEvent">
            <RotateCcw class="size-4" />
            Retry processing
          </Button>
          <Button
            v-if="detailEvent.status !== 'ignored'"
            size="sm"
            variant="outline"
            :disabled="actionLoading"
            @click="ignoreEvent"
          >
            Mark ignored
          </Button>
        </div>

        <ScrollArea class="max-h-[calc(100vh-12rem)] flex-1 px-6 pb-8">
          <div class="space-y-6 py-4">
            <section class="space-y-2">
              <h3 class="text-sm font-semibold">Links</h3>
              <div class="flex flex-col gap-2 text-sm">
                <div>
                  <span class="text-muted-foreground">Customer · </span>
                  <NuxtLink
                    :to="`/customers/${encodeURIComponent(props.customerId)}`"
                    class="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {{ detailEvent.tenantName }}
                  </NuxtLink>
                  <span class="ml-1 font-mono text-xs text-muted-foreground">({{ detailEvent.tenantId }})</span>
                </div>
                <div v-if="detailEvent.subscriptionId">
                  <span class="text-muted-foreground">Subscription · </span>
                  <NuxtLink
                    :to="subscriptionPath(detailEvent.subscriptionId)"
                    class="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {{ detailEvent.subscriptionLabel ?? detailEvent.subscriptionId }}
                  </NuxtLink>
                  <span class="ml-1 font-mono text-xs text-muted-foreground">({{ detailEvent.subscriptionId }})</span>
                </div>
              </div>
            </section>

            <section v-if="detailEvent.errorJson?.trim()" class="space-y-2">
              <h3 class="text-sm font-semibold text-destructive">Error</h3>
              <pre
                class="max-h-48 overflow-auto border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed"
                >{{ prettyJson(detailEvent.errorJson) }}</pre
              >
            </section>

            <section class="space-y-2">
              <h3 class="text-sm font-semibold">Normalization result</h3>
              <pre
                class="max-h-56 overflow-auto border border-border/70 bg-muted/30 p-3 text-xs leading-relaxed"
                >{{ prettyJson(detailEvent.normalizedJson) }}</pre
              >
            </section>

            <section class="space-y-2">
              <h3 class="text-sm font-semibold">Raw provider payload</h3>
              <pre
                class="max-h-64 overflow-auto border border-border/70 bg-muted/30 p-3 text-xs leading-relaxed"
                >{{ prettyJson(detailEvent.payloadJson) }}</pre
              >
            </section>

            <section class="space-y-2">
              <h3 class="text-sm font-semibold">Processing logs</h3>
              <ul class="space-y-2 border border-border/70 bg-muted/20 p-3 text-xs">
                <li
                  v-for="(line, idx) in parseJsonArray<{ at: string; level: string; message: string }>(
                    detailEvent.processingLogsJson,
                  )"
                  :key="idx"
                  class="border-b border-border/40 pb-2 last:border-0 last:pb-0"
                >
                  <span class="text-muted-foreground">{{ line.at }}</span>
                  <Badge variant="outline" class="mx-2 align-middle text-[10px]">{{ line.level }}</Badge>
                  {{ line.message }}
                </li>
                <li v-if="!parseJsonArray(detailEvent.processingLogsJson).length" class="text-muted-foreground">
                  No log lines.
                </li>
              </ul>
            </section>

            <section class="space-y-2">
              <h3 class="text-sm font-semibold">Impacted internal records</h3>
              <ul class="space-y-2 text-sm">
                <li
                  v-for="(rec, idx) in parseJsonArray<{ type: string; id: string; label?: string }>(
                    detailEvent.impactedRecordsJson,
                  )"
                  :key="idx"
                  class="rounded-md border border-border/60 px-3 py-2"
                >
                  <span class="font-medium">{{ rec.type }}</span>
                  <span class="mx-1 text-muted-foreground">·</span>
                  <span class="font-mono text-xs">{{ rec.id }}</span>
                  <div v-if="rec.label" class="text-xs text-muted-foreground">{{ rec.label }}</div>
                </li>
                <li v-if="!parseJsonArray(detailEvent.impactedRecordsJson).length" class="text-muted-foreground">
                  None recorded for this event.
                </li>
              </ul>
            </section>
          </div>
        </ScrollArea>
      </template>
    </SheetContent>
  </Sheet>
</template>
