<script setup lang="ts">
import type { Component } from 'vue'
import ConsolePageHeader from '~/components/ConsolePageHeader.vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { formatCurrency, formatDate, formatRelative, statusVariant, usageStatusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import type { ActivityFeedItem, DashboardAlert } from '~/types/workspace-dashboard'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  CreditCard,
  DatabaseZap,
  DollarSign,
  Fingerprint,
  Gauge,
  Globe2,
  Layers3,
  Minus,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-vue-next'

type SummaryCard = {
  label: string
  value: string
  hint: string
  icon: Component
  variant?: 'default' | 'risk' | 'revenue'
}

definePageMeta({
  layout: 'console',
})

const search = ref('')
const { data, pending, error, refresh } = await useWorkspaceDashboard()

useSeoMeta({
  title: `${site.brand.name} | Dashboard`,
  description: site.brand.tagline,
})

const query = computed(() => search.value.trim().toLowerCase())
const matches = (values: string[]) => !query.value || values.some((value) => value.toLowerCase().includes(query.value))

const filteredProducts = computed(() => data.value?.products.filter((product) => matches([product.name, product.slug, product.productTypeLabel, product.status, product.description])) ?? [])
const filteredProductOverview = computed(
  () =>
    data.value?.productOverview?.filter((row) => matches([row.name, row.slug, row.status, ...row.topModules.map((m) => m.name)])) ?? [],
)
const filteredTenants = computed(
  () =>
    data.value?.tenants.filter((tenant) =>
      matches([
        tenant.name,
        tenant.slug,
        tenant.industry,
        tenant.planName,
        tenant.planSummary,
        tenant.status,
        tenant.country,
        tenant.email,
        tenant.contactName,
        ...tenant.subscribedProducts,
      ]),
    ) ?? [],
)
const filteredLicenses = computed(() => data.value?.licenses.filter((license) => matches([license.licenseKey, license.tenantName, license.productName, license.mode, license.status])) ?? [])
const filteredActivations = computed(
  () =>
    data.value?.activations.filter((activation) =>
      matches([
        activation.id,
        activation.deviceId,
        activation.siteId,
        activation.installationId,
        activation.licenseKey,
        activation.licenseId,
        activation.tenantName,
        activation.productName,
        activation.bindingLabel,
        activation.activationType,
        activation.status,
      ]),
    ) ?? [],
)
const filteredUsage = computed(
  () =>
    data.value?.usage.filter((usage) =>
      matches([usage.tenantName, usage.productName, usage.metric, usage.metricLabel, usage.period, usage.status]),
    ) ?? [],
)
const filteredEvents = computed(
  () =>
    data.value?.billingEvents.filter((event) =>
      matches([event.tenantName, event.provider, event.eventType, event.currency, event.status]),
    ) ?? [],
)
const filteredActivityFeed = computed(
  () => data.value?.activityFeed?.filter((item) => matches([item.title, item.description, item.kind])) ?? [],
)

const filteredAlerts = computed(() => data.value?.alerts?.filter((alert) => matches([alert.title, alert.detail])) ?? [])

const criticalAlertCount = computed(() => filteredAlerts.value.filter((a) => a.severity === 'critical').length)

const attentionHeadline = computed(() => {
  const alerts = filteredAlerts.value
  if (!alerts.length) {
    return 'No urgent items — revenue, risk, and renewals look clear.'
  }

  const critical = alerts.filter((a) => a.severity === 'critical').length
  if (critical > 0) {
    return `${critical} critical item${critical === 1 ? '' : 's'} need action today.`
  }

  return `${alerts.length} item${alerts.length === 1 ? '' : 's'} to review this week.`
})

const kpiCards = computed<SummaryCard[]>(() => {
  const bh = data.value?.businessHealth
  if (!bh) {
    return [
      { label: 'Customers', value: '—', hint: 'Customers on the platform', icon: Users },
      { label: 'MRR', value: '—', hint: 'Monthly recurring revenue', icon: DollarSign, variant: 'revenue' },
      { label: 'Active subs', value: '—', hint: 'Active + trialing', icon: CreditCard },
      { label: 'Expiring (30d)', value: '—', hint: 'Licenses in renewal window', icon: Zap, variant: 'risk' },
    ]
  }

  return [
    {
      label: 'Customers',
      value: String(bh.totalCustomers),
      hint: `${bh.trialTenants} trial customer${bh.trialTenants === 1 ? '' : 's'} · ${bh.trialingSubscriptions} trialing sub${bh.trialingSubscriptions === 1 ? '' : 's'}`,
      icon: Users,
    },
    {
      label: 'MRR',
      value: formatCurrency(bh.mrrCents, 'USD'),
      hint: `ARR ${formatCurrency(bh.arrCents, 'USD')}`,
      icon: DollarSign,
      variant: 'revenue',
    },
    {
      label: 'Active subs',
      value: String(bh.activeSubscriptions),
      hint: 'Billable active + trialing',
      icon: CreditCard,
    },
    {
      label: 'Expiring (30d)',
      value: String(bh.expiringLicenses30d),
      hint: `${bh.failedPayments} failed payment event${bh.failedPayments === 1 ? '' : 's'} · ${bh.offlineLicensesActive} offline license${bh.offlineLicensesActive === 1 ? '' : 's'} active`,
      icon: Zap,
      variant: 'risk',
    },
  ]
})

const heroPulse = computed(() => {
  const s = data.value?.summary
  const bh = data.value?.businessHealth
  if (!s || !bh) {
    return []
  }

  return [
    { label: 'Products', value: s.products },
    { label: 'Customers', value: bh.totalCustomers },
    { label: 'Active subs', value: bh.activeSubscriptions },
    { label: 'Expiring 30d', value: s.expiringSoon },
  ]
})

const maxBillingTrend = computed(() => {
  const rows = data.value?.revenueInsights.monthlyBillingTrend ?? []
  return Math.max(1, ...rows.map((r) => r.totalCents))
})

const maxNewTenantsTrend = computed(() => {
  const rows = data.value?.revenueInsights.newTenantsByMonth ?? []
  return Math.max(1, ...rows.map((r) => r.count))
})

const planDistTotal = computed(() => data.value?.revenueInsights.planDistribution.reduce((a, p) => a + p.count, 0) ?? 1)

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

const alertBadgeVariant = (severity: DashboardAlert['severity']) => {
  if (severity === 'critical') {
    return 'destructive'
  }

  if (severity === 'warning') {
    return 'warning'
  }

  return 'secondary'
}

const feedBadgeVariant = (severity: ActivityFeedItem['severity']) => {
  if (severity === 'destructive') {
    return 'destructive'
  }

  if (severity === 'warning') {
    return 'warning'
  }

  if (severity === 'success') {
    return 'success'
  }

  return 'outline'
}

const trendIcon = (t: 'up' | 'flat' | 'down') => {
  if (t === 'up') {
    return TrendingUp
  }

  if (t === 'down') {
    return TrendingDown
  }

  return Minus
}

const trendLabel = (t: 'up' | 'flat' | 'down') => {
  if (t === 'up') {
    return 'Growing'
  }

  if (t === 'down') {
    return 'Cooling'
  }

  return 'Steady'
}
</script>

<template>
  <div class="relative flex flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Dashboard' },
      ]"
    >
      <template #actions>
        <Badge v-if="pending" variant="warning">
          Syncing
        </Badge>
        <Badge v-else-if="error" variant="destructive">
          Offline
        </Badge>
        <Badge v-else variant="success">
          Connected
        </Badge>
        <Button variant="outline" size="sm" @click="refresh">
          <RefreshCw class="size-4" />
          Refresh
        </Button>
      </template>
    </ConsolePageHeader>

    <div class="relative flex-1">
      <div class="relative space-y-6 p-4 lg:p-6">
        <Card class="overflow-hidden rounded-2xl border-border/70 bg-background/95 shadow-sm">
          <div class="p-6 lg:p-8">
            <div class="flex flex-col gap-6">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="space-y-4">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" class="border-border/70">
                      <Sparkles class="mr-1 size-3.5" />
                      Dashboard
                    </Badge>
                    <Badge v-if="criticalAlertCount > 0" variant="destructive" class="border-white/20">
                      <AlertTriangle class="mr-1 size-3.5" />
                      {{ criticalAlertCount }} critical
                    </Badge>
                  </div>
                  <div class="max-w-3xl space-y-3">
                    <h2 class="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
                      Minimal operating view for customers, subscriptions, revenue, and risk
                    </h2>
                    <p class="max-w-2xl text-sm leading-7 text-muted-foreground lg:text-base">
                      Keep an eye on the few metrics that matter most. Everything else lives in the dedicated pages.
                    </p>
                  </div>
                </div>

                <div class="flex flex-wrap gap-3">
                  <Button variant="outline" @click="refresh">
                    <RefreshCw class="size-4" />
                    Refresh
                  </Button>
                  <NuxtLink
                    to="/customers"
                    class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border/70 bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Customers
                    <ArrowUpRight class="size-4" />
                  </NuxtLink>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div
                  v-for="card in kpiCards"
                  :key="card.label"
                  class="rounded-2xl border border-border/70 bg-background p-4 shadow-sm"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      {{ card.label }}
                    </p>
                    <component :is="card.icon" class="size-4 text-muted-foreground" />
                  </div>
                  <p class="mt-3 text-2xl font-semibold tabular-nums">
                    {{ card.value }}
                  </p>
                  <p class="mt-2 text-sm leading-snug text-muted-foreground">
                    {{ card.hint }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div class="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <Card class="rounded-3xl border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur-sm">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-muted-foreground">
                  Priority alerts
                </p>
                <h3 class="mt-1 text-xl font-semibold tracking-tight">
                  What needs attention
                </h3>
                <p class="mt-1 text-sm text-muted-foreground">
                  {{ attentionHeadline }}
                </p>
              </div>
              <Badge variant="outline" class="gap-1">
                <Bell class="size-3.5" />
                {{ filteredAlerts.length }}
              </Badge>
            </div>

            <div v-if="filteredAlerts.length === 0" class="mt-6 rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              <ShieldCheck class="mx-auto mb-2 size-8 text-emerald-600 opacity-80" />
              No urgent items right now.
            </div>

            <ul v-else class="mt-5 space-y-3">
              <li v-for="alert in filteredAlerts.slice(0, 3)" :key="alert.title + alert.href">
                <NuxtLink
                  :to="alert.href"
                  class="flex gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div class="mt-0.5">
                    <Badge :variant="alertBadgeVariant(alert.severity)" class="tabular-nums">
                      {{ alert.count }}
                    </Badge>
                  </div>
                  <div class="min-w-0 flex-1 space-y-1">
                    <p class="font-medium leading-snug">
                      {{ alert.title }}
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {{ alert.detail }}
                    </p>
                  </div>
                  <ArrowUpRight class="mt-1 size-4 shrink-0 text-muted-foreground" />
                </NuxtLink>
              </li>
            </ul>
          </Card>

          <Card class="rounded-3xl border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur-sm">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-muted-foreground">
                  Quick links
                </p>
                <h3 class="mt-1 text-xl font-semibold tracking-tight">
                  Open the detail pages
                </h3>
              </div>
            </div>

            <div class="mt-5 grid gap-3">
              <NuxtLink
                v-for="item in [
                  { label: 'Customers', href: '/customers', description: 'Manage the customer registry.' },
                  { label: 'Subscriptions', href: '/subscriptions', description: 'Check renewals and contract state.' },
                  { label: 'Licenses', href: '/licenses', description: 'Review expiry and activations.' },
                  { label: 'Usage', href: '/usage', description: 'Inspect limits and overages.' },
                ]"
                :key="item.href"
                :to="item.href"
                class="group rounded-2xl border border-border/70 bg-background/70 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-medium">
                      {{ item.label }}
                    </p>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {{ item.description }}
                    </p>
                  </div>
                  <ArrowUpRight class="mt-0.5 size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </div>
              </NuxtLink>
            </div>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>
