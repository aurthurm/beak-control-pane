import { createError } from 'h3'

/**
 * License signing keys (ECDSA P-256 / ES256) from environment.
 * Generate with:
 *   openssl ecparam -name prime256v1 -genkey -noout -out ec-private.pem
 *   openssl ec -in ec-private.pem -pubout -out ec-public.pem
 *   openssl pkcs8 -topk8 -nocrypt -in ec-private.pem -out ec-private-pkcs8.pem
 */
export type LicenseKeyConfig = {
  kid: string
  privateKeyPem: string
  publicKeyPem: string
}

export function getLicenseKeyConfig(): LicenseKeyConfig | null {
  const kid = process.env.BCP_LICENSE_KEY_ID?.trim() || 'bcp-1'
  const privateKeyPem = process.env.BCP_LICENSE_PRIVATE_KEY_PEM?.trim() ?? ''
  const publicKeyPem = process.env.BCP_LICENSE_PUBLIC_KEY_PEM?.trim() ?? ''
  if (!privateKeyPem || !publicKeyPem) {
    return null
  }
  return { kid, privateKeyPem, publicKeyPem }
}

export function requireLicenseKeyConfig(): LicenseKeyConfig {
  const c = getLicenseKeyConfig()
  if (!c) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'License signing is not configured. Set BCP_LICENSE_PRIVATE_KEY_PEM and BCP_LICENSE_PUBLIC_KEY_PEM (PKCS#8 / SPKI PEM).',
    })
  }
  return c
}
