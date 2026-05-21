<script setup lang="ts">
import AppSidebar from '~/components/AppSidebar.vue'
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar'
</script>

<template>
  <SidebarProvider>
    <AppSidebar variant="inset" />
    <SidebarInset class="flex min-h-svh flex-col">
      <slot />
    </SidebarInset>
  </SidebarProvider>
</template>
