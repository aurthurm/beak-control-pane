<script setup lang="ts">
type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'

const props = withDefaults(
  defineProps<{
    variant?: BadgeVariant
  }>(),
  {
    variant: 'default',
  },
)

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border border-border bg-transparent text-foreground',
  success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  destructive: 'bg-destructive/12 text-destructive',
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-border/70"
    :class="variantClasses[props.variant]"
  >
    <slot />
  </span>
</template>
