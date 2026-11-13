/** Client-generated UUIDs — the key to idempotent sync (spec 11.5). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 v4 fallback for very old browsers.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Stable per-device id so we can detect an active workout on another device. */
export function deviceId(): string {
  const KEY = 'orbit.deviceId'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = uuid()
    localStorage.setItem(KEY, id)
  }
  return id
}
