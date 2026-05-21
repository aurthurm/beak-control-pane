<script setup lang="ts">
import { GalleryVerticalEnd } from 'lucide-vue-next'
import { site } from '~/lib/site'
</script>

<template>
  <div class="grid min-h-svh lg:grid-cols-2">
    <div class="flex flex-col gap-4 p-6 md:p-10">
      <div class="flex justify-center gap-2 md:justify-start">
        <NuxtLink to="/" class="flex items-center gap-2 font-medium">
          <div class="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <GalleryVerticalEnd class="size-4" />
          </div>
          {{ site.brand.shortName }}
        </NuxtLink>
      </div>
      <div class="flex flex-1 items-center justify-center">
        <div class="w-full max-w-xs">
          <slot />
        </div>
      </div>
    </div>
    <div class="bg-muted relative hidden lg:block">
      <div class="absolute inset-0 bg-gradient-to-br from-primary/20 via-muted to-muted" />
    </div>
  </div>
</template>
