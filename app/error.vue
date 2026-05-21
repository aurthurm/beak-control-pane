<template>
  <div class="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-start justify-center gap-5 px-6 py-24">
    <p class="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
      Beak Control Plane
    </p>
    <h1 class="text-4xl font-semibold tracking-tight text-foreground">
      We hit an error loading this page.
    </h1>
    <p class="max-w-xl text-base leading-7 text-muted-foreground">
      The control plane starter is still a local SQLite-backed Nuxt app. Refresh the page or return to the dashboard.
    </p>
    <NuxtLink
      to="/"
      class="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
    >
      Back to dashboard
    </NuxtLink>
  </div>
</template>
