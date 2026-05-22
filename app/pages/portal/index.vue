<script setup lang="ts">
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import PortalShell from './components/PortalShell.vue'
import { formatCompactNumber, formatDate, portalHref, toneForStatus } from './shared'

definePageMeta({ layout: 'default' })

const route = useRoute()
const organizationId = computed(() => (typeof route.query.organizationId === 'string' ? route.query.organizationId : null))
const { data: summary, pending, error } = usePortalSummary(organizationId)

useSeoMeta({
  title: 'Subscriber portal',
})

const stats = computed(() => {
  const data = summary.value
  if (!data) {
    return []
  }
  return [
    { label: 'Products', value: data.overview.productCount },
    { label: 'Subscribers', value: data.overview.subscriberCount },
    { label: 'Subscriptions', value: data.overview.subscriptionCount },
    { label: 'Licenses', value: data.overview.licenseCount },
    { label: 'Usage rows', value: data.overview.usageRecordCount },
    { label: 'Entitlements', value: data.overview.entitlementCount },
  ]
})

const activeMembershipRole = computed(() => {
  const data = summary.value
  if (!data) {
    return 'member'
  }
  return data.account.memberships.find((membership) => membership.organizationId === data.activeOrganizationId)?.membershipRole ?? 'member'
})

</script>

<template>
    <PortalShell
    title="Your account hub"
    subtitle="Track the current subscriber, review billing and licensing state, and jump into the parts of the account that need attention."
    :summary="summary ?? null"
    :pending="pending"
    :error="error ? 'Unable to load portal data.' : null"
  >
    <div v-if="summary" class="space-y-6">
      <section class="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card class="relative overflow-hidden border-border/70 bg-gradient-to-br from-card via-background to-muted/30 shadow-sm">
          <div aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div aria-hidden="true" class="pointer-events-none absolute -right-16 top-6 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
          <CardHeader class="space-y-4 border-b border-border/60 pb-5">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                Active subscriber
              </Badge>
              <Badge :variant="toneForStatus(summary.activeOrganization?.status ?? '')">
                {{ summary.activeOrganization?.status || 'unknown' }}
              </Badge>
              <Badge variant="outline">
                Signed in as {{ summary.account.user.email }}
              </Badge>
            </div>
            <div class="space-y-1">
              <CardTitle class="text-2xl">
                {{ summary.activeOrganization?.name || 'Active subscriber' }}
              </CardTitle>
              <CardDescription>
                {{ summary.activeOrganization?.slug || summary.activeOrganizationId }}
              </CardDescription>
            </div>
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                <div class="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Role
                </div>
                <div class="mt-1 text-sm font-medium">
                  {{ activeMembershipRole }}
                </div>
              </div>
              <div class="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                <div class="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Memberships
                </div>
                <div class="mt-1 text-sm font-medium">
                  {{ summary.account.memberships.length }}
                </div>
              </div>
              <div class="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                <div class="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Active account
                </div>
                <div class="mt-1 text-sm font-medium">
                  {{ summary.activeOrganization?.slug || summary.activeOrganizationId }}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent class="grid gap-4 pt-6 sm:grid-cols-2 xl:grid-cols-3">
            <div v-for="stat in stats" :key="stat.label" class="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div class="text-2xl font-semibold">
                {{ formatCompactNumber(stat.value) }}
              </div>
              <div class="text-sm text-muted-foreground">
                {{ stat.label }}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="space-y-2">
            <CardTitle class="text-lg">
              Account snapshot
            </CardTitle>
            <CardDescription>
              Your current subscriber and membership details.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2 rounded-2xl border border-border/70 bg-background/70 p-4">
              <div class="text-sm text-muted-foreground">
                Active subscriber
              </div>
              <div class="font-medium">
                {{ summary.activeOrganization?.name || 'Unknown subscriber' }}
              </div>
              <div class="text-sm text-muted-foreground">
                Role: {{ activeMembershipRole }}
              </div>
            </div>

            <div class="space-y-2 rounded-2xl border border-border/70 bg-background/70 p-4">
              <div class="text-sm text-muted-foreground">
                Memberships
              </div>
              <div class="text-2xl font-semibold">
                {{ summary.account.memberships.length }}
              </div>
              <div class="text-sm text-muted-foreground">
                Switch subscribers from the chips above.
              </div>
            </div>

          </CardContent>
        </Card>
      </section>

      <section class="space-y-3">
        <div class="flex items-end justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold">
              Entry points
            </h2>
            <p class="text-sm text-muted-foreground">
              The main areas subscriber members usually check first.
            </p>
          </div>
        </div>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NuxtLink
            v-for="item in summary.entryPoints"
            :key="item.key"
            :to="portalHref(item.href, summary.activeOrganizationId)"
            class="group rounded-2xl border border-border/70 bg-card/90 p-5 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="text-sm text-muted-foreground">
                  {{ item.count }} total
                </div>
                <div class="mt-1 text-lg font-semibold">
                  {{ item.title }}
                </div>
              </div>
              <Badge variant="outline">
                Open
              </Badge>
            </div>
            <p class="mt-3 text-sm text-muted-foreground">
              {{ item.description }}
            </p>
          </NuxtLink>
        </div>
      </section>

      <section class="grid gap-4 xl:grid-cols-2">
        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="space-y-2">
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>Current plans and renewal state.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div
              v-for="sub in summary.recent.subscriptions"
              :key="sub.id"
              class="rounded-2xl border border-border/70 bg-background/70 p-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="font-medium">
                    {{ sub.productName }} · {{ sub.planName }}
                  </div>
                  <div class="text-sm text-muted-foreground">
                    {{ sub.subscriberName }} · {{ sub.billingInterval }}
                  </div>
                </div>
                <Badge :variant="toneForStatus(sub.status)">
                  {{ sub.status }}
                </Badge>
              </div>
              <div class="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>{{ sub.amountLabel }}</span>
                <span>Renewal {{ formatDate(sub.renewalAt) }}</span>
              </div>
            </div>
            <NuxtLink :to="portalHref('/portal/subscriptions', summary.activeOrganizationId, route.query as Record<string, string | string[] | undefined>)" class="text-sm font-medium text-primary underline-offset-4 hover:underline">
              View all subscriptions
            </NuxtLink>
          </CardContent>
        </Card>

        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="space-y-2">
            <CardTitle>Licenses</CardTitle>
            <CardDescription>Validity, activation pressure, and expiry windows.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div
              v-for="license in summary.recent.licenses"
              :key="license.id"
              class="rounded-2xl border border-border/70 bg-background/70 p-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="font-medium">
                    {{ license.productName }}
                  </div>
                  <div class="text-sm text-muted-foreground">
                    {{ license.subscriberName }} · {{ license.mode }}
                  </div>
                </div>
                <Badge :variant="toneForStatus(license.status)">
                  {{ license.status }}
                </Badge>
              </div>
              <div class="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>{{ license.activeActivations }} / {{ license.maxActivations }} activations</span>
                <span>Expires {{ license.validToLabel }}</span>
              </div>
            </div>
            <NuxtLink :to="portalHref('/portal/licenses', summary.activeOrganizationId, route.query as Record<string, string | string[] | undefined>)" class="text-sm font-medium text-primary underline-offset-4 hover:underline">
              View all licenses
            </NuxtLink>
          </CardContent>
        </Card>

        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="space-y-2">
            <CardTitle>Usage</CardTitle>
            <CardDescription>Signals that are close to limits or already exceeded.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div
              v-for="usage in summary.recent.usage"
              :key="usage.id"
              class="rounded-2xl border border-border/70 bg-background/70 p-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="font-medium">
                    {{ usage.metricLabel }}
                  </div>
                  <div class="text-sm text-muted-foreground">
                    {{ usage.subscriberName }} · {{ usage.productName }}
                  </div>
                </div>
                <Badge :variant="toneForStatus(usage.uiStatus)">
                  {{ usage.uiStatus }}
                </Badge>
              </div>
              <div class="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>{{ formatCompactNumber(usage.value) }} / {{ formatCompactNumber(usage.limitValue) }}</span>
                <span>{{ usage.period }}</span>
              </div>
            </div>
            <NuxtLink :to="portalHref('/portal/usage', summary.activeOrganizationId, route.query as Record<string, string | string[] | undefined>)" class="text-sm font-medium text-primary underline-offset-4 hover:underline">
              View usage details
            </NuxtLink>
          </CardContent>
        </Card>

        <Card class="border-border/70 bg-card/90 shadow-sm">
          <CardHeader class="space-y-2">
            <CardTitle>Entitlements</CardTitle>
              <CardDescription>What the active subscriber is entitled to use.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div
              v-for="entitlement in summary.recent.entitlements"
              :key="entitlement.id"
              class="rounded-2xl border border-border/70 bg-background/70 p-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="font-medium">
                    {{ entitlement.productName }}
                  </div>
                  <div class="text-sm text-muted-foreground">
                    {{ entitlement.subscriberName }} · {{ entitlement.primarySource }}
                  </div>
                </div>
                <Badge variant="outline">
                  {{ entitlement.limitCount }} limits
                </Badge>
              </div>
              <div class="mt-3 text-sm text-muted-foreground">
                {{ entitlement.enabledModuleCount }} / {{ entitlement.moduleCount }} modules enabled
              </div>
            </div>
            <NuxtLink :to="portalHref('/portal/entitlements', summary.activeOrganizationId, route.query as Record<string, string | string[] | undefined>)" class="text-sm font-medium text-primary underline-offset-4 hover:underline">
              View entitlement details
            </NuxtLink>
          </CardContent>
        </Card>
      </section>
    </div>

    <div v-else class="mx-auto flex min-h-[60vh] max-w-xl items-center px-4">
      <Card class="w-full border-border/70 bg-card/90">
        <CardHeader>
          <CardTitle>Preparing portal</CardTitle>
          <CardDescription>
            {{ pending ? 'Loading your account summary…' : 'Subscriber data could not be loaded.' }}
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <p class="text-sm text-muted-foreground">
            When data is available, this page shows your subscriber summary, active subscriptions, license state, usage, and entitlement snapshots.
          </p>
          <NuxtLink to="/portal/login" class="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Go to sign in
          </NuxtLink>
        </CardContent>
      </Card>
    </div>
  </PortalShell>
</template>
