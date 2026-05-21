<script setup lang="ts">
import { definePageMeta } from '#imports'
import LoginForm from '~/components/login-02/components/LoginForm.vue'
import { Button } from '~/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const invite = computed(() => (typeof route.query.invite === 'string' ? route.query.invite : ''))

const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const pending = ref(false)

async function acceptInvite(e: Event) {
  e.preventDefault()
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }
  pending.value = true
  try {
    await $fetch('/api/auth/admin-invite/accept', {
      method: 'POST',
      body: { token: invite.value, password: password.value },
    })
    await navigateTo('/')
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    error.value = msg || 'Could not accept invite'
  } finally {
    pending.value = false
  }
}

useSeoMeta({
  title: 'Staff sign in',
})
</script>

<template>
  <div v-if="invite" class="space-y-6">
    <div class="text-center">
      <h1 class="text-2xl font-bold">
        Accept staff invite
      </h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Set your password to activate your account.
      </p>
    </div>
    <form class="flex flex-col gap-4" @submit="acceptInvite">
      <p v-if="error" class="text-center text-sm text-destructive">
        {{ error }}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel for="pw">Password</FieldLabel>
          <Input id="pw" v-model="password" type="password" required minlength="8" autocomplete="new-password" />
        </Field>
        <Field>
          <FieldLabel for="pw2">Confirm password</FieldLabel>
          <Input id="pw2" v-model="confirmPassword" type="password" required autocomplete="new-password" />
        </Field>
        <Button type="submit" :disabled="pending">
          {{ pending ? 'Saving…' : 'Activate account' }}
        </Button>
      </FieldGroup>
    </form>
  </div>
  <LoginForm v-else intent="staff" />
</template>
