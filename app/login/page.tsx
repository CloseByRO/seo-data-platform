import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-black/10 p-8 dark:border-white/15">
        <h1 className="text-2xl font-semibold">SEO Data Platform</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          Sign in to access org dashboards and run ingestion jobs.
        </p>
        <div className="mt-6">
          <Suspense fallback={<p className="text-sm text-black/60 dark:text-white/60">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
