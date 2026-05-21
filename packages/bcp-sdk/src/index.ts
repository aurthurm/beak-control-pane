import { importSPKI, jwtVerify } from 'jose'

export type EntitlementApiResponse = {
  tenant: { id: string; name: string; status: string; seats?: number }
  product: { id: string; name: string; slug: string }
  subscription: {
    id: string
    status: string
    provider: string
    renewalAt: string
  }
  plan: {
    id: string
    name: string
    billingCycle: string
    status: string
  }
  entitlement?: {
    id?: string
    computedAt?: string
    modules: Record<string, boolean>
    limits: Record<string, number>
    meta?: Record<string, unknown>
    lineage?: Record<string, unknown>
  }
  features: Array<{ key: string; name: string; enabled: boolean; source?: string }>
  limits: Array<{
    key: string
    value: number
    resetPeriod?: string
    unit?: string
    enforcement?: string
    notes?: string
    valueKind?: string
  }>
  license: {
    id: string
    licenseKey: string
    mode: string
    status: string
    validTo: string
    graceUntil: string
  } | null
}

export type BcpClientOptions = {
  baseUrl: string
  tenantId: string
  productId: string
  /** PEM public key (SPKI) for offline JWS verification */
  publicKeyPem?: string
  /** `BCP_INGEST_SECRET` — sent as Bearer for `/api/usage/report` and `/api/runtime-flags/evaluate` when the server requires it */
  ingestApiKey?: string
  fetchImpl?: typeof fetch
}

export type LicenseExportFile = {
  kid: string
  jws: string
  payload: Record<string, unknown>
}

export class BcpClient {
  private readonly baseUrl: string
  private readonly tenantId: string
  private readonly productId: string
  private readonly publicKeyPem?: string
  private readonly ingestApiKey?: string
  private readonly fetchImpl: typeof fetch

  private entitlement: EntitlementApiResponse | null = null
  private offlinePayload: Record<string, unknown> | null = null

  constructor(opts: BcpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.tenantId = opts.tenantId
    this.productId = opts.productId
    this.publicKeyPem = opts.publicKeyPem
    this.ingestApiKey = opts.ingestApiKey?.trim() || undefined
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  private ingestHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.ingestApiKey) {
      h.Authorization = `Bearer ${this.ingestApiKey}`
    }
    return h
  }

  /** Fetch latest entitlements from GET /api/entitlements/:tenant/:product */
  async refresh(): Promise<EntitlementApiResponse> {
    const url = `${this.baseUrl}/api/entitlements/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.productId)}`
    const res = await this.fetchImpl(url)
    if (!res.ok) {
      throw new Error(`BcpClient.refresh failed: ${res.status} ${res.statusText}`)
    }
    this.entitlement = (await res.json()) as EntitlementApiResponse
    this.offlinePayload = null
    return this.entitlement
  }

  /** Load offline license file JSON ({ kid, jws, payload }) and verify JWS when publicKeyPem is set */
  async importLicenseFile(text: string): Promise<Record<string, unknown>> {
    const file = JSON.parse(text) as LicenseExportFile
    if (!file.jws) {
      throw new Error('importLicenseFile: missing jws')
    }
    if (this.publicKeyPem) {
      const key = await importSPKI(this.publicKeyPem, 'ES256')
      const { payload } = await jwtVerify(file.jws, key, { algorithms: ['ES256'] })
      this.offlinePayload = payload as Record<string, unknown>
    } else {
      this.offlinePayload = file.payload ?? {}
    }
    this.entitlement = null
    return this.offlinePayload
  }

  private modules(): Record<string, boolean> {
    if (this.offlinePayload) {
      const ent = this.offlinePayload.entitlement as { modules?: Record<string, boolean> } | undefined
      return ent?.modules ?? (this.offlinePayload.modules as Record<string, boolean>) ?? {}
    }
    return this.entitlement?.entitlement?.modules ?? {}
  }

  private limitsMap(): Record<string, number> {
    if (this.offlinePayload) {
      const ent = this.offlinePayload.entitlement as { limits?: Record<string, number> } | undefined
      return ent?.limits ?? (this.offlinePayload.limits as Record<string, number>) ?? {}
    }
    return this.entitlement?.entitlement?.limits ?? {}
  }

  isFeatureEnabled(key: string): boolean {
    return this.modules()[key] === true
  }

  getLimit(key: string): number | undefined {
    const v = this.limitsMap()[key]
    return typeof v === 'number' ? v : undefined
  }

  isExpired(): boolean {
    const now = Date.now()
    if (this.offlinePayload) {
      const vt = this.offlinePayload.validTo
      if (typeof vt === 'string') {
        return new Date(vt).getTime() < now
      }
      return false
    }
    const lic = this.entitlement?.license
    if (!lic) return false
    if (['revoked', 'superseded'].includes(lic.status.toLowerCase())) return true
    return new Date(lic.validTo).getTime() < now
  }

  canAddUser(): boolean {
    const seats = this.entitlement?.tenant?.seats ?? 0
    const maxUsers = this.getLimit('users')
    if (maxUsers === undefined) return true
    return seats < maxUsers
  }

  daysRemaining(): number {
    const end =
      this.offlinePayload && typeof this.offlinePayload.validTo === 'string'
        ? new Date(this.offlinePayload.validTo).getTime()
        : this.entitlement?.license
          ? new Date(this.entitlement.license.validTo).getTime()
          : this.entitlement?.subscription?.renewalAt
            ? new Date(this.entitlement.subscription.renewalAt).getTime()
            : NaN
    if (!Number.isFinite(end)) return 0
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)))
  }

  /** POST /api/usage/report — metered usage for this tenant/product */
  async reportUsage(body: {
    metric: string
    value: number
    mode?: 'set' | 'increment'
    period?: string
    periodKey?: string
    source?: string
    licenseKey?: string
    recalculate?: boolean
  }): Promise<unknown> {
    const url = `${this.baseUrl}/api/usage/report`
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: this.ingestHeaders(),
      body: JSON.stringify({
        tenantId: this.tenantId,
        productId: this.productId,
        ...body,
      }),
    })
    if (!res.ok) {
      throw new Error(`BcpClient.reportUsage failed: ${res.status} ${res.statusText}`)
    }
    return res.json() as Promise<unknown>
  }

  /** POST /api/runtime-flags/evaluate — rollout flags for this tenant (and product scope when set) */
  async evaluateRuntimeFlags(opts?: {
    environment?: string | null
    flagKeys?: string[]
  }): Promise<{
    tenantId: string
    productId: string | null
    environment: string | null
    flags: Record<string, { value: string; enabled: boolean; reason: string }>
    evaluatedAt: string
  }> {
    const url = `${this.baseUrl}/api/runtime-flags/evaluate`
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: this.ingestHeaders(),
      body: JSON.stringify({
        tenantId: this.tenantId,
        productId: this.productId,
        environment: opts?.environment ?? null,
        flagKeys: opts?.flagKeys,
      }),
    })
    if (!res.ok) {
      throw new Error(`BcpClient.evaluateRuntimeFlags failed: ${res.status} ${res.statusText}`)
    }
    return res.json() as Promise<{
      tenantId: string
      productId: string | null
      environment: string | null
      flags: Record<string, { value: string; enabled: boolean; reason: string }>
      evaluatedAt: string
    }>
  }
}

export async function verifyLicenseJwsOffline(jws: string, publicKeyPem: string): Promise<Record<string, unknown>> {
  const key = await importSPKI(publicKeyPem, 'ES256')
  const { payload } = await jwtVerify(jws, key, { algorithms: ['ES256'] })
  return payload as Record<string, unknown>
}
