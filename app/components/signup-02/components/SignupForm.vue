<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  class?: HTMLAttributes['class']
  inviteToken?: string
}>()

const route = useRoute()
const token = computed(() => props.inviteToken?.trim() || (typeof route.query.invite === 'string' ? route.query.invite : ''))

const email = ref('')
const organizationName = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const pending = ref(false)

const inviteMeta = ref<{ valid: boolean; email?: string; organizationName?: string } | null>(null)

watch(
  token,
  async (t) => {
    if (!t) {
      inviteMeta.value = null
      return
    }
    try {
      const r = await $fetch<{
        valid: boolean
        email?: string
        organizationName?: string
        reason?: string
      }>(`/api/invites/org/verify?token=${encodeURIComponent(t)}`)
      inviteMeta.value = { valid: r.valid, email: r.email, organizationName: r.organizationName }
      if (r.valid && r.email) {
        email.value = r.email
      }
    } catch {
      inviteMeta.value = { valid: false }
    }
  },
  { immediate: true },
)

async function onSubmit(e: Event) {
  e.preventDefault()
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }
  pending.value = true
  try {
    if (token.value) {
      await $fetch('/api/invites/org/accept', {
        method: 'POST',
        body: {
          token: token.value,
          password: password.value,
          email: email.value.trim().toLowerCase() || undefined,
        },
      })
    } else {
      await $fetch('/api/auth/signup', {
        method: 'POST',
        body: {
          email: email.value.trim().toLowerCase(),
          password: password.value,
          organizationName: organizationName.value.trim() || 'Customer',
        },
      })
    }
    await navigateTo('/portal')
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    error.value = msg || 'Could not create account'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form :class="cn('flex flex-col gap-6', props.class)" @submit="onSubmit">
    <FieldGroup>
      <div class="flex flex-col items-center gap-1 text-center">
        <h1 class="text-2xl font-bold">
          {{ token ? 'Accept invitation' : 'Create your customer' }}
        </h1>
        <p class="text-muted-foreground text-sm text-balance">
          {{ token ? 'Set a password to join your team.' : 'You will be the customer owner.' }}
        </p>
      </div>
      <p v-if="token && inviteMeta && !inviteMeta.valid" class="text-center text-sm text-destructive">
        This invite link is invalid or expired.
      </p>
      <p v-if="error" class="text-center text-sm text-destructive">
        {{ error }}
      </p>
      <Field v-if="!token">
        <FieldLabel for="org">
          Customer name
        </FieldLabel>
        <Input id="org" v-model="organizationName" type="text" required autocomplete="organization" />
      </Field>
      <Field v-if="token && inviteMeta?.organizationName">
        <FieldDescription>Customer: {{ inviteMeta.organizationName }}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="email">
          Email
        </FieldLabel>
        <Input
          id="email"
          v-model="email"
          type="email"
          placeholder="you@company.com"
          required
          autocomplete="email"
          :disabled="!!token && !!inviteMeta?.valid"
        />
      </Field>
      <Field>
        <FieldLabel for="password">
          Password
        </FieldLabel>
        <Input id="password" v-model="password" type="password" required minlength="8" autocomplete="new-password" />
        <FieldDescription>At least 8 characters.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="confirm-password">
          Confirm password
        </FieldLabel>
        <Input id="confirm-password" v-model="confirmPassword" type="password" required autocomplete="new-password" />
      </Field>
      <Field>
        <Button type="submit" :disabled="pending || (!!token && inviteMeta && !inviteMeta.valid)">
          {{ pending ? 'Saving…' : token ? 'Join customer' : 'Create account' }}
        </Button>
      </Field>
      <Field>
        <FieldDescription class="text-center">
          Already have an account?
          <NuxtLink to="/portal/login" class="underline underline-offset-4">
            Sign in
          </NuxtLink>
        </FieldDescription>
      </Field>
    </FieldGroup>
  </form>
</template>
