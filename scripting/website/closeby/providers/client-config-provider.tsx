'use client'

import { createContext, useContext } from 'react'
import type { ClientConfig } from '@/types/client-config'

const ClientConfigContext = createContext<ClientConfig | null>(null)

export function ClientConfigProvider({ value, children }: { value: ClientConfig; children: React.ReactNode }) {
  return <ClientConfigContext.Provider value={value}>{children}</ClientConfigContext.Provider>
}

/** Merged server config (DB → env → static) when wrapped by `RootLayout`; otherwise null. */
export function useMergedClientConfig(): ClientConfig | null {
  return useContext(ClientConfigContext)
}
