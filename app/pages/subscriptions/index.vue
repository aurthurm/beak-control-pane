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
  DialogTrigger,
} from '~/components/ui/dialog'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatCurrency, formatDate, statusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import { Plus, RefreshCw, Search } from 'lucide-vue-next'

definePageMeta({ layout: 'console' })

useSeoMeta({
  title: `${site.brand.name} | Subscriptions`,
  description: 'Subscription records across billing providers.',
})

type SubscriptionRow = {
  id: string
  subscriberId: string
  subscriberName: string
  productId: string
  productName: string
  planId: string
  planName: string
  provider: string
  providerRef: string
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
  addOns: Array<{ id: string; name: string; amountCents: number }>
  isPaused: boolean
}

type References = {
  tenants: Array<{ id: string; name: string }>
  plans: Array<{
    id: string
    name: string
    productId: string
    productName: string
    billingCycle: string
    priceCents: number
    currency: string
  }>
  products: Array<{ id: string; name: string }>
}

const search = ref('')
const filterProductId = ref<string | '__all__'>('__all__')
const filterProvider = ref<string | '__all__'>('__all__')
const filterStatus = ref<string | '__all__'>('__all__')
const filterQuick = ref<'none' | 'expiring' | 'delinquent' | 'manual' | 'trials'>('none')

const createOpen = ref(false)
const creating = ref(false)
const formTenant = ref('')
const formPlan = ref('')
const formLicenseCount = ref(1)
const formActivationsPerLicense = ref(1)
const formProvider = ref('stripe')
const formRef = ref('')
const formStatus = ref('active')
const formAutoRenew = ref(true)
const formManual = ref(false)

const { data, pending, refresh } = await useFetch<{ subscriptions: SubscriptionRow[]; references: References }>(
  '/api/subscriptions',
  { key: 'bcp-subscriptions-list' },
)

const references = computed(() => data.value?.references)

watch(createOpen, (open) => {
  if (open && references.value?.tenants.length && !formTenant.value) {
    formTenant.value = references.value.tenants[0]?.id ?? ''
  }
  if (open && references.value?.plans.length && !formPlan.value) {
    formPlan.value = references.value.plans[0]?.id ?? ''
  }
  if (open) {
    formLicenseCount.value = 1
    formActivationsPerLicense.value = 1
  }
})

const selectedPlan = computed(() => references.value?.plans.find((plan) => plan.id === formPlan.value) ?? null)

const MS_DAY = 86_400_000

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const rows = data.value?.subscriptions ?? []
  const now = Date.now()
  const expiringHorizon = now + 14 * MS_DAY

  return rows.filter((s) => {
    if (q) {
      const hay = [
        s.id,
        s.subscriberName,
        s.planName,
        s.productName,
        s.provider,
        s.providerRef,
        s.status,
      ]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filterProductId.value !== '__all__' && s.productId !== filterProductId.value) return false
    if (filterProvider.value !== '__all__' && s.provider !== filterProvider.value) return false
    if (filterStatus.value !== '__all__' && s.status !== filterStatus.value) return false

    if (filterQuick.value === 'expiring') {
      const renew = new Date(s.renewalAt).getTime()
      if (!(renew >= now && renew <= expiringHorizon)) return false
    }
    if (filterQuick.value === 'delinquent') {
      const st = s.status.toLowerCase()
      if (st !== 'past_due' && st !== 'unpaid') return false
    }
    if (filterQuick.value === 'manual' && !s.manualContract) return false
    if (filterQuick.value === 'trials' && s.status.toLowerCase() !== 'trialing') return false

    return true
  })
})

const providerOptions = computed(() => {
  const set = new Set((data.value?.subscriptions ?? []).map((s) => s.provider))
  return [...set].sort()
})

const metrics = computed(() => {
  const rows = filtered.value
  return [
    { label: 'Subscriptions', value: rows.length, detail: 'Visible in the current view' },
    { label: 'Active', value: rows.filter((sub) => sub.status === 'active').length, detail: 'Currently billing' },
    { label: 'Manual', value: rows.filter((sub) => sub.manualContract).length, detail: 'Custom contract rows' },
  ]
})

async function createSubscription() {
  if (!formTenant.value || !formPlan.value) return
  creating.value = true
  try {
    await $fetch('/api/subscriptions', {
      method: 'POST',
      body: {
        subscriberId: formTenant.value,
        planId: formPlan.value,
        licenseCount: formLicenseCount.value,
        activationsPerLicense: formActivationsPerLicense.value,
        provider: formProvider.value,
        providerRef: formRef.value.trim() || undefined,
        status: formStatus.value,
        autoRenew: formAutoRenew.value,
        manualContract: formManual.value || formProvider.value === 'manual',
      },
    })
    createOpen.value = false
    formRef.value = ''
    await refresh()
  } finally {
    creating.value = false
  }
}

function displayStatus(s: SubscriptionRow) {
  if (s.isPaused) return `${s.status} (paused)`
  return s.status
}

function badgeVariantForSubscription(s: SubscriptionRow) {
  if (s.isPaused) return 'outline' as const
  return statusVariant(s.status)
}

function subscriptionDetailPath(s: SubscriptionRow) {
  if (!s.subscriberId || !s.id) return '/subscriptions'
  return `/subscribers/${s.subscriberId}/subscription/${s.id}`
}

function goToSubscription(s: SubscriptionRow) {
  void navigateTo(subscriptionDetailPath(s))
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Subscriptions' },
      ]"
    >
      <template #actions>
        <Dialog v-model:open="createOpen">
          <DialogTrigger as-child>
            <Button size="sm" class="gap-1">
              <Plus class="size-4" />
              Create subscription
            </Button>
          </DialogTrigger>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>Create subscription</DialogTitle>
              <DialogDescription>Attach a subscriber to a catalog plan. Provider references can be refined later.</DialogDescription>
            </DialogHeader>
            <div class="grid gap-3 py-2">
              <div class="grid gap-1.5">
                <Label for="sub-subscriber">Subscriber</Label>
                <NativeSelect id="sub-subscriber" v-model="formTenant">
                  <NativeSelectOption v-for="t in references?.tenants ?? []" :key="t.id" :value="t.id">
                    {{ t.name }}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <div class="grid gap-1.5">
                <Label for="sub-plan">Plan</Label>
                <NativeSelect id="sub-plan" v-model="formPlan">
                  <NativeSelectOption v-for="p in references?.plans ?? []" :key="p.id" :value="p.id">
                    {{ p.name }} · {{ p.productName }} · {{ formatCurrency(p.priceCents, p.currency) }} · {{ p.billingCycle }}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <div class="grid gap-1.5">
                <Label for="sub-licenses">Number of licenses</Label>
                <Input id="sub-licenses" v-model.number="formLicenseCount" type="number" min="1" />
              </div>
              <div class="grid gap-1.5">
                <Label for="sub-activations">Activations per license</Label>
                <Input id="sub-activations" v-model.number="formActivationsPerLicense" type="number" min="1" />
              </div>
              <div v-if="selectedPlan" class="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                <div class="font-medium text-foreground">Pricing summary</div>
                <div class="mt-1">
                  {{ selectedPlan.name }} · {{ selectedPlan.productName }} ·
                  {{ formatCurrency(selectedPlan.priceCents, selectedPlan.currency) }} per license ·
                  {{ selectedPlan.billingCycle }}
                </div>
                <div class="mt-1 font-medium text-foreground">
                  Total:
                  {{ formatCurrency(selectedPlan.priceCents * Math.max(1, formLicenseCount), selectedPlan.currency) }}
                </div>
                <div class="mt-1">
                  Each license allows {{ Math.max(1, formActivationsPerLicense) }} activations.
                </div>
              </div>
              <div class="grid gap-1.5">
                <Label for="sub-provider">Provider</Label>
                <NativeSelect id="sub-provider" v-model="formProvider">
                  <NativeSelectOption value="stripe">stripe</NativeSelectOption>
                  <NativeSelectOption value="paynow">paynow</NativeSelectOption>
                  <NativeSelectOption value="manual">manual</NativeSelectOption>
                  <NativeSelectOption value="paddle">paddle</NativeSelectOption>
                </NativeSelect>
              </div>
              <div class="grid gap-1.5">
                <Label for="sub-ref">Provider reference</Label>
                <Input id="sub-ref" v-model="formRef" placeholder="Optional external id" />
              </div>
              <div class="grid gap-1.5">
                <Label for="sub-status">Status</Label>
                <NativeSelect id="sub-status" v-model="formStatus">
                  <NativeSelectOption value="trialing">trialing</NativeSelectOption>
                  <NativeSelectOption value="active">active</NativeSelectOption>
                  <NativeSelectOption value="past_due">past_due</NativeSelectOption>
                  <NativeSelectOption value="unpaid">unpaid</NativeSelectOption>
                  <NativeSelectOption value="canceled">canceled</NativeSelectOption>
                  <NativeSelectOption value="expired">expired</NativeSelectOption>
                </NativeSelect>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <Checkbox id="sub-autorenew" v-model="formAutoRenew" />
                <Label for="sub-autorenew" class="cursor-pointer font-normal">Auto-renew</Label>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <Checkbox id="sub-manual" v-model="formManual" />
                <Label for="sub-manual" class="cursor-pointer font-normal">Manual contract</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" @click="createOpen = false">Cancel</Button>
              <Button :disabled="creating || !formTenant || !formPlan" @click="createSubscription">
                {{ creating ? 'Creating…' : 'Create' }}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button variant="outline" size="sm" :disabled="pending" @click="refresh">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
      </template>
    </ConsolePageHeader>

    <div class="flex-1 space-y-6 p-4 lg:p-6">
      <section class="grid gap-3 sm:grid-cols-3">
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

      <Card class="overflow-hidden rounded-3xl border-border/70 bg-card/90 shadow-sm backdrop-blur-sm">
        <CardHeader class="flex flex-col gap-4">
          <div class="space-y-1">
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>
              This page manages subscription records regardless of provider. Open a row for upgrades, pauses, add-ons, and billing
              history.
            </CardDescription>
          </div>
          <div class="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div class="relative w-full lg:max-w-xs">
              <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="search" class="pl-9" placeholder="Search ID, subscriber, plan, provider…" />
            </div>
            <div class="grid gap-1.5 sm:min-w-[140px]">
              <Label for="sub-f-product" class="text-xs text-muted-foreground">Product</Label>
              <NativeSelect id="sub-f-product" v-model="filterProductId">
                <NativeSelectOption value="__all__">All products</NativeSelectOption>
                <NativeSelectOption v-for="p in references?.products ?? []" :key="p.id" :value="p.id">{{ p.name }}</NativeSelectOption>
              </NativeSelect>
            </div>
            <div class="grid gap-1.5 sm:min-w-[140px]">
              <Label for="sub-f-provider" class="text-xs text-muted-foreground">Provider</Label>
              <NativeSelect id="sub-f-provider" v-model="filterProvider">
                <NativeSelectOption value="__all__">All providers</NativeSelectOption>
                <NativeSelectOption v-for="pr in providerOptions" :key="pr" :value="pr">{{ pr }}</NativeSelectOption>
              </NativeSelect>
            </div>
            <div class="grid gap-1.5 sm:min-w-[140px]">
              <Label for="sub-f-status" class="text-xs text-muted-foreground">Status</Label>
              <NativeSelect id="sub-f-status" v-model="filterStatus">
                <NativeSelectOption value="__all__">All statuses</NativeSelectOption>
                <NativeSelectOption value="trialing">trialing</NativeSelectOption>
                <NativeSelectOption value="active">active</NativeSelectOption>
                <NativeSelectOption value="past_due">past_due</NativeSelectOption>
                <NativeSelectOption value="unpaid">unpaid</NativeSelectOption>
                <NativeSelectOption value="canceled">canceled</NativeSelectOption>
                <NativeSelectOption value="expired">expired</NativeSelectOption>
              </NativeSelect>
            </div>
            <div class="grid gap-1.5 sm:min-w-[180px]">
              <Label for="sub-f-quick" class="text-xs text-muted-foreground">Quick filters</Label>
              <NativeSelect id="sub-f-quick" v-model="filterQuick">
                <NativeSelectOption value="none">None</NativeSelectOption>
                <NativeSelectOption value="expiring">Expiring soon (14d)</NativeSelectOption>
                <NativeSelectOption value="delinquent">Unpaid / past due</NativeSelectOption>
                <NativeSelectOption value="manual">Manual contracts only</NativeSelectOption>
                <NativeSelectOption value="trials">Trials only</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <ScrollArea class="h-[min(72vh,780px)] w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="whitespace-nowrap">Subscription ID</TableHead>
                  <TableHead>Subscriber</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead class="whitespace-nowrap">Billing interval</TableHead>
                  <TableHead class="whitespace-nowrap">Start</TableHead>
                  <TableHead class="whitespace-nowrap">Renewal</TableHead>
                  <TableHead class="whitespace-nowrap">End</TableHead>
                  <TableHead class="whitespace-nowrap">Grace end</TableHead>
                  <TableHead class="whitespace-nowrap">Auto-renew</TableHead>
                  <TableHead class="whitespace-nowrap">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="s in filtered"
                  :key="s.id"
                  class="cursor-pointer transition-colors hover:bg-muted/40"
                  role="link"
                  tabindex="0"
                  @click="goToSubscription(s)"
                  @keydown.enter="goToSubscription(s)"
                >
                  <TableCell class="font-mono text-xs text-primary underline-offset-4 hover:underline">
                    {{ s.id }}
                  </TableCell>
                  <TableCell class="font-medium">{{ s.subscriberName }}</TableCell>
                  <TableCell>{{ s.productName }}</TableCell>
                  <TableCell>{{ s.planName }}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{{ s.provider }}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge :variant="badgeVariantForSubscription(s)">{{ displayStatus(s) }}</Badge>
                  </TableCell>
                  <TableCell class="capitalize">{{ s.billingInterval }}</TableCell>
                  <TableCell class="whitespace-nowrap text-sm">{{ formatDate(s.startsAt) }}</TableCell>
                  <TableCell class="whitespace-nowrap text-sm">{{ formatDate(s.renewalAt) }}</TableCell>
                  <TableCell class="whitespace-nowrap text-sm">{{ formatDate(s.endsAt) }}</TableCell>
                  <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
                    {{ s.graceEndsAt ? formatDate(s.graceEndsAt) : '—' }}
                  </TableCell>
                  <TableCell>{{ s.autoRenew ? 'Yes' : 'No' }}</TableCell>
                  <TableCell class="whitespace-nowrap">
                    <div class="font-medium">{{ formatCurrency(s.amountCents, s.currency) }}</div>
                    <div class="text-xs text-muted-foreground">
                      {{ s.licenseCount }} licenses · {{ formatCurrency(s.unitAmountCents, s.currency) }} each ·
                      {{ s.activationsPerLicense }} activations/license
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
  </div>
</template>
