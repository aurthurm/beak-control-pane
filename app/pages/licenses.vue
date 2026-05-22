<script setup lang="ts">
import { definePageMeta, navigateTo } from '#imports'
import ConsolePageHeader from '~/components/ConsolePageHeader.vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatDate, formatRelative, statusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import type { WorkspaceDashboard } from '~/types/workspace-dashboard'
import { Loader2, MoreHorizontal, Plus, RefreshCw, Search } from 'lucide-vue-next'

definePageMeta({ layout: 'console' })

type LicenseRow = WorkspaceDashboard['licenses'][number]

useSeoMeta({
  title: `${site.brand.name} | Licenses`,
  description: 'Issued licenses, modes, and renewal posture.',
})

const search = ref('')
const { data, pending, refresh } = await useWorkspaceDashboard()

const generateOpen = ref(false)
const genSubscriptionId = ref('')
const genMode = ref<'online' | 'hybrid' | 'offline'>('online')
const genMaxActivations = ref(3)
const generateBusy = ref(false)
const actionError = ref('')

const query = computed(() => search.value.trim().toLowerCase())
const filtered = computed(
  () =>
    data.value?.licenses.filter((license) => {
      if (!query.value) return true
      const hay = [
        license.id,
        license.licenseKey,
        license.subscriberName,
        license.productName,
        license.planName,
        license.planSlug,
        license.planEdition,
        license.mode,
        license.status,
        license.subscriptionId ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(query.value)
    }) ?? [],
)

function prettyPayload(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function licenseDetailPath(lic: LicenseRow) {
  return `/subscribers/${encodeURIComponent(lic.subscriberId)}/license/${encodeURIComponent(lic.id)}`
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    actionError.value = 'Could not copy to clipboard.'
  }
}

function downloadLicenseJson(license: LicenseRow) {
  let payload: unknown
  try {
    payload = JSON.parse(license.payloadJson)
  } catch {
    payload = license.payloadJson
  }
  const blob = new Blob(
    [
      JSON.stringify(
        {
          licenseKey: license.licenseKey,
          signature: license.signature,
          payload,
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${license.id}.license.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function submitGenerate() {
  if (!genSubscriptionId.value) {
    actionError.value = 'Select a subscription.'
    return
  }
  generateBusy.value = true
  actionError.value = ''
  try {
    const created = await $fetch<{ id: string }>('/api/licenses', {
      method: 'POST',
      body: {
        subscriptionId: genSubscriptionId.value,
        mode: genMode.value,
        maxActivations: genMaxActivations.value,
      },
    })
    generateOpen.value = false
    await refresh()
    const subscription = data.value?.subscriptionsDetail.find((sub) => sub.id === genSubscriptionId.value)
    if (created?.id && subscription) {
      await navigateTo(`/subscribers/${encodeURIComponent(subscription.subscriberId)}/license/${encodeURIComponent(created.id)}`)
    }
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    actionError.value = err.data?.statusMessage ?? err.message ?? 'Could not generate license'
  } finally {
    generateBusy.value = false
  }
}

const subscriptionOptions = computed(() => data.value?.subscriptionsDetail ?? [])
const selectedSubscription = computed(
  () => subscriptionOptions.value.find((subscription) => subscription.id === genSubscriptionId.value) ?? null,
)

watch(generateOpen, (open) => {
  if (open && !genSubscriptionId.value && subscriptionOptions.value.length) {
    genSubscriptionId.value =
      subscriptionOptions.value.find((subscription) => subscription.status === 'active')?.id ?? subscriptionOptions.value[0]!.id
  }
  if (open && selectedSubscription.value) {
    genMaxActivations.value = selectedSubscription.value.activationsPerLicense
  }
})

watch(selectedSubscription, (subscription) => {
  if (subscription) {
    genMaxActivations.value = subscription.activationsPerLicense
  }
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Licenses' },
      ]"
    >
      <template #actions>
        <Dialog v-model:open="generateOpen">
          <DialogTrigger as-child>
            <Button size="sm">
              <Plus class="size-4" />
              Generate license
            </Button>
          </DialogTrigger>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>Generate new license</DialogTitle>
              <DialogDescription>Creates a signed row from an existing subscription.</DialogDescription>
            </DialogHeader>
            <div class="grid gap-4 py-2">
              <div class="grid gap-2">
                <Label for="lic-subscription">Subscription</Label>
                <NativeSelect id="lic-subscription" v-model="genSubscriptionId">
                  <NativeSelectOption v-for="sub in subscriptionOptions" :key="sub.id" :value="sub.id">
                    {{ sub.subscriberName }} · {{ sub.productName }} · {{ sub.planName }}
                  </NativeSelectOption>
                </NativeSelect>
                <p v-if="selectedSubscription" class="text-xs text-muted-foreground">
                  {{ selectedSubscription.subscriberName }} · {{ selectedSubscription.productName }}
                  · {{ selectedSubscription.licenseCount }} licenses
                  · {{ selectedSubscription.activationsPerLicense }} activations/license
                </p>
                <p v-else class="text-xs text-muted-foreground">No subscriptions are available to issue a license from.</p>
              </div>
              <div class="grid gap-2">
                <Label for="lic-mode">Mode</Label>
                <NativeSelect id="lic-mode" v-model="genMode">
                  <NativeSelectOption value="online">Online</NativeSelectOption>
                  <NativeSelectOption value="hybrid">Hybrid</NativeSelectOption>
                  <NativeSelectOption value="offline">Offline</NativeSelectOption>
                </NativeSelect>
              </div>
              <div class="grid gap-2">
                <Label for="lic-max">Activation cap</Label>
                <Input id="lic-max" v-model.number="genMaxActivations" type="number" min="1" max="999" />
                <p v-if="selectedSubscription" class="text-xs text-muted-foreground">
                  Defaulted from the subscription activation limit, but can be overridden for this issuance.
                </p>
              </div>
            </div>
            <p v-if="actionError && generateOpen" class="text-sm text-destructive">{{ actionError }}</p>
            <DialogFooter>
              <Button variant="outline" @click="generateOpen = false">Cancel</Button>
              <Button :disabled="generateBusy || !genSubscriptionId" @click="submitGenerate">
                <Loader2 v-if="generateBusy" class="size-4 animate-spin" />
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button variant="outline" size="sm" :disabled="pending" @click="refresh">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
      </template>
    </ConsolePageHeader>

    <div class="flex-1 space-y-6 p-4 lg:p-6">
      <Card class="overflow-hidden border-border/70 bg-card/90 shadow-sm backdrop-blur-sm">
        <CardHeader class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="space-y-1">
            <CardTitle>Licenses</CardTitle>
            <CardDescription>
              This page manages all generated licenses — modes, caps, subscription linkage, and signed payloads. Open a row for
              the full detail page.
            </CardDescription>
          </div>
          <div class="relative w-full sm:max-w-xs">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" class="pl-9" placeholder="Search by key, subscriber, product, plan…" />
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <p v-if="actionError && !generateOpen" class="px-6 pb-2 text-sm text-destructive">{{ actionError }}</p>
          <ScrollArea class="h-[min(75vh,840px)] w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>License ID</TableHead>
                  <TableHead>Subscriber</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Plan / edition</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valid from</TableHead>
                  <TableHead>Valid to</TableHead>
                  <TableHead>Grace until</TableHead>
                  <TableHead>Activations</TableHead>
                  <TableHead>Last download</TableHead>
                  <TableHead>Last check-in</TableHead>
                  <TableHead class="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="license in filtered"
                  :key="license.id"
                  class="cursor-pointer"
                  @click="navigateTo(licenseDetailPath(license))"
                >
                  <TableCell>
                    <div class="font-mono text-xs font-medium">{{ license.id }}</div>
                    <div class="font-mono text-[11px] text-muted-foreground">{{ license.licenseKey }}</div>
                  </TableCell>
                  <TableCell class="font-medium">{{ license.subscriberName }}</TableCell>
                  <TableCell>{{ license.productName }}</TableCell>
                  <TableCell>
                    <div class="text-sm">{{ license.planName ?? '—' }}</div>
                    <div class="text-xs text-muted-foreground">{{ license.planEdition ?? '' }}</div>
                  </TableCell>
                  <TableCell>
                    <div class="flex flex-wrap gap-1">
                      <Badge variant="outline">{{ license.mode }}</Badge>
                      <Badge v-if="license.offlineAllowed" variant="secondary">Offline-capable</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge :variant="statusVariant(license.status)">{{ license.status }}</Badge>
                  </TableCell>
                  <TableCell class="whitespace-nowrap text-sm">{{ formatDate(license.validFrom) }}</TableCell>
                  <TableCell class="whitespace-nowrap text-sm">{{ formatDate(license.validTo) }}</TableCell>
                  <TableCell class="whitespace-nowrap text-sm text-muted-foreground">{{ formatDate(license.graceUntil) }}</TableCell>
                  <TableCell class="whitespace-nowrap text-sm">
                    {{ license.activationCount ?? 0 }} / {{ license.maxActivations }}
                  </TableCell>
                  <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
                    <span v-if="license.lastPayloadDownloadAt">{{ formatRelative(license.lastPayloadDownloadAt) }}</span>
                    <span v-else>—</span>
                  </TableCell>
                  <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
                    <span v-if="license.lastCheckInAt">{{ formatRelative(license.lastCheckInAt) }}</span>
                    <span v-else>—</span>
                  </TableCell>
                  <TableCell class="text-right" @click.stop>
                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <Button variant="outline" size="icon" class="size-8">
                          <MoreHorizontal class="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" class="w-52">
                        <DropdownMenuItem as-child>
                          <NuxtLink :to="licenseDetailPath(license)">Open license detail</NuxtLink>
                        </DropdownMenuItem>
                        <DropdownMenuItem @click="downloadLicenseJson(license)">Download / export JSON</DropdownMenuItem>
                        <DropdownMenuItem @click="copyText(prettyPayload(license.payloadJson))">Copy raw payload</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
