<script setup lang="ts">
import type { LucideIcon } from "lucide-vue-next"
import { ChevronRight } from "lucide-vue-next"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'

defineProps<{
  items: {
    title: string
    to: string
    icon?: LucideIcon
    items?: {
      title: string
      to: string
    }[]
  }[]
}>()

const route = useRoute()

const isRouteMatch = (to: string) => {
  if (to === '/') {
    return route.path === '/'
  }

  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>Platform</SidebarGroupLabel>
    <SidebarMenu>
      <Collapsible
        v-for="item in items"
        :key="item.title"
        as-child
        :default-open="isRouteMatch(item.to) || item.items?.some((sub) => isRouteMatch(sub.to))"
        class="group/collapsible"
      >
        <SidebarMenuItem>
          <SidebarMenuButton as-child :tooltip="item.title" :is-active="isRouteMatch(item.to)">
            <NuxtLink :to="item.to">
              <component :is="item.icon" v-if="item.icon" />
              <span class="group-data-[collapsible=icon]:hidden">{{ item.title }}</span>
            </NuxtLink>
          </SidebarMenuButton>
          <CollapsibleTrigger as-child>
            <SidebarMenuAction :aria-label="`Toggle ${item.title}`" show-on-hover>
              <ChevronRight class="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuAction>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              <SidebarMenuSubItem v-for="subItem in item.items" :key="subItem.title">
                <SidebarMenuSubButton as-child :is-active="isRouteMatch(subItem.to)">
                  <NuxtLink :to="subItem.to">
                    <span class="group-data-[collapsible=icon]:hidden">{{ subItem.title }}</span>
                  </NuxtLink>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </SidebarMenu>
  </SidebarGroup>
</template>
