<script setup lang="ts">
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
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatDate, statusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import { ChevronRight, Plus, RefreshCw, Search } from 'lucide-vue-next'

definePageMeta({ layout: 'console' })

useSeoMeta({
  title: `${site.brand.name} | Customers`,
  description: 'Customer registry across the platform.',
})

const router = useRouter()

const search = ref('')
const { data, pending, refresh } = await useWorkspaceDashboard()

const query = computed(() => search.value.trim().toLowerCase())
const filtered = computed(() => {
  const rows = data.value?.tenants ?? []
  const q = query.value
  if (!q) return rows
  return rows.filter((tenant) => {
    const hay = [
      tenant.name,
      tenant.slug,
      tenant.legalName,
      tenant.status,
      tenant.planSummary,
      tenant.billingStatus,
      tenant.licenseStatus,
      tenant.country,
      tenant.contactName,
      tenant.email,
      tenant.subscribedProducts.join(' '),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
})

const metrics = computed(() => {
  const rows = filtered.value
  return [
    { label: 'Customers', value: rows.length, detail: 'Visible in the current view' },
    { label: 'Active', value: rows.filter((tenant) => tenant.status === 'active').length, detail: 'Live customer accounts' },
    { label: 'With subscriptions', value: rows.filter((tenant) => tenant.subscribedProducts.length > 0).length, detail: 'Customers already in use' },
  ]
})

const createOpen = ref(false)
const actionError = ref('')
const saving = ref('')

const form = ref({
  slug: '',
  name: '',
  legalName: '',
  industry: 'General',
  status: 'active',
  seats: 0,
  email: '',
  phone: '',
  country: '',
  billingMode: '',
  billingProvider: '',
  supportTier: '',
  internalNotes: '',
  contactName: '',
})

const resetForm = () => {
  form.value = {
    slug: '',
    name: '',
    legalName: '',
    industry: 'General',
    status: 'active',
    seats: 0,
    email: '',
    phone: '',
    country: '',
    billingMode: '',
    billingProvider: '',
    supportTier: '',
    internalNotes: '',
    contactName: '',
  }
}

const openCreate = () => {
  actionError.value = ''
  resetForm()
  createOpen.value = true
}

const submitCreate = async () => {
  saving.value = 'create'
  actionError.value = ''
  try {
    await $fetch('/api/tenants', {
      method: 'POST',
      body: {
        slug: form.value.slug || undefined,
        name: form.value.name,
        legalName: form.value.legalName,
        industry: form.value.industry,
        status: form.value.status,
        seats: form.value.seats,
        email: form.value.email,
        phone: form.value.phone,
        country: form.value.country,
        billingMode: form.value.billingMode,
        billingProvider: form.value.billingProvider,
        supportTier: form.value.supportTier,
        internalNotes: form.value.internalNotes,
        contactName: form.value.contactName,
      },
    })
    createOpen.value = false
    await refresh()
  } catch (e: unknown) {
    actionError.value = e instanceof Error ? e.message : 'Could not create customer'
  } finally {
    saving.value = ''
  }
}

const goToTenantDetail = (id: string) => {
  void router.push(`/customers/${encodeURIComponent(id)}`)
}

const tenantFormFields = () => [
  { key: 'slug' as const, label: 'Customer code (key)', placeholder: 'auto from name if empty' },
  { key: 'name' as const, label: 'Display name', placeholder: 'Customer display name' },
  { key: 'legalName' as const, label: 'Legal / business name', placeholder: 'Registered legal name' },
  { key: 'contactName' as const, label: 'Owner / admin contact', placeholder: 'Primary contact name' },
  { key: 'email' as const, label: 'Email', placeholder: 'billing@example.com' },
  { key: 'phone' as const, label: 'Phone', placeholder: '+1 …' },
  { key: 'country' as const, label: 'Country / region', placeholder: 'United States' },
  { key: 'industry' as const, label: 'Industry', placeholder: 'Healthcare' },
  { key: 'billingMode' as const, label: 'Billing mode', placeholder: 'subscription, manual_contract, …' },
  { key: 'billingProvider' as const, label: 'Billing provider', placeholder: 'stripe, paynow, manual' },
  { key: 'supportTier' as const, label: 'Support tier', placeholder: 'standard, premium, enterprise' },
]
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Customers', to: '/customers' },
      ]"
    >
      <template #actions>
        <Button size="sm" @click="openCreate">
          <Plus class="size-4" />
          Create customer
        </Button>
        <Button variant="outline" size="sm" :disabled="pending" @click="refresh">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
      </template>
    </ConsolePageHeader>

    <div class="flex-1 space-y-6 p-4 lg:p-6">
      <p v-if="actionError" class="text-sm text-destructive">{{ actionError }}</p>

      <section class="grid gap-3 sm:grid-cols-3">
        <div v-for="metric in metrics" :key="metric.label" class="rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-sm">
          <div class="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {{ metric.label }}
          </div>
          <div class="mt-1 text-2xl font-semibold">
            {{ metric.value }}
          </div>
          <div class="mt-1 text-sm text-muted-foreground">
            {{ metric.detail }}
          </div>
        </div>
      </section>

      <Card class="overflow-hidden rounded-3xl border-border/70 bg-card/90 shadow-sm backdrop-blur-sm">
        <CardHeader class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="space-y-1">
            <CardTitle>Customers</CardTitle>
            <CardDescription>
              Open a row for the full customer hub — subscriptions, entitlements, usage, billing, licenses, and edits.
            </CardDescription>
          </div>
          <div class="relative w-full sm:max-w-xs">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" class="pl-9" placeholder="Search customers, codes, contacts, products…" />
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <ScrollArea class="h-[min(72vh,800px)] w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Plan summary</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead class="w-10 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="tenant in filtered"
                  :key="tenant.id"
                  class="cursor-pointer transition-colors hover:bg-muted/40"
                  @click="goToTenantDetail(tenant.id)"
                >
                  <TableCell>
                    <div class="font-medium">{{ tenant.name }}</div>
                    <div v-if="tenant.legalName" class="text-xs text-muted-foreground">{{ tenant.legalName }}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{{ tenant.slug }}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge class="capitalize" :variant="statusVariant(tenant.status)">{{ tenant.status }}</Badge>
                  </TableCell>
                  <TableCell>
                    <span class="text-sm">{{ tenant.subscribedProducts.length ? tenant.subscribedProducts.join(', ') : '—' }}</span>
                  </TableCell>
                  <TableCell class="max-w-[200px] truncate text-sm" :title="tenant.planSummary">
                    {{ tenant.planSummary }}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" class="font-normal capitalize">{{ tenant.billingStatus }}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" class="font-normal capitalize">{{ tenant.licenseStatus }}</Badge>
                  </TableCell>
                  <TableCell class="text-sm">{{ tenant.country || '—' }}</TableCell>
                  <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
                    {{ formatDate(tenant.createdAt) }}
                  </TableCell>
                  <TableCell class="max-w-[160px]">
                    <div class="truncate text-sm font-medium">{{ tenant.contactName || '—' }}</div>
                    <div class="truncate text-xs text-muted-foreground">{{ tenant.email || '—' }}</div>
                  </TableCell>
                  <TableCell class="text-right text-muted-foreground" @click.stop>
                    <ChevronRight class="ml-auto size-4" aria-hidden="true" />
                    <span class="sr-only">Open customer</span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>

    <Dialog v-model:open="createOpen">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create customer</DialogTitle>
          <DialogDescription>Add a customer manually to the registry. You can attach subscriptions afterward.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div v-for="field in tenantFormFields()" :key="field.key" class="space-y-1.5">
            <Label :for="`c-${field.key}`">{{ field.label }}</Label>
            <Input :id="`c-${field.key}`" v-model="form[field.key]" :placeholder="field.placeholder" />
          </div>
          <div class="space-y-1.5">
            <Label for="c-status">Account status</Label>
            <Select v-model="form.status">
              <SelectTrigger id="c-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="trial">trial</SelectItem>
                <SelectItem value="suspended">suspended</SelectItem>
                <SelectItem value="expired">expired</SelectItem>
                <SelectItem value="churned">churned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label for="c-seats">Seats</Label>
            <Input id="c-seats" v-model.number="form.seats" type="number" min="0" />
          </div>
          <div class="space-y-1.5">
            <Label for="c-notes">Internal notes</Label>
            <Textarea
              id="c-notes"
              v-model="form.internalNotes"
              rows="3"
              class="min-h-[80px]"
              placeholder="Internal comments (not shown to the customer)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="createOpen = false">Cancel</Button>
          <Button :disabled="saving === 'create'" @click="submitCreate">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
