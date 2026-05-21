import { defineNuxtRouteMiddleware } from '#imports'
import { useAuthSession } from '~/composables/useAuthSession'

export default defineNuxtRouteMiddleware(async (to) => {
  const { authEnforceConsole, authEnforcePortal } = useRuntimeConfig().public
  const path = to.path

  if (
    path === '/portal/login'
    || path === '/portal/signup'
    || path === '/portal/join'
    || path === '/admin/login'
  ) {
    return
  }

  const { session, refresh } = useAuthSession()
  await refresh()

  const authed = session.value?.authenticated
  const role = authed ? session.value?.user.platformRole ?? null : null

  if (path.startsWith('/portal')) {
    if (!authEnforcePortal) {
      return
    }
    if (!authed) {
      return navigateTo('/portal/login')
    }
    if (role !== 'customer') {
      return navigateTo('/')
    }
    return
  }

  if (path.startsWith('/admin')) {
    if (!authEnforceConsole) {
      return
    }
    if (!authed) {
      return navigateTo('/admin/login')
    }
    if (role !== 'platform_admin' && role !== 'support') {
      return navigateTo('/portal')
    }
    return
  }

  if (!authEnforceConsole) {
    return
  }
  if (!authed) {
    return navigateTo('/admin/login')
  }
  if (role !== 'platform_admin' && role !== 'support') {
    return navigateTo('/portal')
  }
})
