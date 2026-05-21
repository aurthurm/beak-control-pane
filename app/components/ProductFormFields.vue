<script setup lang="ts">
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '~/components/ui/native-select'
import { Textarea } from '~/components/ui/textarea'

export type ProductFormModel = {
  name: string
  slug: string
  description: string
  status: string
  productType: string
  defaultBillingMode: string
  offlineLicensesSupported: boolean
  activationsRequired: boolean
  usageTrackingEnabled: boolean
  extraDetails: string
}

const model = defineModel<ProductFormModel>({ required: true })

defineProps<{
  disabled?: boolean
  idPrefix?: string
}>()
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="space-y-2 sm:col-span-2">
      <Label :for="`${idPrefix ?? 'pf'}-name`">Name</Label>
      <Input :id="`${idPrefix ?? 'pf'}-name`" v-model="model.name" :disabled="disabled" />
    </div>
    <div class="space-y-2">
      <Label :for="`${idPrefix ?? 'pf'}-slug`">Key / slug</Label>
      <Input :id="`${idPrefix ?? 'pf'}-slug`" v-model="model.slug" :disabled="disabled" placeholder="e.g. beak-lims" />
    </div>
    <div class="space-y-2">
      <Label :for="`${idPrefix ?? 'pf'}-status`">Status</Label>
      <NativeSelect :id="`${idPrefix ?? 'pf'}-status`" v-model="model.status" :disabled="disabled">
        <NativeSelectOption value="draft">
          Draft
        </NativeSelectOption>
        <NativeSelectOption value="active">
          Active
        </NativeSelectOption>
        <NativeSelectOption value="archived">
          Archived
        </NativeSelectOption>
      </NativeSelect>
    </div>
    <div class="space-y-2">
      <Label :for="`${idPrefix ?? 'pf'}-ptype`">Product type</Label>
      <NativeSelect :id="`${idPrefix ?? 'pf'}-ptype`" v-model="model.productType" :disabled="disabled">
        <NativeSelectOption value="saas">
          SaaS
        </NativeSelectOption>
        <NativeSelectOption value="on_prem">
          On-prem
        </NativeSelectOption>
        <NativeSelectOption value="hybrid">
          Hybrid
        </NativeSelectOption>
        <NativeSelectOption value="offline_capable">
          Offline-capable
        </NativeSelectOption>
      </NativeSelect>
    </div>
    <div class="space-y-2">
      <Label :for="`${idPrefix ?? 'pf'}-bill`">Default billing mode</Label>
      <NativeSelect :id="`${idPrefix ?? 'pf'}-bill`" v-model="model.defaultBillingMode" :disabled="disabled">
        <NativeSelectOption value="subscription">
          Subscription
        </NativeSelectOption>
        <NativeSelectOption value="usage">
          Usage-based
        </NativeSelectOption>
        <NativeSelectOption value="license">
          License / perpetual
        </NativeSelectOption>
        <NativeSelectOption value="manual">
          Manual / contract
        </NativeSelectOption>
        <NativeSelectOption value="hybrid_billing">
          Hybrid billing
        </NativeSelectOption>
      </NativeSelect>
    </div>
    <div class="space-y-2 sm:col-span-2">
      <Label :for="`${idPrefix ?? 'pf'}-desc`">Description</Label>
      <Textarea :id="`${idPrefix ?? 'pf'}-desc`" v-model="model.description" :disabled="disabled" class="min-h-[88px]" />
    </div>
    <div class="flex flex-col gap-3 sm:col-span-2">
      <div class="flex items-center gap-2">
        <Checkbox :id="`${idPrefix ?? 'pf'}-offline`" v-model="model.offlineLicensesSupported" :disabled="disabled" />
        <Label :for="`${idPrefix ?? 'pf'}-offline`" class="cursor-pointer font-normal">Offline licenses supported</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox :id="`${idPrefix ?? 'pf'}-act`" v-model="model.activationsRequired" :disabled="disabled" />
        <Label :for="`${idPrefix ?? 'pf'}-act`" class="cursor-pointer font-normal">Activations required</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox :id="`${idPrefix ?? 'pf'}-usage`" v-model="model.usageTrackingEnabled" :disabled="disabled" />
        <Label :for="`${idPrefix ?? 'pf'}-usage`" class="cursor-pointer font-normal">Usage tracking enabled</Label>
      </div>
    </div>
    <div class="space-y-2 sm:col-span-2">
      <Label :for="`${idPrefix ?? 'pf'}-extra`">Extra details</Label>
      <Textarea
        :id="`${idPrefix ?? 'pf'}-extra`"
        v-model="model.extraDetails"
        :disabled="disabled"
        class="min-h-[88px]"
        placeholder="Internal notes, rollout constraints, links…"
      />
    </div>
  </div>
</template>
