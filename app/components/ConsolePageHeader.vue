<script setup lang="ts">
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

defineProps<{
  breadcrumbs?: { label: string; to?: string }[]
  title?: string
  description?: string
}>()
</script>

<template>
  <header class="flex h-16 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur lg:px-6">
    <SidebarTrigger class="-ml-1" />
    <Separator orientation="vertical" class="mr-2 h-4" />
    <template v-if="breadcrumbs?.length">
      <Breadcrumb>
        <BreadcrumbList>
          <template v-for="(crumb, index) in breadcrumbs" :key="`${crumb.label}-${index}`">
            <BreadcrumbSeparator v-if="index > 0" class="hidden md:block" />
            <BreadcrumbItem :class="index < breadcrumbs.length - 1 ? 'hidden md:block' : ''">
              <BreadcrumbLink v-if="crumb.to" as-child>
                <NuxtLink :to="crumb.to">
                  {{ crumb.label }}
                </NuxtLink>
              </BreadcrumbLink>
              <BreadcrumbPage v-else>
                {{ crumb.label }}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </template>
        </BreadcrumbList>
      </Breadcrumb>
    </template>
    <template v-else>
      <div class="min-w-0">
        <div class="truncate text-sm font-medium">
          {{ title ?? '' }}
        </div>
        <div v-if="description" class="truncate text-xs text-muted-foreground">
          {{ description }}
        </div>
      </div>
    </template>
    <div class="ml-auto flex items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
