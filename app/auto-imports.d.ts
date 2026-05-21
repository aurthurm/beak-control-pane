export {}

declare global {
  const $fetch: typeof import('ofetch').$fetch
  const computed: typeof import('vue').computed
  const defineNuxtRouteMiddleware: typeof import('#app').defineNuxtRouteMiddleware
  const definePageMeta: typeof import('#app').definePageMeta
  const navigateTo: typeof import('#app').navigateTo
  const onMounted: typeof import('vue').onMounted
  const refreshNuxtData: typeof import('#app').refreshNuxtData
  const ref: typeof import('vue').ref
  const toRef: typeof import('vue').toRef
  const unref: typeof import('vue').unref
  const useAsyncData: typeof import('#app').useAsyncData
  const useCookie: typeof import('#app').useCookie
  const useFetch: typeof import('#app').useFetch
  const useAuthSession: typeof import('./composables/useAuthSession').useAuthSession
  const useNuxtData: typeof import('#app').useNuxtData
  const usePortalSummary: typeof import('./composables/usePortalSummary').usePortalSummary
  const useRequestFetch: typeof import('#app').useRequestFetch
  const useRoute: typeof import('#app').useRoute
  const useRouter: typeof import('#app').useRouter
  const useSeoMeta: typeof import('#app').useSeoMeta
  const useState: typeof import('#app').useState
  const useWorkspaceDashboard: typeof import('./composables/useWorkspaceDashboard').useWorkspaceDashboard
  const watch: typeof import('vue').watch
  const nextTick: typeof import('vue').nextTick
}
