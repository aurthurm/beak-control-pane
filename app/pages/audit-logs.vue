<script setup lang="ts">
import { definePageMeta } from '#imports'
import ConsolePageHeader from '~/components/ConsolePageHeader.vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area'
import { Separator } from '~/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import {
  auditDisplaySummary,
  computeChangedFields,
  formatAuditSource,
  normalizedChangedFieldsFromPayload,
  parseAuditDetailsJson,
} from '~/lib/audit-log'
import { formatDate } from '~/lib/formatters'
import { site } from '~/lib/site'
import type { WorkspaceDashboard } from '~/types/workspace-dashboard'
import { Download, FileJson, RefreshCw, Search } from 'lucide-vue-next'

type AuditEntry = WorkspaceDashboard['auditTrail'][number]

definePageMeta({ layout: 'console' })

useSeoMeta({
  title: `${site.brand.name} | Audit logs`,
  description: 'Immutable, read-only audit trail for control plane actions.',
})

const search = ref('')
const filterActor = ref('')
const filterEntityType = ref('')
const dateFrom = ref('')
const dateTo = ref('')

const detailOpen = ref(false)
const jsonOpen = ref(false)
const selectedEntry = ref<AuditEntry | null>(null)

const { data, pending, refresh } = await useWorkspaceDashboard()

const query = computed(() => search.value.trim().toLowerCase())

const trail = computed(() => data.value?.auditTrail ?? [])

const actorOptions = computed(() => [...new Set(trail.value.map((e) => e.actor))].sort())

const entityTypeOptions = computed(() => [...new Set(trail.value.map((e) => e.resourceType))].sort())

function startOfDayUtc(isoDate: string): number {
  const parts = isoDate.split('-')
  if (parts.length !== 3) {
    return NaN
  }
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0)
}

function endOfDayUtc(isoDate: string): number {
  const parts = isoDate.split('-')
  if (parts.length !== 3) {
    return NaN
  }
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  return Date.UTC(y, m - 1, d, 23, 59, 59, 999)
}

const filtered = computed(() => {
  let rows = trail.value

  if (filterActor.value) {
    rows = rows.filter((e) => e.actor === filterActor.value)
  }
  if (filterEntityType.value) {
    rows = rows.filter((e) => e.resourceType === filterEntityType.value)
  }
  if (dateFrom.value) {
    const t0 = startOfDayUtc(dateFrom.value)
    rows = rows.filter((e) => new Date(e.createdAt).getTime() >= t0)
  }
  if (dateTo.value) {
    const t1 = endOfDayUtc(dateTo.value)
    rows = rows.filter((e) => new Date(e.createdAt).getTime() <= t1)
  }

  if (!query.value) return rows

  return rows.filter((entry) =>
    [
      entry.id,
      entry.actor,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.resourceName,
      entry.tenantName,
      entry.source,
      entry.result,
    ].some((field) => field.toLowerCase().includes(query.value)),
  )
})

const detailParse = computed(() => {
  if (!selectedEntry.value) return { payload: {}, parseError: undefined as string | undefined }
  return parseAuditDetailsJson(selectedEntry.value.detailsJson)
})

const detailSummary = computed(() => {
  if (!selectedEntry.value) return ''
  return auditDisplaySummary(
    selectedEntry.value.action,
    selectedEntry.value.resourceType,
    selectedEntry.value.resourceId,
    selectedEntry.value.resourceName,
    detailParse.value.payload,
  )
})

const detailChangedFields = computed(() => {
  const { payload } = detailParse.value
  const fromPayload = normalizedChangedFieldsFromPayload(payload)
  if (fromPayload.length) return fromPayload
  return computeChangedFields(payload.before ?? null, payload.after ?? null)
})

const rawEventText = computed(() => {
  if (!selectedEntry.value) return ''
  const e = selectedEntry.value
  const { payload, parseError } = parseAuditDetailsJson(e.detailsJson)
  const event = {
    auditId: e.id,
    tenantId: e.tenantId,
    tenantName: e.tenantName,
    actor: e.actor,
    action: e.action,
    entityType: e.resourceType,
    entityId: e.resourceId,
    entityName: e.resourceName,
    timestamp: e.createdAt,
    source: e.source,
    result: e.result,
    details: payload,
    ...(parseError ? { _parseError: parseError } : {}),
  }
  return JSON.stringify(event, null, 2)
})

function openDetail(entry: AuditEntry) {
  selectedEntry.value = entry
  detailOpen.value = true
}

function openJson(entry: AuditEntry) {
  selectedEntry.value = entry
  jsonOpen.value = true
}

function csvEscape(value: string) {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function exportAuditReport() {
  const rows = filtered.value
  const header = [
    'Audit ID',
    'Actor',
    'Action',
    'Entity type',
    'Entity ID',
    'Entity name',
    'Timestamp',
    'Source',
    'Result',
    'Customer',
  ]
  const lines = [
    header.join(','),
    ...rows.map((e) =>
      [
        csvEscape(e.id),
        csvEscape(e.actor),
        csvEscape(e.action),
        csvEscape(e.resourceType),
        csvEscape(e.resourceId),
        csvEscape(e.resourceName || ''),
        csvEscape(e.createdAt),
        csvEscape(e.source),
        csvEscape(e.result),
        csvEscape(e.tenantName),
      ].join(','),
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportAuditJson() {
  const rows = filtered.value.map((e) => {
    const { payload, parseError } = parseAuditDetailsJson(e.detailsJson)
    return {
      auditId: e.id,
      tenantId: e.tenantId,
      tenantName: e.tenantName,
      actor: e.actor,
      action: e.action,
      entityType: e.resourceType,
      entityId: e.resourceId,
      entityName: e.resourceName,
      timestamp: e.createdAt,
      source: e.source,
      result: e.result,
      details: payload,
      ...(parseError ? { _parseError: parseError } : {}),
    }
  })
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-report-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function copyRawJson() {
  try {
    await navigator.clipboard.writeText(rawEventText.value)
  } catch {
    /* ignore */
  }
}

function resultVariant(result: string): 'default' | 'destructive' | 'outline' {
  return String(result).toLowerCase() === 'failure' ? 'destructive' : 'outline'
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Audit logs' },
      ]"
    >
      <template #actions>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" :disabled="!filtered.length" @click="exportAuditReport">
            <Download class="size-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" :disabled="!filtered.length" @click="exportAuditJson">
            <FileJson class="size-4" />
            Export JSON
          </Button>
          <Button variant="outline" size="sm" :disabled="pending" @click="refresh">
            <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
            Refresh
          </Button>
        </div>
      </template>
    </ConsolePageHeader>

    <div class="flex-1 space-y-6 p-4 lg:p-6">
      <Card class="overflow-hidden border-border/70 bg-card/90 shadow-sm backdrop-blur-sm">
        <CardHeader class="flex flex-col gap-4">
          <div class="space-y-1">
            <CardTitle>Audit trail</CardTitle>
            <CardDescription>
              Platform-wide accountability log. Entries are read-only; filters and export are client-side views of the
              immutable record.
            </CardDescription>
          </div>

          <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <div class="space-y-2">
              <Label for="audit-search" class="text-xs text-muted-foreground">Search</Label>
              <div class="relative">
                <Search
                  class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input id="audit-search" v-model="search" class="pl-9" placeholder="ID, actor, action, entity…" />
              </div>
            </div>
            <div class="space-y-2">
              <Label for="audit-actor" class="text-xs text-muted-foreground">Actor</Label>
              <NativeSelect id="audit-actor" v-model="filterActor" class="h-10">
                <NativeSelectOption value="">All actors</NativeSelectOption>
                <NativeSelectOption v-for="a in actorOptions" :key="a" :value="a">{{ a }}</NativeSelectOption>
              </NativeSelect>
            </div>
            <div class="space-y-2">
              <Label for="audit-entity" class="text-xs text-muted-foreground">Entity type</Label>
              <NativeSelect id="audit-entity" v-model="filterEntityType" class="h-10">
                <NativeSelectOption value="">All types</NativeSelectOption>
                <NativeSelectOption v-for="t in entityTypeOptions" :key="t" :value="t">{{ t }}</NativeSelectOption>
              </NativeSelect>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-2">
                <Label for="audit-from" class="text-xs text-muted-foreground">From</Label>
                <Input id="audit-from" v-model="dateFrom" type="date" class="font-mono text-xs" />
              </div>
              <div class="space-y-2">
                <Label for="audit-to" class="text-xs text-muted-foreground">To</Label>
                <Input id="audit-to" v-model="dateTo" type="date" class="font-mono text-xs" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <ScrollArea class="h-[min(70vh,720px)] w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Audit ID</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity type</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead class="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-if="!filtered.length">
                  <TableCell colspan="9" class="py-12 text-center text-sm text-muted-foreground">
                    No audit entries match the current filters.
                  </TableCell>
                </TableRow>
                <TableRow
                  v-for="entry in filtered"
                  :key="entry.id"
                  class="cursor-pointer"
                  @click="openDetail(entry)"
                >
                  <TableCell class="font-mono text-xs">{{ entry.id }}</TableCell>
                  <TableCell class="whitespace-nowrap text-sm">{{ formatDate(entry.createdAt) }}</TableCell>
                  <TableCell class="max-w-[140px] truncate font-mono text-xs" :title="entry.actor">
                    {{ entry.actor }}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{{ entry.action }}</Badge>
                  </TableCell>
                  <TableCell class="text-sm">{{ entry.resourceType }}</TableCell>
                  <TableCell class="max-w-[200px]">
                    <div class="truncate font-mono text-xs text-muted-foreground" :title="entry.resourceId">
                      {{ entry.resourceId }}
                    </div>
                    <div v-if="entry.resourceName" class="truncate text-sm font-medium">
                      {{ entry.resourceName }}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{{ formatAuditSource(entry.source) }}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge :variant="resultVariant(entry.result)">{{ entry.result }}</Badge>
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="flex justify-end gap-1">
                      <Button variant="outline" size="sm" @click.stop="openDetail(entry)">Detail</Button>
                      <Button variant="ghost" size="sm" @click.stop="openJson(entry)">JSON</Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>

    <Dialog v-model:open="detailOpen">
      <DialogContent class="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit record</DialogTitle>
          <DialogDescription v-if="selectedEntry" class="font-mono text-xs">
            {{ selectedEntry.id }} · {{ selectedEntry.action }}
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedEntry" class="space-y-4">
          <div>
            <h4 class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</h4>
            <p class="text-sm leading-relaxed">{{ detailSummary }}</p>
          </div>

          <div v-if="detailChangedFields.length" class="space-y-2">
            <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Changed fields</h4>
            <div class="border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="w-[30%]">Field</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="row in detailChangedFields" :key="row.path">
                    <TableCell class="font-mono text-xs">{{ row.path }}</TableCell>
                    <TableCell class="max-w-[200px]">
                      <pre class="whitespace-pre-wrap break-all text-xs text-muted-foreground">{{
                        prettyJson(row.before)
                      }}</pre>
                    </TableCell>
                    <TableCell class="max-w-[200px]">
                      <pre class="whitespace-pre-wrap break-all text-xs">{{ prettyJson(row.after) }}</pre>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Before snapshot</h4>
              <ScrollArea class="h-48 border border-border/70 bg-muted/30 p-3">
                <pre class="whitespace-pre-wrap break-all text-xs leading-relaxed">{{
                  detailParse.payload.before != null ? prettyJson(detailParse.payload.before) : '—'
                }}</pre>
              </ScrollArea>
            </div>
            <div class="space-y-2">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">After snapshot</h4>
              <ScrollArea class="h-48 border border-border/70 bg-muted/30 p-3">
                <pre class="whitespace-pre-wrap break-all text-xs leading-relaxed">{{
                  detailParse.payload.after != null ? prettyJson(detailParse.payload.after) : '—'
                }}</pre>
              </ScrollArea>
            </div>
          </div>

          <div v-if="detailParse.payload.request && Object.keys(detailParse.payload.request).length" class="space-y-2">
            <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Request metadata</h4>
            <div class="border border-border/70 bg-muted/20 p-3 font-mono text-xs">
              <div v-for="(v, k) in detailParse.payload.request" :key="k" class="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 border-b border-border/40 py-1 last:border-0">
                <span class="text-muted-foreground">{{ k }}</span>
                <span class="break-all">{{ typeof v === 'object' ? prettyJson(v) : String(v) }}</span>
              </div>
            </div>
          </div>

          <Separator />

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Raw JSON event</h4>
              <Button type="button" variant="outline" size="sm" @click="copyRawJson">Copy</Button>
            </div>
            <ScrollArea class="max-h-48 border border-border/70 bg-muted/30 p-3">
              <pre class="whitespace-pre-wrap break-all text-xs leading-relaxed">{{ rawEventText }}</pre>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="jsonOpen">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Raw JSON</DialogTitle>
          <DialogDescription v-if="selectedEntry">{{ selectedEntry.id }}</DialogDescription>
        </DialogHeader>
        <ScrollArea class="max-h-[60vh] border border-border/70 bg-muted/30 p-4">
          <pre class="whitespace-pre-wrap break-all text-xs leading-relaxed">{{ rawEventText }}</pre>
        </ScrollArea>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" @click="copyRawJson">Copy JSON</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
