<script setup lang="ts">
import { ChevronsUpDown } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuthSession } from '@/composables/useAuthSession'

type OrganizationItem = {
  id: string
  name: string
  slug: string
  membershipRole: string
}

const props = defineProps<{
  organizations: OrganizationItem[]
  activeOrganizationId: string | null
}>()

const { isMobile } = useSidebar()
const route = useRoute()
const { refresh } = useAuthSession()
const pendingOrganizationId = ref<string | null>(null)

const activeOrganization = computed(() => {
  if (!props.organizations.length) {
    return null
  }

  return props.organizations.find((organization) => organization.id === props.activeOrganizationId)
    ?? props.organizations[0]
})

function organizationInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'O'
}

async function selectOrganization(organizationId: string) {
  if (organizationId === props.activeOrganizationId) {
    return
  }

  pendingOrganizationId.value = organizationId
  try {
    await $fetch('/api/auth/organization', {
      method: 'POST',
      body: { organizationId },
    })
    await refresh()
    await navigateTo({
      path: route.path,
      query: { ...route.query, organizationId },
    }, { replace: true })
  } finally {
    pendingOrganizationId.value = null
  }
}
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <span class="text-xs font-semibold tracking-tight">
                {{ activeOrganization ? organizationInitials(activeOrganization.name) : 'O' }}
              </span>
            </div>
            <div class="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span class="truncate font-medium">
                {{ activeOrganization?.name ?? 'No subscriber' }}
              </span>
              <span class="truncate text-xs">
                {{ activeOrganization ? `${activeOrganization.membershipRole} · ${activeOrganization.slug}` : 'Select a subscriber' }}
              </span>
            </div>
            <ChevronsUpDown class="ml-auto group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-(--reka-dropdown-menu-trigger-width) min-w-64 rounded-lg"
          align="start"
          :side="isMobile ? 'bottom' : 'right'"
          :side-offset="4"
        >
          <DropdownMenuLabel class="text-xs text-muted-foreground">
            Subscribers
          </DropdownMenuLabel>
          <DropdownMenuItem
            v-for="(organization, index) in organizations"
            :key="organization.id"
            class="gap-2 p-2"
            :disabled="pendingOrganizationId === organization.id"
            @click="selectOrganization(organization.id)"
          >
            <div class="flex size-6 items-center justify-center rounded-sm border">
              <span class="text-[10px] font-semibold">
                {{ organizationInitials(organization.name) }}
              </span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">
                {{ organization.name }}
              </div>
              <div class="truncate text-xs text-muted-foreground">
                {{ organization.membershipRole }} · {{ organization.slug }}
              </div>
            </div>
            <DropdownMenuShortcut>⌘{{ index + 1 }}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator v-if="organizations.length" />
          <DropdownMenuItem v-if="!organizations.length" class="gap-2 p-2" disabled>
            <div class="flex size-6 items-center justify-center rounded-sm border">
              <span class="text-[10px] font-semibold">--</span>
            </div>
            <div class="font-medium text-muted-foreground">
              No subscribers available
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
