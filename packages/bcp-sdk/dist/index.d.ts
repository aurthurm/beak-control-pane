type EntitlementApiResponse = {
    subscriber: {
        id: string;
        name: string;
        status: string;
        seats?: number;
    };
    product: {
        id: string;
        name: string;
        slug: string;
    };
    subscription: {
        id: string;
        status: string;
        provider: string;
        renewalAt: string;
    };
    plan: {
        id: string;
        name: string;
        billingCycle: string;
        status: string;
    };
    entitlement?: {
        id?: string;
        computedAt?: string;
        modules: Record<string, boolean>;
        limits: Record<string, number>;
        meta?: Record<string, unknown>;
        lineage?: Record<string, unknown>;
    };
    features: Array<{
        key: string;
        name: string;
        enabled: boolean;
        source?: string;
    }>;
    limits: Array<{
        key: string;
        value: number;
        resetPeriod?: string;
        unit?: string;
        enforcement?: string;
        notes?: string;
        valueKind?: string;
    }>;
    license: {
        id: string;
        licenseKey: string;
        mode: string;
        status: string;
        validTo: string;
        graceUntil: string;
    } | null;
};
type BcpClientOptions = {
    baseUrl: string;
    subscriberId: string;
    productId: string;
    /** PEM public key (SPKI) for offline JWS verification */
    publicKeyPem?: string;
    /** `BCP_INGEST_SECRET` — sent as Bearer for `/api/usage/report` and `/api/runtime-flags/evaluate` when the server requires it */
    ingestApiKey?: string;
    fetchImpl?: typeof fetch;
};
type LicenseExportFile = {
    kid: string;
    jws: string;
    payload: Record<string, unknown>;
};
declare class BcpClient {
    private readonly baseUrl;
    private readonly subscriberId;
    private readonly productId;
    private readonly publicKeyPem?;
    private readonly ingestApiKey?;
    private readonly fetchImpl;
    private entitlement;
    private offlinePayload;
    constructor(opts: BcpClientOptions);
    private ingestHeaders;
    /** Fetch latest entitlements from GET /api/entitlements/:subscriber/:product */
    refresh(): Promise<EntitlementApiResponse>;
    /** Load offline license file JSON ({ kid, jws, payload }) and verify JWS when publicKeyPem is set */
    importLicenseFile(text: string): Promise<Record<string, unknown>>;
    private modules;
    private limitsMap;
    isFeatureEnabled(key: string): boolean;
    getLimit(key: string): number | undefined;
    isExpired(): boolean;
    canAddUser(): boolean;
    daysRemaining(): number;
    /** POST /api/usage/report — metered usage for this subscriber/product */
    reportUsage(body: {
        metric: string;
        value: number;
        mode?: 'set' | 'increment';
        period?: string;
        periodKey?: string;
        source?: string;
        licenseKey?: string;
        recalculate?: boolean;
    }): Promise<unknown>;
    /** POST /api/runtime-flags/evaluate — rollout flags for this subscriber (and product scope when set) */
    evaluateRuntimeFlags(opts?: {
        environment?: string | null;
        flagKeys?: string[];
    }): Promise<{
        subscriberId: string;
        productId: string | null;
        environment: string | null;
        flags: Record<string, {
            value: string;
            enabled: boolean;
            reason: string;
        }>;
        evaluatedAt: string;
    }>;
}
declare function verifyLicenseJwsOffline(jws: string, publicKeyPem: string): Promise<Record<string, unknown>>;

export { BcpClient, type BcpClientOptions, type EntitlementApiResponse, type LicenseExportFile, verifyLicenseJwsOffline };
