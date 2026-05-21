import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

const SALT_LEN = 16
const KEY_LEN = 64

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  const derived = (await scryptAsync(plain, salt, KEY_LEN)) as Buffer
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) {
    return false
  }
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false
  }
  const saltPart = parts[1]
  const expectedPart = parts[2]
  if (!saltPart || !expectedPart) {
    return false
  }
  const salt = Buffer.from(saltPart, 'base64')
  const expected = Buffer.from(expectedPart, 'base64')
  const derived = (await scryptAsync(plain, salt, expected.length)) as Buffer
  if (derived.length !== expected.length) {
    return false
  }
  return timingSafeEqual(derived, expected)
}

export function randomSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
