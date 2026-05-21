<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { portalHref, portalNav } from '../shared'
import type { PortalSummaryResponse } from '~/composables/usePortalSummary'

const props = defineProps<{
  title: string
  subtitle: string
  summary: PortalSummaryResponse | null
  pending?: boolean
  error?: string | null
}>()

const route = useRoute()

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/portal/login')
}

const activeOrganizationId = computed(() => props.summary?.activeOrganizationId ?? '')
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.02),transparent_42%)]">
    <div class="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-slate-900/5 to-transparent" />
    <div class="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section class="overflow-hidden rounded-3xl border border-border/70 bg-card/90 shadow-[0_20px_80px_-35px_rgba(15,23,42,0.4)] backdrop-blur">
        <div class="flex flex-col gap-6 border-b border-border/60 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                Customer portal
              </Badge>
              <Badge
                v-if="summary?.activeOrganization"
                :variant="summary.activeOrganization.status === 'active' ? 'success' : 'warning'"
              >
                {{ summary.activeOrganization.name }}
              </Badge>
            </div>
            <div class="space-y-1">
              <h1 class="text-3xl font-semibold tracking-tight">
                {{ title }}
              </h1>
              <p class="max-w-2xl text-sm text-muted-foreground">
                {{ subtitle }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              @click="signOut"
            >
              Sign out
            </Button>
          </div>
        </div>

        <div class="flex flex-col gap-4 px-6 py-5">
          <div class="flex flex-wrap gap-2 border-b border-dashed border-border/60 pb-4">
            <NuxtLink
              v-for="item in portalNav"
              :key="item.to"
              :to="portalHref(item.to, activeOrganizationId || null, route.query as Record<string, string | string[] | undefined>)"
              class="rounded-full border px-3 py-1.5 text-sm transition"
              :class="route.path === item.to ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/70 text-foreground hover:border-primary/60 hover:bg-accent'"
            >
              {{ item.label }}
            </NuxtLink>
          </div>

          <div
            v-if="summary?.account.memberships?.length"
            class="flex flex-wrap gap-2"
          >
            <NuxtLink
              v-for="membership in summary.account.memberships"
              :key="membership.organizationId"
              :to="portalHref(route.path, membership.organizationId, route.query as Record<string, string | string[] | undefined>)"
              class="group flex min-w-[16rem] items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition"
              :class="membership.organizationId === activeOrganizationId ? 'border-primary/70 bg-primary/5 shadow-sm' : 'border-border/70 bg-background/70 hover:border-primary/40 hover:bg-accent/50'"
            >
              <div class="min-w-0">
                <div class="truncate text-sm font-medium">
                  {{ membership.organizationName }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ membership.organizationSlug || membership.organizationId }}
                </div>
              </div>
              <div class="flex flex-col items-end gap-1">
                <Badge variant="outline">
                  {{ membership.membershipRole }}
                </Badge>
                <div class="text-xs text-muted-foreground">
                  {{ membership.counts.subscriptionCount }} subscriptions
                </div>
              </div>
            </NuxtLink>
          </div>

          <div v-if="pending" class="rounded-2xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
            Loading portal data…
          </div>
          <div v-else-if="error" class="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {{ error }}
          </div>
        </div>
      </section>

      <slot />
    </div>
  </div>
</template>
