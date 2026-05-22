// src/index.ts
import { importSPKI, jwtVerify } from "jose";
var BcpClient = class {
  baseUrl;
  subscriberId;
  productId;
  publicKeyPem;
  ingestApiKey;
  fetchImpl;
  entitlement = null;
  offlinePayload = null;
  constructor(opts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.subscriberId = opts.subscriberId;
    this.productId = opts.productId;
    this.publicKeyPem = opts.publicKeyPem;
    this.ingestApiKey = opts.ingestApiKey?.trim() || void 0;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  ingestHeaders() {
    const h = { "Content-Type": "application/json" };
    if (this.ingestApiKey) {
      h.Authorization = `Bearer ${this.ingestApiKey}`;
    }
    return h;
  }
  /** Fetch latest entitlements from GET /api/entitlements/:subscriber/:product */
  async refresh() {
    const url = `${this.baseUrl}/api/entitlements/${encodeURIComponent(this.subscriberId)}/${encodeURIComponent(this.productId)}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`BcpClient.refresh failed: ${res.status} ${res.statusText}`);
    }
    this.entitlement = await res.json();
    this.offlinePayload = null;
    return this.entitlement;
  }
  /** Load offline license file JSON ({ kid, jws, payload }) and verify JWS when publicKeyPem is set */
  async importLicenseFile(text) {
    const file = JSON.parse(text);
    if (!file.jws) {
      throw new Error("importLicenseFile: missing jws");
    }
    if (this.publicKeyPem) {
      const key = await importSPKI(this.publicKeyPem, "ES256");
      const { payload } = await jwtVerify(file.jws, key, { algorithms: ["ES256"] });
      this.offlinePayload = payload;
    } else {
      this.offlinePayload = file.payload ?? {};
    }
    this.entitlement = null;
    return this.offlinePayload;
  }
  modules() {
    if (this.offlinePayload) {
      const ent = this.offlinePayload.entitlement;
      return ent?.modules ?? this.offlinePayload.modules ?? {};
    }
    return this.entitlement?.entitlement?.modules ?? {};
  }
  limitsMap() {
    if (this.offlinePayload) {
      const ent = this.offlinePayload.entitlement;
      return ent?.limits ?? this.offlinePayload.limits ?? {};
    }
    return this.entitlement?.entitlement?.limits ?? {};
  }
  isFeatureEnabled(key) {
    return this.modules()[key] === true;
  }
  getLimit(key) {
    const v = this.limitsMap()[key];
    return typeof v === "number" ? v : void 0;
  }
  isExpired() {
    const now = Date.now();
    if (this.offlinePayload) {
      const vt = this.offlinePayload.validTo;
      if (typeof vt === "string") {
        return new Date(vt).getTime() < now;
      }
      return false;
    }
    const lic = this.entitlement?.license;
    if (!lic) return false;
    if (["revoked", "superseded"].includes(lic.status.toLowerCase())) return true;
    return new Date(lic.validTo).getTime() < now;
  }
  canAddUser() {
    const seats = this.entitlement?.subscriber?.seats ?? 0;
    const maxUsers = this.getLimit("users");
    if (maxUsers === void 0) return true;
    return seats < maxUsers;
  }
  daysRemaining() {
    const end = this.offlinePayload && typeof this.offlinePayload.validTo === "string" ? new Date(this.offlinePayload.validTo).getTime() : this.entitlement?.license ? new Date(this.entitlement.license.validTo).getTime() : this.entitlement?.subscription?.renewalAt ? new Date(this.entitlement.subscription.renewalAt).getTime() : NaN;
    if (!Number.isFinite(end)) return 0;
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1e3)));
  }
  /** POST /api/usage/report — metered usage for this subscriber/product */
  async reportUsage(body) {
    const url = `${this.baseUrl}/api/usage/report`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.ingestHeaders(),
      body: JSON.stringify({
        subscriberId: this.subscriberId,
        productId: this.productId,
        ...body
      })
    });
    if (!res.ok) {
      throw new Error(`BcpClient.reportUsage failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
  /** POST /api/runtime-flags/evaluate — rollout flags for this subscriber (and product scope when set) */
  async evaluateRuntimeFlags(opts) {
    const url = `${this.baseUrl}/api/runtime-flags/evaluate`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.ingestHeaders(),
      body: JSON.stringify({
        subscriberId: this.subscriberId,
        productId: this.productId,
        environment: opts?.environment ?? null,
        flagKeys: opts?.flagKeys
      })
    });
    if (!res.ok) {
      throw new Error(`BcpClient.evaluateRuntimeFlags failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
};
async function verifyLicenseJwsOffline(jws, publicKeyPem) {
  const key = await importSPKI(publicKeyPem, "ES256");
  const { payload } = await jwtVerify(jws, key, { algorithms: ["ES256"] });
  return payload;
}
export {
  BcpClient,
  verifyLicenseJwsOffline
};
