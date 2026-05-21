<script setup lang="ts">
import LoginForm from '~/components/login-02/components/LoginForm.vue'

definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Portal sign in',
})
</script>

<template>
  <LoginForm intent="portal" />
</template>
