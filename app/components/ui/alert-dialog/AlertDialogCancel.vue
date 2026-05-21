<script setup lang="ts">
import type { AlertDialogCancelProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { AlertDialogCancel, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const props = defineProps<AlertDialogCancelProps & { class?: HTMLAttributes["class"] }>()

const delegated = reactiveOmit(props, "class")
const forwarded = useForwardProps(delegated)
</script>

<template>
  <AlertDialogCancel
    v-bind="forwarded"
    :class="cn(buttonVariants({ variant: 'outline' }), 'mt-2 sm:mt-0', props.class)"
  >
    <slot />
  </AlertDialogCancel>
</template>
