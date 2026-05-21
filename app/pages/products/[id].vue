<script setup lang="ts">
import { reactive } from 'vue'
import ProductFormFields, { type ProductFormModel } from '~/components/ProductFormFields.vue'
import ConsolePageHeader from '~/components/ConsolePageHeader.vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area'
import { Separator } from '~/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Textarea } from '~/components/ui/textarea'
import { formatCurrency, formatDate, statusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import ProductFeatureFlagsPanel from '~/components/ProductFeatureFlagsPanel.vue'
import {
  ArrowLeft,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  MoreHorizontal,
  Star,
  Trash2,
} from 'lucide-vue-next'

definePageMeta({ layout: 'console' })

const route = useRoute()
const segment = computed(() => String(route.params.id ?? ''))

type CatalogPlan = {
  id: string
  slug: string
  name: string
  edition: string
  billingCycle: string
  priceCents: number
  currency: string
  status: string
  createdAt: string
  updatedAt: string
  trialSupported: boolean
  visibility: string
  isDefault: boolean
  isRecommended: boolean
  limits: Array<{
    id: string
    limitKey: string
    limitValue: number
    resetPeriod: string
    limitUnit: string
    enforcement: 'hard' | 'soft'
    notes: string
    valueKind: 'number' | 'boolean'
  }>
  limitsSummary: string
  enabledFeatureCount: number
  includedFeatureIds: string[]
  billingMappings: Record<string, string>
  trialSettings: { days: number; requiresPaymentMethod: boolean }
  gracePeriodDays: number
  enterpriseOverrideCompatible: boolean
}

type CatalogFeature = {
  id: string
  /** When set to this product, the row can be deleted from the catalog UI. Shared / legacy rows may be null or another product. */
  productId: string | null
  featureKey: string
  name: string
  description: string
  category: string
  featureType: string
  status: string
  visibility: string
  isBillable: boolean
  defaultEnabled: boolean
}

type CatalogLimitDefinition = {
  id: string
  limitKey: string
  resetPeriod: string
  limitUnit: string
  valueKind: 'number' | 'boolean'
  enforcement: 'hard' | 'soft'
  notes: string
}

type CatalogAddonDefinition = {
  id: string
  addonKey: string
  displayName: string
  notes: string
}

type LimitCell = {
  id: string
  limitValue: number
  resetPeriod: string
  limitUnit: string
  enforcement: 'hard' | 'soft'
  notes: string
  valueKind: 'number' | 'boolean'
}

type ProductDetail = {
  summary: {
    id: string
    name: string
    slug: string
    description: string
    status: string
    productType: string
    productTypeLabel: string
    defaultBillingMode: string
    defaultBillingModeLabel: string
    offlineLicensesSupported: boolean
    activationsRequired: boolean
    usageTrackingEnabled: boolean
    extraDetails: string
    planCount: number
    tenantCount: number
    createdAt: string
    updatedAt: string
  }
  catalog: {
    plans: CatalogPlan[]
    features: CatalogFeature[]
    enabledFeatureIdsByPlan: Record<string, string[]>
    limitDefinitions: CatalogLimitDefinition[]
    limitCellsByPlan: Record<string, Record<string, LimitCell | null>>
    addonDefinitions: CatalogAddonDefinition[]
    enabledAddonKeysByPlan: Record<string, string[]>
  }
  subscriptionStats: {
    totalSubscriptions: number
    activeSubscriptions: number
    trialingSubscriptions: number
    mrrCents: number
    licensesTotal: number
    licensesByStatus: Record<string, number>
    activeActivations: number
  }
}

const { data, pending, error, refresh } = await useFetch<ProductDetail>(() => `/api/products/${encodeURIComponent(segment.value)}`, {
  key: () => `bcp-product-${segment.value}`,
  watch: [segment],
})

useSeoMeta({
  title: () => (data.value?.summary.name ? `${site.brand.name} | ${data.value.summary.name}` : `${site.brand.name} | Product`),
  description: () => data.value?.summary.description ?? 'Product details',
})

const enabledByPlan = reactive<Record<string, string[]>>({})
const togglingKey = ref<string | null>(null)

watch(
  () => data.value?.catalog,
  (c) => {
    if (!c) return
    for (const key of Object.keys(enabledByPlan)) {
      delete enabledByPlan[key]
    }
    for (const p of c.plans) {
      enabledByPlan[p.id] = [...(c.enabledFeatureIdsByPlan[p.id] ?? [])]
    }
  },
  { immediate: true },
)

function isCellOn(planId: string, featureId: string) {
  return (enabledByPlan[planId] ?? []).includes(featureId)
}

async function toggleCell(planId: string, featureId: string, on: boolean) {
  const prev = [...(enabledByPlan[planId] ?? [])]
  const set = new Set(enabledByPlan[planId] ?? [])
  if (on) {
    set.add(featureId)
  } else {
    set.delete(featureId)
  }
  const next = [...set]
  enabledByPlan[planId] = next
  togglingKey.value = `${planId}:${featureId}`
  try {
    await $fetch(`/api/plans/${planId}`, {
      method: 'PATCH',
      body: { enabledFeatureIds: next },
    })
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e) {
    enabledByPlan[planId] = prev
    console.error(e)
  } finally {
    togglingKey.value = null
  }
}

const editOpen = ref(false)
const editForm = ref<ProductFormModel>({
  name: '',
  slug: '',
  description: '',
  status: 'draft',
  productType: 'saas',
  defaultBillingMode: 'subscription',
  offlineLicensesSupported: false,
  activationsRequired: true,
  usageTrackingEnabled: true,
  extraDetails: '',
})
const editSaving = ref(false)

watch(
  () => data.value?.summary,
  (s) => {
    if (!s) return
    editForm.value = {
      name: s.name,
      slug: s.slug,
      description: s.description,
      status: s.status,
      productType: s.productType,
      defaultBillingMode: s.defaultBillingMode,
      offlineLicensesSupported: s.offlineLicensesSupported,
      activationsRequired: s.activationsRequired,
      usageTrackingEnabled: s.usageTrackingEnabled,
      extraDetails: s.extraDetails,
    }
  },
  { immediate: true },
)

function openEdit() {
  const s = data.value?.summary
  if (!s) return
  editForm.value = {
    name: s.name,
    slug: s.slug,
    description: s.description,
    status: s.status,
    productType: s.productType,
    defaultBillingMode: s.defaultBillingMode,
    offlineLicensesSupported: s.offlineLicensesSupported,
    activationsRequired: s.activationsRequired,
    usageTrackingEnabled: s.usageTrackingEnabled,
    extraDetails: s.extraDetails,
  }
  editOpen.value = true
}

async function submitEdit() {
  if (!segment.value) return
  editSaving.value = true
  try {
    await $fetch(`/api/products/${encodeURIComponent(segment.value)}`, {
      method: 'PATCH',
      body: {
        name: editForm.value.name,
        slug: editForm.value.slug,
        description: editForm.value.description,
        status: editForm.value.status,
        productType: editForm.value.productType,
        defaultBillingMode: editForm.value.defaultBillingMode,
        offlineLicensesSupported: editForm.value.offlineLicensesSupported,
        activationsRequired: editForm.value.activationsRequired,
        usageTrackingEnabled: editForm.value.usageTrackingEnabled,
        extraDetails: editForm.value.extraDetails,
      },
    })
    editOpen.value = false
    const previousSegment = segment.value
    await refresh()
    const nextSlug = data.value?.summary.slug
    if (nextSlug && nextSlug !== previousSegment) {
      await navigateTo(`/products/${encodeURIComponent(nextSlug)}`, { replace: true })
    }
    await refreshNuxtData('bcp-workspace-dashboard')
    await refreshNuxtData('bcp-products')
  } catch (e) {
    console.error(e)
  } finally {
    editSaving.value = false
  }
}

const featureFlagsPanel = ref<InstanceType<typeof ProductFeatureFlagsPanel> | null>(null)

async function refreshAll() {
  await refresh()
  await featureFlagsPanel.value?.refresh()
  await refreshNuxtData('bcp-workspace-dashboard')
  await refreshNuxtData('bcp-products')
}

const FEATURE_CATEGORY_ORDER = [
  'core',
  'commerce',
  'inventory',
  'customers',
  'reports',
  'integrations',
  'ai',
  'admin',
  'security',
  'billing',
  'laboratory',
  'pos',
  'analytics',
  'operations',
  'feature-flags',
] as const

const FEATURE_TYPE_OPTIONS = ['module', 'toggle', 'permission', 'integration', 'experimental'] as const
const FEATURE_STATUS_OPTIONS = ['active', 'archived'] as const
const VISIBILITY_OPTIONS = ['public', 'internal', 'beta', 'enterprise', 'deprecated'] as const

const billingIntervals = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'one-time', label: 'One-time' },
  { value: 'manual', label: 'Manual' },
] as const

const PLAN_COLUMN_CLASS = 'w-[190px] min-w-[190px] max-w-[190px]'
const PLAN_STICKY_CLASS = 'sticky left-0 z-20 min-w-[220px] border-r border-border/50 bg-muted/30 px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm'
const ROW_STICKY_CLASS = 'sticky left-0 z-10 border-r border-border/50 bg-card/95 px-3 py-2 backdrop-blur-sm'
const LIMIT_STICKY_CLASS = PLAN_STICKY_CLASS.replace('min-w-[220px]', 'min-w-[200px]')
const ADDON_STICKY_CLASS = PLAN_STICKY_CLASS.replace('min-w-[220px]', 'min-w-[200px]')
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

const visibilityOptions = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'custom', label: 'Custom' },
] as const

const catalogMessage = ref('')
const catalogError = ref('')
const catalogBusy = ref(false)

const createFeatureOpen = ref(false)
const featureFormError = ref('')
const featureForm = reactive({
  name: '',
  featureKey: '',
  description: '',
  category: 'core',
  featureType: 'module',
  isBillable: true,
  defaultEnabled: true,
  visibility: 'public',
})
const featureDetailOpen = ref(false)
const featureEditOpen = ref(false)
const featureDetail = ref<CatalogFeature | null>(null)
const featureEditTarget = ref<CatalogFeature | null>(null)
const featureEditError = ref('')
const featureEditForm = reactive({
  name: '',
  featureKey: '',
  description: '',
  category: 'core',
  featureType: 'module',
  status: 'active',
  visibility: 'public',
  isBillable: true,
  defaultEnabled: true,
})
const featureDetailPlans = computed(() => {
  const feat = featureDetail.value
  if (!feat) return []
  return (data.value?.catalog.plans ?? []).filter((plan) => isCellOn(plan.id, feat.id))
})

function openCreateFeature() {
  featureFormError.value = ''
  featureForm.name = ''
  featureForm.featureKey = ''
  featureForm.description = ''
  featureForm.category = 'core'
  featureForm.featureType = 'module'
  featureForm.isBillable = true
  featureForm.defaultEnabled = true
  featureForm.visibility = 'public'
  createFeatureOpen.value = true
}

function openFeatureDetail(feat: CatalogFeature) {
  featureDetail.value = feat
  featureDetailOpen.value = true
}

function openFeatureEdit(feat: CatalogFeature) {
  featureEditError.value = ''
  featureEditTarget.value = feat
  featureEditForm.name = feat.name
  featureEditForm.featureKey = feat.featureKey
  featureEditForm.description = feat.description
  featureEditForm.category = feat.category
  featureEditForm.featureType = feat.featureType
  featureEditForm.status = feat.status === 'archived' ? 'archived' : 'active'
  featureEditForm.visibility = feat.visibility
  featureEditForm.isBillable = feat.isBillable
  featureEditForm.defaultEnabled = feat.defaultEnabled
  featureEditOpen.value = true
}

function canDeleteCatalogFeature(feat: CatalogFeature): boolean {
  const pid = data.value?.summary.id
  return Boolean(pid && feat.productId === pid)
}

type CatalogDestructiveContext = {
  kind: 'delete-feature' | 'delete-limit' | 'delete-addon' | 'archive-plan'
  title: string
  description: string
  confirmLabel: string
  feature?: CatalogFeature
  limit?: CatalogLimitDefinition
  addon?: CatalogAddonDefinition
  plan?: CatalogPlan
}

const catalogDestructiveOpen = ref(false)
const catalogDestructiveSubmitting = ref(false)
const catalogDestructive = ref<CatalogDestructiveContext | null>(null)

watch(catalogDestructiveOpen, (open) => {
  if (!open) {
    catalogDestructive.value = null
    catalogDestructiveSubmitting.value = false
  }
})

function openCatalogDestructive(ctx: CatalogDestructiveContext) {
  catalogDestructive.value = ctx
  catalogDestructiveOpen.value = true
}

function requestDeleteCatalogFeature(feat: CatalogFeature) {
  if (!canDeleteCatalogFeature(feat)) return
  openCatalogDestructive({
    kind: 'delete-feature',
    title: 'Delete feature',
    description: `This removes “${feat.name}” (${feat.featureKey}) from the catalog and drops plan assignments. This cannot be undone.`,
    confirmLabel: 'Delete feature',
    feature: feat,
  })
}

function requestDeleteLimitDefinition(def: CatalogLimitDefinition) {
  openCatalogDestructive({
    kind: 'delete-limit',
    title: 'Remove limit',
    description: `Remove limit “${def.limitKey}” from this product and clear its values on all plans?`,
    confirmLabel: 'Remove limit',
    limit: def,
  })
}

function requestArchivePlan(plan: CatalogPlan) {
  openCatalogDestructive({
    kind: 'archive-plan',
    title: 'Archive plan',
    description: `Archive “${plan.name}” (${plan.slug})? Subscribers may still need migration before you retire it fully.`,
    confirmLabel: 'Archive plan',
    plan,
  })
}

function requestDeleteAddonDefinition(def: CatalogAddonDefinition) {
  openCatalogDestructive({
    kind: 'delete-addon',
    title: 'Remove add-on',
    description: `Remove “${def.displayName}” (${def.addonKey}) from this product and clear it from all plans?`,
    confirmLabel: 'Remove add-on',
    addon: def,
  })
}

async function runCatalogDestructiveConfirm() {
  const ctx = catalogDestructive.value
  const pid = data.value?.summary.id
  if (!ctx || !pid) return

  catalogDestructiveSubmitting.value = true
  catalogError.value = ''

  try {
    if (ctx.kind === 'delete-feature' && ctx.feature) {
      featureDeletingId.value = ctx.feature.id
      catalogBusy.value = true
      await $fetch(`/api/products/${encodeURIComponent(pid)}/features/${encodeURIComponent(ctx.feature.id)}`, {
        method: 'DELETE',
      })
      catalogMessage.value = `Removed feature “${ctx.feature.name}”.`
      await refresh()
      await refreshNuxtData('bcp-workspace-dashboard')
    } else if (ctx.kind === 'delete-limit' && ctx.limit) {
      catalogBusy.value = true
      await $fetch(`/api/products/${encodeURIComponent(pid)}/limit-keys/${encodeURIComponent(ctx.limit.id)}`, {
        method: 'DELETE',
      })
      catalogMessage.value = 'Limit removed.'
      await refresh()
      await refreshNuxtData('bcp-workspace-dashboard')
    } else if (ctx.kind === 'delete-addon' && ctx.addon) {
      catalogBusy.value = true
      await $fetch(`/api/products/${encodeURIComponent(pid)}/addon-keys/${encodeURIComponent(ctx.addon.id)}`, {
        method: 'DELETE',
      })
      catalogMessage.value = 'Add-on removed.'
      await refresh()
      await refreshNuxtData('bcp-workspace-dashboard')
    } else if (ctx.kind === 'archive-plan' && ctx.plan) {
      catalogBusy.value = true
      await $fetch(`/api/plans/${ctx.plan.id}`, { method: 'PATCH', body: { status: 'archived' } })
      catalogMessage.value = 'Plan archived.'
      await refresh()
      await refreshNuxtData('bcp-workspace-dashboard')
    }
    catalogDestructiveOpen.value = false
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    catalogError.value =
      err.data?.statusMessage ?? err.message ?? 'Action failed.'
  } finally {
    featureDeletingId.value = null
    catalogBusy.value = false
    catalogDestructiveSubmitting.value = false
  }
}

async function submitCreateFeature() {
  const productId = data.value?.summary.id
  if (!productId) return
  featureFormError.value = ''
  catalogBusy.value = true
  try {
    const plans = data.value?.catalog.plans ?? []
    await $fetch('/api/features', {
      method: 'POST',
      body: {
        name: featureForm.name,
        featureKey: featureForm.featureKey || undefined,
        description: featureForm.description,
        category: featureForm.category,
        productId,
        featureType: featureForm.featureType,
        isBillable: featureForm.isBillable,
        defaultEnabled: featureForm.defaultEnabled,
        status: 'active',
        visibility: featureForm.visibility,
        visibilityRules: {},
        dependencies: [],
        mutuallyExclusive: [],
        tags: [],
        planAssignments: plans.map((p) => ({ planId: p.id, enabled: false })),
      },
    })
    createFeatureOpen.value = false
    catalogMessage.value = 'Feature created.'
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    featureFormError.value = err.data?.statusMessage ?? err.message ?? 'Request failed'
  } finally {
    catalogBusy.value = false
  }
}

async function submitFeatureEdit() {
  const feat = featureEditTarget.value
  if (!feat) return

  featureEditError.value = ''
  catalogBusy.value = true
  try {
    await $fetch(`/api/features/${encodeURIComponent(feat.id)}`, {
      method: 'PATCH',
      body: {
        name: featureEditForm.name,
        featureKey: featureEditForm.featureKey || undefined,
        description: featureEditForm.description,
        category: featureEditForm.category,
        featureType: featureEditForm.featureType,
        status: featureEditForm.status,
        visibility: featureEditForm.visibility,
        isBillable: featureEditForm.isBillable,
        defaultEnabled: featureEditForm.defaultEnabled,
        planAssignments: (data.value?.catalog.plans ?? []).map((plan) => ({
          planId: plan.id,
          enabled: isCellOn(plan.id, feat.id),
        })),
      },
    })
    featureEditOpen.value = false
    featureDetailOpen.value = false
    catalogMessage.value = 'Feature updated.'
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    featureEditError.value = err.data?.statusMessage ?? err.message ?? 'Could not update feature.'
  } finally {
    catalogBusy.value = false
  }
}

const createPlanOpen = ref(false)
const createPlanForm = reactive({
  name: '',
  slug: '',
  edition: '',
  billingCycle: 'monthly',
  priceCents: 0,
  currency: 'USD',
  trialSupported: false,
  visibility: 'public',
})

function openCreatePlan() {
  catalogError.value = ''
  createPlanForm.name = ''
  createPlanForm.slug = ''
  createPlanForm.edition = ''
  createPlanForm.billingCycle = 'monthly'
  createPlanForm.priceCents = 0
  createPlanForm.currency = 'USD'
  createPlanForm.trialSupported = false
  createPlanForm.visibility = 'public'
  createPlanOpen.value = true
}

async function submitCreatePlan() {
  const productId = data.value?.summary.id
  if (!productId || !createPlanForm.name.trim()) {
    catalogError.value = 'Plan name is required.'
    return
  }
  catalogBusy.value = true
  catalogError.value = ''
  try {
    await $fetch('/api/plans', {
      method: 'POST',
      body: {
        productId,
        name: createPlanForm.name.trim(),
        slug: createPlanForm.slug.trim() || undefined,
        edition: createPlanForm.edition.trim() || undefined,
        billingCycle: createPlanForm.billingCycle,
        priceCents: Number(createPlanForm.priceCents) || 0,
        currency: createPlanForm.currency,
        trialSupported: createPlanForm.trialSupported,
        visibility: createPlanForm.visibility,
        metadata: {
          trial: { days: 0, requiresPaymentMethod: false },
          gracePeriodDays: 0,
          enterpriseOverrideCompatible: true,
          billingMappings: {},
        },
      },
    })
    createPlanOpen.value = false
    catalogMessage.value = 'Plan created.'
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    catalogError.value = e instanceof Error ? e.message : 'Could not create plan.'
  } finally {
    catalogBusy.value = false
  }
}

const detailPlanOpen = ref(false)
const detailPlan = ref<CatalogPlan | null>(null)
const billingPlanOpen = ref(false)
const billingPlan = ref<CatalogPlan | null>(null)
const billingForm = reactive({
  billingStripe: '',
  billingPaddle: '',
  billingManual: '',
})
const detailForm = reactive({
  name: '',
  slug: '',
  edition: '',
  billingCycle: 'monthly',
  priceCents: 0,
  currency: 'USD',
  status: 'active',
  trialSupported: false,
  visibility: 'public',
  isDefault: false,
  isRecommended: false,
  enterpriseOverrideCompatible: false,
  gracePeriodDays: 0,
  trialDays: 0,
  trialRequiresPm: false,
})

function openPlanDetail(plan: CatalogPlan) {
  catalogError.value = ''
  detailPlan.value = plan
  detailForm.name = plan.name
  detailForm.slug = plan.slug
  detailForm.edition = plan.edition
  detailForm.billingCycle = plan.billingCycle
  detailForm.priceCents = plan.priceCents
  detailForm.currency = plan.currency
  detailForm.status = plan.status
  detailForm.trialSupported = plan.trialSupported
  detailForm.visibility = plan.visibility
  detailForm.isDefault = plan.isDefault
  detailForm.isRecommended = plan.isRecommended
  detailForm.enterpriseOverrideCompatible = plan.enterpriseOverrideCompatible
  detailForm.gracePeriodDays = plan.gracePeriodDays
  detailForm.trialDays = plan.trialSettings.days
  detailForm.trialRequiresPm = plan.trialSettings.requiresPaymentMethod
  detailPlanOpen.value = true
}

function openPlanBilling(plan: CatalogPlan) {
  catalogError.value = ''
  billingPlan.value = plan
  const bm = plan.billingMappings
  billingForm.billingStripe = bm.stripe ?? ''
  billingForm.billingPaddle = bm.paddle ?? ''
  billingForm.billingManual = bm.manual ?? ''
  billingPlanOpen.value = true
}

async function submitPlanBilling() {
  const plan = billingPlan.value
  if (!plan) return
  catalogBusy.value = true
  catalogError.value = ''
  const billingMappings: Record<string, string> = {}
  if (billingForm.billingStripe.trim()) billingMappings.stripe = billingForm.billingStripe.trim()
  if (billingForm.billingPaddle.trim()) billingMappings.paddle = billingForm.billingPaddle.trim()
  if (billingForm.billingManual.trim()) billingMappings.manual = billingForm.billingManual.trim()

  try {
    await $fetch(`/api/plans/${plan.id}`, {
      method: 'PATCH',
      body: {
        metadata: {
          billingMappings,
          trial: {
            days: Math.max(0, Math.round(Number(plan.trialSettings.days) || 0)),
            requiresPaymentMethod: plan.trialSettings.requiresPaymentMethod,
          },
          gracePeriodDays: Math.max(0, Math.round(Number(plan.gracePeriodDays) || 0)),
          enterpriseOverrideCompatible: plan.enterpriseOverrideCompatible,
        },
      },
    })
    billingPlanOpen.value = false
    catalogMessage.value = 'Billing settings saved.'
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    catalogError.value = e instanceof Error ? e.message : 'Could not save billing settings.'
  } finally {
    catalogBusy.value = false
  }
}

async function submitPlanDetail() {
  const plan = detailPlan.value
  if (!plan) return
  catalogBusy.value = true
  catalogError.value = ''

  try {
    await $fetch(`/api/plans/${plan.id}`, {
      method: 'PATCH',
      body: {
        name: detailForm.name.trim(),
        slug: detailForm.slug.trim(),
        edition: detailForm.edition.trim(),
        billingCycle: detailForm.billingCycle,
        priceCents: Number(detailForm.priceCents) || 0,
        currency: detailForm.currency.trim(),
        status: detailForm.status.trim(),
        trialSupported: detailForm.trialSupported,
        visibility: detailForm.visibility,
        isDefault: detailForm.isDefault,
        isRecommended: detailForm.isRecommended,
        enabledFeatureIds: [...(enabledByPlan[plan.id] ?? [])],
        metadata: {
          billingMappings: { ...plan.billingMappings },
          trial: {
            days: Math.max(0, Math.round(Number(detailForm.trialDays) || 0)),
            requiresPaymentMethod: detailForm.trialRequiresPm,
          },
          gracePeriodDays: Math.max(0, Math.round(Number(detailForm.gracePeriodDays) || 0)),
          enterpriseOverrideCompatible: detailForm.enterpriseOverrideCompatible,
        },
      },
    })
    detailPlanOpen.value = false
    catalogMessage.value = 'Plan updated.'
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    catalogError.value = e instanceof Error ? e.message : 'Could not update plan.'
  } finally {
    catalogBusy.value = false
  }
}

const limitResetIntervals = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'none', label: 'None' },
] as const

const newLimitForm = reactive({
  limitKey: '',
  resetPeriod: 'monthly',
  limitUnit: '',
  valueKind: 'number' as 'number' | 'boolean',
  enforcement: 'hard' as 'hard' | 'soft',
  notes: '',
})

const limitCreateOpen = ref(false)
const limitSearch = ref('')
const limitDetailOpen = ref(false)
const limitDetailKey = ref<string | null>(null)
const limitEditOpen = ref(false)
const limitEditTarget = ref<CatalogLimitDefinition | null>(null)
const limitEditError = ref('')
const limitEditForm = reactive({
  limitKey: '',
  resetPeriod: 'monthly',
  limitUnit: '',
  valueKind: 'number' as 'number' | 'boolean',
  enforcement: 'hard' as 'hard' | 'soft',
  notes: '',
})

const limitCellSaving = ref<string | null>(null)
const addonTogglingKey = ref<string | null>(null)
const featureDeletingId = ref<string | null>(null)

const newAddonForm = reactive({
  addonKey: '',
  displayName: '',
  notes: '',
})

const addonCreateOpen = ref(false)
const addonSearch = ref('')
const addonDetailOpen = ref(false)
const addonDetailKey = ref<string | null>(null)
const addonEditOpen = ref(false)
const addonEditTarget = ref<CatalogAddonDefinition | null>(null)
const addonEditError = ref('')
const addonEditForm = reactive({
  addonKey: '',
  displayName: '',
  notes: '',
})

const filteredLimitDefinitions = computed(() => {
  const defs = data.value?.catalog.limitDefinitions ?? []
  const q = limitSearch.value.trim().toLowerCase()
  if (!q) return defs
  return defs.filter((def) =>
    [def.limitKey, def.resetPeriod, def.limitUnit, def.valueKind, def.enforcement, def.notes].some((field) =>
      String(field).toLowerCase().includes(q),
    ),
  )
})

const filteredAddonDefinitions = computed(() => {
  const defs = data.value?.catalog.addonDefinitions ?? []
  const q = addonSearch.value.trim().toLowerCase()
  if (!q) return defs
  return defs.filter((def) =>
    [def.addonKey, def.displayName, def.notes].some((field) => String(field).toLowerCase().includes(q)),
  )
})

const limitDetailDefinition = computed(() =>
  (data.value?.catalog.limitDefinitions ?? []).find((def) => def.limitKey === limitDetailKey.value) ?? null,
)

const addonDetailDefinition = computed(() =>
  (data.value?.catalog.addonDefinitions ?? []).find((def) => def.addonKey === addonDetailKey.value) ?? null,
)

const addonDetailEnabledPlans = computed(() => {
  const key = addonDetailKey.value
  if (!key) return []
  return (data.value?.catalog.plans ?? []).filter((plan) => isAddonOn(plan.id, key))
})

function limitNumberDisplay(planId: string, limitKey: string): string {
  const cell = data.value?.catalog.limitCellsByPlan[planId]?.[limitKey]
  if (!cell) return ''
  return String(cell.limitValue)
}

/** While typing, keep local text so controlled :value is not overwritten on re-render (fixes multi-digit entry). */
const limitInputDrafts = reactive<Record<string, string>>({})

function limitInputKey(planId: string, limitKey: string) {
  return `${planId}:${limitKey}`
}

function limitInputModel(planId: string, limitKey: string): string {
  const k = limitInputKey(planId, limitKey)
  if (Object.prototype.hasOwnProperty.call(limitInputDrafts, k)) {
    const draft = limitInputDrafts[k]
    return typeof draft === 'string' ? draft : ''
  }
  return limitNumberDisplay(planId, limitKey)
}

function onLimitNumberFocus(planId: string, limitKey: string) {
  limitInputDrafts[limitInputKey(planId, limitKey)] = limitNumberDisplay(planId, limitKey)
}

function onLimitNumberInput(planId: string, limitKey: string, raw: string) {
  limitInputDrafts[limitInputKey(planId, limitKey)] = raw
}

async function onLimitNumberBlur(planId: string, def: CatalogLimitDefinition) {
  const k = limitInputKey(planId, def.limitKey)
  const draft = limitInputDrafts[k]
  const raw = typeof draft === 'string' ? draft : limitNumberDisplay(planId, def.limitKey)
  delete limitInputDrafts[k]
  await commitLimitNumber(planId, def, raw)
}

function onLimitNumberKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLInputElement | null
  target?.blur()
}

async function submitNewLimitDefinition() {
  const pid = data.value?.summary.id
  if (!pid || !newLimitForm.limitKey.trim()) {
    catalogError.value = 'Limit key is required.'
    return
  }
  catalogBusy.value = true
  catalogError.value = ''
  try {
    await $fetch(`/api/products/${encodeURIComponent(pid)}/limit-keys`, {
      method: 'POST',
      body: {
        limitKey: newLimitForm.limitKey,
        resetPeriod: newLimitForm.resetPeriod,
        limitUnit: newLimitForm.limitUnit,
        valueKind: newLimitForm.valueKind,
        enforcement: newLimitForm.enforcement,
        notes: newLimitForm.notes,
      },
    })
    newLimitForm.limitKey = ''
    newLimitForm.limitUnit = ''
    newLimitForm.notes = ''
    catalogMessage.value = 'Limit key added.'
    limitCreateOpen.value = false
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    catalogError.value = err.data?.statusMessage ?? err.message ?? 'Could not add limit.'
  } finally {
    catalogBusy.value = false
  }
}

async function afterLimitCellSave() {
  await refresh()
  await refreshNuxtData('bcp-workspace-dashboard')
}

async function commitLimitNumber(planId: string, def: CatalogLimitDefinition, raw: string) {
  const k = `${planId}:${def.limitKey}`
  limitCellSaving.value = k
  catalogError.value = ''
  const trimmed = raw.trim()
  try {
    if (trimmed === '') {
      await $fetch(`/api/plans/${planId}/limit-cell`, {
        method: 'PATCH',
        body: { limitKey: def.limitKey, limitValue: null },
      })
    } else {
      const n = Math.round(Number(trimmed))
      if (Number.isNaN(n)) {
        await refresh()
        return
      }
      await $fetch(`/api/plans/${planId}/limit-cell`, {
        method: 'PATCH',
        body: {
          limitKey: def.limitKey,
          limitValue: n,
          valueKind: 'number',
        },
      })
    }
    await afterLimitCellSave()
  } catch (e: unknown) {
    catalogError.value = e instanceof Error ? e.message : 'Could not save limit.'
    await refresh()
  } finally {
    limitCellSaving.value = null
  }
}

async function toggleLimitBoolean(planId: string, def: CatalogLimitDefinition, on: boolean) {
  const k = `${planId}:${def.limitKey}`
  limitCellSaving.value = k
  catalogError.value = ''
  try {
    await $fetch(`/api/plans/${planId}/limit-cell`, {
      method: 'PATCH',
      body: {
        limitKey: def.limitKey,
        limitValue: on ? 1 : 0,
        valueKind: 'boolean',
      },
    })
    await afterLimitCellSave()
  } catch (e: unknown) {
    catalogError.value = e instanceof Error ? e.message : 'Could not save limit.'
    await refresh()
  } finally {
    limitCellSaving.value = null
  }
}

function limitBoolChecked(planId: string, def: CatalogLimitDefinition): boolean {
  const cell = data.value?.catalog.limitCellsByPlan[planId]?.[def.limitKey]
  return Boolean(cell?.limitValue)
}

function limitCellForPlan(planId: string, limitKey: string): LimitCell | null {
  return data.value?.catalog.limitCellsByPlan[planId]?.[limitKey] ?? null
}

function openCreateLimitDialog() {
  catalogError.value = ''
  newLimitForm.limitKey = ''
  newLimitForm.resetPeriod = 'monthly'
  newLimitForm.limitUnit = ''
  newLimitForm.valueKind = 'number'
  newLimitForm.enforcement = 'hard'
  newLimitForm.notes = ''
  limitCreateOpen.value = true
}

function openLimitDetail(def: CatalogLimitDefinition) {
  limitDetailKey.value = def.limitKey
  limitDetailOpen.value = true
}

function openLimitEdit(def: CatalogLimitDefinition) {
  limitEditError.value = ''
  limitEditTarget.value = def
  limitEditForm.limitKey = def.limitKey
  limitEditForm.resetPeriod = def.resetPeriod
  limitEditForm.limitUnit = def.limitUnit
  limitEditForm.valueKind = def.valueKind
  limitEditForm.enforcement = def.enforcement
  limitEditForm.notes = def.notes
  limitEditOpen.value = true
}

async function submitLimitEdit() {
  const pid = data.value?.summary.id
  const def = limitEditTarget.value
  if (!pid || !def) return

  limitEditError.value = ''
  catalogBusy.value = true
  try {
    const result = await $fetch<{ ok: true; id: string; limitKey: string }>(
      `/api/products/${encodeURIComponent(pid)}/limit-keys/${encodeURIComponent(def.id)}`,
      {
        method: 'PATCH',
        body: {
          limitKey: limitEditForm.limitKey,
          resetPeriod: limitEditForm.resetPeriod,
          limitUnit: limitEditForm.limitUnit,
          valueKind: limitEditForm.valueKind,
          enforcement: limitEditForm.enforcement,
          notes: limitEditForm.notes,
        },
      },
    )
    if (limitDetailOpen.value && result.limitKey) {
      limitDetailKey.value = result.limitKey
    }
    limitEditOpen.value = false
    catalogMessage.value = 'Limit updated.'
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    limitEditError.value = err.data?.statusMessage ?? err.message ?? 'Could not update limit.'
  } finally {
    catalogBusy.value = false
  }
}

async function submitNewAddonDefinition() {
  const pid = data.value?.summary.id
  if (!pid || !newAddonForm.addonKey.trim()) {
    catalogError.value = 'Add-on key is required.'
    return
  }
  catalogBusy.value = true
  catalogError.value = ''
  try {
    await $fetch(`/api/products/${encodeURIComponent(pid)}/addon-keys`, {
      method: 'POST',
      body: {
        addonKey: newAddonForm.addonKey,
        displayName: newAddonForm.displayName.trim() || undefined,
        notes: newAddonForm.notes,
      },
    })
    newAddonForm.addonKey = ''
    newAddonForm.displayName = ''
    newAddonForm.notes = ''
    catalogMessage.value = 'Add-on key added.'
    addonCreateOpen.value = false
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    catalogError.value = err.data?.statusMessage ?? err.message ?? 'Could not add add-on.'
  } finally {
    catalogBusy.value = false
  }
}

function openCreateAddonDialog() {
  catalogError.value = ''
  newAddonForm.addonKey = ''
  newAddonForm.displayName = ''
  newAddonForm.notes = ''
  addonCreateOpen.value = true
}

function openAddonDetail(def: CatalogAddonDefinition) {
  addonDetailKey.value = def.addonKey
  addonDetailOpen.value = true
}

function openAddonEdit(def: CatalogAddonDefinition) {
  addonEditError.value = ''
  addonEditTarget.value = def
  addonEditForm.addonKey = def.addonKey
  addonEditForm.displayName = def.displayName
  addonEditForm.notes = def.notes
  addonEditOpen.value = true
}

async function submitAddonEdit() {
  const pid = data.value?.summary.id
  const def = addonEditTarget.value
  if (!pid || !def) return

  addonEditError.value = ''
  catalogBusy.value = true
  try {
    const result = await $fetch<{ ok: true; id: string; addonKey: string }>(
      `/api/products/${encodeURIComponent(pid)}/addon-keys/${encodeURIComponent(def.id)}`,
      {
        method: 'PATCH',
        body: {
          addonKey: addonEditForm.addonKey,
          displayName: addonEditForm.displayName,
          notes: addonEditForm.notes,
        },
      },
    )
    if (addonDetailOpen.value && result.addonKey) {
      addonDetailKey.value = result.addonKey
    }
    addonEditOpen.value = false
    catalogMessage.value = 'Add-on updated.'
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    addonEditError.value = err.data?.statusMessage ?? err.message ?? 'Could not update add-on.'
  } finally {
    catalogBusy.value = false
  }
}

function isAddonOn(planId: string, addonKey: string): boolean {
  return (data.value?.catalog.enabledAddonKeysByPlan[planId] ?? []).includes(addonKey)
}

async function toggleAddonCell(planId: string, addonKey: string, on: boolean) {
  addonTogglingKey.value = `${planId}:${addonKey}`
  catalogError.value = ''
  try {
    await $fetch(`/api/plans/${planId}/addon-cell`, {
      method: 'PATCH',
      body: { addonKey, enabled: on },
    })
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    catalogError.value = e instanceof Error ? e.message : 'Could not update add-on.'
    await refresh()
  } finally {
    addonTogglingKey.value = null
  }
}

function scrollToLimits() {
  document.getElementById('product-catalog-limits')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function scrollToAddons() {
  document.getElementById('product-catalog-addons')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function duplicatePlan(plan: CatalogPlan) {
  catalogBusy.value = true
  catalogError.value = ''
  try {
    await $fetch(`/api/plans/${plan.id}/duplicate`, { method: 'POST' })
    catalogMessage.value = 'Plan duplicated.'
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e: unknown) {
    catalogError.value = e instanceof Error ? e.message : 'Duplicate failed.'
  } finally {
    catalogBusy.value = false
  }
}

function categoryLabel(c: string) {
  return c.replaceAll('-', ' ')
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      v-if="data?.summary"
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Products', to: '/products' },
        { label: data.summary.name },
      ]"
    >
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <NuxtLink to="/products">
            <ArrowLeft class="size-4" />
            Back
          </NuxtLink>
        </Button>
        <Button variant="outline" size="sm" :disabled="pending" @click="refreshAll">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
        <Button size="sm" @click="openEdit">
          <Pencil class="size-4" />
          Edit
        </Button>
      </template>
    </ConsolePageHeader>

    <template v-if="error">
      <ConsolePageHeader
        :breadcrumbs="[
          { label: site.brand.name, to: '/' },
          { label: 'Products', to: '/products' },
          { label: 'Not found' },
        ]"
      >
        <template #actions>
          <Button variant="outline" size="sm" as-child>
            <NuxtLink to="/products">
              <ArrowLeft class="size-4" />
              Back to products
            </NuxtLink>
          </Button>
        </template>
      </ConsolePageHeader>
      <div class="space-y-2 p-6">
        <p class="font-medium text-destructive">
          Product not found
        </p>
        <p class="max-w-xl text-sm text-muted-foreground">
          Check the key in the URL. Open the product from the
          <NuxtLink to="/products" class="text-primary underline underline-offset-4">Products</NuxtLink>
          list, or use the catalog slug (for example
          <code class="rounded bg-muted px-1 py-0.5 text-xs">/products/data-verse</code>
          ) instead of the internal id. A single mistyped character in the id will 404.
        </p>
      </div>
    </template>

    <div v-else-if="data" class="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6">
      <Card class="shrink-0 rounded-3xl border-border/70 bg-card/90 shadow-sm backdrop-blur-sm">
        <CardHeader class="pb-2">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="space-y-2">
              <CardTitle class="text-2xl font-semibold tracking-tight">
                {{ data.summary.name }}
              </CardTitle>
              <CardDescription class="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{{ data.summary.slug }}</Badge>
                <Badge :variant="statusVariant(data.summary.status)" class="capitalize">
                  {{ data.summary.status }}
                </Badge>
                <span class="text-muted-foreground">{{ data.summary.productTypeLabel }}</span>
                <span class="text-muted-foreground">·</span>
                <span class="text-muted-foreground">{{ data.summary.defaultBillingModeLabel }}</span>
              </CardDescription>
              <p class="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {{ data.summary.description }}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent class="pt-0">
          <Tabs default-value="overview" class="w-full">
            <TabsList class="mb-6 inline-flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-muted/40 p-1 sm:w-auto">
              <TabsTrigger value="overview" class="rounded-lg px-4 py-2 data-[state=active]:shadow-sm">
                Overview
              </TabsTrigger>
              <TabsTrigger value="catalog" class="rounded-lg px-4 py-2 data-[state=active]:shadow-sm">
                Catalog
                <span class="ml-1.5 tabular-nums text-muted-foreground">
                  ({{ data.catalog.plans.length }}×{{ data.catalog.features.length }})
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" class="mt-0 outline-none">
              <div class="grid gap-6 lg:grid-cols-2">
                <div class="rounded-2xl border border-border/60 bg-card/50 p-5">
                  <h3 class="text-sm font-medium">
                    Catalog
                  </h3>
                  <p class="mt-1 text-xs text-muted-foreground">
                    Identity, lifecycle, and delivery flags for this application.
                  </p>
                  <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt class="text-muted-foreground">
                        Plans
                      </dt>
                      <dd class="font-medium tabular-nums">
                        {{ data.summary.planCount }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted-foreground">
                        Customers using
                      </dt>
                      <dd class="font-medium tabular-nums">
                        {{ data.summary.tenantCount }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted-foreground">
                        Created
                      </dt>
                      <dd class="font-medium">
                        {{ formatDate(data.summary.createdAt) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted-foreground">
                        Updated
                      </dt>
                      <dd class="font-medium">
                        {{ data.summary.updatedAt ? formatDate(data.summary.updatedAt) : '—' }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted-foreground">
                        Offline licenses
                      </dt>
                      <dd class="font-medium">
                        {{ data.summary.offlineLicensesSupported ? 'Supported' : 'Not supported' }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted-foreground">
                        Activations
                      </dt>
                      <dd class="font-medium">
                        {{ data.summary.activationsRequired ? 'Required' : 'Optional' }}
                      </dd>
                    </div>
                    <div class="sm:col-span-2">
                      <dt class="text-muted-foreground">
                        Usage tracking
                      </dt>
                      <dd class="font-medium">
                        {{ data.summary.usageTrackingEnabled ? 'Enabled' : 'Disabled' }}
                      </dd>
                    </div>
                  </dl>
                  <p class="mt-4 text-xs text-muted-foreground">
                    Manage sellable modules on the
                    <span class="font-medium text-foreground">Catalog</span>
                    tab; staged rollouts and kill switches on
                    <span class="font-medium text-foreground">Feature flags</span>.
                  </p>
                  <div v-if="data.summary.extraDetails?.trim()" class="mt-5 border-t border-border/50 pt-5">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Extra details
                    </p>
                    <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                      {{ data.summary.extraDetails }}
                    </p>
                  </div>
                </div>

                <div class="rounded-2xl border border-border/60 bg-card/50 p-5">
                  <h3 class="text-sm font-medium">
                    Subscription &amp; licensing
                  </h3>
                  <p class="mt-1 text-xs text-muted-foreground">
                    Footprint for plans tied to this product (subscriptions, licenses, activations).
                  </p>
                  <div class="mt-4 space-y-3 text-sm">
                    <div class="flex justify-between gap-2">
                      <span class="text-muted-foreground">Active subs</span>
                      <span class="font-medium tabular-nums">{{ data.subscriptionStats.activeSubscriptions }}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-muted-foreground">Trialing</span>
                      <span class="font-medium tabular-nums">{{ data.subscriptionStats.trialingSubscriptions }}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-muted-foreground">Total subs</span>
                      <span class="font-medium tabular-nums">{{ data.subscriptionStats.totalSubscriptions }}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-muted-foreground">MRR (normalized)</span>
                      <span class="font-medium tabular-nums">{{ formatCurrency(data.subscriptionStats.mrrCents, 'USD') }}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-muted-foreground">Licenses</span>
                      <span class="font-medium tabular-nums">{{ data.subscriptionStats.licensesTotal }}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-muted-foreground">Activations</span>
                      <span class="font-medium tabular-nums">{{ data.subscriptionStats.activeActivations }}</span>
                    </div>
                    <div v-if="Object.keys(data.subscriptionStats.licensesByStatus).length" class="border-t border-border/50 pt-3 text-xs text-muted-foreground">
                      <p class="font-medium text-foreground">
                        Licenses by status
                      </p>
                      <ul class="mt-2 space-y-1">
                        <li v-for="(n, st) in data.subscriptionStats.licensesByStatus" :key="st" class="flex justify-between">
                          <span class="capitalize">{{ st }}</span>
                          <span>{{ n }}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="catalog" class="mt-0 outline-none space-y-4">
              <p v-if="catalogMessage" class="text-sm text-emerald-700 dark:text-emerald-400">
                {{ catalogMessage }}
              </p>
              <p v-if="catalogError" class="text-sm text-destructive">
                {{ catalogError }}
              </p>

              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold tracking-tight">
                    Features and plans
                  </h3>
                  <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Plans are columns; features are rows. Toggle a cell to include or remove that capability from the plan’s
                    <span class="font-medium text-foreground">plan_features</span> mapping.
                  </p>
                </div>
                <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <Button size="sm" variant="outline" :disabled="catalogBusy" @click="openCreateFeature">
                    <Plus class="size-4" />
                    New feature
                  </Button>
                  <Button size="sm" :disabled="catalogBusy" @click="openCreatePlan">
                    <Plus class="size-4" />
                    New plan
                  </Button>
                </div>
              </div>

              <div v-if="!data.catalog.plans.length" class="rounded-xl border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                No plans for this product yet. Create a plan to start mapping features.
              </div>

              <div v-else-if="!data.catalog.features.length" class="rounded-xl border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                No features in this catalog. Add features scoped to this product, then enable them per plan.
              </div>

              <div v-else class="overflow-hidden rounded-xl border border-border/60">
                <ScrollArea class="max-h-[min(70vh,720px)] w-full">
                  <table class="w-max min-w-full border-collapse text-sm">
                    <thead>
                      <tr class="border-b border-border/60 bg-muted/30">
                        <th
                          :class="PLAN_STICKY_CLASS"
                        >
                          Feature
                        </th>
                        <th
                          v-for="(plan, index) in data.catalog.plans"
                          :key="plan.id"
                          :class="[PLAN_COLUMN_CLASS, planToneClass(index), 'border-l border-border/40 px-2 py-2 align-bottom']"
                        >
                          <div class="relative flex min-h-[108px] flex-col items-center justify-center gap-2 px-10 text-center">
                            <div class="flex flex-col items-center gap-1">
                              <div class="flex flex-wrap items-center justify-center gap-1.5">
                                <span class="text-sm font-semibold leading-tight">{{ plan.name }}</span>
                              </div>
                              <div class="flex flex-wrap items-center justify-center gap-1">
                                <Badge v-if="plan.isDefault" variant="outline" class="h-5 px-1.5 text-[10px]">
                                  Default
                                </Badge>
                                <Badge v-if="plan.isRecommended" variant="secondary" class="h-5 px-1.5 text-[10px]">
                                  <Star class="mr-0.5 size-3" />
                                  Recommended
                                </Badge>
                              </div>
                            </div>
                            <div class="text-[11px] font-medium tabular-nums text-foreground">
                              {{ formatCurrency(plan.priceCents, plan.currency) }}
                            </div>
                            <Badge :variant="statusVariant(plan.status)" class="h-5 w-fit px-1.5 text-[10px] capitalize">
                              {{ plan.status }}
                            </Badge>
                            <div class="absolute right-1 top-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger as-child>
                                  <Button variant="ghost" size="icon" class="size-7 shrink-0" :disabled="catalogBusy">
                                    <MoreHorizontal class="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" class="w-52">
                                  <DropdownMenuItem @click="openPlanDetail(plan)">
                                    Edit plan
                                  </DropdownMenuItem>
                                  <DropdownMenuItem @click="openPlanBilling(plan)">
                                    Manage plan billing
                                  </DropdownMenuItem>
                                  <DropdownMenuItem @click="scrollToLimits">
                                    Jump to limits matrix
                                  </DropdownMenuItem>
                                  <DropdownMenuItem @click="scrollToAddons">
                                    Jump to add-ons matrix
                                  </DropdownMenuItem>
                                  <DropdownMenuItem @click="duplicatePlan(plan)">
                                    <Copy class="mr-2 size-4" />
                                    Duplicate
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem class="text-destructive" @click="requestArchivePlan(plan)">
                                    Archive
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="feat in data.catalog.features"
                        :key="feat.id"
                        class="border-b border-border/40 hover:bg-muted/20"
                      >
                        <td
                          :class="ROW_STICKY_CLASS"
                        >
                          <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0 flex-1">
                              <div class="font-medium leading-tight">
                                {{ feat.name }}
                              </div>
                              <div class="mt-0.5 flex flex-wrap items-center gap-1">
                                <Badge variant="outline" class="font-mono text-[10px]">{{ feat.featureKey }}</Badge>
                                <span class="text-[11px] capitalize text-muted-foreground">{{ categoryLabel(feat.category) }}</span>
                              </div>
                              <div v-if="feat.status === 'archived'" class="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                                Archived — matrix frozen
                              </div>
                            </div>
                            <div class="flex shrink-0 flex-wrap justify-end gap-1.5">
                              <Button variant="outline" size="sm" class="h-7 px-2 text-xs" @click="openFeatureDetail(feat)">
                                Detail
                              </Button>
                              <Button variant="outline" size="sm" class="h-7 px-2 text-xs" @click="openFeatureEdit(feat)">
                                Edit
                              </Button>
                              <Button
                                v-if="canDeleteCatalogFeature(feat)"
                                variant="ghost"
                                size="icon"
                                class="size-7 shrink-0 text-destructive hover:text-destructive"
                                :disabled="catalogBusy || featureDeletingId === feat.id"
                                title="Delete feature from this product"
                                @click="requestDeleteCatalogFeature(feat)"
                              >
                                <Trash2 class="size-4" />
                              </Button>
                            </div>
                          </div>
                        </td>
                        <td
                          v-for="(plan, index) in data.catalog.plans"
                          :key="`${feat.id}-${plan.id}`"
                          :class="[PLAN_COLUMN_CLASS, planToneClass(index), 'border-l border-border/40 px-2 py-2 text-center align-middle']"
                        >
                          <div class="flex justify-center">
                            <Checkbox
                              :disabled="feat.status === 'archived' || togglingKey === `${plan.id}:${feat.id}` || catalogBusy"
                              :model-value="isCellOn(plan.id, feat.id)"
                              @update:model-value="(v) => toggleCell(plan.id, feat.id, v === true)"
                            />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>

              <div
                id="product-catalog-limits"
                class="scroll-mt-24 space-y-4 border-t border-border/50 pt-8"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-semibold tracking-tight">
                      Limits
                    </h3>
                    <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Add a limit key from a modal, then inspect its per-plan values in a detail dialog. The matrix stays aligned with the same plan columns as the other sections.
                    </p>
                  </div>
                  <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <div class="relative w-full sm:max-w-xs">
                      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input v-model="limitSearch" class="pl-9" placeholder="Search limits" />
                    </div>
                    <Button variant="outline" size="sm" :disabled="pending" @click="refreshAll">
                      <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
                      Refresh
                    </Button>
                    <Button size="sm" :disabled="catalogBusy || !data.catalog.plans.length" @click="openCreateLimitDialog">
                      <Plus class="size-4" />
                      Add limit
                    </Button>
                  </div>
                </div>
                <p v-if="!data.catalog.plans.length" class="text-sm text-muted-foreground">
                  Create at least one plan before adding limit keys.
                </p>

                <div
                  v-else-if="!filteredLimitDefinitions.length"
                  class="rounded-xl border border-dashed border-border/70 bg-muted/15 p-6 text-center text-sm text-muted-foreground"
                >
                  No limit keys yet. Use the button above to add one (for example
                  <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">max_users</code>
                  ).
                </div>

                <div v-else class="overflow-hidden rounded-xl border border-border/60">
                  <ScrollArea class="max-h-[min(56vh,520px)] w-full">
                    <table class="w-max min-w-full border-collapse text-sm">
                      <thead>
                        <tr class="border-b border-border/60 bg-muted/30">
                          <th :class="LIMIT_STICKY_CLASS">
                            Limit
                          </th>
                          <th
                            v-for="(plan, index) in data.catalog.plans"
                            :key="`lim-${plan.id}`"
                            :class="[PLAN_COLUMN_CLASS, planToneClass(index), 'border-l border-border/40 px-2 py-2 align-bottom text-center']"
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
                          v-for="def in filteredLimitDefinitions"
                          :key="def.id"
                          class="border-b border-border/40 hover:bg-muted/15"
                        >
                          <td
                            :class="ROW_STICKY_CLASS"
                          >
                          <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                              <div class="font-mono text-sm font-medium">
                                {{ def.limitKey }}
                              </div>
                                <div class="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                                  <span>{{ def.resetPeriod }}</span>
                                  <span v-if="def.limitUnit">· {{ def.limitUnit }}</span>
                                  <span>· {{ def.valueKind }}</span>
                                  <span>· {{ def.enforcement }}</span>
                                </div>
                                <p v-if="def.notes?.trim()" class="mt-1 text-[11px] leading-snug text-muted-foreground">
                                  {{ def.notes }}
                                </p>
                              </div>
                              <div class="flex shrink-0 flex-wrap justify-end gap-1.5">
                                <Button variant="outline" size="sm" class="h-7 px-2 text-xs" @click="openLimitDetail(def)">
                                  Detail
                                </Button>
                                <Button variant="outline" size="sm" class="h-7 px-2 text-xs" @click="openLimitEdit(def)">
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  class="size-7 shrink-0 text-destructive hover:text-destructive"
                                  :disabled="catalogBusy"
                                  title="Remove limit from product"
                                  @click="requestDeleteLimitDefinition(def)"
                                >
                                  <Trash2 class="size-4" />
                                </Button>
                              </div>
                            </div>
                          </td>
                          <td
                            v-for="(plan, index) in data.catalog.plans"
                            :key="`${def.id}-${plan.id}`"
                            :class="[PLAN_COLUMN_CLASS, planToneClass(index), 'border-l border-border/40 px-2 py-2 align-middle']"
                          >
                            <div v-if="def.valueKind === 'boolean'" class="flex justify-center">
                              <Checkbox
                                :disabled="catalogBusy || limitCellSaving === `${plan.id}:${def.limitKey}`"
                                :model-value="limitBoolChecked(plan.id, def)"
                                @update:model-value="(v) => toggleLimitBoolean(plan.id, def, v === true)"
                              />
                            </div>
                            <div v-else class="flex justify-center">
                              <Input
                                class="h-8 w-24 text-center tabular-nums font-mono text-sm"
                                type="text"
                                inputmode="numeric"
                                :disabled="catalogBusy || limitCellSaving === `${plan.id}:${def.limitKey}`"
                                :model-value="limitInputModel(plan.id, def.limitKey)"
                                placeholder="—"
                                @focus="onLimitNumberFocus(plan.id, def.limitKey)"
                                @update:model-value="(v) => onLimitNumberInput(plan.id, def.limitKey, String(v ?? ''))"
                                @blur="onLimitNumberBlur(plan.id, def)"
                                @keydown.enter="onLimitNumberKeydown"
                              />
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>

                <Dialog v-model:open="limitCreateOpen">
                  <DialogContent class="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add limit</DialogTitle>
                      <DialogDescription>
                        Define a new limit for <span class="font-medium text-foreground">{{ data.summary.name }}</span>.
                      </DialogDescription>
                    </DialogHeader>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div class="space-y-2 sm:col-span-2">
                        <Label for="new-limit-key">Limit key</Label>
                        <Input
                          id="new-limit-key"
                          v-model="newLimitForm.limitKey"
                          placeholder="e.g. max_users"
                          class="font-mono text-sm"
                          autocomplete="off"
                        />
                      </div>
                      <div class="space-y-2">
                        <Label>Reset period</Label>
                        <NativeSelect v-model="newLimitForm.resetPeriod">
                          <NativeSelectOption v-for="r in limitResetIntervals" :key="r.value" :value="r.value">
                            {{ r.label }}
                          </NativeSelectOption>
                        </NativeSelect>
                      </div>
                      <div class="space-y-2">
                        <Label for="new-limit-unit">Unit</Label>
                        <Input id="new-limit-unit" v-model="newLimitForm.limitUnit" placeholder="users" class="text-sm" />
                      </div>
                      <div class="space-y-2">
                        <Label>Value kind</Label>
                        <NativeSelect v-model="newLimitForm.valueKind">
                          <NativeSelectOption value="number">Number</NativeSelectOption>
                          <NativeSelectOption value="boolean">Boolean</NativeSelectOption>
                        </NativeSelect>
                      </div>
                      <div class="space-y-2">
                        <Label>Enforcement</Label>
                        <NativeSelect v-model="newLimitForm.enforcement">
                          <NativeSelectOption value="hard">Hard</NativeSelectOption>
                          <NativeSelectOption value="soft">Soft</NativeSelectOption>
                        </NativeSelect>
                      </div>
                      <div class="space-y-2 sm:col-span-2">
                        <Label for="new-limit-notes">Notes (optional)</Label>
                        <Textarea
                          id="new-limit-notes"
                          v-model="newLimitForm.notes"
                          placeholder="Shown as default for new cells"
                          class="min-h-[88px] text-sm"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" @click="limitCreateOpen = false">
                        Cancel
                      </Button>
                      <Button
                        :disabled="catalogBusy || !newLimitForm.limitKey.trim() || !data.catalog.plans.length"
                        @click="submitNewLimitDefinition"
                      >
                        Create limit
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog v-model:open="limitDetailOpen">
                  <DialogContent class="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{{ limitDetailDefinition?.limitKey ?? 'Limit detail' }}</DialogTitle>
                      <DialogDescription v-if="limitDetailDefinition">
                        Per-plan values and metadata for this limit.
                      </DialogDescription>
                    </DialogHeader>
                    <div v-if="limitDetailDefinition" class="space-y-6">
                      <div class="grid gap-3 text-sm sm:grid-cols-2">
                        <div><span class="text-muted-foreground">Reset period:</span> {{ limitDetailDefinition.resetPeriod }}</div>
                        <div><span class="text-muted-foreground">Unit:</span> {{ limitDetailDefinition.limitUnit || '—' }}</div>
                        <div><span class="text-muted-foreground">Value kind:</span> {{ limitDetailDefinition.valueKind }}</div>
                        <div><span class="text-muted-foreground">Enforcement:</span> {{ limitDetailDefinition.enforcement }}</div>
                        <div class="sm:col-span-2"><span class="text-muted-foreground">Notes:</span> {{ limitDetailDefinition.notes || '—' }}</div>
                      </div>
                      <div>
                        <h4 class="mb-2 text-sm font-medium">
                          Plan values
                        </h4>
                        <div class="overflow-hidden rounded-lg border border-border/60">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Plan</TableHead>
                                <TableHead>Value</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <TableRow v-for="plan in data.catalog.plans" :key="`limit-detail-${plan.id}`">
                                <TableCell class="font-medium">
                                  {{ plan.name }}
                                  <div class="text-xs text-muted-foreground">{{ plan.slug }}</div>
                                </TableCell>
                                <TableCell>
                                  <code class="text-xs">
                                    {{ limitCellForPlan(plan.id, limitDetailDefinition.limitKey)?.limitValue ?? '—' }}
                                  </code>
                                </TableCell>
                                <TableCell>{{ limitDetailDefinition.limitUnit || '—' }}</TableCell>
                                <TableCell class="capitalize">
                                  {{ limitCellForPlan(plan.id, limitDetailDefinition.limitKey) ? 'set' : 'unset' }}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" @click="limitDetailOpen = false">
                        Close
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog v-model:open="limitEditOpen">
                  <DialogContent class="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit limit</DialogTitle>
                      <DialogDescription v-if="limitEditTarget">
                        Update the definition used by the plan matrix for this product.
                      </DialogDescription>
                    </DialogHeader>
                    <div class="grid gap-4 py-2">
                      <p v-if="limitEditError" class="text-sm text-destructive">
                        {{ limitEditError }}
                      </p>
                      <div class="space-y-2 sm:col-span-2">
                        <Label for="edit-limit-key">Limit key</Label>
                        <Input
                          id="edit-limit-key"
                          v-model="limitEditForm.limitKey"
                          placeholder="e.g. max_users"
                          class="font-mono text-sm"
                          autocomplete="off"
                        />
                      </div>
                      <div class="grid gap-4 sm:grid-cols-2">
                        <div class="space-y-2">
                          <Label>Reset period</Label>
                          <NativeSelect v-model="limitEditForm.resetPeriod">
                            <NativeSelectOption v-for="r in limitResetIntervals" :key="r.value" :value="r.value">
                              {{ r.label }}
                            </NativeSelectOption>
                          </NativeSelect>
                        </div>
                        <div class="space-y-2">
                          <Label for="edit-limit-unit">Unit</Label>
                          <Input id="edit-limit-unit" v-model="limitEditForm.limitUnit" placeholder="users" class="text-sm" />
                        </div>
                      </div>
                      <div class="grid gap-4 sm:grid-cols-2">
                        <div class="space-y-2">
                          <Label>Value kind</Label>
                          <NativeSelect v-model="limitEditForm.valueKind">
                            <NativeSelectOption value="number">Number</NativeSelectOption>
                            <NativeSelectOption value="boolean">Boolean</NativeSelectOption>
                          </NativeSelect>
                        </div>
                        <div class="space-y-2">
                          <Label>Enforcement</Label>
                          <NativeSelect v-model="limitEditForm.enforcement">
                            <NativeSelectOption value="hard">Hard</NativeSelectOption>
                            <NativeSelectOption value="soft">Soft</NativeSelectOption>
                          </NativeSelect>
                        </div>
                      </div>
                      <div class="space-y-2">
                        <Label for="edit-limit-notes">Notes (optional)</Label>
                        <Textarea
                          id="edit-limit-notes"
                          v-model="limitEditForm.notes"
                          placeholder="Shown as default for new cells"
                          class="min-h-[88px] text-sm"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" :disabled="catalogBusy" @click="limitEditOpen = false">
                        Cancel
                      </Button>
                      <Button
                        :disabled="catalogBusy || !limitEditForm.limitKey.trim()"
                        @click="submitLimitEdit"
                      >
                        {{ catalogBusy ? 'Saving…' : 'Save limit' }}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

                <div
                id="product-catalog-addons"
                class="scroll-mt-24 space-y-4 border-t border-border/50 pt-8"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-semibold tracking-tight">
                      Add-ons
                    </h3>
                    <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Add and inspect add-on keys from modals. The matrix stays aligned with the same plan columns as limits and feature flags.
                    </p>
                  </div>
                  <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <div class="relative w-full sm:max-w-xs">
                      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input v-model="addonSearch" class="pl-9" placeholder="Search add-ons" />
                    </div>
                    <Button variant="outline" size="sm" :disabled="pending" @click="refreshAll">
                      <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
                      Refresh
                    </Button>
                    <Button size="sm" :disabled="catalogBusy || !data.catalog.plans.length" @click="openCreateAddonDialog">
                      <Plus class="size-4" />
                      Add add-on
                    </Button>
                  </div>
                </div>
                <p v-if="!data.catalog.plans.length" class="text-sm text-muted-foreground">
                  Create at least one plan before adding add-on keys.
                </p>

                <div
                  v-else-if="!filteredAddonDefinitions.length"
                  class="rounded-xl border border-dashed border-border/70 bg-muted/15 p-6 text-center text-sm text-muted-foreground"
                >
                  No add-on keys yet. Use the button above to add one.
                </div>

                <div v-else class="overflow-hidden rounded-xl border border-border/60">
                  <ScrollArea class="max-h-[min(56vh,520px)] w-full">
                    <table class="w-max min-w-full border-collapse text-sm">
                      <thead>
                        <tr class="border-b border-border/60 bg-muted/30">
                          <th
                            :class="ADDON_STICKY_CLASS"
                          >
                            Add-on
                          </th>
                          <th
                            v-for="(plan, index) in data.catalog.plans"
                            :key="`addon-${plan.id}`"
                            :class="[PLAN_COLUMN_CLASS, planToneClass(index), 'border-l border-border/40 px-2 py-2 align-bottom text-center']"
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
                          v-for="def in filteredAddonDefinitions"
                          :key="def.id"
                          class="border-b border-border/40 hover:bg-muted/15"
                        >
                          <td
                            :class="ROW_STICKY_CLASS"
                          >
                          <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                              <div class="font-mono text-sm font-medium">
                                {{ def.addonKey }}
                              </div>
                                <div v-if="def.displayName?.trim()" class="mt-0.5 text-[11px] text-muted-foreground">
                                  {{ def.displayName }}
                                </div>
                                <p v-if="def.notes?.trim()" class="mt-1 text-[11px] leading-snug text-muted-foreground">
                                  {{ def.notes }}
                                </p>
                              </div>
                              <div class="flex shrink-0 flex-wrap justify-end gap-1.5">
                                <Button variant="outline" size="sm" class="h-7 px-2 text-xs" @click="openAddonDetail(def)">
                                  Detail
                                </Button>
                                <Button variant="outline" size="sm" class="h-7 px-2 text-xs" @click="openAddonEdit(def)">
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  class="size-7 shrink-0 text-destructive hover:text-destructive"
                                  :disabled="catalogBusy"
                                  title="Remove add-on from product"
                                  @click="requestDeleteAddonDefinition(def)"
                                >
                                  <Trash2 class="size-4" />
                                </Button>
                              </div>
                            </div>
                          </td>
                          <td
                            v-for="(plan, index) in data.catalog.plans"
                            :key="`${def.id}-${plan.id}`"
                            :class="[PLAN_COLUMN_CLASS, planToneClass(index), 'border-l border-border/40 px-2 py-2 text-center align-middle']"
                          >
                            <div class="flex justify-center">
                              <Checkbox
                                :disabled="catalogBusy || addonTogglingKey === `${plan.id}:${def.addonKey}`"
                                :model-value="isAddonOn(plan.id, def.addonKey)"
                                @update:model-value="(v) => toggleAddonCell(plan.id, def.addonKey, v === true)"
                              />
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>

                <Dialog v-model:open="addonCreateOpen">
                  <DialogContent class="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add add-on</DialogTitle>
                      <DialogDescription>
                        Define a new add-on for <span class="font-medium text-foreground">{{ data.summary.name }}</span>.
                      </DialogDescription>
                    </DialogHeader>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div class="space-y-2 sm:col-span-2">
                        <Label for="new-addon-key">Add-on key</Label>
                        <Input
                          id="new-addon-key"
                          v-model="newAddonForm.addonKey"
                          placeholder="e.g. extra_seats"
                          class="font-mono text-sm"
                          autocomplete="off"
                        />
                      </div>
                      <div class="space-y-2 sm:col-span-2">
                        <Label for="new-addon-display">Display name (optional)</Label>
                        <Input id="new-addon-display" v-model="newAddonForm.displayName" placeholder="Extra seats" class="text-sm" />
                      </div>
                      <div class="space-y-2 sm:col-span-2">
                        <Label for="new-addon-notes">Notes (optional)</Label>
                        <Textarea
                          id="new-addon-notes"
                          v-model="newAddonForm.notes"
                          class="min-h-[88px] text-sm"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" @click="addonCreateOpen = false">
                        Cancel
                      </Button>
                      <Button
                        :disabled="catalogBusy || !newAddonForm.addonKey.trim() || !data.catalog.plans.length"
                        @click="submitNewAddonDefinition"
                      >
                        Create add-on
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog v-model:open="addonDetailOpen">
                  <DialogContent class="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{{ addonDetailDefinition?.addonKey ?? 'Add-on detail' }}</DialogTitle>
                      <DialogDescription v-if="addonDetailDefinition">
                        Definition and per-plan availability for this add-on.
                      </DialogDescription>
                    </DialogHeader>
                    <div v-if="addonDetailDefinition" class="space-y-6">
                      <div class="grid gap-3 text-sm sm:grid-cols-2">
                        <div><span class="text-muted-foreground">Display name:</span> {{ addonDetailDefinition.displayName || '—' }}</div>
                        <div><span class="text-muted-foreground">Notes:</span> {{ addonDetailDefinition.notes || '—' }}</div>
                      </div>
                      <div>
                        <h4 class="mb-2 text-sm font-medium">
                          Enabled plans
                        </h4>
                        <div class="flex flex-wrap gap-2">
                          <Badge
                            v-for="plan in addonDetailEnabledPlans"
                            :key="`addon-detail-${plan.id}`"
                            variant="outline"
                            class="text-[11px]"
                          >
                            {{ plan.name }}
                          </Badge>
                          <p v-if="!addonDetailEnabledPlans.length" class="text-sm text-muted-foreground">
                            No plans enabled yet.
                          </p>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" @click="addonDetailOpen = false">
                        Close
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog v-model:open="addonEditOpen">
                  <DialogContent class="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit add-on</DialogTitle>
                      <DialogDescription v-if="addonEditTarget">
                        Update the add-on definition used by the product matrix.
                      </DialogDescription>
                    </DialogHeader>
                    <div class="grid gap-4 py-2">
                      <p v-if="addonEditError" class="text-sm text-destructive">
                        {{ addonEditError }}
                      </p>
                      <div class="space-y-2 sm:col-span-2">
                        <Label for="edit-addon-key">Add-on key</Label>
                        <Input
                          id="edit-addon-key"
                          v-model="addonEditForm.addonKey"
                          placeholder="e.g. extra_seats"
                          class="font-mono text-sm"
                          autocomplete="off"
                        />
                      </div>
                      <div class="space-y-2 sm:col-span-2">
                        <Label for="edit-addon-display">Display name (optional)</Label>
                        <Input id="edit-addon-display" v-model="addonEditForm.displayName" placeholder="Extra seats" class="text-sm" />
                      </div>
                      <div class="space-y-2 sm:col-span-2">
                        <Label for="edit-addon-notes">Notes (optional)</Label>
                        <Textarea
                          id="edit-addon-notes"
                          v-model="addonEditForm.notes"
                          class="min-h-[88px] text-sm"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" :disabled="catalogBusy" @click="addonEditOpen = false">
                        Cancel
                      </Button>
                      <Button
                        :disabled="catalogBusy || !addonEditForm.addonKey.trim()"
                        @click="submitAddonEdit"
                      >
                        {{ catalogBusy ? 'Saving…' : 'Save add-on' }}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div v-if="data.catalog.plans.length && data.catalog.features.length" class="rounded-lg border border-border/50 bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
                <span class="font-medium text-foreground">Tip:</span>
                Feature checkboxes control which capabilities each plan includes. Limits and add-ons use the matrices below. Use Manage plan billing (plan ⋮) for Stripe, Paddle, or manual price references.
                Features you create on this product can be deleted from the row (trash); shared catalog rows that only appear because they are on a plan stay read-only here so other products are not affected.
              </div>

              <div
                id="product-catalog-feature-flags"
                class="scroll-mt-24 space-y-4 border-t border-border/50 pt-8"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-semibold tracking-tight">
                      Feature flags
                    </h3>
                    <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Runtime rollout flags sit at the end of the catalog so you can manage them in the same plan flow. Assign coverage directly in the matrix, then inspect the flag details in the modal.
                    </p>
                  </div>
                </div>
                <ProductFeatureFlagsPanel
                  ref="featureFlagsPanel"
                  :product-id="data.summary.id"
                  :product-name="data.summary.name"
                  :plans="data.catalog.plans"
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>

    <Dialog v-model:open="editOpen">
      <DialogContent class="max-h-[min(90vh,840px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
          <DialogDescription>Update catalog fields for this application.</DialogDescription>
        </DialogHeader>
        <ProductFormFields v-model="editForm" id-prefix="detail" :disabled="editSaving" />
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" :disabled="editSaving" @click="editOpen = false">
            Cancel
          </Button>
          <Button :disabled="editSaving || !editForm.name.trim()" @click="submitEdit">
            {{ editSaving ? 'Saving…' : 'Save changes' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="createFeatureOpen">
      <DialogContent class="max-h-[min(90vh,840px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New feature</DialogTitle>
          <DialogDescription>
            Creates a catalog feature for {{ data?.summary.name }}. Assign it to plans using the matrix.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-2">
          <p v-if="featureFormError" class="text-sm text-destructive">
            {{ featureFormError }}
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label for="pc-f-name">Name</Label>
              <Input id="pc-f-name" v-model="featureForm.name" autocomplete="off" />
            </div>
            <div class="grid gap-2">
              <Label for="pc-f-key">Key (optional)</Label>
              <Input id="pc-f-key" v-model="featureForm.featureKey" placeholder="snake_case" autocomplete="off" />
            </div>
          </div>
          <div class="grid gap-2">
            <Label for="pc-f-desc">Description</Label>
            <Textarea id="pc-f-desc" v-model="featureForm.description" rows="3" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label>Category</Label>
              <Select v-model="featureForm.category">
                <SelectTrigger class="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="c in FEATURE_CATEGORY_ORDER" :key="c" :value="c" class="capitalize">
                    {{ c.replaceAll('-', ' ') }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-2">
              <Label>Type</Label>
              <Select v-model="featureForm.featureType">
                <SelectTrigger class="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="t in FEATURE_TYPE_OPTIONS" :key="t" :value="t" class="capitalize">
                    {{ t }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="grid gap-2">
            <Label>Visibility</Label>
            <Select v-model="featureForm.visibility">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="v in VISIBILITY_OPTIONS" :key="v" :value="v" class="capitalize">
                  {{ v }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex flex-wrap gap-6">
            <div class="flex items-center gap-2 text-sm">
              <Checkbox id="pc-f-bill" v-model="featureForm.isBillable" />
              <Label for="pc-f-bill" class="cursor-pointer font-normal">Billable</Label>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <Checkbox id="pc-f-def" v-model="featureForm.defaultEnabled" />
              <Label for="pc-f-def" class="cursor-pointer font-normal">Default enabled</Label>
            </div>
          </div>
        </div>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" :disabled="catalogBusy" @click="createFeatureOpen = false">
            Cancel
          </Button>
          <Button :disabled="catalogBusy || !featureForm.name.trim()" @click="submitCreateFeature">
            {{ catalogBusy ? 'Saving…' : 'Create feature' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="featureDetailOpen">
      <DialogContent class="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ featureDetail?.name ?? 'Feature detail' }}</DialogTitle>
          <DialogDescription v-if="featureDetail">
            Read-only details for this catalog feature. Coverage is shown as the plans that currently include it.
          </DialogDescription>
        </DialogHeader>
        <div v-if="featureDetail" class="space-y-6 py-2">
          <div class="grid gap-3 text-sm sm:grid-cols-2">
            <div><span class="text-muted-foreground">Key:</span> {{ featureDetail.featureKey }}</div>
            <div><span class="text-muted-foreground">Category:</span> {{ categoryLabel(featureDetail.category) }}</div>
            <div><span class="text-muted-foreground">Type:</span> {{ featureDetail.featureType }}</div>
            <div><span class="text-muted-foreground">Status:</span> <span class="capitalize">{{ featureDetail.status }}</span></div>
            <div><span class="text-muted-foreground">Visibility:</span> <span class="capitalize">{{ featureDetail.visibility }}</span></div>
            <div><span class="text-muted-foreground">Billable:</span> {{ featureDetail.isBillable ? 'Yes' : 'No' }}</div>
            <div><span class="text-muted-foreground">Default enabled:</span> {{ featureDetail.defaultEnabled ? 'Yes' : 'No' }}</div>
            <div><span class="text-muted-foreground">Ownership:</span> {{ featureDetail.productId === data?.summary.id ? 'Product-owned' : 'Shared' }}</div>
          </div>
          <div v-if="featureDetail.description?.trim()" class="rounded-lg border border-border/60 bg-muted/20 p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {{ featureDetail.description }}
            </p>
          </div>
          <div>
            <div class="mb-2 flex items-center justify-between gap-3">
              <h4 class="text-sm font-medium">Plan coverage</h4>
              <span class="text-xs text-muted-foreground">{{ featureDetailPlans.length }} of {{ data?.catalog.plans.length ?? 0 }} plans</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <Badge v-for="plan in featureDetailPlans" :key="plan.id" variant="secondary" class="font-normal">
                {{ plan.name }}
              </Badge>
              <span v-if="!featureDetailPlans.length" class="text-sm text-muted-foreground">No plans currently include this feature.</span>
            </div>
          </div>
        </div>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" :disabled="catalogBusy" @click="featureDetailOpen = false">
            Close
          </Button>
          <Button :disabled="catalogBusy || !featureDetail" @click="featureDetail && openFeatureEdit(featureDetail)">
            Edit feature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="featureEditOpen">
      <DialogContent class="max-h-[min(90vh,880px)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit feature</DialogTitle>
          <DialogDescription v-if="featureEditTarget">
            Update the feature metadata. Plan coverage is preserved from the matrix.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-2">
          <p v-if="featureEditError" class="text-sm text-destructive">
            {{ featureEditError }}
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label for="pc-fe-name">Name</Label>
              <Input id="pc-fe-name" v-model="featureEditForm.name" autocomplete="off" />
            </div>
            <div class="grid gap-2">
              <Label for="pc-fe-key">Key</Label>
              <Input id="pc-fe-key" v-model="featureEditForm.featureKey" placeholder="snake_case" autocomplete="off" />
            </div>
          </div>
          <div class="grid gap-2">
            <Label for="pc-fe-desc">Description</Label>
            <Textarea id="pc-fe-desc" v-model="featureEditForm.description" rows="3" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label>Category</Label>
              <Select v-model="featureEditForm.category">
                <SelectTrigger class="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="c in FEATURE_CATEGORY_ORDER" :key="c" :value="c" class="capitalize">
                    {{ c.replaceAll('-', ' ') }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-2">
              <Label>Type</Label>
              <Select v-model="featureEditForm.featureType">
                <SelectTrigger class="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="t in FEATURE_TYPE_OPTIONS" :key="t" :value="t" class="capitalize">
                    {{ t }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label>Status</Label>
              <Select v-model="featureEditForm.status">
                <SelectTrigger class="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="s in FEATURE_STATUS_OPTIONS" :key="s" :value="s" class="capitalize">
                    {{ s }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-2">
              <Label>Visibility</Label>
              <Select v-model="featureEditForm.visibility">
                <SelectTrigger class="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="v in VISIBILITY_OPTIONS" :key="v" :value="v" class="capitalize">
                    {{ v }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="flex flex-wrap gap-6">
            <div class="flex items-center gap-2 text-sm">
              <Checkbox id="pc-fe-bill" v-model="featureEditForm.isBillable" />
              <Label for="pc-fe-bill" class="cursor-pointer font-normal">Billable</Label>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <Checkbox id="pc-fe-def" v-model="featureEditForm.defaultEnabled" />
              <Label for="pc-fe-def" class="cursor-pointer font-normal">Default enabled</Label>
            </div>
          </div>
        </div>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" :disabled="catalogBusy" @click="featureEditOpen = false">
            Cancel
          </Button>
          <Button :disabled="catalogBusy || !featureEditForm.name.trim()" @click="submitFeatureEdit">
            {{ catalogBusy ? 'Saving…' : 'Save changes' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="createPlanOpen">
      <DialogContent class="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>Add a pricing tier for {{ data?.summary.name }}.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div class="grid gap-2">
            <Label>Plan name</Label>
            <Input v-model="createPlanForm.name" placeholder="e.g. Professional" />
          </div>
          <div class="grid gap-2">
            <Label>Slug (optional)</Label>
            <Input v-model="createPlanForm.slug" placeholder="auto from name if empty" />
          </div>
          <div class="grid gap-2">
            <Label>Edition / type</Label>
            <Input v-model="createPlanForm.edition" placeholder="e.g. Professional" />
          </div>
          <div class="grid gap-2">
            <Label>Billing interval</Label>
            <NativeSelect v-model="createPlanForm.billingCycle">
              <NativeSelectOption v-for="b in billingIntervals" :key="b.value" :value="b.value">
                {{ b.label }}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="grid gap-2">
              <Label>Price (cents)</Label>
              <Input v-model.number="createPlanForm.priceCents" type="number" min="0" />
            </div>
            <div class="grid gap-2">
              <Label>Currency</Label>
              <Input v-model="createPlanForm.currency" />
            </div>
          </div>
          <div class="grid gap-2">
            <Label>Visibility</Label>
            <NativeSelect v-model="createPlanForm.visibility">
              <NativeSelectOption v-for="o in visibilityOptions" :key="o.value" :value="o.value">
                {{ o.label }}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <Checkbox id="pc-p-trial" v-model="createPlanForm.trialSupported" />
            <Label for="pc-p-trial" class="cursor-pointer font-normal">Trial supported</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="createPlanOpen = false">
            Cancel
          </Button>
          <Button :disabled="catalogBusy" @click="submitCreatePlan">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="detailPlanOpen">
      <DialogContent class="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit plan</DialogTitle>
          <DialogDescription>
            Core fields and trial or grace settings. Enable features in the matrix above; billing IDs are under Manage plan billing.
          </DialogDescription>
        </DialogHeader>
        <div v-if="detailPlan" class="grid gap-6 py-2">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="grid gap-2 sm:col-span-2">
              <Label>Name</Label>
              <Input v-model="detailForm.name" />
            </div>
            <div class="grid gap-2">
              <Label>Slug</Label>
              <Input v-model="detailForm.slug" />
            </div>
            <div class="grid gap-2">
              <Label>Edition / type</Label>
              <Input v-model="detailForm.edition" />
            </div>
            <div class="grid gap-2">
              <Label>Billing interval</Label>
              <NativeSelect v-model="detailForm.billingCycle">
                <NativeSelectOption v-for="b in billingIntervals" :key="b.value" :value="b.value">
                  {{ b.label }}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div class="grid gap-2">
              <Label>Status</Label>
              <Input v-model="detailForm.status" placeholder="active, draft, archived…" />
            </div>
            <div class="grid gap-2">
              <Label>Price (cents)</Label>
              <Input v-model.number="detailForm.priceCents" type="number" min="0" />
            </div>
            <div class="grid gap-2">
              <Label>Currency</Label>
              <Input v-model="detailForm.currency" />
            </div>
            <div class="grid gap-2">
              <Label>Visibility</Label>
              <NativeSelect v-model="detailForm.visibility">
                <NativeSelectOption v-for="o in visibilityOptions" :key="o.value" :value="o.value">
                  {{ o.label }}
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          <div class="flex flex-wrap gap-4">
            <div class="flex items-center gap-2 text-sm">
              <Checkbox id="pc-d-trial" v-model="detailForm.trialSupported" />
              <Label for="pc-d-trial" class="cursor-pointer font-normal">Trial supported</Label>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <Checkbox id="pc-d-def" v-model="detailForm.isDefault" />
              <Label for="pc-d-def" class="cursor-pointer font-normal">Default for product</Label>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <Checkbox id="pc-d-rec" v-model="detailForm.isRecommended" />
              <Label for="pc-d-rec" class="cursor-pointer font-normal">Recommended</Label>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <Checkbox id="pc-d-ent" v-model="detailForm.enterpriseOverrideCompatible" />
              <Label for="pc-d-ent" class="cursor-pointer font-normal">Enterprise override compatible</Label>
            </div>
          </div>

          <Separator />

          <div class="grid gap-3 sm:grid-cols-3">
            <div class="grid gap-2">
              <Label>Trial days</Label>
              <Input v-model.number="detailForm.trialDays" type="number" min="0" />
            </div>
            <div class="grid gap-2">
              <Label>Grace period (days)</Label>
              <Input v-model.number="detailForm.gracePeriodDays" type="number" min="0" />
            </div>
            <div class="flex items-end gap-2 pb-2 text-sm">
              <Checkbox id="pc-d-pm" v-model="detailForm.trialRequiresPm" />
              <Label for="pc-d-pm" class="cursor-pointer font-normal">Trial requires payment method</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="detailPlanOpen = false">
            Cancel
          </Button>
          <Button :disabled="catalogBusy" @click="submitPlanDetail">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="billingPlanOpen">
      <DialogContent class="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage plan billing</DialogTitle>
          <DialogDescription v-if="billingPlan">
            Stripe, Paddle, and manual references for {{ billingPlan.name }} ({{ billingPlan.slug }}). Trial and grace values are left as-is.
          </DialogDescription>
        </DialogHeader>
        <div v-if="billingPlan" class="grid gap-4 py-2">
          <div class="grid gap-2">
            <Label for="bill-stripe">Stripe price / product ID</Label>
            <Input
              id="bill-stripe"
              v-model="billingForm.billingStripe"
              placeholder="price_…"
              class="font-mono text-sm"
              autocomplete="off"
            />
          </div>
          <div class="grid gap-2">
            <Label for="bill-paddle">Paddle price ID</Label>
            <Input
              id="bill-paddle"
              v-model="billingForm.billingPaddle"
              placeholder="pri_…"
              class="font-mono text-sm"
              autocomplete="off"
            />
          </div>
          <div class="grid gap-2">
            <Label for="bill-manual">Manual / contract reference</Label>
            <Input id="bill-manual" v-model="billingForm.billingManual" placeholder="Invoice, SKU, or internal ref" autocomplete="off" />
          </div>
        </div>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" :disabled="catalogBusy" @click="billingPlanOpen = false">
            Cancel
          </Button>
          <Button :disabled="catalogBusy || !billingPlan" @click="submitPlanBilling">
            {{ catalogBusy ? 'Saving…' : 'Save billing' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="catalogDestructiveOpen">
      <AlertDialogContent class="sm:max-w-md">
        <template v-if="catalogDestructive">
          <AlertDialogHeader>
            <AlertDialogTitle>{{ catalogDestructive.title }}</AlertDialogTitle>
            <AlertDialogDescription class="text-pretty">
              {{ catalogDestructive.description }}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel as-child>
              <Button variant="outline" :disabled="catalogDestructiveSubmitting">
                Cancel
              </Button>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              :disabled="catalogDestructiveSubmitting"
              @click="runCatalogDestructiveConfirm"
            >
              {{ catalogDestructiveSubmitting ? 'Please wait…' : catalogDestructive.confirmLabel }}
            </Button>
          </AlertDialogFooter>
        </template>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
