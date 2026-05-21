import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { getCookie, setCookie, deleteCookie, createError } from 'h3'
import { drizzle } from 'drizzle-orm/libsql'
import {
  organizationMembershipsTable,
  organizationsTable,
  sessionsTable,
  usersTable,
  type UserRow,
} from '../db/schema'
import { getDatabaseClient } from '../db/bootstrap'
import { hashToken, randomSessionToken } from './auth-crypto'

export const ACTIVE_ORGANIZATION_COOKIE = 'bcp_active_org'

export type SessionUser = {
  user: Pick<UserRow, 'id' | 'email' | 'platformRole'>
  memberships: Array<{
    organizationId: string
    organizationName: string
    organizationSlug: string
    membershipRole: string
  }>
  activeOrganizationId: string | null
}

const SESSION_DAYS = 14

function getAuthConfig(event: H3Event) {
  const config = useRuntimeConfig(event)
  const cookieName = (config.authCookieName as string) || 'bcp_session'
  const sessionDays = Number(config.authSessionDays) || SESSION_DAYS
  const activeOrganizationCookieName = (config.authActiveOrganizationCookieName as string) || ACTIVE_ORGANIZATION_COOKIE
  return { cookieName, sessionDays, activeOrganizationCookieName }
}

function isValidOrganizationId(raw: string) {
  return /^[a-zA-Z0-9_-]+$/.test(raw)
}

function resolveActiveOrganizationId(
  event: H3Event,
  memberships: Array<{ organizationId: string }>,
): string | null {
  const { activeOrganizationCookieName } = getAuthConfig(event)
  const activeOrganizationId = getCookie(event, activeOrganizationCookieName)?.trim() || ''
  const membershipIds = new Set(memberships.map((membership) => membership.organizationId))

  if (activeOrganizationId && membershipIds.has(activeOrganizationId)) {
    return activeOrganizationId
  }

  return memberships[0]?.organizationId ?? null
}

function syncActiveOrganizationCookie(event: H3Event, organizationId: string | null) {
  const { activeOrganizationCookieName, sessionDays } = getAuthConfig(event)
  if (organizationId) {
    setCookie(event, activeOrganizationCookieName, organizationId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: sessionDays * 86_400,
    })
    return
  }

  deleteCookie(event, activeOrganizationCookieName, { path: '/' })
}

export async function getSessionFromEvent(event: H3Event): Promise<SessionUser | null> {
  const { cookieName } = getAuthConfig(event)
  const token = getCookie(event, cookieName)
  if (!token?.trim()) {
    return null
  }

  const tokenHash = hashToken(token.trim())
  const client = getDatabaseClient()
  const db = drizzle(client)

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.tokenHash, tokenHash))
  if (!session) {
    return null
  }

  const exp = new Date(session.expiresAt)
  if (Number.isNaN(exp.getTime()) || exp < new Date()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id))
    return null
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId))
  if (!user) {
    return null
  }

  const memberships = await db
    .select({
      organizationId: organizationMembershipsTable.organizationId,
      organizationName: organizationsTable.name,
      organizationSlug: organizationsTable.slug,
      membershipRole: organizationMembershipsTable.membershipRole,
    })
    .from(organizationMembershipsTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationMembershipsTable.organizationId))
    .where(eq(organizationMembershipsTable.userId, user.id))

  const activeOrganizationId = resolveActiveOrganizationId(
    event,
    memberships.map((membership) => ({ organizationId: membership.organizationId })),
  )
  syncActiveOrganizationCookie(event, activeOrganizationId)

  return {
    user: { id: user.id, email: user.email, platformRole: user.platformRole },
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationSlug: m.organizationSlug,
      membershipRole: m.membershipRole,
    })),
    activeOrganizationId,
  }
}

export async function createSessionForUser(event: H3Event, userId: string): Promise<void> {
  const client = getDatabaseClient()
  const db = drizzle(client)
  const { cookieName, sessionDays } = getAuthConfig(event)

  const token = randomSessionToken()
  const tokenHash = hashToken(token)
  const now = new Date()
  const expires = new Date(now.getTime() + sessionDays * 86_400_000)
  const sessionId = `ses_${randomUUID().replace(/-/g, '').slice(0, 16)}`

  await db.insert(sessionsTable).values({
    id: sessionId,
    userId,
    tokenHash,
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
  })

  setCookie(event, cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionDays * 86_400,
  })

  syncActiveOrganizationCookie(event, null)
}

export async function destroySession(event: H3Event): Promise<void> {
  const { cookieName } = getAuthConfig(event)
  const token = getCookie(event, cookieName)
  if (token?.trim()) {
    const tokenHash = hashToken(token.trim())
    const client = getDatabaseClient()
    const db = drizzle(client)
    await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, tokenHash))
  }
  deleteCookie(event, cookieName, { path: '/' })
  syncActiveOrganizationCookie(event, null)
}

export function newUserId(): string {
  return `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

export function newOrganizationId(): string {
  return `org_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export async function setActiveOrganizationForSession(event: H3Event, organizationId: string): Promise<SessionUser> {
  if (!isValidOrganizationId(organizationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid organizationId' })
  }

  const session = await getSessionFromEvent(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const membership = session.memberships.find((m) => m.organizationId === organizationId)
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  syncActiveOrganizationCookie(event, organizationId)

  return {
    ...session,
    activeOrganizationId: organizationId,
  }
}
