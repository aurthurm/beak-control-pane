{
  "meta": {
    "schema_version": "1.0",
    "license_id": "lic_8f3a9c",
    "issued_at": "2026-04-01T00:00:00Z",
    "issued_by": "beak-control-plane"
  },

  "subject": {
    "tenant_id": "tenant_123",
    "product": "beak-pos",
    "environment": "production",
    "edition": "pro"
  },

  "entitlements": {
    "modules": {
      "pos": true,
      "inventory": true,
      "customers": true,
      "reports_advanced": false
    },

    "limits": {
      "users": 25,
      "branches": 2,
      "products": 5000,
      "api_calls_per_month": 100000
    }
  },

  "validity": {
    "valid_from": "2026-04-01T00:00:00Z",
    "valid_to": "2027-03-31T23:59:59Z",
    "grace_until": "2027-04-15T23:59:59Z"
  },

  "constraints": {
    "offline_allowed": true,
    "max_activations": 3,
    "require_periodic_check": false,
    "check_interval_days": 30,
    "allowed_versions": ">=1.0.0 <2.0.0"
  },

  "binding": {
    "type": "none", 
    "machine_id": null,
    "site_id": null
  },

  "signature": {
    "algorithm": "RS256",
    "value": "BASE64_SIGNATURE"
  }
}
