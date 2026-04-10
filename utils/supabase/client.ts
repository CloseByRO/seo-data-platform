import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  // Ensure this is only used in the browser. For Server Components / Route Handlers,
  // use `utils/supabase/server.ts` or the Proxy (`proxy.ts`) integration.
  if (typeof window === 'undefined') {
    throw new Error('Supabase browser client cannot be created on the server')
  }

  // Use the SSR package in the browser so auth is stored in cookies
  // and is visible to Server Components via `utils/supabase/server.ts`.
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
