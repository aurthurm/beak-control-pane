import { SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose'
import type { LicenseKeyConfig } from './keys'

/**
 * Sign license document (JWT claims = parsed payload object).
 */
export async function signLicensePayload(payload: Record<string, unknown>, config: LicenseKeyConfig): Promise<string> {
  const key = await importPKCS8(config.privateKeyPem, 'ES256')
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: config.kid })
    .sign(key)
}

export async function verifyLicenseJws(jws: string, publicKeyPem: string): Promise<{ payload: Record<string, unknown> }> {
  const key = await importSPKI(publicKeyPem, 'ES256')
  const { payload } = await jwtVerify(jws, key, { algorithms: ['ES256'] })
  return { payload: payload as Record<string, unknown> }
}
