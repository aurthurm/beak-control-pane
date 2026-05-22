<script setup lang="ts">
import ConsolePageHeader from '~/components/ConsolePageHeader.vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
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
import { Separator } from '~/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { formatCurrency, formatDate, formatDateTime, statusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import { Activity, KeyRound, LayoutGrid, PlusCircle, RefreshCw } from 'lucide-vue-next'

definePageMeta({ layout: 'console' })

const route = useRoute()
const subscriberId = computed(() => String(route.params.id ?? ''))
const subscriptionId = computed(() => String(route.params.subscriptionId ?? ''))

type Detail = {
  subscription: {
    id: string
    subscriberId: string
    subscriberName: string
    planId: string
    planName: string
    productId: string
    productName: string
    provider: string
    providerRef: string
    providerMetadata: Record<string, string>
    status: string
    startsAt: string
    renewalAt: string
    endsAt: string
    graceEndsAt: string
    autoRenew: boolean
    manualContract: boolean
    pausedAt: string
    billingInterval: string
    amountCents: number
    unitAmountCents: number
    licenseCount: number
    activationsPerLicense: number
    currency: string
    basePlanAmountCents: number
    isPaused: boolean
  }
  subscriber: { id: string; name: string; slug: string; status: string } | null
  product: { id: string; name: string; slug: string } | null
  plan: {
    id: string
    name: string
    slug: string
    billingCycle: string
    priceCents: number
    currency: string
    status: string
  } | null
  currentBillingState: string
  planFeatures: Array<{ featureKey: string; name: string; enabled: boolean }>
  entitlements: Array<{ id: string; computedAt: string; payloadJson: string }>
  billingEvents: Array<{
    id: string
    provider: string
    eventType: string
    amountCents: number
    currency: string
    occurredAt: string
    subscriptionId: string | null
    payloadJson: string
  }>
  statusHistory: Array<{ id: string; actor: string; action: string; detailsJson: string; createdAt: string }>
  licenses: Array<{
    id: string
    subscriberId: string
    productId: string
    subscriptionId: string | null
    licenseKey: string
    mode: string
    status: string
    validFrom: string
    validTo: string
    graceUntil: string
    maxActivations: number
    offlineAllowed: boolean
    signature: string
    payloadJson: string
  }>
}

const { data, pending, refresh } = await useFetch<Detail>(() => `/api/subscriptions/${subscriptionId.value}`, {
  key: () => `bcp-subscription-${subscriberId.value}-${subscriptionId.value}`,
  watch: [subscriptionId, subscriberId],
})

watch(
  () => data.value?.subscription,
  (sub) => {
    if (!sub || sub.subscriberId === subscriberId.value) return
    void navigateTo(`/subscribers/${sub.subscriberId}/subscription/${sub.id}`, { replace: true })
  },
  { flush: 'post' },
)

useSeoMeta({
  title: computed(() =>
    data.value ? `${site.brand.name} | ${data.value.subscription.id}` : `${site.brand.name} | Subscription`,
  ),
})

const { data: listMeta } = await useFetch<{
  references: { plans: Array<{ id: string; name: string; productId: string; productName: string }> }
}>('/api/subscriptions', { key: 'bcp-subscriptions-ref-plans' })

const planChoices = computed(() => {
  const currentProductId = data.value?.subscription.productId ?? ''
  return (listMeta.value?.references?.plans ?? []).filter((p) => p.productId === currentProductId)
})

const selectedPlan = ref('')
watch(
  () => data.value?.subscription.planId,
  (pid) => {
    if (pid) selectedPlan.value = pid
  },
  { immediate: true },
)

const busy = ref(false)
const licenseOpen = ref(false)
const licenseMode = ref<'online' | 'hybrid' | 'offline'>('online')
const licenseMaxAct = ref(3)
const licenseBusy = ref(false)
const licenseError = ref('')

async function patch(body: Record<string, unknown>) {
  busy.value = true
  try {
    await $fetch(`/api/subscriptions/${subscriptionId.value}`, { method: 'PATCH', body })
    await refresh()
  } finally {
    busy.value = false
  }
}

function assignPlan() {
  if (!selectedPlan.value || selectedPlan.value === data.value?.subscription.planId) return
  void patch({ planId: selectedPlan.value })
}

async function pauseToggle() {
  const s = data.value?.subscription
  if (!s) return
  void patch({ pause: !s.isPaused })
}

function cancelSub() {
  void patch({ cancel: true })
}

function openLicense() {
  const s = data.value?.subscription
  if (!s) return
  licenseError.value = ''
  licenseMode.value = 'online'
  licenseMaxAct.value = s.activationsPerLicense
  licenseOpen.value = true
}

async function submitLicense() {
  const s = data.value?.subscription
  if (!s) return
  licenseBusy.value = true
  licenseError.value = ''
  try {
    await $fetch('/api/licenses', {
      method: 'POST',
      body: {
        subscriptionId: s.id,
        mode: licenseMode.value,
        maxActivations: licenseMaxAct.value,
      },
    })
    licenseOpen.value = false
    await refresh()
  } catch (e: unknown) {
    licenseError.value = e instanceof Error ? e.message : 'Could not generate license'
  } finally {
    licenseBusy.value = false
  }
}

function parseEntPayload(json: string) {
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

function displayStatus() {
  const s = data.value?.subscription
  if (!s) return ''
  if (s.isPaused) return `${s.status} (paused)`
  return s.status
}

const activityCount = computed(() => {
  const d = data.value
  if (!d) return 0
  return d.billingEvents.length + d.statusHistory.length
})

</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Subscribers', to: '/subscribers' },
        {
          label: data?.subscriber?.name ?? data?.subscription.subscriberName ?? subscriberId,
          to: `/subscribers/${subscriberId}`,
        },
        { label: data?.subscription.id ?? '…' },
      ]"
    >
      <template #actions>
        <Button variant="outline" size="sm" :disabled="pending" @click="refresh">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
      </template>
    </ConsolePageHeader>

    <div v-if="data" class="flex-1 space-y-6 p-4 lg:p-6">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="font-mono text-lg font-semibold tracking-tight">{{ data.subscription.id }}</h1>
          <p class="text-sm text-muted-foreground">{{ data.product?.name }} · {{ data.plan?.name }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Badge :variant="data.subscription.isPaused ? 'outline' : statusVariant(data.subscription.status)">
            {{ displayStatus() }}
          </Badge>
          <Badge v-if="data.subscription.manualContract" variant="secondary">Manual contract</Badge>
        </div>
      </div>

      <Tabs default-value="overview" class="w-full">
        <TabsList class="mb-4 h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="overview" class="gap-1.5">
            <LayoutGrid class="size-3.5 shrink-0 opacity-70" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="access" class="gap-1.5">
            Access
          </TabsTrigger>
          <TabsTrigger value="licenses" class="gap-1.5">
            <KeyRound class="size-3.5 shrink-0 opacity-70" />
            Licenses
            <Badge v-if="data.licenses.length" variant="secondary" class="ml-0.5 px-1.5 py-0 text-[10px] font-normal">
              {{ data.licenses.length }}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="activity" class="gap-1.5">
            <Activity class="size-3.5 shrink-0 opacity-70" />
            Activity
            <Badge v-if="activityCount" variant="secondary" class="ml-0.5 px-1.5 py-0 text-[10px] font-normal">
              {{ activityCount }}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" class="mt-0 space-y-4 focus-visible:outline-none">
          <div class="grid gap-4 lg:grid-cols-3">
            <Card class="border-border/70">
              <CardHeader>
                <CardTitle class="text-base">Subscriber</CardTitle>
                <CardDescription>Subscriber on this subscription.</CardDescription>
              </CardHeader>
              <CardContent v-if="data.subscriber" class="space-y-1 text-sm">
                <NuxtLink :to="`/subscribers/${subscriberId}`" class="font-medium text-primary underline-offset-4 hover:underline">
                  {{ data.subscriber.name }}
                </NuxtLink>
                <p class="text-muted-foreground">{{ data.subscriber.slug }} · {{ data.subscriber.status }}</p>
              </CardContent>
            </Card>
            <Card class="border-border/70">
              <CardHeader>
                <CardTitle class="text-base">Product &amp; plan</CardTitle>
                <CardDescription>Catalog linkage for entitlements.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-2 text-sm">
                <p>
                  <span class="text-muted-foreground">Product</span><br >
                  <span class="font-medium">{{ data.product?.name ?? '—' }}</span>
                </p>
                <p>
                  <span class="text-muted-foreground">Plan</span><br >
                  <span class="font-medium">{{ data.plan?.name ?? '—' }}</span>
                  <span class="text-muted-foreground"> · {{ data.plan?.billingCycle }}</span>
                </p>
              </CardContent>
            </Card>
            <Card class="border-border/70">
              <CardHeader>
                <CardTitle class="text-base">Amount</CardTitle>
                <CardDescription>Unit price, quantity, and effective total.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-2 text-sm">
                <p class="text-2xl font-semibold tabular-nums">
                  {{ formatCurrency(data.subscription.amountCents, data.subscription.currency) }}
                </p>
                <div class="grid gap-1 text-xs text-muted-foreground">
                  <p>
                    Unit price
                    {{ formatCurrency(data.subscription.unitAmountCents, data.plan?.currency ?? data.subscription.currency) }}
                  </p>
                  <p>Licenses {{ data.subscription.licenseCount }}</p>
                  <p>Activations per license {{ data.subscription.activationsPerLicense }}</p>
                  <p>
                    Base plan
                    {{ formatCurrency(data.subscription.basePlanAmountCents, data.plan?.currency ?? data.subscription.currency) }}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card class="border-border/70">
            <CardHeader>
              <CardTitle class="text-base">Schedule</CardTitle>
              <CardDescription>Renewal window and billing cadence for this subscription.</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div class="space-y-1 text-sm">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Start</p>
                  <p>{{ formatDate(data.subscription.startsAt) }}</p>
                </div>
                <div class="space-y-1 text-sm">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Renewal</p>
                  <p>{{ formatDate(data.subscription.renewalAt) }}</p>
                </div>
                <div class="space-y-1 text-sm">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">End</p>
                  <p>{{ formatDate(data.subscription.endsAt) }}</p>
                </div>
                <div class="space-y-1 text-sm">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Grace ends</p>
                  <p>{{ data.subscription.graceEndsAt ? formatDate(data.subscription.graceEndsAt) : '—' }}</p>
                </div>
                <div class="space-y-1 text-sm">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Auto-renew</p>
                  <p>{{ data.subscription.autoRenew ? 'Yes' : 'No' }}</p>
                </div>
                <div class="space-y-1 text-sm">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Billing interval</p>
                  <p class="capitalize">{{ data.subscription.billingInterval }}</p>
                </div>
                <div class="space-y-1 text-sm">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Licenses</p>
                  <p>{{ data.subscription.licenseCount }}</p>
                </div>
                <div class="space-y-1 text-sm">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Activations per license</p>
                  <p>{{ data.subscription.activationsPerLicense }}</p>
                </div>
                <div class="space-y-1 text-sm">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit price</p>
                  <p>{{ formatCurrency(data.subscription.unitAmountCents, data.plan?.currency ?? data.subscription.currency) }}</p>
                </div>
                <div class="space-y-1 text-sm sm:col-span-2 lg:col-span-3">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Billing state</p>
                  <p>{{ data.currentBillingState }}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card class="border-border/70">
            <CardHeader>
              <CardTitle class="text-base">Billing</CardTitle>
              <CardDescription>Price and lifecycle controls for the current product only.</CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-4">
              <div class="space-y-3 text-sm">
                <p>{{ data.currentBillingState }}</p>
                <div class="flex flex-wrap items-baseline gap-2">
                  <span class="text-2xl font-semibold tabular-nums">
                    {{ formatCurrency(data.subscription.amountCents, data.subscription.currency) }}
                  </span>
                  <span class="text-muted-foreground">total</span>
                </div>
                <p class="text-xs text-muted-foreground">
                  Plan list price
                  {{ formatCurrency(data.subscription.basePlanAmountCents, data.plan?.currency ?? data.subscription.currency) }}
                  · {{ data.plan?.billingCycle }}
                </p>
              </div>

              <Separator />

              <div class="flex flex-col gap-4">
                <div class="flex min-w-0 max-w-xl flex-col gap-2">
                  <Label>Change plan</Label>
                  <div class="flex flex-wrap gap-2">
                    <NativeSelect v-model="selectedPlan" class="min-w-0 flex-1">
                      <NativeSelectOption v-for="p in planChoices" :key="p.id" :value="p.id">
                        {{ p.name }} · {{ p.productName }}
                      </NativeSelectOption>
                    </NativeSelect>
                    <Button size="sm" :disabled="busy || !planChoices.length" @click="assignPlan">Save</Button>
                  </div>
                  <p v-if="!planChoices.length" class="text-xs text-muted-foreground">
                    No alternate plans found for this product.
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" :disabled="busy" @click="pauseToggle">
                    {{ data.subscription.isPaused ? 'Resume' : 'Pause' }}
                  </Button>
                  <Button size="sm" variant="destructive" :disabled="busy" @click="cancelSub">Cancel subscription</Button>
                </div>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="access" class="mt-0 space-y-4 focus-visible:outline-none">
          <Card class="border-border/70">
            <CardHeader>
              <CardTitle class="text-base">Plan features</CardTitle>
              <CardDescription>Features enabled for the assigned plan in the catalog.</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="f in data.planFeatures"
                  :key="f.featureKey"
                  :variant="f.enabled ? 'secondary' : 'outline'"
                  class="text-xs"
                >
                  {{ f.name }}
                </Badge>
                <p v-if="!data.planFeatures.length" class="text-sm text-muted-foreground">No features linked to this plan.</p>
              </div>
            </CardContent>
          </Card>

          <Card class="border-border/70">
            <CardHeader>
              <CardTitle class="text-base">Computed entitlements</CardTitle>
              <CardDescription>Snapshots for this subscriber and product from the entitlement engine.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <div v-for="e in data.entitlements" :key="e.id" class="rounded-lg border border-border/60 p-3 text-sm">
                <p class="text-xs text-muted-foreground">{{ e.id }} · {{ formatDateTime(e.computedAt) }}</p>
                <pre class="mt-2 max-h-48 overflow-auto rounded bg-muted/40 p-2 text-xs">{{ JSON.stringify(parseEntPayload(e.payloadJson), null, 2) }}</pre>
              </div>
              <p v-if="!data.entitlements.length" class="text-sm text-muted-foreground">No entitlement rows for this product yet.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="licenses" class="mt-0 space-y-4 focus-visible:outline-none">
          <Card class="border-border/70">
            <CardHeader class="flex flex-row flex-wrap items-end justify-between gap-4">
              <div>
                <CardTitle class="text-base">Licenses</CardTitle>
                <CardDescription>License keys issued for this subscription.</CardDescription>
              </div>
              <Button variant="outline" size="sm" @click="openLicense">
                <PlusCircle class="mr-1 size-4" />
                Generate license
              </Button>
            </CardHeader>
            <CardContent class="grid gap-3 sm:grid-cols-2">
              <NuxtLink
                v-for="lic in data.licenses"
                :key="lic.id"
                :to="`/subscribers/${subscriberId}/license/${lic.id}`"
                class="block rounded-lg border border-border/50 bg-background/40 p-4 text-sm transition-colors hover:border-primary/40 hover:bg-background/60"
              >
                <div class="font-mono text-xs break-all">{{ lic.licenseKey }}</div>
                <div class="mt-2 text-muted-foreground">
                  {{ data.product?.name ?? 'Product' }} · {{ lic.mode }} · Expires {{ formatDate(lic.validTo) }}
                </div>
                <div class="mt-2 flex flex-wrap gap-2">
                  <Badge class="capitalize" :variant="statusVariant(lic.status)">{{ lic.status }}</Badge>
                  <Badge variant="outline" class="capitalize">{{ lic.maxActivations }} activations</Badge>
                </div>
              </NuxtLink>
              <p v-if="!data.licenses.length" class="text-sm text-muted-foreground sm:col-span-2">
                No licenses yet. Generate one from this tab.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" class="mt-0 space-y-4 focus-visible:outline-none">
          <Card class="border-border/70">
            <CardHeader>
              <CardTitle class="text-base">Linked billing events</CardTitle>
              <CardDescription>Invoices and payments matched to this subscription when the provider sends an id.</CardDescription>
            </CardHeader>
            <CardContent class="p-0">
              <ScrollArea v-if="data.billingEvents.length" class="max-h-[min(50vh,360px)] w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Occurred</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow v-for="b in data.billingEvents" :key="b.id">
                      <TableCell>
                        <Badge variant="secondary">{{ b.provider }}</Badge>
                      </TableCell>
                      <TableCell>{{ b.eventType }}</TableCell>
                      <TableCell>{{ formatCurrency(b.amountCents, b.currency) }}</TableCell>
                      <TableCell>{{ formatDateTime(b.occurredAt) }}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              <p v-else class="px-6 py-8 text-sm text-muted-foreground">No linked billing events.</p>
            </CardContent>
          </Card>

          <Card class="border-border/70">
            <CardHeader>
              <CardTitle class="text-base">Status history</CardTitle>
              <CardDescription>Audit trail for this subscription id.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3 text-sm">
              <div v-for="h in data.statusHistory" :key="h.id" class="border-b border-border/40 pb-3 last:border-0">
                <p class="font-medium">{{ h.action }}</p>
                <p class="text-xs text-muted-foreground">{{ h.actor }} · {{ formatDateTime(h.createdAt) }}</p>
                <pre class="mt-1 max-h-28 overflow-auto rounded bg-muted/30 p-2 text-xs">{{ h.detailsJson }}</pre>
              </div>
              <p v-if="!data.statusHistory.length" class="text-muted-foreground">No history yet.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    <div v-else-if="pending" class="p-6 text-sm text-muted-foreground">Loading subscription…</div>
    <div v-else class="p-6 text-sm text-destructive">Subscription not found.</div>
  </div>

  <Dialog v-model:open="licenseOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Generate license</DialogTitle>
        <DialogDescription>
          Creates a license record against this subscription.
        </DialogDescription>
      </DialogHeader>
      <p v-if="licenseError" class="text-sm text-destructive">{{ licenseError }}</p>
      <div class="grid gap-3 py-2">
        <div class="space-y-2">
          <Label>Mode</Label>
          <Select v-model="licenseMode">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="online">online</SelectItem>
              <SelectItem value="hybrid">hybrid</SelectItem>
              <SelectItem value="offline">offline</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="lic-max">Max activations</Label>
          <Input id="lic-max" v-model.number="licenseMaxAct" type="number" min="1" />
          <p class="text-xs text-muted-foreground">
            Defaults from the current subscription, but can be overridden for this license.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="licenseOpen = false">Cancel</Button>
        <Button :disabled="licenseBusy" @click="submitLicense">Generate</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
