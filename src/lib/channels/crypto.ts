import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

/**
 * AES-256-GCM encryption for channel_integrations.config.
 *
 * Threat model: a reader of the `channel_integrations` table (via compromised
 * service key, replica dump, backup leak) should not recover provider API
 * keys. RLS is the first gate; this is the second.
 *
 * Key source: `CHANNEL_ENCRYPTION_KEY` env var. Must be 32 bytes or a
 * passphrase of any length (we derive a 32-byte key via scrypt with a fixed
 * salt — fine for symmetric encryption since both ends use the same env).
 *
 * Storage format (plain JSON so column stays queryable for existence checks):
 *   { "v": 1, "iv": "base64", "tag": "base64", "data": "base64" }
 */

const VERSION = 1
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12 // GCM recommended 12-byte IV
const SCRYPT_SALT = 'orbya-channel-v1' // fixed: key rotation happens via env var rotation

let _cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (_cachedKey) return _cachedKey
  const raw = process.env.CHANNEL_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'CHANNEL_ENCRYPTION_KEY not set — required to encrypt channel integration credentials'
    )
  }
  // Derive a fixed-length key. scryptSync is a good default for single-machine
  // deployments; if we later need HSM we swap this out.
  _cachedKey = scryptSync(raw, SCRYPT_SALT, KEY_BYTES)
  return _cachedKey
}

export type EncryptedBlob = {
  v: number
  iv: string
  tag: string
  data: string
}

export function encryptConfig(plain: Record<string, unknown>): EncryptedBlob {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const serialized = JSON.stringify(plain)
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    v: VERSION,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  }
}

export function decryptConfig(blob: EncryptedBlob | Record<string, unknown>): Record<string, unknown> {
  // Backwards-compat: if a row somehow has plaintext config, return as-is.
  if (!('v' in blob) || !('iv' in blob) || !('tag' in blob) || !('data' in blob)) {
    return blob as Record<string, unknown>
  }
  const typed = blob as EncryptedBlob
  if (typed.v !== VERSION) {
    throw new Error(`Unsupported encrypted config version: ${typed.v}`)
  }
  const key = getKey()
  const iv = Buffer.from(typed.iv, 'base64')
  const tag = Buffer.from(typed.tag, 'base64')
  const data = Buffer.from(typed.data, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

/**
 * Redact sensitive values for UI display — we need to show SOMETHING so the
 * user knows the integration is configured, but the actual secret stays
 * server-side.
 */
export function redactConfigForUI(config: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config)) {
    if (typeof v !== 'string') {
      redacted[k] = v
      continue
    }
    // Redact anything that looks like a credential field by name.
    if (/api[_-]?key|secret|token|password|bearer/i.test(k)) {
      redacted[k] = v.length > 8 ? `••••${v.slice(-4)}` : '••••'
    } else if (v.length > 40 && /^[A-Za-z0-9+/=_-]+$/.test(v)) {
      // Long opaque strings → redact anyway (likely a token)
      redacted[k] = `••••${v.slice(-4)}`
    } else {
      redacted[k] = v
    }
  }
  return redacted
}
