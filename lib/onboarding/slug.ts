import { stripDiacritics } from '@/lib/romania/counties'

function normKey(s: string) {
  return stripDiacritics(s.trim().toLowerCase()).replace(/\s+/g, ' ')
}

export function toSlugFromName(name: string) {
  const n = normKey(name)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
  return n || 'client'
}

