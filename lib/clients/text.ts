import crypto from 'node:crypto'

export function normalizeText(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

export function addressHash(addressText: string) {
  const norm = normalizeText(addressText).replace(/[^\p{L}\p{N}\s]/gu, '')
  return crypto.createHash('sha256').update(norm, 'utf8').digest('hex')
}

export function normalizeClientSlug(raw: string) {
  return normalizeText(raw).replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
}
