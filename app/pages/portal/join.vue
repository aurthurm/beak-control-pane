<script setup lang="ts">
import SignupForm from '~/components/signup-02/components/SignupForm.vue'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const invite = computed(() => (typeof route.query.invite === 'string' ? route.query.invite : undefined))

useSeoMeta({
  title: 'Join customer',
})
</script>

<template>
  <SignupForm :invite-token="invite" />
</template>
