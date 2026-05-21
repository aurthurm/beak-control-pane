<script setup lang="ts">
import type { AlertDialogTriggerProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { AlertDialogTrigger, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<AlertDialogTriggerProps & { class?: HTMLAttributes["class"] }>()

const delegated = reactiveOmit(props, "class")
const forwarded = useForwardProps(delegated)
</script>

<template>
  <AlertDialogTrigger
    data-slot="alert-dialog-trigger"
    v-bind="forwarded"
    :class="cn(props.class)"
  >
    <slot />
  </AlertDialogTrigger>
</template>
