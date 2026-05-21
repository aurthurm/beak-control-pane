import { setActiveOrganizationForSession } from '../../utils/auth'

type Body = {
  organizationId?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const organizationId = body.organizationId?.trim()

  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const session = await setActiveOrganizationForSession(event, organizationId)

  return {
    ok: true,
    activeOrganizationId: session.activeOrganizationId,
  }
})
