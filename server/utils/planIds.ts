export function newPlanId() {
  return `plan_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export function newPlanLimitId() {
  return `lim_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export function newProductLimitKeyId() {
  return `plk_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export function newProductAddonKeyId() {
  return `pak_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}
