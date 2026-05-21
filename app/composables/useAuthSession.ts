export type AuthSessionPayload =
  | { authenticated: false }
  | {
      authenticated: true
      user: { id: string; email: string; platformRole: string }
      memberships: Array<{
        organizationId: string
        organizationName: string
        organizationSlug: string
        membershipRole: string
      }>
      activeOrganizationId: string | null
    }

export function useAuthSession() {
  const session = useState<AuthSessionPayload | null>('bcp-auth-session', () => null)
  const pending = useState('bcp-auth-pending', () => false)

  async function refresh() {
    pending.value = true
    try {
      if (import.meta.server) {
        const requestFetch = useRequestFetch()
        session.value = await requestFetch<AuthSessionPayload>('/api/auth/session')
      } else {
        session.value = await $fetch<AuthSessionPayload>('/api/auth/session')
      }
    } finally {
      pending.value = false
    }
  }

  return { session, pending, refresh }
}
