<script setup lang="ts">
definePageMeta({ layout: 'console' })

await navigateTo('/products', { replace: true })
</script>

<template>
  <div class="p-6 text-sm text-muted-foreground">
    Redirecting to the product catalog…
  </div>
</template>
