"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const sb = getSupabaseBrowserClient();
  const router = useRouter();
  const [email, setEmail] = useState("geo-pilot@luminouspr.com");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setErr("");
    setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div id="login">
      <div className="login-card">
        <div className="brand-mark">LUMINOUS PR</div>
        <h1>GEO Visibility Pilot</h1>
        <p className="sub">Sign in to the AI search visibility tracker.</p>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && signIn()}
        />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && signIn()}
        />
        <div style={{ height: 18 }} />
        <button className="btn block" onClick={signIn} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="err">{err}</div>
        <div className="hint">
          Sign in with the Luminous GEO pilot account, or your existing Agency Hub
          account. Add <b>?view=client</b> to the URL for the read-only client view.
        </div>
      </div>
    </div>
  );
}
