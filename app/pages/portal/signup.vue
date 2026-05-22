<script setup lang="ts">
import SignupForm from '~/components/signup-02/components/SignupForm.vue'

definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Create subscriber',
})
</script>

<template>
  <SignupForm />
</template>
