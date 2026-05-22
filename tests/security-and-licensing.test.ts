import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { activationCountsTowardCap, appendHeartbeatJson, appendViolationJson, buildActivationBindingLabel, parseEnvironmentJson } from '../server/utils/activations'
import { hashPassword, verifyPassword, randomSessionToken, hashToken } from '../server/utils/auth-crypto'
import { newPlanId, newPlanLimitId, newProductAddonKeyId, newProductLimitKeyId } from '../server/utils/planIds'
import { mergePlanMetadata, parsePlanMetadata } from '../server/utils/planMetadata'
import { requireLicenseKeyConfig, getLicenseKeyConfig } from '../server/core/licensing/keys'
import { signLicensePayload, verifyLicenseJws } from '../server/core/licensing/jws'

describe('plan metadata', () => {
  it('parses and merges metadata safely', () => {
    expect(parsePlanMetadata('')).toEqual({})
    expect(parsePlanMetadata('not-json')).toEqual({})
    expect(mergePlanMetadata('{"gracePeriodDays":7}', { enterpriseOverrideCompatible: true })).toBe(
      '{"gracePeriodDays":7,"enterpriseOverrideCompatible":true}',
    )
  })
})

describe('activation helpers', () => {
  it('parses environment and appends history', () => {
    expect(parseEnvironmentJson('{"os":"linux","meta":{"branch":"west"}}')).toEqual({
      os: 'linux',
      meta: '{"branch":"west"}',
    })
    expect(buildActivationBindingLabel({ activationType: 'user', deviceId: 'd', siteId: 's', installationId: 'i', userBinding: 'alice' })).toBe('alice')
    expect(buildActivationBindingLabel({ activationType: 'site', deviceId: 'd', siteId: 's', installationId: 'i', userBinding: '' })).toBe('s')
    expect(activationCountsTowardCap('revoked')).toBe(false)
    expect(JSON.parse(appendHeartbeatJson('[]', { at: '2026-05-01T00:00:00Z', ip: '127.0.0.1' }))).toHaveLength(1)
    expect(JSON.parse(appendViolationJson('[]', { at: '2026-05-01T00:00:00Z', kind: 'limit', detail: 'warn' }))).toHaveLength(1)
  })
})

describe('auth crypto', () => {
  it('hashes and verifies passwords and tokens', async () => {
    const hashed = await hashPassword('secret-pass')
    expect(await verifyPassword('secret-pass', hashed)).toBe(true)
    expect(await verifyPassword('wrong', hashed)).toBe(false)
    const token = randomSessionToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(hashToken(token)).toHaveLength(64)
  })
})

describe('license signing', () => {
  const originalEnv = {
    privateKey: process.env.BCP_LICENSE_PRIVATE_KEY_PEM,
    publicKey: process.env.BCP_LICENSE_PUBLIC_KEY_PEM,
    kid: process.env.BCP_LICENSE_KEY_ID,
  }
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })

  beforeEach(() => {
    process.env.BCP_LICENSE_PRIVATE_KEY_PEM = privateKey
    process.env.BCP_LICENSE_PUBLIC_KEY_PEM = publicKey
    process.env.BCP_LICENSE_KEY_ID = 'test-kid'
  })

  afterEach(() => {
    if (originalEnv.privateKey === undefined) {
      delete process.env.BCP_LICENSE_PRIVATE_KEY_PEM
    } else {
      process.env.BCP_LICENSE_PRIVATE_KEY_PEM = originalEnv.privateKey
    }
    if (originalEnv.publicKey === undefined) {
      delete process.env.BCP_LICENSE_PUBLIC_KEY_PEM
    } else {
      process.env.BCP_LICENSE_PUBLIC_KEY_PEM = originalEnv.publicKey
    }
    if (originalEnv.kid === undefined) {
      delete process.env.BCP_LICENSE_KEY_ID
    } else {
      process.env.BCP_LICENSE_KEY_ID = originalEnv.kid
    }
  })

  it('reads config and signs/verifies payloads', async () => {
    const config = getLicenseKeyConfig()
    expect(config?.kid).toBe('test-kid')
    expect(() => requireLicenseKeyConfig()).not.toThrow()
    const jws = await signLicensePayload({ licenseId: 'lic_1', subscriberId: 'sub_1' }, config!)
    const verified = await verifyLicenseJws(jws, publicKey)
    expect(verified.payload).toMatchObject({ licenseId: 'lic_1', subscriberId: 'sub_1' })
  })
})

describe('plan ids', () => {
  it('creates prefixed ids', () => {
    expect(newPlanId()).toMatch(/^plan_[a-f0-9]{12}$/)
    expect(newPlanLimitId()).toMatch(/^lim_[a-f0-9]{12}$/)
    expect(newProductLimitKeyId()).toMatch(/^plk_[a-f0-9]{12}$/)
    expect(newProductAddonKeyId()).toMatch(/^pak_[a-f0-9]{12}$/)
  })
})
