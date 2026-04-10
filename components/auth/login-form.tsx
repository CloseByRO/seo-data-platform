"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const submittedEmail = String(fd.get("email") ?? "").trim();
    const submittedPassword = String(fd.get("password") ?? "");

    const supabase = createClient();
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: submittedEmail, password: submittedPassword })
        : await supabase.auth.signUp({ email: submittedEmail, password: submittedPassword });
    if (error) {
      setStatus(error.message);
      return;
    }

    window.location.href = "/org";
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Email</label>
        <input
          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Password</label>
        <input
          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />
      </div>

      {status ? (
        <p className="text-sm text-red-600 dark:text-red-400">{status}</p>
      ) : null}

      <button
        type="submit"
        className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-150 ease-out hover:bg-black/90 hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-black dark:hover:bg-white/90 dark:focus-visible:ring-white/30"
      >
        {mode === "signin" ? "Sign in" : "Create account"}
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="w-full rounded-md border border-black/10 px-3 py-2 text-sm transition-all duration-150 ease-out hover:bg-black/[.04] hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:border-white/15 dark:hover:bg-white/10 dark:focus-visible:ring-white/20"
      >
        {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </form>
  );
}

