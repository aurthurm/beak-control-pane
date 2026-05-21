<script setup lang="ts">
import ConsolePageHeader from '~/components/ConsolePageHeader.vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Separator } from '~/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { formatDate, formatDateTime, formatRelative, statusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import type { WorkspaceDashboard } from '~/types/workspace-dashboard'
import ActivationDetailPanel from '~/components/ActivationDetailPanel.vue'
import { ArrowLeft, CheckCircle2, Copy, Download, KeyRound, Loader2, Plus, RefreshCw, XCircle } from 'lucide-vue-next'

definePageMeta({ layout: 'console' })

type LicenseRow = WorkspaceDashboard['licenses'][number]

type LicensePatchBody = {
  action: 'revoke' | 'regenerate' | 'reissue' | 'supersede' | 'bind'
  siteId?: string
  deviceId?: string
}

const route = useRoute()
const router = useRouter()
const tenantId = computed(() => String(route.params.id ?? ''))
const licenseId = computed(() => String(route.params.licenseId ?? ''))

const { data, pending, refresh } = await useWorkspaceDashboard()

const license = computed(
  () => data.value?.licenses.find((l) => l.id === licenseId.value && l.tenantId === tenantId.value) ?? null,
)

const licenseById = computed(() => data.value?.licenses.find((l) => l.id === licenseId.value) ?? null)

watch(
  [pending, licenseById, tenantId],
  ([isPending, lic, tid]) => {
    if (isPending || !lic) return
    if (lic.tenantId !== tid) {
      void navigateTo(`/customers/${lic.tenantId}/license/${lic.id}`, { replace: true })
    }
  },
  { flush: 'post' },
)

const tenantName = computed(() => data.value?.tenants.find((t) => t.id === tenantId.value)?.name ?? tenantId.value)

const customerUrl = computed(() => `/customers/${tenantId.value}`)
const licensesListUrl = '/licenses'

useSeoMeta({
  title: computed(() =>
    license.value ? `${site.brand.name} | ${license.value.licenseKey}` : `${site.brand.name} | License`,
  ),
})

function parsePayload(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function prettyPayload(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

const payload = computed(() => (license.value ? parsePayload(license.value.payloadJson) : null))

const verification = computed(() => {
  if (!license.value) {
    return { ok: false, checks: [] as Array<{ label: string; ok: boolean; detail?: string }> }
  }
  const lic = license.value
  const p = payload.value
  const now = Date.now()
  const validTo = new Date(lic.validTo).getTime()
  const checks: Array<{ label: string; ok: boolean; detail?: string }> = [
    { label: 'Payload parses as JSON', ok: p !== null },
    {
      label: 'Schema version present',
      ok: typeof p?.schemaVersion === 'string',
      detail: typeof p?.schemaVersion === 'string' ? String(p.schemaVersion) : undefined,
    },
    {
      label: 'Signed license (JWS)',
      ok: (() => {
        const s = lic.signature ?? ''
        return s.split('.').length === 3
      })(),
      detail: (lic.signature ?? '').split('.').length === 3 ? 'ES256 compact JWT' : 'Local bootstrap fixture signature',
    },
    {
      label: 'Not past hard expiry',
      ok: validTo >= now || ['revoked', 'superseded'].includes(lic.status.toLowerCase()),
      detail: formatDate(lic.validTo),
    },
  ]
  return { ok: checks.every((c) => c.ok), checks }
})

const actionError = ref('')
const actionBusy = ref(false)

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    actionError.value = 'Could not copy to clipboard.'
  }
}

function downloadLicenseJson(lic: LicenseRow) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          licenseKey: lic.licenseKey,
          signature: lic.signature,
          payload: parsePayload(lic.payloadJson),
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
  a.download = `${lic.id}.license.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function patchLicense(action: LicensePatchBody['action'], extra?: { siteId?: string; deviceId?: string }) {
  if (!license.value) return
  actionError.value = ''
  actionBusy.value = true
  try {
    await $fetch(`/api/licenses/${license.value.id}`, {
      method: 'PATCH',
      body: { action, ...extra },
    })
    await refresh()
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    actionError.value = err.data?.statusMessage ?? err.message ?? 'Request failed'
  } finally {
    actionBusy.value = false
  }
}

const bindOpen = ref(false)
const bindSiteId = ref('')
const bindDeviceId = ref('')
const bindBusy = ref(false)

function openBind() {
  if (!license.value) return
  const p = parsePayload(license.value.payloadJson)
  const b = p?.binding as Record<string, string> | undefined
  bindSiteId.value = b?.siteId ?? ''
  bindDeviceId.value = b?.deviceId ?? ''
  bindOpen.value = true
}

async function submitBind() {
  if (!license.value) return
  bindBusy.value = true
  actionError.value = ''
  try {
    await patchLicense('bind', {
      siteId: bindSiteId.value,
      deviceId: bindDeviceId.value,
    })
    bindOpen.value = false
  } finally {
    bindBusy.value = false
  }
}

const notFound = computed(() => !pending.value && data.value && !licenseById.value)

const licenseActivations = computed(() => {
  const rows = (data.value?.activations ?? []).filter((a) => a.licenseId === licenseId.value)
  return [...rows].sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
})

const selectedActivationId = ref<string | null>(null)

watch(
  [licenseActivations, () => route.query.activation],
  ([rows, actQ]) => {
    if (!rows.length) {
      selectedActivationId.value = null
      return
    }
    const q = typeof actQ === 'string' && actQ.trim() ? actQ.trim() : null
    if (q && rows.some((r) => r.id === q)) {
      selectedActivationId.value = q
      return
    }
    if (!selectedActivationId.value || !rows.some((r) => r.id === selectedActivationId.value)) {
      selectedActivationId.value = rows[0]!.id
    }
  },
  { immediate: true },
)

watch(licenseId, () => {
  selectedActivationId.value = null
})

function selectActivation(id: string) {
  selectedActivationId.value = id
  router.replace({
    path: route.path,
    query: { ...route.query, tab: 'activations', activation: id },
  })
}

const registerOpen = ref(false)
const registerBusy = ref(false)
const registerMessage = ref('')
const registerForm = ref({
  activationType: 'machine',
  deviceId: '',
  siteId: '',
  installationId: '',
  userBinding: '',
  ip: '',
  hostname: '',
})

function resetRegisterForm() {
  registerMessage.value = ''
  registerForm.value = {
    activationType: 'machine',
    deviceId: '',
    siteId: '',
    installationId: '',
    userBinding: '',
    ip: '',
    hostname: '',
  }
}

watch(registerOpen, (open) => {
  if (open) {
    resetRegisterForm()
  }
})

async function submitRegisterActivation() {
  if (!license.value) return
  registerMessage.value = ''
  registerBusy.value = true
  try {
    const env: Record<string, string> = {}
    if (registerForm.value.ip.trim()) {
      env.ip = registerForm.value.ip.trim()
    }
    if (registerForm.value.hostname.trim()) {
      env.hostname = registerForm.value.hostname.trim()
    }
    const created = await $fetch<{ id: string }>('/api/activations', {
      method: 'POST',
      body: {
        licenseId: license.value.id,
        activationType: registerForm.value.activationType,
        deviceId: registerForm.value.deviceId,
        siteId: registerForm.value.siteId,
        installationId: registerForm.value.installationId,
        userBinding: registerForm.value.userBinding || undefined,
        environment: Object.keys(env).length ? env : undefined,
      },
    })
    registerOpen.value = false
    await refresh()
    selectActivation(created.id)
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    registerMessage.value = err.data?.statusMessage ?? err.message ?? 'Registration failed'
  } finally {
    registerBusy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Customers', to: '/customers' },
        { label: tenantName, to: customerUrl },
        { label: license?.licenseKey ?? licenseId },
      ]"
    >
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <NuxtLink :to="customerUrl" class="gap-1">
            <ArrowLeft class="size-4" />
            Back to customer
          </NuxtLink>
        </Button>
        <Button variant="outline" size="sm" as-child>
          <NuxtLink :to="licensesListUrl" class="text-muted-foreground">All licenses</NuxtLink>
        </Button>
        <Button variant="outline" size="sm" :disabled="pending" @click="refresh">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
      </template>
    </ConsolePageHeader>

    <div v-if="pending" class="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <div v-else-if="notFound" class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <KeyRound class="size-10 text-muted-foreground" />
      <div>
        <p class="font-medium">License not found</p>
        <p class="text-sm text-muted-foreground">It may have been removed or the link is wrong.</p>
      </div>
      <Button as-child variant="outline">
        <NuxtLink :to="licensesListUrl">Go to licenses</NuxtLink>
      </Button>
    </div>

    <div v-else-if="license" class="flex-1 space-y-6 p-4 lg:p-6">
      <p v-if="actionError" class="text-sm text-destructive">{{ actionError }}</p>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 space-y-1">
          <h1 class="font-mono text-lg font-semibold tracking-tight">{{ license.licenseKey }}</h1>
          <p class="text-sm text-muted-foreground">{{ license.productName }} · {{ license.tenantName }}</p>
          <p class="font-mono text-xs text-muted-foreground">{{ license.id }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Badge :variant="statusVariant(license.status)">{{ license.status }}</Badge>
          <Badge variant="outline">{{ license.mode }}</Badge>
          <Badge v-if="license.offlineAllowed" variant="secondary">Offline-capable</Badge>
        </div>
      </div>

      <Card class="overflow-hidden rounded-3xl border-border/70 bg-card/90 shadow-sm">
        <CardHeader class="pb-3">
          <CardTitle class="text-base">Validity &amp; usage</CardTitle>
          <CardDescription>Plan linkage, activation usage, and telemetry hints from the workspace snapshot.</CardDescription>
        </CardHeader>
        <div class="grid gap-3 border-t border-border/60 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan / edition</div>
            <div class="mt-1 text-sm font-medium">{{ license.planName ?? '—' }}</div>
            <div class="text-xs text-muted-foreground">{{ license.planEdition ?? '' }}</div>
          </div>
          <div>
            <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid</div>
            <div class="mt-1 text-sm">{{ formatDate(license.validFrom) }} → {{ formatDate(license.validTo) }}</div>
            <div class="text-xs text-muted-foreground">Grace {{ formatDate(license.graceUntil) }}</div>
          </div>
          <div>
            <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Activations</div>
            <div class="mt-1 text-sm">{{ license.activationCount ?? 0 }} / {{ license.maxActivations }}</div>
          </div>
          <div>
            <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last activity</div>
            <div class="mt-1 text-sm">
              Download:
              <span v-if="license.lastPayloadDownloadAt" class="text-muted-foreground">{{
                formatRelative(license.lastPayloadDownloadAt)
              }}</span>
              <span v-else class="text-muted-foreground">—</span>
            </div>
            <div class="text-xs text-muted-foreground">
              Check-in:
              <span v-if="license.lastCheckInAt">{{ formatRelative(license.lastCheckInAt) }}</span>
              <span v-else>—</span>
            </div>
          </div>
        </div>
      </Card>

      <div class="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-muted/20 p-3">
        <Button variant="outline" size="sm" :disabled="actionBusy" @click="copyText(prettyPayload(license.payloadJson))">
          <Copy class="size-3.5" />
          Copy payload
        </Button>
        <Button variant="outline" size="sm" :disabled="actionBusy" @click="downloadLicenseJson(license)">
          <Download class="size-3.5" />
          Download
        </Button>
        <Separator orientation="vertical" class="mx-1 hidden h-6 sm:block" />
        <Button variant="outline" size="sm" :disabled="actionBusy" @click="patchLicense('regenerate')">Regenerate</Button>
        <Button variant="outline" size="sm" :disabled="actionBusy" @click="patchLicense('reissue')">Reissue</Button>
        <Button variant="outline" size="sm" :disabled="actionBusy" @click="openBind">Bind…</Button>
        <Button variant="outline" size="sm" :disabled="actionBusy" @click="patchLicense('supersede')">Supersede</Button>
        <Button variant="destructive" size="sm" :disabled="actionBusy" @click="patchLicense('revoke')">Revoke</Button>
        <Loader2 v-if="actionBusy" class="size-4 animate-spin text-muted-foreground" />
      </div>

      <Tabs
        :key="license.id"
        :default-value="route.query.tab === 'activations' ? 'activations' : 'summary'"
        class="w-full"
      >
        <TabsList class="mb-4 h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-muted/50 p-1">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="activations">Activations</TabsTrigger>
          <TabsTrigger value="entitlements">Entitlements</TabsTrigger>
          <TabsTrigger value="constraints">Constraints</TabsTrigger>
          <TabsTrigger value="binding">Binding</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" class="mt-0 space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-2xl border border-border/70 bg-card/80 p-4">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked customer</h4>
              <p class="mt-1 font-medium">{{ license.tenantName }}</p>
              <p class="font-mono text-xs text-muted-foreground">{{ license.tenantId }}</p>
            </div>
            <div class="rounded-2xl border border-border/70 bg-card/80 p-4">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Product &amp; subscription</h4>
              <p class="mt-1 font-medium">{{ license.productName }}</p>
              <p class="text-xs text-muted-foreground">
                <span v-if="license.subscriptionId" class="font-mono">{{ license.subscriptionId }}</span>
                <span v-else>—</span>
                <span v-if="license.subscriptionStatus"> · {{ license.subscriptionStatus }}</span>
              </p>
            </div>
            <div class="rounded-2xl border border-border/70 bg-card/80 p-4">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Issuance</h4>
              <template v-if="payload?.issue">
                <p class="mt-1 text-sm">
                  <span class="text-muted-foreground">By</span>
                  {{ (payload.issue as Record<string, string>).issuedBy ?? '—' }}
                </p>
                <p class="text-sm">
                  <span class="text-muted-foreground">Reason</span>
                  {{ (payload.issue as Record<string, string>).reason ?? '—' }}
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ formatDateTime(String((payload.issue as Record<string, string>).issuedAt ?? license.validFrom)) }}
                  · rev {{ (payload.issue as Record<string, number>).revision ?? '—' }}
                </p>
              </template>
              <p v-else class="mt-1 text-sm text-muted-foreground">No issue block in payload.</p>
            </div>
            <div class="rounded-2xl border border-border/70 bg-card/80 p-4">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Signature metadata</h4>
              <dl class="mt-2 space-y-1 text-sm">
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Algorithm</dt>
                  <dd class="font-mono text-xs">ES256 / JWS</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Key id</dt>
                  <dd class="font-mono text-xs">bcp-1</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Schema</dt>
                  <dd class="font-mono text-xs">{{ String(payload?.schemaVersion ?? '—') }}</dd>
                </div>
              </dl>
              <p class="mt-2 break-all font-mono text-[11px] text-muted-foreground">{{ license.signature }}</p>
            </div>
          </div>

          <div class="rounded-2xl border border-border/70 bg-card/80 p-4">
            <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Verification preview</h4>
            <ul class="mt-2 space-y-2">
              <li v-for="(c, i) in verification.checks" :key="i" class="flex items-start gap-2 text-sm">
                <CheckCircle2 v-if="c.ok" class="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <XCircle v-else class="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>
                  {{ c.label }}
                  <span v-if="c.detail" class="block text-xs text-muted-foreground">{{ c.detail }}</span>
                </span>
              </li>
            </ul>
            <p class="mt-3 text-xs font-medium" :class="verification.ok ? 'text-emerald-700' : 'text-destructive'">
              {{ verification.ok ? 'All checks passed.' : 'One or more checks failed.' }}
            </p>
          </div>

          <div class="rounded-2xl border border-border/70 bg-card/80 p-4">
            <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version history</h4>
            <ul v-if="(license.versionHistory ?? []).length" class="mt-2 space-y-2 text-sm">
              <li v-for="ev in license.versionHistory ?? []" :key="ev.id" class="border-b border-border/40 pb-2 last:border-0">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <span class="font-medium">{{ ev.action }}</span>
                  <span class="text-xs text-muted-foreground">{{ formatDateTime(ev.createdAt) }}</span>
                </div>
                <p class="text-xs text-muted-foreground">{{ ev.actor }}</p>
              </li>
            </ul>
            <p v-else class="mt-2 text-sm text-muted-foreground">No audit events for this license yet.</p>
          </div>

          <div class="rounded-xl border border-border/70 bg-card/80 p-4">
            <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Seat bindings</h4>
            <p class="mt-2 text-sm text-muted-foreground">
              Live activations, heartbeats, and release actions are on the
              <NuxtLink
                class="text-primary underline-offset-4 hover:underline"
                :to="{ path: `/customers/${license.tenantId}/license/${license.id}`, query: { tab: 'activations' } }"
                >Activations</NuxtLink
              >
              tab for this license.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="activations" class="mt-0">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm text-muted-foreground">
              {{ licenseActivations.length }} activation{{ licenseActivations.length === 1 ? '' : 's' }} ·
              {{ license.activationCount ?? licenseActivations.length }} / {{ license.maxActivations }} seats
            </p>
            <Button variant="outline" size="sm" @click="registerOpen = true">
              <Plus class="size-3.5" />
              Register activation
            </Button>
          </div>
          <div class="grid min-h-[min(72vh,680px)] gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
            <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/50">
              <div class="shrink-0 border-b border-border/60 px-3 py-2">
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">License activations</p>
                <p class="text-[11px] text-muted-foreground">Newest check-in first</p>
              </div>
              <ScrollArea class="min-h-0 flex-1">
                <div class="p-2">
                  <div
                    v-if="!licenseActivations.length"
                    class="rounded-lg border border-dashed border-border/70 px-3 py-10 text-center text-sm text-muted-foreground"
                  >
                    No activations for this license yet. Use Register activation above to add a seat.
                  </div>
                  <div v-else class="space-y-1.5">
                    <button
                      v-for="act in licenseActivations"
                      :key="act.id"
                      type="button"
                      class="w-full rounded-lg border px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      :class="
                        selectedActivationId === act.id
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : 'border-border/60 bg-background/40 hover:border-border hover:bg-muted/40'
                      "
                      @click="selectActivation(act.id)"
                    >
                      <div class="truncate font-mono text-[10px] text-muted-foreground">{{ act.id }}</div>
                      <div class="truncate font-medium leading-snug">{{ act.bindingLabel }}</div>
                      <div class="mt-1.5 flex items-center justify-between gap-1">
                        <Badge variant="outline" class="h-5 px-1.5 text-[10px] capitalize">{{ act.status }}</Badge>
                        <span class="shrink-0 text-[10px] tabular-nums text-muted-foreground">{{
                          formatRelative(act.lastSeenAt)
                        }}</span>
                      </div>
                    </button>
                  </div>
                </div>
              </ScrollArea>
            </div>
            <div
              class="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-border/70 bg-card/50 p-3 lg:p-4"
            >
              <ActivationDetailPanel
                :activation-id="selectedActivationId"
                embed-mode
                @updated="refresh"
                @select-sibling="selectActivation"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="entitlements" class="mt-0">
          <template v-if="license.linkedEntitlement">
            <p class="text-xs text-muted-foreground">
              Linked entitlement {{ license.linkedEntitlement.id }} · computed
              {{ formatDateTime(license.linkedEntitlement.computedAt) }}
            </p>
            <div v-if="license.linkedEntitlement.modules" class="mt-3">
              <h4 class="text-xs font-medium uppercase text-muted-foreground">Modules</h4>
              <div class="mt-2 flex flex-wrap gap-1">
                <Badge
                  v-for="(on, key) in license.linkedEntitlement.modules"
                  :key="key"
                  :variant="on ? 'default' : 'secondary'"
                  class="text-[10px]"
                >
                  {{ key }}
                </Badge>
              </div>
            </div>
            <div v-if="license.linkedEntitlement.limits" class="mt-4">
              <h4 class="text-xs font-medium uppercase text-muted-foreground">Limits</h4>
              <ul class="mt-2 space-y-1 font-mono text-xs">
                <li v-for="(val, key) in license.linkedEntitlement.limits" :key="key" class="flex justify-between gap-2">
                  <span>{{ key }}</span>
                  <span>{{ val }}</span>
                </li>
              </ul>
            </div>
          </template>
          <p v-else class="text-sm text-muted-foreground">No computed entitlement row for this customer/product pair.</p>
        </TabsContent>

        <TabsContent value="constraints" class="mt-0">
          <pre
            v-if="payload?.constraints"
            class="rounded-lg border border-border/70 bg-muted/30 p-3 font-mono text-xs leading-relaxed"
            >{{ JSON.stringify(payload.constraints, null, 2) }}</pre
          >
          <p v-else class="text-sm text-muted-foreground">No constraints object on payload.</p>
        </TabsContent>

        <TabsContent value="binding" class="mt-0">
          <pre
            v-if="payload?.binding && Object.keys(payload.binding as object).length"
            class="rounded-lg border border-border/70 bg-muted/30 p-3 font-mono text-xs leading-relaxed"
            >{{ JSON.stringify(payload.binding, null, 2) }}</pre
          >
          <p v-else class="text-sm text-muted-foreground">No binding stored. Use Bind in the toolbar.</p>
        </TabsContent>

        <TabsContent value="raw" class="mt-0 space-y-3">
          <p class="text-xs text-muted-foreground">Beautified JSON payload carried with the license.</p>
          <ScrollArea class="max-h-[min(60vh,520px)] rounded-md border border-border/70">
            <pre class="whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed">{{ prettyPayload(license.payloadJson) }}</pre>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>

    <Dialog v-model:open="bindOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Bind license</DialogTitle>
          <DialogDescription>Optional site and device hints stored in the payload.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div class="grid gap-2">
            <Label for="bind-site">Site ID</Label>
            <Input id="bind-site" v-model="bindSiteId" placeholder="site-central-01" />
          </div>
          <div class="grid gap-2">
            <Label for="bind-device">Device ID</Label>
            <Input id="bind-device" v-model="bindDeviceId" placeholder="device-001" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="bindOpen = false">Cancel</Button>
          <Button :disabled="bindBusy" @click="submitBind">
            <Loader2 v-if="bindBusy" class="size-4 animate-spin" />
            Save binding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="registerOpen">
      <DialogContent class="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register activation</DialogTitle>
          <DialogDescription>
            Bind a machine, server, site, user, or installation to this license. Caps are enforced before a new seat is created.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-2">
          <p v-if="registerMessage" class="text-sm text-destructive">{{ registerMessage }}</p>
          <div class="grid gap-2">
            <Label for="reg-type">Activation type</Label>
            <Select v-model="registerForm.activationType">
              <SelectTrigger id="reg-type" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="machine">Machine</SelectItem>
                <SelectItem value="server">Server</SelectItem>
                <SelectItem value="site">Site</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="installation">Installation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div v-if="registerForm.activationType === 'user'" class="grid gap-2">
            <Label for="reg-user">User binding</Label>
            <Input id="reg-user" v-model="registerForm.userBinding" placeholder="email or directory id" autocomplete="off" />
          </div>
          <div class="grid gap-2">
            <Label for="reg-device">Device / server identifier</Label>
            <Input id="reg-device" v-model="registerForm.deviceId" placeholder="device fingerprint or host id" autocomplete="off" />
          </div>
          <div class="grid gap-2">
            <Label for="reg-site">Site identifier</Label>
            <Input id="reg-site" v-model="registerForm.siteId" placeholder="branch, venue, or site code" autocomplete="off" />
          </div>
          <div class="grid gap-2">
            <Label for="reg-inst">Installation id</Label>
            <Input id="reg-inst" v-model="registerForm.installationId" placeholder="unique install slot" autocomplete="off" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="grid gap-2">
              <Label for="reg-ip">IP (optional)</Label>
              <Input id="reg-ip" v-model="registerForm.ip" placeholder="10.0.0.1" autocomplete="off" />
            </div>
            <div class="grid gap-2">
              <Label for="reg-host">Hostname (optional)</Label>
              <Input id="reg-host" v-model="registerForm.hostname" autocomplete="off" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" @click="registerOpen = false">Cancel</Button>
          <Button type="button" :disabled="registerBusy" @click="submitRegisterActivation">
            {{ registerBusy ? 'Saving…' : 'Register' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
