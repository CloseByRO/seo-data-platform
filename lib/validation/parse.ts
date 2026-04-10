import type { ZodError } from 'zod'

export function zodErrorMessage(err: ZodError): string {
  const first = err.issues[0]
  return first?.message ?? 'Invalid request body'
}
