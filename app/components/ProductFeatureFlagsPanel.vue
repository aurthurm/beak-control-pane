<script setup lang="ts">
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { Textarea } from '~/components/ui/textarea'
import { formatDate, statusVariant } from '~/lib/formatters'
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-vue-next'

type RuntimeFlagListItem = {
  id: string
  key: string
  name: string
  description: string
  productId: string | null
  productName: string | null
  linkedFeatureId: string | null
  linkedFeatureName: string | null
  linkedFeatureKey: string | null
  planIds: string[]
  type: string
  typeLabel: string
  status: string
  scope: string
  defaultValue: string
  rolloutStrategy: string
  rolloutStrategyLabel: string
  rolloutPercent: number
  globallyEnabled: boolean
  targetSubscriberCount: number
  environmentKeys: string[]
  expiresAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  evaluationHistoryCount: number
}

type RuntimeFlagDetail = RuntimeFlagListItem & {
  rules: Record<string, unknown>
  targetSubscribers: Array<{ id: string; name: string }>
  environmentValues: Record<string, string | number | boolean>
  evaluationHistory: Array<{
    at: string
    subscriberId: string | null
    environment: string | null
    result: string
    reason: string
  }>
}

type PlanSummary = {
  id: string
  name: string
  slug: string
}

const props = defineProps<{
  productId: string
  productName: string
  plans: PlanSummary[]
}>()

const idSafe = computed(() => props.productId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-24) || 'p')

const PLAN_TONES = [
  'border-sky-500/20 bg-sky-50/80 dark:border-sky-400/20 dark:bg-sky-950/20',
  'border-emerald-500/20 bg-emerald-50/80 dark:border-emerald-400/20 dark:bg-emerald-950/20',
  'border-amber-500/20 bg-amber-50/80 dark:border-amber-400/20 dark:bg-amber-950/20',
  'border-violet-500/20 bg-violet-50/80 dark:border-violet-400/20 dark:bg-violet-950/20',
  'border-rose-500/20 bg-rose-50/80 dark:border-rose-400/20 dark:bg-rose-950/20',
  'border-cyan-500/20 bg-cyan-50/80 dark:border-cyan-400/20 dark:bg-cyan-950/20',
]

function planToneClass(index: number) {
  return PLAN_TONES[index % PLAN_TONES.length] ?? PLAN_TONES[0]!
}

type Lookups = {
  products: Array<{ id: string; name: string }>
  tenants: Array<{ id: string; name: string }>
  features: Array<{ id: string; name: string; featureKey: string }>
}

type RuntimeFlagsResponse = { flags: RuntimeFlagListItem[]; lookups: Lookups }

type FormModel = {
  name: string
  key: string
  description: string
  linkedFeatureId: string
  flagType: string
  status: string
  scope: string
  defaultValue: string
  rolloutStrategy: string
  rolloutPercent: number
  globallyEnabled: boolean
  rulesJsonText: string
  envJsonText: string
  targetSubscriberIds: string[]
  planIds: string[]
  expiresAt: string
}

const { data, pending, refresh } = await useFetch<RuntimeFlagsResponse>(
  () => `/api/runtime-flags?productId=${encodeURIComponent(props.productId)}`,
  {
    key: () => `bcp-runtime-flags-${props.productId}`,
  },
)

const search = ref('')
const query = computed(() => search.value.trim().toLowerCase())
const filtered = computed(() => {
  const flags = data.value?.flags ?? []
  if (!query.value) return flags
  return flags.filter((f) =>
    [f.name, f.key, f.description, f.typeLabel, f.status, f.scope].some((field) =>
      String(field).toLowerCase().includes(query.value),
    ),
  )
})

function emptyForm(): FormModel {
  return {
    name: '',
    key: '',
    description: '',
    linkedFeatureId: '',
    flagType: 'release',
    status: 'active',
    scope: 'global',
    defaultValue: 'false',
    rolloutStrategy: 'full_rollout',
    rolloutPercent: 100,
    globallyEnabled: true,
    rulesJsonText: '{}',
    envJsonText: '{}',
    targetSubscriberIds: [],
    planIds: [],
    expiresAt: '',
  }
}

const createOpen = ref(false)
const createForm = ref<FormModel>(emptyForm())
const createSaving = ref(false)

const editOpen = ref(false)
const editId = ref<string | null>(null)
const editForm = ref<FormModel>(emptyForm())
const editSaving = ref(false)

const detailOpen = ref(false)
const detailLoading = ref(false)
const detailFlag = ref<RuntimeFlagDetail | null>(null)

const rowSavingId = ref<string | null>(null)

function subscriberChecked(subscriberId: string, form: FormModel): boolean {
  return form.targetSubscriberIds.includes(subscriberId)
}

function planChecked(planId: string, form: FormModel): boolean {
  return form.planIds.includes(planId)
}

function toggleSubscriber(subscriberId: string, form: FormModel, checked: boolean) {
  const set = new Set(form.targetSubscriberIds)
  if (checked) set.add(subscriberId)
  else set.delete(subscriberId)
  form.targetSubscriberIds = [...set]
}

function togglePlan(planId: string, form: FormModel, checked: boolean) {
  const set = new Set(form.planIds)
  if (checked) set.add(planId)
  else set.delete(planId)
  form.planIds = [...set]
}

function parseJsonField<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }
}

const subscribersForForm = computed(() => data.value?.lookups.tenants ?? [])
const featuresForForm = computed(() => data.value?.lookups.features ?? [])

function featureOptionLabel(featureId: string, name: string, key: string): string {
  const feature = featuresForForm.value.find((f) => f.id === featureId)
  return feature ? `${name} (${key})` : `${name} (${key})`
}

async function submitCreate() {
  createSaving.value = true
  try {
    let rules: Record<string, unknown>
    let environmentValues: Record<string, string | number | boolean>
    try {
      rules = parseJsonField(createForm.value.rulesJsonText, 'Rules')
      environmentValues = parseJsonField(createForm.value.envJsonText, 'Environment values')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Invalid JSON')
      return
    }
    await $fetch('/api/runtime-flags', {
      method: 'POST',
      body: {
        name: createForm.value.name,
        key: createForm.value.key || undefined,
        description: createForm.value.description,
        productId: props.productId,
        linkedFeatureId: createForm.value.linkedFeatureId || null,
        flagType: createForm.value.flagType,
        status: createForm.value.status,
        scope: createForm.value.scope,
        defaultValue: createForm.value.defaultValue,
        rolloutStrategy: createForm.value.rolloutStrategy,
        rolloutPercent: createForm.value.rolloutPercent,
        globallyEnabled: createForm.value.globallyEnabled,
        rules,
        targetSubscriberIds: createForm.value.targetSubscriberIds,
        environmentValues,
        planIds: createForm.value.planIds,
      },
    })
    createOpen.value = false
    createForm.value = emptyForm()
    await refresh()
    await refreshNuxtData(`bcp-runtime-flags-${props.productId}`)
  } catch (e) {
    console.error(e)
  } finally {
    createSaving.value = false
  }
}

async function loadDetail(id: string) {
  detailLoading.value = true
  try {
    const res = await $fetch<{ flag: RuntimeFlagDetail }>(`/api/runtime-flags/${id}`)
    detailFlag.value = res.flag
  } catch (e) {
    console.error(e)
    detailFlag.value = null
  } finally {
    detailLoading.value = false
  }
}

async function openDetail(row: RuntimeFlagListItem) {
  detailOpen.value = true
  await loadDetail(row.id)
}

async function openEdit(row: RuntimeFlagListItem) {
  editId.value = row.id
  editSaving.value = false
  const res = await $fetch<{ flag: RuntimeFlagDetail }>(`/api/runtime-flags/${row.id}`)
  const f = res.flag
  editForm.value = {
    name: f.name,
    key: f.key,
    description: f.description,
    linkedFeatureId: f.linkedFeatureId ?? '',
    flagType: f.type,
    status: f.status,
    scope: f.scope,
    defaultValue: f.defaultValue,
    rolloutStrategy: f.rolloutStrategy,
    rolloutPercent: f.rolloutPercent,
    globallyEnabled: f.globallyEnabled,
    rulesJsonText: JSON.stringify(f.rules, null, 2),
    envJsonText: JSON.stringify(f.environmentValues, null, 2),
    targetSubscriberIds: f.targetSubscribers.map((t) => t.id),
    planIds: f.planIds,
    expiresAt: f.expiresAt ?? '',
  }
  editOpen.value = true
}

async function submitEdit() {
  if (!editId.value) return
  editSaving.value = true
  try {
    let rules: Record<string, unknown>
    let environmentValues: Record<string, string | number | boolean>
    try {
      rules = parseJsonField(editForm.value.rulesJsonText, 'Rules')
      environmentValues = parseJsonField(editForm.value.envJsonText, 'Environment values')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Invalid JSON')
      return
    }
    await $fetch(`/api/runtime-flags/${editId.value}`, {
      method: 'PATCH',
      body: {
        name: editForm.value.name,
        key: editForm.value.key,
        description: editForm.value.description,
        productId: props.productId,
        linkedFeatureId: editForm.value.linkedFeatureId || null,
        flagType: editForm.value.flagType,
        status: editForm.value.status,
        scope: editForm.value.scope,
        defaultValue: editForm.value.defaultValue,
        rolloutStrategy: editForm.value.rolloutStrategy,
        rolloutPercent: editForm.value.rolloutPercent,
        globallyEnabled: editForm.value.globallyEnabled,
        rules,
        targetSubscriberIds: editForm.value.targetSubscriberIds,
        environmentValues,
        planIds: editForm.value.planIds,
        expiresAt: editForm.value.expiresAt || null,
      },
    })
    editOpen.value = false
    editId.value = null
    await refresh()
    await refreshNuxtData(`bcp-runtime-flags-${props.productId}`)
    if (detailOpen.value && detailFlag.value?.id) {
      await loadDetail(detailFlag.value.id)
    }
  } catch (e) {
    console.error(e)
  } finally {
    editSaving.value = false
  }
}

async function patchRow(row: RuntimeFlagListItem, body: Record<string, unknown>) {
  rowSavingId.value = row.id
  try {
    await $fetch(`/api/runtime-flags/${row.id}`, {
      method: 'PATCH',
      body,
    })
    await refresh()
    await refreshNuxtData(`bcp-runtime-flags-${props.productId}`)
    if (detailOpen.value && detailFlag.value?.id === row.id) {
      await loadDetail(row.id)
    }
  } catch (e) {
    console.error(e)
  } finally {
    rowSavingId.value = null
  }
}

async function togglePlanAssignment(row: RuntimeFlagListItem, planId: string, checked: boolean) {
  const nextIds = new Set(row.planIds)
  if (checked) nextIds.add(planId)
  else nextIds.delete(planId)
  await patchRow(row, { planIds: [...nextIds] })
}

async function toggleGlobal(row: RuntimeFlagListItem, enabled: boolean) {
  await patchRow(row, { globallyEnabled: enabled })
}

async function archiveFlag(row: RuntimeFlagListItem) {
  if (!confirm(`Archive flag “${row.name}”? It will no longer roll out to new contexts.`)) return
  await patchRow(row, { status: 'archived' })
}

function openCreateDialog() {
  createOpen.value = true
  createForm.value = emptyForm()
}

defineExpose({ refresh })
</script>

<template>
  <div class="space-y-4">
    <Card class="overflow-hidden rounded-xl border-border/70 bg-card/90 shadow-sm backdrop-blur-sm">
      <CardHeader class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-1">
          <CardTitle class="text-base">
            Flags
          </CardTitle>
          <CardDescription>
            Toggle plan coverage directly from the grid.
          </CardDescription>
        </div>
        <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div class="relative w-full sm:max-w-xs">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" class="pl-9" placeholder="Search flags" />
          </div>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" :disabled="pending" @click="refresh">
              <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
              Refresh
            </Button>
            <Button size="sm" @click="openCreateDialog">
              <Plus class="size-4" />
              Create flag
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <ScrollArea class="h-[min(62vh,720px)] w-full">
          <table class="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr class="border-b border-border/60 bg-muted/30">
                <th class="sticky left-0 z-20 min-w-[320px] border-r border-border/50 bg-muted/30 px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                  Flag
                </th>
                <th
                  v-for="(plan, index) in plans"
                  :key="`plan-${plan.id}`"
                  :class="[
                    'w-[190px] min-w-[190px] max-w-[190px] border-l border-border/40 px-2 py-2 align-bottom text-center',
                    planToneClass(index),
                  ]"
                >
                  <div class="font-semibold leading-tight">
                    {{ plan.name }}
                  </div>
                  <div class="text-[11px] text-muted-foreground">
                    {{ plan.slug }}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filtered"
                :key="row.id"
                :class="row.status === 'archived' ? 'opacity-60' : 'hover:bg-muted/15'"
              >
                <td class="sticky left-0 z-10 border-r border-border/50 bg-card/95 px-3 py-3 backdrop-blur-sm">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 space-y-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <div class="font-medium leading-tight">
                          {{ row.name }}
                        </div>
                        <Badge variant="outline" class="text-[10px]">
                          {{ row.typeLabel }}
                        </Badge>
                        <Badge :variant="statusVariant(row.status)" class="text-[10px]">
                          {{ row.status }}
                        </Badge>
                      </div>
                      <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <code class="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                          {{ row.key }}
                        </code>
                        <span v-if="row.description" class="line-clamp-1 max-w-[260px]">
                          {{ row.description }}
                        </span>
                      </div>
                      <div class="flex flex-wrap items-center gap-3">
                        <label class="flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            :model-value="row.globallyEnabled"
                            :disabled="row.status === 'archived' || rowSavingId === row.id"
                            :title="row.globallyEnabled ? 'Disable globally' : 'Enable globally'"
                            @update:model-value="(v) => toggleGlobal(row, v === true)"
                          />
                          Global
                        </label>
                        <span v-if="row.scope" class="text-[11px] capitalize text-muted-foreground">
                          {{ row.scope }} scope
                        </span>
                      </div>
                    </div>
                    <div class="flex shrink-0 flex-col gap-1">
                      <Button variant="outline" size="sm" @click="openDetail(row)">
                        Detail
                      </Button>
                      <div class="flex justify-end gap-1">
                        <Button variant="outline" size="icon" class="size-8" :disabled="row.status === 'archived'" @click="openEdit(row)">
                          <Pencil class="size-3.5" />
                        </Button>
                        <Button
                          v-if="row.status !== 'archived'"
                          variant="ghost"
                          size="icon"
                          class="size-8 text-destructive hover:text-destructive"
                          @click="archiveFlag(row)"
                        >
                          <Trash2 class="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </td>
                <td
                  v-for="(plan, index) in plans"
                  :key="`${row.id}-${plan.id}`"
                  :class="[
                    'border-l border-border/40 px-2 py-2 text-center align-middle',
                    planToneClass(index),
                  ]"
                >
                  <div class="flex justify-center">
                    <Checkbox
                      :disabled="row.status === 'archived' || rowSavingId === row.id"
                      :model-value="row.planIds.includes(plan.id)"
                      @update:model-value="(v) => togglePlanAssignment(row, plan.id, v === true)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <p v-if="!pending && !filtered.length" class="border-t border-border/60 p-6 text-center text-sm text-muted-foreground">
          No runtime flags for this product yet. Create one to place a rollout gate against the plan matrix.
        </p>
      </CardContent>
    </Card>

    <Dialog v-model:open="createOpen">
      <DialogContent class="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create runtime flag</DialogTitle>
          <DialogDescription>
            New flag for <span class="font-medium text-foreground">{{ productName }}</span>.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-c-name`">Name</Label>
            <Input :id="`rf-${idSafe}-c-name`" v-model="createForm.name" />
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-c-key`">Key</Label>
            <Input :id="`rf-${idSafe}-c-key`" v-model="createForm.key" placeholder="auto from name if empty" />
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-c-type`">Type</Label>
            <NativeSelect :id="`rf-${idSafe}-c-type`" v-model="createForm.flagType">
              <NativeSelectOption value="release">Release</NativeSelectOption>
              <NativeSelectOption value="experiment">Experiment</NativeSelectOption>
              <NativeSelectOption value="ops">Ops</NativeSelectOption>
              <NativeSelectOption value="permission_override">Permission override</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-c-desc`">Description</Label>
            <Textarea :id="`rf-${idSafe}-c-desc`" v-model="createForm.description" class="min-h-[88px]" rows="3" />
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-c-feat`">Related catalog feature (optional)</Label>
            <NativeSelect :id="`rf-${idSafe}-c-feat`" v-model="createForm.linkedFeatureId">
              <NativeSelectOption value="">—</NativeSelectOption>
              <NativeSelectOption v-for="f in featuresForForm" :key="f.id" :value="f.id">
                {{ featureOptionLabel(f.id, f.name, f.featureKey) }}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-c-status`">Status</Label>
            <NativeSelect :id="`rf-${idSafe}-c-status`" v-model="createForm.status">
              <NativeSelectOption value="active">Active</NativeSelectOption>
              <NativeSelectOption value="scheduled">Scheduled</NativeSelectOption>
              <NativeSelectOption value="archived">Archived</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-c-scope`">Scope</Label>
            <NativeSelect :id="`rf-${idSafe}-c-scope`" v-model="createForm.scope">
              <NativeSelectOption value="global">Global</NativeSelectOption>
              <NativeSelectOption value="product">Product</NativeSelectOption>
              <NativeSelectOption value="subscriber">Subscriber</NativeSelectOption>
              <NativeSelectOption value="environment">Environment</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-c-default`">Default value</Label>
            <Input :id="`rf-${idSafe}-c-default`" v-model="createForm.defaultValue" placeholder="true / false" />
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-c-strat`">Rollout strategy</Label>
            <NativeSelect :id="`rf-${idSafe}-c-strat`" v-model="createForm.rolloutStrategy">
              <NativeSelectOption value="full_rollout">Full rollout</NativeSelectOption>
              <NativeSelectOption value="percentage">Percentage rollout</NativeSelectOption>
              <NativeSelectOption value="subscriber_targeted">Subscriber targeted</NativeSelectOption>
              <NativeSelectOption value="environment_specific">Environment-specific</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-c-pct`">Rollout % (0–100)</Label>
            <Input :id="`rf-${idSafe}-c-pct`" v-model.number="createForm.rolloutPercent" type="number" min="0" max="100" />
          </div>
          <div class="flex items-center gap-2 sm:col-span-2">
            <Checkbox :id="`rf-${idSafe}-c-glob`" v-model="createForm.globallyEnabled" />
            <Label :for="`rf-${idSafe}-c-glob`" class="font-normal">Globally enabled</Label>
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label>Plan coverage</Label>
            <ScrollArea class="max-h-40 rounded-md border border-border/60 p-2">
              <div v-for="(plan, index) in plans" :key="`c-plan-${plan.id}`" class="flex items-center gap-2 py-1 text-sm">
                <Checkbox
                  :id="`rf-${idSafe}-c-plan-${plan.id}`"
                  :model-value="planChecked(plan.id, createForm)"
                  @update:model-value="(v) => togglePlan(plan.id, createForm, v === true)"
                />
                <Label :for="`rf-${idSafe}-c-plan-${plan.id}`" class="flex flex-1 cursor-pointer items-center gap-2 font-normal">
                  <span>{{ plan.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ plan.slug }}</span>
                </Label>
              </div>
            </ScrollArea>
            <p class="text-xs text-muted-foreground">
              Leave empty to use the product's default plan set.
            </p>
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-c-rules`">Rule set (JSON)</Label>
            <Textarea :id="`rf-${idSafe}-c-rules`" v-model="createForm.rulesJsonText" class="min-h-[88px] font-mono" rows="4" />
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-c-env`">Environment values (JSON object)</Label>
            <Textarea :id="`rf-${idSafe}-c-env`" v-model="createForm.envJsonText" class="min-h-[88px] font-mono" rows="3" />
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label>Target subscribers</Label>
            <ScrollArea class="h-36 rounded-md border border-border/60 p-2">
              <div v-for="t in subscribersForForm" :key="`c-${t.id}`" class="flex cursor-pointer items-center gap-2 py-1 text-sm">
                <Checkbox
                  :id="`rf-${idSafe}-subscriber-c-${t.id}`"
                  :model-value="subscriberChecked(t.id, createForm)"
                  @update:model-value="(v) => toggleSubscriber(t.id, createForm, v === true)"
                />
                <Label :for="`rf-${idSafe}-subscriber-c-${t.id}`" class="flex flex-1 cursor-pointer items-center gap-2 font-normal">
                  <span>{{ t.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ t.id }}</span>
                </Label>
              </div>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="createOpen = false">
            Cancel
          </Button>
          <Button :disabled="createSaving" @click="submitCreate">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="editOpen">
      <DialogContent class="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit flag</DialogTitle>
          <DialogDescription>Update the flag and its plan coverage.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-e-name`">Name</Label>
            <Input :id="`rf-${idSafe}-e-name`" v-model="editForm.name" />
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-e-key`">Key</Label>
            <Input :id="`rf-${idSafe}-e-key`" v-model="editForm.key" />
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-e-type`">Type</Label>
            <NativeSelect :id="`rf-${idSafe}-e-type`" v-model="editForm.flagType">
              <NativeSelectOption value="release">Release</NativeSelectOption>
              <NativeSelectOption value="experiment">Experiment</NativeSelectOption>
              <NativeSelectOption value="ops">Ops</NativeSelectOption>
              <NativeSelectOption value="permission_override">Permission override</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-e-desc`">Description</Label>
            <Textarea :id="`rf-${idSafe}-e-desc`" v-model="editForm.description" class="min-h-[88px]" rows="3" />
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-e-feat`">Related catalog feature</Label>
            <NativeSelect :id="`rf-${idSafe}-e-feat`" v-model="editForm.linkedFeatureId">
              <NativeSelectOption value="">—</NativeSelectOption>
              <NativeSelectOption v-for="f in featuresForForm" :key="f.id" :value="f.id">
                {{ featureOptionLabel(f.id, f.name, f.featureKey) }}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-e-status`">Status</Label>
            <NativeSelect :id="`rf-${idSafe}-e-status`" v-model="editForm.status">
              <NativeSelectOption value="active">Active</NativeSelectOption>
              <NativeSelectOption value="scheduled">Scheduled</NativeSelectOption>
              <NativeSelectOption value="archived">Archived</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-e-scope`">Scope</Label>
            <NativeSelect :id="`rf-${idSafe}-e-scope`" v-model="editForm.scope">
              <NativeSelectOption value="global">Global</NativeSelectOption>
              <NativeSelectOption value="product">Product</NativeSelectOption>
              <NativeSelectOption value="subscriber">Subscriber</NativeSelectOption>
              <NativeSelectOption value="environment">Environment</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-e-default`">Default value</Label>
            <Input :id="`rf-${idSafe}-e-default`" v-model="editForm.defaultValue" />
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-e-strat`">Rollout strategy</Label>
            <NativeSelect :id="`rf-${idSafe}-e-strat`" v-model="editForm.rolloutStrategy">
              <NativeSelectOption value="full_rollout">Full rollout</NativeSelectOption>
              <NativeSelectOption value="percentage">Percentage rollout</NativeSelectOption>
              <NativeSelectOption value="subscriber_targeted">Subscriber targeted</NativeSelectOption>
              <NativeSelectOption value="environment_specific">Environment-specific</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-e-pct`">Rollout %</Label>
            <Input :id="`rf-${idSafe}-e-pct`" v-model.number="editForm.rolloutPercent" type="number" min="0" max="100" />
          </div>
          <div class="space-y-2">
            <Label :for="`rf-${idSafe}-e-exp`">Expires at (ISO, optional)</Label>
            <Input :id="`rf-${idSafe}-e-exp`" v-model="editForm.expiresAt" placeholder="2026-12-31T23:59:59Z" />
          </div>
          <div class="flex items-center gap-2 sm:col-span-2">
            <Checkbox :id="`rf-${idSafe}-e-glob`" v-model="editForm.globallyEnabled" />
            <Label :for="`rf-${idSafe}-e-glob`" class="font-normal">Globally enabled</Label>
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label>Plan coverage</Label>
            <ScrollArea class="max-h-40 rounded-md border border-border/60 p-2">
              <div v-for="plan in plans" :key="`e-plan-${plan.id}`" class="flex items-center gap-2 py-1 text-sm">
                <Checkbox
                  :id="`rf-${idSafe}-e-plan-${plan.id}`"
                  :model-value="planChecked(plan.id, editForm)"
                  @update:model-value="(v) => togglePlan(plan.id, editForm, v === true)"
                />
                <Label :for="`rf-${idSafe}-e-plan-${plan.id}`" class="flex flex-1 cursor-pointer items-center gap-2 font-normal">
                  <span>{{ plan.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ plan.slug }}</span>
                </Label>
              </div>
            </ScrollArea>
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-e-rules`">Rule set (JSON)</Label>
            <Textarea :id="`rf-${idSafe}-e-rules`" v-model="editForm.rulesJsonText" class="min-h-[88px] font-mono" rows="5" />
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label :for="`rf-${idSafe}-e-env`">Environment values (JSON)</Label>
            <Textarea :id="`rf-${idSafe}-e-env`" v-model="editForm.envJsonText" class="min-h-[88px] font-mono" rows="4" />
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label>Target subscribers</Label>
            <ScrollArea class="h-36 rounded-md border border-border/60 p-2">
              <div v-for="t in subscribersForForm" :key="`e-${t.id}`" class="flex cursor-pointer items-center gap-2 py-1 text-sm">
                <Checkbox
                  :id="`rf-${idSafe}-subscriber-e-${t.id}`"
                  :model-value="subscriberChecked(t.id, editForm)"
                  @update:model-value="(v) => toggleSubscriber(t.id, editForm, v === true)"
                />
                <Label :for="`rf-${idSafe}-subscriber-e-${t.id}`" class="cursor-pointer font-normal">
                  {{ t.name }}
                </Label>
              </div>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editOpen = false">
            Cancel
          </Button>
          <Button :disabled="editSaving" @click="submitEdit">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="detailOpen">
      <DialogContent class="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ detailFlag?.name ?? 'Flag detail' }}</DialogTitle>
          <DialogDescription v-if="detailFlag">
            <code class="rounded bg-muted px-1.5 py-0.5 text-xs">{{ detailFlag.key }}</code>
            · {{ productName }}
          </DialogDescription>
        </DialogHeader>
        <div v-if="detailLoading" class="p-6 text-sm text-muted-foreground">
          Loading…
        </div>
        <div v-else-if="detailFlag" class="space-y-6">
          <p class="text-sm text-muted-foreground">
            {{ detailFlag.description || 'No description.' }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Badge variant="outline">{{ detailFlag.typeLabel }}</Badge>
            <Badge :variant="statusVariant(detailFlag.status)">{{ detailFlag.status }}</Badge>
            <Badge variant="secondary" class="capitalize">{{ detailFlag.scope }} scope</Badge>
            <Badge v-if="detailFlag.globallyEnabled" variant="success">
              Global on
            </Badge>
            <Badge v-else variant="destructive">
              Global off
            </Badge>
          </div>
          <div class="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span class="text-muted-foreground">Related feature:</span>
              <template v-if="detailFlag.linkedFeatureName">
                {{ detailFlag.linkedFeatureName }}
                <code class="ml-1 text-xs">({{ detailFlag.linkedFeatureKey }})</code>
              </template>
              <template v-else>—</template>
            </div>
            <div><span class="text-muted-foreground">Default value:</span> <code>{{ detailFlag.defaultValue }}</code></div>
            <div>
              <span class="text-muted-foreground">Rollout:</span> {{ detailFlag.rolloutStrategyLabel }}
              <span v-if="detailFlag.rolloutStrategy === 'percentage'">· {{ detailFlag.rolloutPercent }}%</span>
            </div>
            <div v-if="detailFlag.expiresAt">
              <span class="text-muted-foreground">Expires:</span> {{ formatDate(detailFlag.expiresAt) }}
            </div>
            <div v-if="detailFlag.archivedAt">
              <span class="text-muted-foreground">Archived:</span> {{ formatDate(detailFlag.archivedAt) }}
            </div>
            <div class="text-muted-foreground">
              Updated {{ formatDate(detailFlag.updatedAt) }}
            </div>
          </div>
          <div>
            <h4 class="mb-2 text-sm font-medium">
              Plan coverage
            </h4>
            <div v-if="detailFlag.planIds.length" class="flex flex-wrap gap-2">
              <Badge
                v-for="planId in detailFlag.planIds"
                :key="planId"
                variant="outline"
                class="text-[11px]"
              >
                {{ plans.find((plan) => plan.id === planId)?.name ?? planId }}
              </Badge>
            </div>
            <p v-else class="text-sm text-muted-foreground">
              No plans selected.
            </p>
          </div>
          <div>
            <h4 class="mb-2 text-sm font-medium">
              Current rule set
            </h4>
            <pre class="max-h-48 overflow-auto rounded-lg bg-muted/80 p-3 text-xs">{{ JSON.stringify(detailFlag.rules, null, 2) }}</pre>
          </div>
          <div>
            <h4 class="mb-2 text-sm font-medium">
              Targeted subscribers
            </h4>
            <ul v-if="detailFlag.targetSubscribers.length" class="space-y-1 text-sm">
              <li v-for="t in detailFlag.targetSubscribers" :key="t.id">
                {{ t.name }} <span class="text-xs text-muted-foreground">({{ t.id }})</span>
              </li>
            </ul>
            <p v-else class="text-sm text-muted-foreground">
              None.
            </p>
          </div>
          <div>
            <h4 class="mb-2 text-sm font-medium">
              Environments
            </h4>
            <div v-if="Object.keys(detailFlag.environmentValues).length" class="rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Environment</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="(val, env) in detailFlag.environmentValues" :key="String(env)">
                    <TableCell class="font-medium">
                      {{ env }}
                    </TableCell>
                    <TableCell><code class="text-xs">{{ JSON.stringify(val) }}</code></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p v-else class="text-sm text-muted-foreground">
              No environment-specific overrides.
            </p>
          </div>
          <div>
            <h4 class="mb-2 text-sm font-medium">
              Evaluation history
            </h4>
            <div v-if="detailFlag.evaluationHistory.length" class="space-y-3">
              <div
                v-for="(ev, i) in detailFlag.evaluationHistory"
                :key="i"
                class="rounded-lg border border-border/50 bg-card/50 p-3 text-sm"
              >
                <div class="text-xs text-muted-foreground">
                  {{ formatDate(ev.at) }}
                  <template v-if="ev.environment">· {{ ev.environment }}</template>
                  <template v-if="ev.subscriberId">· {{ ev.subscriberId }}</template>
                </div>
                <div class="mt-1 font-medium">
                  Result: <code>{{ ev.result }}</code>
                </div>
                <div class="text-muted-foreground">
                  {{ ev.reason }}
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-muted-foreground">
              No evaluation samples recorded yet.
            </p>
          </div>
          <div class="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button
              variant="outline"
              size="sm"
              :disabled="detailFlag.status === 'archived'"
              @click="openEdit(detailFlag); detailOpen = false"
            >
              Edit
            </Button>
            <Button
              v-if="detailFlag.status !== 'archived'"
              variant="ghost"
              size="sm"
              class="text-destructive"
              @click="archiveFlag(detailFlag); detailOpen = false"
            >
              Archive
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
