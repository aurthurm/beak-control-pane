import type { H3Event } from 'h3'
import { getSessionFromEvent, type SessionUser } from './auth'

/** When `AUTH_ENFORCE_API=true`, staff console API routes require a platform session. Default off for gradual rollout. */
export async function requireStaffApiWhenEnforced(event: H3Event): Promise<void> {
  const config = useRuntimeConfig(event)
  if (!config.authEnforceApi) {
    return
  }
  await requirePlatformStaff(event)
}

/** Requires a logged-in platform staff session (admin or support). */
export async function requirePlatformStaff(event: H3Event): Promise<SessionUser> {
  const session = await getSessionFromEvent(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const role = session.user.platformRole
  if (role !== 'platform_admin' && role !== 'support') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return session
}

export async function requirePlatformAdmin(event: H3Event): Promise<SessionUser> {
  const session = await getSessionFromEvent(event)
  if (!session || session.user.platformRole !== 'platform_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return session
}

export async function requireCustomerWithOrg(
  event: H3Event,
  organizationId: string,
): Promise<SessionUser> {
  const session = await getSessionFromEvent(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (session.user.platformRole !== 'customer') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const ok = session.memberships.some((m) => m.organizationId === organizationId)
  if (!ok) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return session
}
