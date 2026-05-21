import { getSessionFromEvent } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const session = await getSessionFromEvent(event)
  if (!session) {
    return { authenticated: false as const }
  }

  return {
    authenticated: true as const,
    user: session.user,
    memberships: session.memberships,
    activeOrganizationId: session.activeOrganizationId,
  }
})
