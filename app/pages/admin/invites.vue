<script setup lang="ts">
import { definePageMeta } from '#imports'
import ConsolePageHeader from '~/components/ConsolePageHeader.vue'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { site } from '~/lib/site'

definePageMeta({ layout: 'console' })

const email = ref('')
const targetRole = ref<'support' | 'platform_admin'>('support')
const token = ref<string | null>(null)
const acceptUrl = ref<string | null>(null)
const error = ref('')
const pending = ref(false)

async function createInvite() {
  error.value = ''
  token.value = null
  acceptUrl.value = null
  pending.value = true
  try {
    const res = await $fetch<{
      token: string
      acceptUrl: string
    }>('/api/admin/invites', {
      method: 'POST',
      body: {
        email: email.value.trim().toLowerCase(),
        targetRole: targetRole.value,
      },
    })
    token.value = res.token
    acceptUrl.value = res.acceptUrl
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    error.value = msg || 'Could not create invite'
  } finally {
    pending.value = false
  }
}

useSeoMeta({
  title: `${site.brand.name} | Staff invites`,
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-6 p-4 md:p-6">
    <ConsolePageHeader
      title="Support & admin invites"
      description="Create an invite for a support or platform admin account. Copy the link once; email delivery is not configured in this build."
    />
    <Card class="max-w-lg">
      <CardHeader>
        <CardTitle>New invite</CardTitle>
        <CardDescription>
          Only platform administrators can create invites.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <p v-if="error" class="text-sm text-destructive">
          {{ error }}
        </p>
        <div class="space-y-2">
          <Label for="inv-email">Email</Label>
          <Input id="inv-email" v-model="email" type="email" placeholder="colleague@company.com" />
        </div>
        <div class="space-y-2">
          <Label>Role</Label>
          <Select v-model="targetRole">
            <SelectTrigger>
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="support">
                Support
              </SelectItem>
              <SelectItem value="platform_admin">
                Platform admin
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button :disabled="pending || !email.trim()" @click="createInvite">
          {{ pending ? 'Creating…' : 'Create invite' }}
        </Button>
        <div v-if="token" class="rounded-md border bg-muted/40 p-3 text-sm">
          <p class="font-medium">
            Invite created
          </p>
          <p class="text-muted-foreground mt-1 break-all">
            Token: {{ token }}
          </p>
          <p v-if="acceptUrl" class="mt-2 break-all">
            Link: {{ acceptUrl }}
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
