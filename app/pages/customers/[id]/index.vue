<script setup lang="ts">
import { definePageMeta, nextTick } from '#imports'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Separator } from '~/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Textarea } from '~/components/ui/textarea'
import { formatCurrency, formatDate, formatRelative, statusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import { Ban, Pencil, PlusCircle, RefreshCw } from 'lucide-vue-next'

definePageMeta({ layout: 'console' })

const VALID_TABS = new Set(['overview', 'subscriptions', 'audit'])

const route = useRoute()
const router = useRouter()
const tenantId = computed(() => String(route.params.id ?? ''))

const { data, pending, refresh } = await useWorkspaceDashboard()

const tenant = computed(() => data.value?.tenants.find((t) => t.id === tenantId.value))
const products = computed(() => [...(data.value?.products ?? [])].sort((a, b) => a.name.localeCompare(b.name)))
const subscriptions = computed(() => data.value?.subscriptionsDetail.filter((s) => s.tenantId === tenantId.value) ?? [])
const entitlements = computed(() => data.value?.entitlementsDetail.filter((e) => e.tenantId === tenantId.value) ?? [])
const licenses = computed(() => data.value?.licenses.filter((l) => l.tenantId === tenantId.value) ?? [])
const auditRows = computed(
  () =>
    data.value?.auditTrail.filter((a) => a.tenantId === tenantId.value).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ) ?? [],
)

const activeTab = ref('overview')
const syncingTabFromRoute = ref(false)

function normalizeTabQuery(raw: unknown): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v === 'string' && VALID_TABS.has(v)) {
    return v
  }
  return 'overview'
}

watch(
  () => route.query.tab,
  () => {
    const raw = route.query.tab
    const v = Array.isArray(raw) ? raw[0] : raw
    if (typeof v === 'string' && v && !VALID_TABS.has(v)) {
      const q = { ...route.query } as Record<string, string | string[] | undefined>
      delete q.tab
      void router.replace({ path: route.path, query: q })
      return
    }
    syncingTabFromRoute.value = true
    activeTab.value = normalizeTabQuery(route.query.tab)
    nextTick(() => {
      syncingTabFromRoute.value = false
    })
  },
  { immediate: true },
)

function onMainTabChange(tab: string | number) {
  const next = typeof tab === 'number' ? String(tab) : tab
  if (!VALID_TABS.has(next)) return
  activeTab.value = next
  if (syncingTabFromRoute.value) return
  const q = { ...route.query } as Record<string, string | string[] | undefined>
  if (next === 'overview') {
    delete q.tab
  } else {
    q.tab = next
  }
  void router.replace({ path: route.path, query: q })
}

const editOpen = ref(false)
const assignSubOpen = ref(false)
const actionError = ref('')
const saving = ref('')

const form = ref({
  slug: '',
  name: '',
  legalName: '',
  industry: 'General',
  status: 'active',
  seats: 0,
  email: '',
  phone: '',
  country: '',
  billingMode: '',
  billingProvider: '',
  supportTier: '',
  internalNotes: '',
  contactName: '',
  enterpriseSegment: '',
})

const assignPlanId = ref('')
const assignProductId = ref('')
const assignLicenseCount = ref(1)
const assignActivationsPerLicense = ref(1)
const assignablePlans = computed(() =>
  [...(data.value?.plansDetail ?? [])]
    .filter((plan) => plan.status === 'active')
    .sort((a, b) => {
      if (a.productName !== b.productName) return a.productName.localeCompare(b.productName)
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1
      return a.priceCents - b.priceCents
    }),
)

const plansForSelectedProduct = computed(() =>
  assignProductId.value ? assignablePlans.value.filter((plan) => plan.productId === assignProductId.value) : [],
)

const selectedAssignPlan = computed(() =>
  assignablePlans.value.find((plan) => plan.id === assignPlanId.value) ?? null,
)

const tenantFormFields = () => [
  { key: 'slug' as const, label: 'Customer code (key)', placeholder: 'auto from name if empty' },
  { key: 'name' as const, label: 'Display name', placeholder: 'Customer display name' },
  { key: 'legalName' as const, label: 'Legal / business name', placeholder: 'Registered legal name' },
  { key: 'contactName' as const, label: 'Owner / admin contact', placeholder: 'Primary contact name' },
  { key: 'email' as const, label: 'Email', placeholder: 'billing@example.com' },
  { key: 'phone' as const, label: 'Phone', placeholder: '+1 …' },
  { key: 'country' as const, label: 'Country / region', placeholder: 'United States' },
  { key: 'industry' as const, label: 'Industry', placeholder: 'Healthcare' },
  { key: 'billingMode' as const, label: 'Billing mode', placeholder: 'subscription, manual_contract, …' },
  { key: 'billingProvider' as const, label: 'Billing provider', placeholder: 'stripe, paynow, manual' },
  { key: 'supportTier' as const, label: 'Support tier', placeholder: 'standard, premium, enterprise' },
]

const openEdit = () => {
  const t = tenant.value
  if (!t) return
  actionError.value = ''
  form.value = {
    slug: t.slug,
    name: t.name,
    legalName: t.legalName,
    industry: t.industry,
    status: t.status,
    seats: t.seats,
    email: t.email,
    phone: t.phone,
    country: t.country,
    billingMode: t.billingMode,
    billingProvider: t.billingProvider,
    supportTier: t.supportTier,
    internalNotes: t.internalNotes,
    contactName: t.contactName,
    enterpriseSegment: t.enterpriseSegment ?? '',
  }
  editOpen.value = true
}

const openAssignSub = () => {
  if (!tenant.value) return
  actionError.value = ''
  assignProductId.value = products.value[0]?.id ?? ''
  assignPlanId.value =
    assignablePlans.value.find((p) => p.productId === assignProductId.value && (p.isDefault || p.isRecommended))?.id ??
    plansForSelectedProduct.value[0]?.id ??
    ''
  assignLicenseCount.value = 1
  assignActivationsPerLicense.value = 1
  assignSubOpen.value = true
}

watch(assignProductId, (productId) => {
  if (!productId) return
  const current = plansForSelectedProduct.value.find((plan) => plan.id === assignPlanId.value)
  if (current) return
  assignPlanId.value =
    plansForSelectedProduct.value.find((plan) => plan.isDefault || plan.isRecommended)?.id ??
    plansForSelectedProduct.value[0]?.id ??
    ''
})

const submitEdit = async () => {
  if (!tenant.value) return
  saving.value = 'edit'
  actionError.value = ''
  try {
    await $fetch(`/api/tenants/${tenant.value.id}`, {
      method: 'PATCH',
      body: {
        slug: form.value.slug,
        name: form.value.name,
        legalName: form.value.legalName,
        industry: form.value.industry,
        status: form.value.status,
        seats: form.value.seats,
        email: form.value.email,
        phone: form.value.phone,
        country: form.value.country,
        billingMode: form.value.billingMode,
        billingProvider: form.value.billingProvider,
        supportTier: form.value.supportTier,
        internalNotes: form.value.internalNotes,
        contactName: form.value.contactName,
        enterpriseSegment: form.value.enterpriseSegment,
      },
    })
    editOpen.value = false
    await refresh()
  } catch (e: unknown) {
    actionError.value = e instanceof Error ? e.message : 'Could not update customer'
  } finally {
    saving.value = ''
  }
}

const patchStatus = async (status: string) => {
  if (!tenant.value) return
  saving.value = tenant.value.id
  actionError.value = ''
  try {
    await $fetch(`/api/tenants/${tenant.value.id}`, { method: 'PATCH', body: { status } })
    await refresh()
  } catch (e: unknown) {
    actionError.value = e instanceof Error ? e.message : 'Could not update status'
  } finally {
    saving.value = ''
  }
}

const submitAssignSub = async () => {
  if (!tenant.value || !assignPlanId.value) return
  saving.value = 'sub'
  actionError.value = ''
  try {
    await $fetch('/api/subscriptions', {
      method: 'POST',
      body: {
        tenantId: tenant.value.id,
        planId: assignPlanId.value,
        licenseCount: assignLicenseCount.value,
        activationsPerLicense: assignActivationsPerLicense.value,
      },
    })
    assignSubOpen.value = false
    await refresh()
  } catch (e: unknown) {
    actionError.value = e instanceof Error ? e.message : 'Could not assign subscription'
  } finally {
    saving.value = ''
  }
}

useSeoMeta({
  title: computed(() => (tenant.value ? `${site.brand.name} | ${tenant.value.name}` : `${site.brand.name} | Customer`)),
  description: computed(() =>
    tenant.value ? `Customer profile, subscriptions, and history for ${tenant.value.name}.` : 'Customer profile.',
  ),
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Customers', to: '/customers' },
        { label: tenant?.name ?? 'Customer' },
      ]"
    >
      <template #actions>
        <template v-if="tenant">
          <Button size="sm" variant="default" @click="openEdit">
            <Pencil class="mr-1 size-3.5" />
            Edit
          </Button>
          <Button
            v-if="tenant.status !== 'suspended'"
            size="sm"
            variant="destructive"
            :disabled="saving === tenant.id"
            @click="patchStatus('suspended')"
          >
            <Ban class="mr-1 size-3.5" />
            Suspend customer
          </Button>
          <Button
            v-else
            size="sm"
            variant="outline"
            :disabled="saving === tenant.id"
            @click="patchStatus('active')"
          >
            <Ban class="mr-1 size-3.5" />
            Reactivate customer
          </Button>
        </template>
        <Button variant="outline" size="sm" :disabled="pending" @click="refresh">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
      </template>
    </ConsolePageHeader>

    <div v-if="!tenant && !pending" class="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p class="text-muted-foreground">Customer not found.</p>
      <Button as-child variant="outline">
        <NuxtLink to="/customers">Back to customers</NuxtLink>
      </Button>
    </div>

    <div v-else-if="tenant" class="flex-1 space-y-4 p-4 pb-10 lg:p-6">
      <p v-if="actionError" class="text-sm text-destructive">{{ actionError }}</p>

      <div
        class="flex flex-col gap-4 rounded-3xl border border-border/70 bg-gradient-to-br from-card/95 to-card/80 p-5 shadow-sm backdrop-blur-sm sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="min-w-0 space-y-1">
          <h1 class="text-2xl font-semibold tracking-tight">{{ tenant.name }}</h1>
          <p class="text-sm text-muted-foreground">
            <span class="font-mono">{{ tenant.slug }}</span>
            <span v-if="tenant.country"> · {{ tenant.country }}</span>
            <span class="text-muted-foreground/80"> · Created {{ formatDate(tenant.createdAt) }}</span>
          </p>
          <div class="flex flex-wrap gap-2 pt-2">
            <Badge class="capitalize" :variant="statusVariant(tenant.status)">{{ tenant.status }}</Badge>
            <Badge variant="outline" class="font-normal capitalize">Billing: {{ tenant.billingStatus }}</Badge>
            <Badge variant="outline" class="font-normal capitalize">License: {{ tenant.licenseStatus }}</Badge>
          </div>
        </div>
        <div class="grid shrink-0 grid-cols-3 gap-2">
          <div class="rounded-2xl border border-border/60 bg-background/60 px-3 py-2 text-center sm:text-left">
            <div class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Subscriptions</div>
            <div class="text-lg font-semibold tabular-nums">{{ subscriptions.length }}</div>
          </div>
          <div class="rounded-2xl border border-border/60 bg-background/60 px-3 py-2 text-center sm:text-left">
            <div class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Entitlements</div>
            <div class="text-lg font-semibold tabular-nums">{{ entitlements.length }}</div>
          </div>
          <div class="rounded-2xl border border-border/60 bg-background/60 px-3 py-2 text-center sm:text-left">
            <div class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Licenses</div>
            <div class="text-lg font-semibold tabular-nums">{{ licenses.length }}</div>
          </div>
        </div>
      </div>

      <Tabs :model-value="activeTab" class="w-full" @update:model-value="onMainTabChange">
        <TabsList class="mb-4 inline-flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-muted/40 p-1 sm:w-auto">
          <TabsTrigger value="overview" class="rounded-lg px-3 py-2 text-xs sm:px-4 sm:text-sm data-[state=active]:shadow-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="subscriptions"
            class="rounded-lg px-3 py-2 text-xs sm:px-4 sm:text-sm data-[state=active]:shadow-sm"
          >
            Subscriptions
          </TabsTrigger>
          <TabsTrigger value="audit" class="rounded-lg px-3 py-2 text-xs sm:px-4 sm:text-sm data-[state=active]:shadow-sm">
            Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" class="mt-0 space-y-6 outline-none">
          <div class="grid gap-6 lg:grid-cols-2">
            <Card class="overflow-hidden rounded-3xl border-border/70 bg-card/90 shadow-sm">
              <CardHeader class="space-y-2">
                <CardTitle class="text-lg">Customer profile</CardTitle>
                <CardDescription>Legal entity, billing posture, and support tier.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Legal / business name</span>
                  <span class="font-medium">{{ tenant.legalName || '—' }}</span>
                </div>
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Industry</span>
                  <span>{{ tenant.industry }}</span>
                </div>
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Enterprise segment</span>
                  <span>{{ tenant.enterpriseSegment?.trim() ? tenant.enterpriseSegment : '—' }}</span>
                </div>
                <Separator />
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Billing mode</span>
                  <span>{{ tenant.billingMode || '—' }}</span>
                </div>
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Billing provider</span>
                  <span>{{ tenant.billingProvider || '—' }}</span>
                </div>
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Support tier</span>
                  <span>{{ tenant.supportTier || '—' }}</span>
                </div>
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Seats</span>
                  <span>{{ tenant.seats }}</span>
                </div>
                <div v-if="tenant.internalNotes" class="border border-border/60 bg-muted/20 p-3">
                  <span class="text-xs font-medium text-muted-foreground">Internal notes</span>
                  <p class="mt-1 whitespace-pre-wrap text-sm">{{ tenant.internalNotes }}</p>
                </div>
              </CardContent>
            </Card>

            <Card class="overflow-hidden rounded-3xl border-border/70 bg-card/90 shadow-sm">
              <CardHeader class="space-y-2">
                <CardTitle class="text-lg">Contacts / admin</CardTitle>
                <CardDescription>Primary owner and reachability.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Name</span>
                  <span class="font-medium">{{ tenant.contactName || '—' }}</span>
                </div>
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Email</span>
                  <span>{{ tenant.email || '—' }}</span>
                </div>
                <div class="grid gap-1">
                  <span class="text-muted-foreground">Phone</span>
                  <span>{{ tenant.phone || '—' }}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card class="overflow-hidden rounded-3xl border-border/70 bg-card/90 shadow-sm">
            <CardHeader class="space-y-2">
              <CardTitle class="text-lg">Subscribed products</CardTitle>
              <CardDescription>Products associated with this customer.</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="flex flex-wrap gap-2">
                <Badge v-for="p in tenant.subscribedProducts" :key="p" variant="secondary">{{ p }}</Badge>
                <span v-if="!tenant.subscribedProducts.length" class="text-sm text-muted-foreground">No products yet.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" class="mt-0 outline-none">
          <Card class="border-border/70 bg-card/90 shadow-sm">
            <CardHeader class="flex flex-row flex-wrap items-end justify-between gap-4">
              <div class="space-y-1">
                <CardTitle class="text-lg">Subscriptions &amp; plans</CardTitle>
                <CardDescription>Subscription rows and provider references for this customer.</CardDescription>
              </div>
              <Button variant="outline" size="sm" @click="openAssignSub">
                <PlusCircle class="mr-1 size-4" />
                Assign subscription
              </Button>
            </CardHeader>
            <CardContent class="space-y-3">
              <div
                v-for="sub in subscriptions"
                :key="sub.id"
                class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-4 py-3 text-sm"
              >
                <NuxtLink
                  :to="`/customers/${tenantId}/subscription/${sub.id}`"
                  class="min-w-0 flex-1 transition-colors hover:text-primary"
                >
                  <div class="font-medium">{{ sub.productName }} — {{ sub.planName }}</div>
                  <div class="text-xs text-muted-foreground">
                    {{ sub.provider }} · {{ sub.providerRef }}
                  </div>
                </NuxtLink>
                <Badge variant="outline" class="capitalize">{{ sub.status }}</Badge>
              </div>
              <p v-if="!subscriptions.length" class="text-sm text-muted-foreground">No subscriptions yet. Assign a plan from this tab.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" class="mt-0 outline-none">
          <Card class="border-border/70 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle class="text-lg">Audit timeline</CardTitle>
              <CardDescription>Recent control-plane actions for this customer.</CardDescription>
            </CardHeader>
            <CardContent class="relative space-y-0 pl-4 text-sm">
              <div class="absolute bottom-0 left-[7px] top-2 w-px bg-border" />
              <div v-for="log in auditRows" :key="log.id" class="relative pb-6 pl-6">
                <div class="absolute left-0 top-1.5 size-2 -translate-x-[3px] rounded-full bg-primary" />
                <div class="font-medium">{{ log.action }}</div>
                <div class="text-xs text-muted-foreground">
                  {{ log.actor }} · {{ log.resourceType }} · {{ formatRelative(log.createdAt) }}
                </div>
              </div>
              <p v-if="!auditRows.length" class="text-muted-foreground">No audit entries.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>

    <Dialog v-model:open="editOpen">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>Update customer profile and internal fields.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div v-for="field in tenantFormFields()" :key="field.key" class="space-y-1.5">
            <Label :for="`e-${field.key}`">{{ field.label }}</Label>
            <Input :id="`e-${field.key}`" v-model="form[field.key]" :placeholder="field.placeholder" />
          </div>
          <div class="space-y-1.5">
            <Label for="e-status">Account status</Label>
            <Select v-model="form.status">
              <SelectTrigger id="e-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="trial">trial</SelectItem>
                <SelectItem value="suspended">suspended</SelectItem>
                <SelectItem value="expired">expired</SelectItem>
                <SelectItem value="churned">churned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label for="e-seats">Seats</Label>
            <Input id="e-seats" v-model.number="form.seats" type="number" min="0" />
          </div>
          <div class="space-y-1.5">
            <Label for="e-segment">Enterprise segment</Label>
            <Input
              id="e-segment"
              v-model="form.enterpriseSegment"
              placeholder="standard, smb, mid_market, enterprise…"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="e-notes">Internal notes</Label>
            <Textarea id="e-notes" v-model="form.internalNotes" rows="3" class="min-h-[80px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editOpen = false">Cancel</Button>
          <Button :disabled="saving === 'edit'" @click="submitEdit">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="assignSubOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign subscription</DialogTitle>
          <DialogDescription>
            {{ tenant?.name }} — creates a new subscription row for the selected plan.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-2 py-2">
          <div class="space-y-2">
            <Label>Product</Label>
            <Select v-model="assignProductId">
              <SelectTrigger>
                <SelectValue placeholder="Choose product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="product in products" :key="product.id" :value="product.id">
                  {{ product.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="assignProductId" class="space-y-2">
            <Label>Plan</Label>
            <div class="grid gap-2">
              <button
                v-for="plan in plansForSelectedProduct"
                :key="plan.id"
                type="button"
                class="rounded-xl border border-border/60 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                :class="assignPlanId === plan.id ? 'border-primary bg-primary/5' : ''"
                @click="assignPlanId = plan.id"
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-medium">{{ plan.name }}</div>
                    <div class="text-xs text-muted-foreground">
                      {{ plan.edition || 'No edition' }}
                      <span v-if="plan.slug"> · {{ plan.slug }}</span>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-semibold">
                      {{ formatCurrency(plan.priceCents, plan.currency) }}
                    </div>
                    <div class="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {{ plan.billingCycle }}
                    </div>
                  </div>
                </div>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <Badge v-if="plan.isDefault" variant="secondary" class="text-[10px]">Default</Badge>
                  <Badge v-if="plan.isRecommended" variant="outline" class="text-[10px]">Recommended</Badge>
                  <Badge v-if="plan.trialSupported" variant="outline" class="text-[10px]">
                    Trial {{ plan.trialSettings.days }}d
                  </Badge>
                  <Badge v-if="plan.trialSettings.requiresPaymentMethod" variant="warning" class="text-[10px]">
                    Trial needs payment method
                  </Badge>
                  <Badge v-if="plan.gracePeriodDays > 0" variant="secondary" class="text-[10px]">
                    Grace {{ plan.gracePeriodDays }}d
                  </Badge>
                </div>
                <div class="mt-2 grid gap-1 text-xs text-muted-foreground">
                  <div>
                    Payment:
                    <span class="capitalize">{{ plan.billingCycle }}</span>
                    · {{ formatCurrency(plan.priceCents, plan.currency) }}
                  </div>
                  <div v-if="plan.billingMappings.stripe || plan.billingMappings.paddle || plan.billingMappings.manual">
                    Billing refs:
                    <span class="font-mono">
                      {{
                        [
                          plan.billingMappings.stripe ? `stripe:${plan.billingMappings.stripe}` : '',
                          plan.billingMappings.paddle ? `paddle:${plan.billingMappings.paddle}` : '',
                          plan.billingMappings.manual ? `manual:${plan.billingMappings.manual}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      }}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div v-else class="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
            Pick a product to see its plans.
          </div>

          <div v-if="selectedAssignPlan" class="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
            <div class="font-medium text-foreground">Selected plan summary</div>
            <div class="mt-1 grid gap-3">
              <div>
                {{ selectedAssignPlan.productName }} · {{ selectedAssignPlan.name }} ·
                {{ formatCurrency(selectedAssignPlan.priceCents, selectedAssignPlan.currency) }} per license ·
                {{ selectedAssignPlan.billingCycle }}
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <Label for="assign-license-count" class="text-xs font-medium">Number of licenses</Label>
                <Input id="assign-license-count" v-model.number="assignLicenseCount" type="number" min="1" class="w-28" />
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <Label for="assign-activations" class="text-xs font-medium">Activations per license</Label>
                <Input
                  id="assign-activations"
                  v-model.number="assignActivationsPerLicense"
                  type="number"
                  min="1"
                  class="w-28"
                />
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium text-foreground">Recurring total:</span>
                <span class="font-semibold text-foreground">
                  {{ formatCurrency(selectedAssignPlan.priceCents * Math.max(1, assignLicenseCount), selectedAssignPlan.currency) }}
                </span>
              </div>
              <div class="text-[11px] text-muted-foreground">
                Each generated license will allow {{ Math.max(1, assignActivationsPerLicense) }} activations.
              </div>
              <p class="text-[11px] text-muted-foreground">
                Quantity multiplies the unit plan price. No separate discount field exists in the current catalog metadata.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="assignSubOpen = false">Cancel</Button>
          <Button :disabled="saving === 'sub' || !assignPlanId" @click="submitAssignSub">Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </div>
</template>
