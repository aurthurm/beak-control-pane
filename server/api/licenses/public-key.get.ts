import { getLicenseKeyConfig } from '../../core/licensing/keys'

export default defineEventHandler(() => {
  const c = getLicenseKeyConfig()
  if (!c) {
    return { keys: [] as Array<{ kid: string; publicKeyPem: string; algorithm: 'ES256' }> }
  }
  return {
    keys: [
      {
        kid: c.kid,
        publicKeyPem: c.publicKeyPem,
        algorithm: 'ES256' as const,
      },
    ],
  }
})
