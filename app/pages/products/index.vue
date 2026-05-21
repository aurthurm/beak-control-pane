<script setup lang="ts">
import ProductFormFields, { type ProductFormModel } from '~/components/ProductFormFields.vue'
import ConsolePageHeader from '~/components/ConsolePageHeader.vue'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
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
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatDate, statusVariant } from '~/lib/formatters'
import { site } from '~/lib/site'
import { Archive, Info, Pencil, Plus, RefreshCw, Search } from 'lucide-vue-next'

definePageMeta({ layout: 'console' })

useSeoMeta({
  title: `${site.brand.name} | Products`,
  description: 'Product catalog for the control plane.',
})

type ProductRow = {
  id: string
  name: string
  slug: string
  description: string
  status: string
  productType: string
  productTypeLabel: string
  defaultBillingMode: string
  defaultBillingModeLabel: string
  offlineLicensesSupported: boolean
  activationsRequired: boolean
  usageTrackingEnabled: boolean
  extraDetails: string
  planCount: number
  tenantCount: number
  createdAt: string
  updatedAt: string
}

type ProductsResponse = { products: ProductRow[] }

const search = ref('')
const { data, pending, error, refresh } = await useFetch<ProductsResponse>('/api/products', { key: 'bcp-products' })

const query = computed(() => search.value.trim().toLowerCase())
const filtered = computed(
  () =>
    data.value?.products.filter((product) => {
      if (!query.value) return true
      return [product.name, product.slug, product.description, product.status, product.productTypeLabel].some((field) =>
        field.toLowerCase().includes(query.value),
      )
    }) ?? [],
)

const metrics = computed(() => {
  const rows = filtered.value
  return [
    { label: 'Products', value: rows.length, detail: 'Visible in the current view' },
    { label: 'Active', value: rows.filter((product) => product.status === 'active').length, detail: 'In production today' },
    { label: 'With plans', value: rows.filter((product) => product.planCount > 0).length, detail: 'Already monetized' },
  ]
})

async function goToProductDetail(product: ProductRow) {
  const slug = product.slug?.trim()
  if (!slug) return
  await navigateTo(`/products/${encodeURIComponent(slug)}`)
}

function emptyForm(): ProductFormModel {
  return {
    name: '',
    slug: '',
    description: '',
    status: 'draft',
    productType: 'saas',
    defaultBillingMode: 'subscription',
    offlineLicensesSupported: false,
    activationsRequired: true,
    usageTrackingEnabled: true,
    extraDetails: '',
  }
}

const createOpen = ref(false)
const createForm = ref<ProductFormModel>(emptyForm())
const createSaving = ref(false)

const editOpen = ref(false)
const editId = ref<string | null>(null)
const editForm = ref<ProductFormModel>(emptyForm())
const editSaving = ref(false)

function openEdit(product: ProductRow) {
  editId.value = product.id
  editForm.value = {
    name: product.name,
    slug: product.slug,
    description: product.description,
    status: product.status,
    productType: product.productType,
    defaultBillingMode: product.defaultBillingMode,
    offlineLicensesSupported: product.offlineLicensesSupported,
    activationsRequired: product.activationsRequired,
    usageTrackingEnabled: product.usageTrackingEnabled,
    extraDetails: product.extraDetails,
  }
  editOpen.value = true
}

async function submitCreate() {
  createSaving.value = true
  try {
    await $fetch('/api/products', {
      method: 'POST',
      body: {
        name: createForm.value.name,
        slug: createForm.value.slug || undefined,
        description: createForm.value.description,
        status: createForm.value.status,
        productType: createForm.value.productType,
        defaultBillingMode: createForm.value.defaultBillingMode,
        offlineLicensesSupported: createForm.value.offlineLicensesSupported,
        activationsRequired: createForm.value.activationsRequired,
        usageTrackingEnabled: createForm.value.usageTrackingEnabled,
        extraDetails: createForm.value.extraDetails,
      },
    })
    createOpen.value = false
    createForm.value = emptyForm()
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e) {
    console.error(e)
  } finally {
    createSaving.value = false
  }
}

async function submitEdit() {
  if (!editId.value) return
  editSaving.value = true
  try {
    await $fetch(`/api/products/${editId.value}`, {
      method: 'PATCH',
      body: {
        name: editForm.value.name,
        slug: editForm.value.slug,
        description: editForm.value.description,
        status: editForm.value.status,
        productType: editForm.value.productType,
        defaultBillingMode: editForm.value.defaultBillingMode,
        offlineLicensesSupported: editForm.value.offlineLicensesSupported,
        activationsRequired: editForm.value.activationsRequired,
        usageTrackingEnabled: editForm.value.usageTrackingEnabled,
        extraDetails: editForm.value.extraDetails,
      },
    })
    editOpen.value = false
    editId.value = null
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e) {
    console.error(e)
  } finally {
    editSaving.value = false
  }
}

async function setArchived(product: ProductRow, archived: boolean) {
  try {
    await $fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      body: { status: archived ? 'archived' : 'active' },
    })
    await refresh()
    await refreshNuxtData('bcp-workspace-dashboard')
  } catch (e) {
    console.error(e)
  }
}

async function refreshAll() {
  await refresh()
  await refreshNuxtData('bcp-workspace-dashboard')
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ConsolePageHeader
      :breadcrumbs="[
        { label: site.brand.name, to: '/' },
        { label: 'Products' },
      ]"
    >
      <template #actions>
        <Button variant="outline" size="sm" :disabled="pending" @click="refreshAll">
          <RefreshCw class="size-4" :class="pending ? 'animate-spin' : ''" />
          Refresh
        </Button>
        <Button size="sm" @click="createOpen = true">
          <Plus class="size-4" />
          New product
        </Button>
      </template>
    </ConsolePageHeader>

    <div class="flex-1 space-y-6 p-4 lg:p-6">
      <Alert class="border-primary/25 bg-primary/5">
        <Info class="size-4" />
        <AlertTitle>Products</AlertTitle>
        <AlertDescription>
          This page manages the top-level applications in the platform, like Beak POS, Beak LIMS, Bitlimbs app, Bitcos service, and future products.
          Each row links to plans, features, subscription stats, and recent billing or licensing activity.
        </AlertDescription>
      </Alert>

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
            <CardTitle>Catalog</CardTitle>
            <CardDescription>
              Name, key, lifecycle status, deployment type, plan coverage, and customer usage.
            </CardDescription>
          </div>
          <div class="relative w-full sm:max-w-xs">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" class="pl-9" placeholder="Filter by name, key, status, or type" />
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <ScrollArea class="h-[min(70vh,720px)] w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead class="text-right">
                    Plans
                  </TableHead>
                  <TableHead class="text-right">
                    Customers
                  </TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead class="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="product in filtered"
                  :key="product.id"
                  class="cursor-pointer transition-colors hover:bg-muted/40"
                  role="button"
                  tabindex="0"
                  @click="goToProductDetail(product)"
                  @keydown.enter.prevent="goToProductDetail(product)"
                >
                  <TableCell>
                    <div class="font-medium">
                      {{ product.name }}
                    </div>
                    <div class="line-clamp-2 text-sm text-muted-foreground">
                      {{ product.description }}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{{ product.slug }}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge :variant="statusVariant(product.status)" class="capitalize">
                      {{ product.status }}
                    </Badge>
                  </TableCell>
                  <TableCell>{{ product.productTypeLabel }}</TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ product.planCount }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ product.tenantCount }}
                  </TableCell>
                  <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
                    {{ formatDate(product.createdAt) }}
                  </TableCell>
                  <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
                    {{ product.updatedAt ? formatDate(product.updatedAt) : '—' }}
                  </TableCell>
                  <TableCell class="text-right" @click.stop>
                    <div class="flex flex-wrap justify-end gap-1">
                      <Button variant="outline" size="sm" as-child>
                        <NuxtLink :to="`/products/${encodeURIComponent(product.slug)}`">
                          Open
                        </NuxtLink>
                      </Button>
                      <Button variant="outline" size="icon-sm" title="Edit" @click.stop="openEdit(product)">
                        <Pencil class="size-4" />
                      </Button>
                      <Button
                        v-if="product.status !== 'archived'"
                        variant="outline"
                        size="icon-sm"
                        title="Archive"
                        @click.stop="setArchived(product, true)"
                      >
                        <Archive class="size-4" />
                      </Button>
                      <Button
                        v-else
                        variant="outline"
                        size="sm"
                        @click.stop="setArchived(product, false)"
                      >
                        Unarchive
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      <Alert v-if="error" variant="destructive">
        <AlertTitle>Could not load products</AlertTitle>
        <AlertDescription>Check the API server and try refreshing.</AlertDescription>
      </Alert>
    </div>

    <Dialog v-model:open="createOpen">
      <DialogContent class="max-h-[min(90vh,840px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            Creates a catalog entry. Plans and feature links are managed from the product detail view and Plans page.
          </DialogDescription>
        </DialogHeader>
        <ProductFormFields v-model="createForm" id-prefix="create" :disabled="createSaving" />
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" :disabled="createSaving" @click="createOpen = false">
            Cancel
          </Button>
          <Button :disabled="createSaving || !createForm.name.trim()" @click="submitCreate">
            {{ createSaving ? 'Saving…' : 'Create product' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="editOpen">
      <DialogContent class="max-h-[min(90vh,840px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
          <DialogDescription>
            Updates catalog metadata. Changing the key may affect integrations — coordinate before renames.
          </DialogDescription>
        </DialogHeader>
        <ProductFormFields v-model="editForm" id-prefix="edit" :disabled="editSaving" />
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" :disabled="editSaving" @click="editOpen = false">
            Cancel
          </Button>
          <Button :disabled="editSaving || !editForm.name.trim()" @click="submitEdit">
            {{ editSaving ? 'Saving…' : 'Save changes' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
