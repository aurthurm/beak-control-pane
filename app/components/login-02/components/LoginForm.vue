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
  /** portal: expect customer; staff: expect platform_admin or support */
  intent?: 'portal' | 'staff'
}>()

const intent = computed(() => props.intent ?? 'portal')

const email = ref('')
const password = ref('')
const error = ref('')
const pending = ref(false)

async function onSubmit(e: Event) {
  e.preventDefault()
  error.value = ''
  pending.value = true
  try {
    const res = await $fetch<{ platformRole: string }>('/api/auth/login', {
      method: 'POST',
      body: { email: email.value.trim(), password: password.value },
    })
    const role = res.platformRole
    if (intent.value === 'staff') {
      if (role === 'customer') {
        await navigateTo('/portal')
        return
      }
      await navigateTo('/')
      return
    }
    if (role !== 'customer') {
      await navigateTo('/')
      return
    }
    await navigateTo('/portal')
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    error.value = msg || 'Sign in failed'
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
          {{ intent === 'staff' ? 'Staff sign in' : 'Sign in' }}
        </h1>
        <p class="text-muted-foreground text-sm text-balance">
          Enter your email and password
        </p>
      </div>
      <p v-if="error" class="text-center text-sm text-destructive">
        {{ error }}
      </p>
      <Field>
        <FieldLabel for="email">
          Email
        </FieldLabel>
        <Input id="email" v-model="email" type="email" placeholder="you@company.com" required autocomplete="email" />
      </Field>
      <Field>
        <FieldLabel for="password">
          Password
        </FieldLabel>
        <Input id="password" v-model="password" type="password" required autocomplete="current-password" />
      </Field>
      <Field>
        <Button type="submit" :disabled="pending">
          {{ pending ? 'Signing in…' : 'Sign in' }}
        </Button>
      </Field>
      <Field v-if="intent === 'portal'">
        <FieldDescription class="text-center">
          Need a customer account?
          <NuxtLink to="/portal/signup" class="underline underline-offset-4">
            Create one
          </NuxtLink>
        </FieldDescription>
      </Field>
      <Field v-else>
        <FieldDescription class="text-center">
          Customer portal:
          <NuxtLink to="/portal/login" class="underline underline-offset-4">
            Customer login
          </NuxtLink>
        </FieldDescription>
      </Field>
    </FieldGroup>
  </form>
</template>
