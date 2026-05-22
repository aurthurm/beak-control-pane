<script setup lang="ts">
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatDateTime, formatRelative, statusVariant } from '~/lib/formatters'

export type ActivationDetailPayload = {
  activation: {
    id: string
    licenseId: string
    deviceId: string
    siteId: string
    installationId: string
    activationType: string
    userBinding: string
    status: string
    activatedAt: string
    lastSeenAt: string
    environment: Record<string, string>
    heartbeats: Array<{ at: string; ip?: string }>
    violations: Array<{ at: string; kind: string; detail: string }>
  }
  license: {
    id: string
    licenseKey: string
    maxActivations: number
    status: string
    mode: string
  } | null
  subscriber: { id: string; name: string } | null
  product: { id: string; name: string } | null
  indicators: {
    stale: boolean
    duplicateMachine: boolean
    licenseAtCap: boolean
    licenseOverCap: boolean
    multiEnvironment: boolean
    inactiveConsumingSeat: boolean
    suspicious: boolean
    highUtilization: boolean
  }
  licenseActivationsSummary: { activeSeatsForLicense: number; maxActivations: number }
  siblings: Array<{
    id: string
    status: string
    activationType: string
    deviceId: string
    siteId: string
    bindingLabel: string
    lastSeenAt: string
  }>
}

const props = withDefaults(
  defineProps<{
    activationId: string | null
    /** Hide license/subscriber summary and siblings — used when listing activations alongside the panel. */
    embedMode?: boolean
  }>(),
  { embedMode: false },
)

const emit = defineEmits<{
  updated: []
  selectSibling: [id: string]
}>()

const activationIdRef = toRef(props, 'activationId')

const { data, pending, error, refresh } = await useAsyncData(
  () => `activation-panel-${activationIdRef.value ?? 'none'}`,
  async () => {
    const id = activationIdRef.value
    if (!id) {
      return null as ActivationDetailPayload | null
    }
    return await $fetch<ActivationDetailPayload>(`/api/activations/${id}`)
  },
  { watch: [activationIdRef] },
)

const busy = ref('')
const message = ref('')

async function patchAction(action: 'release' | 'invalidate' | 'checkin') {
  const id = activationIdRef.value
  if (!id) return
  message.value = ''
  if (action === 'release' && !confirm('Release this activation and free the seat?')) {
    return
  }
  if (action === 'invalidate' && !confirm('Mark this activation as invalid?')) {
    return
  }
  busy.value = action
  try {
    await $fetch(`/api/activations/${id}`, {
      method: 'PATCH',
      body: { action },
    })
    await refresh()
    emit('updated')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    message.value = err.data?.statusMessage ?? err.message ?? 'Request failed'
  } finally {
    busy.value = ''
  }
}

defineExpose({ refresh })

function licenseWorkspaceQuery(extra: Record<string, string> = {}) {
  const subscriber = data.value?.subscriber
  const lic = data.value?.license
  if (!subscriber || !lic) {
    return null
  }
  return {
    path: `/subscribers/${encodeURIComponent(subscriber.id)}/license/${encodeURIComponent(lic.id)}`,
    query: { tab: 'activations', ...extra },
  }
}

const licenseHubHref = computed(() => licenseWorkspaceQuery())

const subscriberHubHref = computed(() => (data.value?.subscriber ? `/subscribers/${encodeURIComponent(data.value.subscriber.id)}` : null))

const violationsNewestFirst = computed(() => [...(data.value?.activation.violations ?? [])].reverse())
</script>

<template>
  <div class="space-y-4">
    <p v-if="message" class="text-sm text-destructive">{{ message }}</p>

    <div
      v-if="!activationIdRef"
      class="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground"
    >
      Select an activation on the left to inspect binding, heartbeats, and violations.
    </div>

    <template v-else-if="error">
      <p class="text-sm text-destructive">Could not load activation.</p>
    </template>

    <template v-else-if="pending && !data">
      <p class="text-sm text-muted-foreground">Loading…</p>
    </template>

    <template v-else-if="data">
      <div class="flex flex-wrap items-center gap-2">
        <Badge :variant="statusVariant(data.activation.status)">{{ data.activation.status }}</Badge>
        <Badge variant="outline">{{ data.activation.activationType }}</Badge>
        <template v-if="data.indicators.suspicious">
          <Badge variant="destructive">Suspicious — review recommended</Badge>
        </template>
        <Badge v-if="data.indicators.highUtilization" variant="warning">High seat utilization (~80%+)</Badge>
        <Button v-if="!embedMode && data.license && licenseHubHref" variant="outline" size="sm" as-child>
          <NuxtLink :to="licenseHubHref" class="inline-flex items-center gap-1.5"> Open in license workspace </NuxtLink>
        </Button>
      </div>

      <div v-if="!embedMode" class="grid gap-4 lg:grid-cols-2">
        <Card class="border-border/70">
          <CardHeader>
            <CardTitle class="text-base">Linked license</CardTitle>
            <CardDescription>Issued key and allowance</CardDescription>
          </CardHeader>
          <CardContent class="space-y-2 text-sm">
            <template v-if="data.license">
              <div v-if="licenseHubHref" class="text-xs">
                <NuxtLink :to="licenseHubHref" class="text-primary underline-offset-4 hover:underline">
                  Open license workspace
                </NuxtLink>
              </div>
              <div>
                <span class="text-muted-foreground">Key</span>
                <div class="font-mono">{{ data.license.licenseKey }}</div>
              </div>
              <div>
                <span class="text-muted-foreground">Mode / license status</span>
                <div>{{ data.license.mode }} · {{ data.license.status }}</div>
              </div>
              <div>
                <span class="text-muted-foreground">Seats</span>
                <div class="tabular-nums">
                  {{ data.licenseActivationsSummary.activeSeatsForLicense }} /
                  {{ data.licenseActivationsSummary.maxActivations }}
                </div>
              </div>
            </template>
          </CardContent>
        </Card>

        <Card class="border-border/70">
          <CardHeader>
            <CardTitle class="text-base">Subscriber &amp; product</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2 text-sm">
            <div v-if="data.subscriber">
              <span class="text-muted-foreground">Subscriber</span>
              <div class="font-medium">{{ data.subscriber.name }}</div>
              <NuxtLink
                v-if="subscriberHubHref"
                :to="subscriberHubHref"
                class="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline"
              >
                Subscriber profile
              </NuxtLink>
            </div>
            <div v-if="data.product">
              <span class="text-muted-foreground">Product</span>
              <div class="font-medium">{{ data.product.name }}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card v-else class="border-border/70 bg-muted/10">
        <CardContent class="flex flex-wrap items-baseline justify-between gap-2 pt-4 text-sm">
          <span class="text-muted-foreground">Seats on this license</span>
          <span class="tabular-nums font-medium">
            {{ data.licenseActivationsSummary.activeSeatsForLicense }} / {{ data.licenseActivationsSummary.maxActivations }}
          </span>
        </CardContent>
      </Card>

      <Card class="border-border/70">
        <CardHeader>
          <CardTitle class="text-base">Binding</CardTitle>
          <CardDescription>Identifiers reported by the client</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span class="text-muted-foreground">Activation id</span>
            <div class="font-mono text-xs">{{ data.activation.id }}</div>
          </div>
          <div>
            <span class="text-muted-foreground">License id</span>
            <div class="font-mono text-xs">{{ data.activation.licenseId }}</div>
          </div>
          <div>
            <span class="text-muted-foreground">Device / server id</span>
            <div>{{ data.activation.deviceId }}</div>
          </div>
          <div>
            <span class="text-muted-foreground">Site</span>
            <div>{{ data.activation.siteId }}</div>
          </div>
          <div>
            <span class="text-muted-foreground">Installation</span>
            <div>{{ data.activation.installationId }}</div>
          </div>
          <div v-if="data.activation.userBinding">
            <span class="text-muted-foreground">User binding</span>
            <div>{{ data.activation.userBinding }}</div>
          </div>
          <div>
            <span class="text-muted-foreground">Activated at</span>
            <div>{{ formatDateTime(data.activation.activatedAt) }}</div>
          </div>
          <div>
            <span class="text-muted-foreground">Last seen</span>
            <div>{{ formatRelative(data.activation.lastSeenAt) }} ({{ formatDateTime(data.activation.lastSeenAt) }})</div>
          </div>
        </CardContent>
      </Card>

      <Card class="border-border/70">
        <CardHeader>
          <CardTitle class="text-base">Environment</CardTitle>
          <CardDescription>IP and client-reported metadata</CardDescription>
        </CardHeader>
        <CardContent>
          <dl class="grid gap-2 text-sm sm:grid-cols-2">
            <template v-for="(val, key) in data.activation.environment" :key="key">
              <div>
                <dt class="text-muted-foreground">{{ key }}</dt>
                <dd class="font-mono text-xs break-all">{{ val }}</dd>
              </div>
            </template>
            <p v-if="!Object.keys(data.activation.environment).length" class="text-muted-foreground">No environment metadata stored.</p>
          </dl>
        </CardContent>
      </Card>

      <div class="grid gap-4 lg:grid-cols-2">
        <Card class="border-border/70">
          <CardHeader>
            <CardTitle class="text-base">Heartbeat history</CardTitle>
            <CardDescription>Recent check-ins (newest first)</CardDescription>
          </CardHeader>
          <CardContent class="p-0">
            <ScrollArea class="max-h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="(hb, i) in [...data.activation.heartbeats].reverse()" :key="i">
                    <TableCell class="whitespace-nowrap text-xs">{{ formatDateTime(hb.at) }}</TableCell>
                    <TableCell class="font-mono text-xs">{{ hb.ip ?? '—' }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card class="border-border/70">
          <CardHeader>
            <CardTitle class="text-base">Violation events</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3 text-sm">
            <div
              v-for="(v, i) in violationsNewestFirst"
              :key="i"
              class="border border-border/60 bg-muted/20 p-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{{ v.kind }}</Badge>
                <span class="text-xs text-muted-foreground">{{ formatDateTime(v.at) }}</span>
              </div>
              <p class="mt-2 text-sm leading-relaxed">{{ v.detail }}</p>
            </div>
            <p v-if="!data.activation.violations.length" class="text-muted-foreground">No violations recorded.</p>
          </CardContent>
        </Card>
      </div>

      <Card v-if="!embedMode && data.siblings.length" class="border-border/70">
        <CardHeader>
          <CardTitle class="text-base">Other activations on this license</CardTitle>
          <CardDescription>Seats under the same license key (newest check-in first).</CardDescription>
        </CardHeader>
        <CardContent class="p-0">
          <ScrollArea class="max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activation</TableHead>
                  <TableHead>Binding</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="s in data.siblings" :key="s.id">
                  <TableCell class="font-mono text-xs">
                    <NuxtLink
                      v-if="data.subscriber && data.license"
                      :to="{
                        path: `/subscribers/${data.subscriber.id}/license/${data.license.id}`,
                        query: { tab: 'activations', activation: s.id },
                      }"
                      class="text-primary underline-offset-4 hover:underline"
                    >
                      {{ s.id }}
                    </NuxtLink>
                    <span v-else class="font-mono">{{ s.id }}</span>
                  </TableCell>
                  <TableCell class="max-w-[200px] truncate text-xs" :title="s.bindingLabel">{{ s.bindingLabel }}</TableCell>
                  <TableCell>
                    <Badge variant="outline" class="text-[10px]">{{ s.activationType }}</Badge>
                  </TableCell>
                  <TableCell class="whitespace-nowrap text-xs text-muted-foreground">
                    {{ formatRelative(s.lastSeenAt) }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card v-else-if="embedMode && data.siblings.length" class="border-border/70">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">Also on this license</CardTitle>
          <CardDescription class="text-xs">Open another seat from the list on the left, or follow a link.</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-wrap gap-2">
          <Button
            v-for="s in data.siblings"
            :key="s.id"
            variant="outline"
            size="sm"
            class="h-auto max-w-[200px] flex-col items-start gap-0.5 py-2"
            @click="emit('selectSibling', s.id)"
          >
            <span class="truncate font-mono text-[10px] text-muted-foreground">{{ s.id }}</span>
            <span class="truncate text-xs">{{ s.bindingLabel }}</span>
          </Button>
        </CardContent>
      </Card>

      <Card class="border-border/70">
        <CardHeader>
          <CardTitle class="text-base">Risk indicators</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-wrap gap-2 text-sm">
          <Badge v-if="data.indicators.stale" variant="warning">Stale check-in</Badge>
          <Badge v-if="data.indicators.duplicateMachine" variant="warning">Duplicate machine id</Badge>
          <Badge v-if="data.indicators.multiEnvironment" variant="secondary">Many environments on license</Badge>
          <Badge v-if="data.indicators.licenseAtCap" variant="warning">License at activation cap</Badge>
          <Badge v-if="data.indicators.licenseOverCap" variant="destructive">License over cap</Badge>
          <Badge v-if="data.indicators.inactiveConsumingSeat" variant="outline">Inactive device consuming seat</Badge>
          <Badge v-if="data.indicators.highUtilization" variant="warning">High seat use (below max but ~80%+)</Badge>
          <p
            v-if="
              !data.indicators.stale &&
              !data.indicators.duplicateMachine &&
              !data.indicators.multiEnvironment &&
              !data.indicators.licenseAtCap &&
              !data.indicators.licenseOverCap &&
              !data.indicators.inactiveConsumingSeat &&
              !data.indicators.highUtilization
            "
            class="text-muted-foreground"
          >
            No flags on this record.
          </p>
        </CardContent>
      </Card>

      <div class="flex flex-wrap gap-2 border-t border-border/60 pt-4">
        <Button
          v-if="['active', 'exceeded'].includes(String(data.activation.status).toLowerCase())"
          variant="secondary"
          :disabled="!!busy"
          @click="patchAction('release')"
        >
          {{ busy === 'release' ? '…' : 'Release / deactivate' }}
        </Button>
        <Button
          v-if="['active', 'exceeded'].includes(String(data.activation.status).toLowerCase())"
          variant="outline"
          :disabled="!!busy"
          @click="patchAction('invalidate')"
        >
          {{ busy === 'invalidate' ? '…' : 'Mark invalid' }}
        </Button>
        <Button variant="default" :disabled="!!busy" @click="patchAction('checkin')">
          {{ busy === 'checkin' ? '…' : 'Record check-in now' }}
        </Button>
      </div>
    </template>
  </div>
</template>
