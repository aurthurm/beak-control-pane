<script setup lang="ts">
definePageMeta({ layout: 'console' })

const route = useRoute()
const id = String(route.params.id ?? '')

type SubDetail = { subscription: { tenantId: string; id: string } }

if (!id) {
  await navigateTo('/subscriptions', { replace: true })
} else {
  const { data, error } = await useAsyncData(`subscription-redirect-${id}`, () => $fetch<SubDetail>(`/api/subscriptions/${id}`))

  if (data.value?.subscription) {
    await navigateTo(`/customers/${data.value.subscription.tenantId}/subscription/${data.value.subscription.id}`, { replace: true })
  } else if (error.value || !data.value) {
    await navigateTo('/subscriptions', { replace: true })
  }
}
</script>

<template>
  <div class="p-6 text-sm text-muted-foreground">Redirecting to the customer subscription record…</div>
</template>
