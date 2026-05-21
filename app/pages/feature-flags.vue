<script setup lang="ts">
/**
 * @deprecated Runtime feature flags live under each product: Products → [product] → Feature flags tab.
 */
definePageMeta({ layout: 'console' })
await navigateTo('/products', { replace: true })
</script>

<template>
  <div class="p-6 text-sm text-muted-foreground">
    Redirecting to the product catalog…
  </div>
</template>
