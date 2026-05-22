<script setup lang="ts">
import type { SidebarProps } from '@/components/ui/sidebar'
import { computed } from 'vue'

import {
  Activity,
  Fingerprint,
  Gauge,
  Layers3,
  Users,
} from "lucide-vue-next"
import NavMain from '@/components/NavMain.vue'
import NavUser from '@/components/NavUser.vue'
import { Badge } from '@/components/ui/badge'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useAuthSession } from '@/composables/useAuthSession'
import { site } from '~/lib/site'

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: "icon",
})

const { session } = useAuthSession()

const user = computed(() => {
  if (!session.value || !session.value.authenticated) {
    return {
      name: 'Beak Ops',
      email: 'ops@beak.local',
      avatar: '',
    }
  }

  return {
    name: session.value.user.platformRole === 'platform_admin'
      ? 'Platform admin'
      : session.value.user.platformRole === 'support'
        ? 'Support agent'
        : 'Subscriber member',
    email: session.value.user.email,
    avatar: '',
  }
})

const platformNav = [
  {
    title: 'Dashboard',
    to: '/',
    icon: Activity,
    items: [{ title: 'Dashboard', to: '/' }],
  },
  {
    title: 'Subscribers',
    to: '/subscribers',
    icon: Users,
    items: [
      { title: 'Subscribers', to: '/subscribers' },
      { title: 'Subscriptions', to: '/subscriptions' },
    ],
  },
  {
    title: 'Products',
    to: '/products',
    icon: Layers3,
    items: [{ title: 'Products', to: '/products' }],
  },
  {
    title: 'Usage',
    to: '/usage',
    icon: Gauge,
    items: [
      { title: 'Usage', to: '/usage' },
      { title: 'Audit logs', to: '/audit-logs' },
      { title: 'Staff invites', to: '/admin/invites' },
    ],
  },
]
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <div class="mx-2 mb-1 rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/40 px-3 py-3 group-data-[collapsible=icon]:hidden">
        <div class="flex items-center gap-2">
          <Badge variant="secondary" class="border-sidebar-border/70 bg-sidebar-primary text-sidebar-primary-foreground">
            {{ site.brand.shortName }}
          </Badge>
          <span class="text-sm font-semibold tracking-tight text-sidebar-foreground">
            {{ site.brand.name }}
          </span>
        </div>
        <p v-if="site.brand.tagline" class="mt-2 text-xs leading-5 text-sidebar-foreground/70">
          {{ site.brand.tagline }}
        </p>
      </div>
      <div class="mx-2 mb-1 hidden group-data-[collapsible=icon]:flex">
        <Badge
          variant="secondary"
          class="flex size-10 items-center justify-center rounded-2xl border border-sidebar-border/70 bg-sidebar-primary text-sidebar-primary-foreground"
        >
          {{ site.brand.shortName }}
        </Badge>
      </div>
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="platformNav" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="user" />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
