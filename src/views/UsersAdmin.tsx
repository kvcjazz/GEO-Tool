"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppState } from "@/state/AppState";
import { callFn } from "@/lib/callFn";
import { UsersResponseSchema, type AdminUser } from "@/lib/schemas";

// Account-wide user administration. Calls the geo-users edge function, which
// runs with the service-role key and only permits admins.
export default function UsersAdmin() {
  const { toast, userEmail } = useAppState();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", admin: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await callFn("geo-users", { action: "list" }, UsersResponseSchema);
      if (!j.ok) {
        setDenied(j.error || "Unable to load users");
        setUsers([]);
      } else {
        setDenied(null);
        setUsers(j.users || []);
      }
    } catch (e) {
      setDenied(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser() {
    if (!form.email.trim()) return toast("Email is required");
    if (form.password.length < 6)
      return toast("Password must be at least 6 characters");
    setBusy(true);
    try {
      const j = await callFn(
        "geo-users",
        {
          action: "create",
          email: form.email.trim(),
          password: form.password,
          role: form.admin ? "admin" : undefined,
        },
        UsersResponseSchema,
      );
      toast(j.ok ? "User created: " + (j.user?.email || "") : "Failed: " + (j.error || ""));
      if (j.ok) {
        setForm({ email: "", password: "", admin: false });
        await load();
      }
    } catch (e) {
      toast("Failed: " + String(e));
    }
    setBusy(false);
  }

  async function resetPassword(u: AdminUser) {
    const pw = window.prompt(`New password for ${u.email} (min 6 characters):`);
    if (pw == null) return;
    if (pw.length < 6) return toast("Password must be at least 6 characters");
    const j = await callFn(
      "geo-users",
      { action: "set_password", user_id: u.id, password: pw },
      UsersResponseSchema,
    );
    toast(j.ok ? "Password updated for " + u.email : "Failed: " + (j.error || ""));
  }

  async function toggleAdmin(u: AdminUser) {
    const makeAdmin = u.role !== "admin";
    if (
      !makeAdmin &&
      !window.confirm(`Revoke admin access from ${u.email}? They'll no longer be able to manage users.`)
    )
      return;
    const j = await callFn(
      "geo-users",
      { action: "set_role", user_id: u.id, role: makeAdmin ? "admin" : null },
      UsersResponseSchema,
    );
    if (j.ok) {
      toast(makeAdmin ? u.email + " is now an admin" : "Admin revoked for " + u.email);
      await load();
    } else {
      toast("Failed: " + (j.error || ""));
    }
  }

  async function removeUser(u: AdminUser) {
    if (!window.confirm(`Permanently delete the account ${u.email}? This cannot be undone.`))
      return;
    const j = await callFn(
      "geo-users",
      { action: "delete", user_id: u.id },
      UsersResponseSchema,
    );
    if (j.ok) {
      toast("Deleted " + u.email);
      await load();
    } else {
      toast("Failed: " + (j.error || ""));
    }
  }

  return (
    <div
      className="card stack"
      style={{ marginBottom: 16, borderLeft: "5px solid var(--navy)" }}
    >
      <h3>
        Users &amp; access{" "}
        <span className="muted" style={{ textTransform: "none", fontWeight: 500 }}>
          — sign-in accounts for this tool (account-wide)
        </span>
      </h3>
      <div className="legend-note">
        Create logins for the team or clients, reset passwords, and grant admin (only
        admins can manage users). New accounts can sign in immediately — no email
        confirmation needed.
      </div>

      {denied ? (
        <div className="ai-box" style={{ background: "#fdeeee", borderColor: "#f0d4d4" }}>
          {denied}
        </div>
      ) : (
        <div style={{ overflow: "auto", marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Confirmed</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Loading users…
                  </td>
                </tr>
              ) : users.length ? (
                users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ minWidth: 180 }}>
                      {u.email}
                      {u.email === userEmail && (
                        <span className="muted"> (you)</span>
                      )}
                    </td>
                    <td>
                      {u.role === "admin" ? (
                        <span className="tag t-yes">Admin</span>
                      ) : (
                        <span className="tag t-na">User</span>
                      )}
                    </td>
                    <td>
                      {u.email_confirmed ? (
                        <span className="tag t-yes">Yes</span>
                      ) : (
                        <span className="tag t-na">No</span>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {u.last_sign_in_at ? u.last_sign_in_at.slice(0, 10) : "never"}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn sm ghost" onClick={() => resetPassword(u)}>
                        Reset password
                      </button>{" "}
                      <button className="btn sm ghost" onClick={() => toggleAdmin(u)}>
                        {u.role === "admin" ? "Revoke admin" : "Make admin"}
                      </button>{" "}
                      {u.email !== userEmail && (
                        <button className="btn sm danger" onClick={() => removeUser(u)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="muted">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!denied && (
        <>
          <div className="set-grid" style={{ marginTop: 12 }}>
            <div>
              <label>New user email</label>
              <input
                type="email"
                value={form.email}
                placeholder="name@company.com"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label>Temporary password (min 6)</label>
              <input
                type="text"
                value={form.password}
                placeholder="At least 6 characters"
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>
          <label className="flex" style={{ fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={form.admin}
              style={{ width: "auto", marginRight: 8 }}
              onChange={(e) => setForm({ ...form, admin: e.target.checked })}
            />{" "}
            Grant admin (can manage users)
          </label>
          <button
            className="btn sm"
            style={{ marginTop: 4 }}
            disabled={busy}
            onClick={createUser}
          >
            {busy ? "Creating…" : "Create user"}
          </button>
          <div className="legend-note">
            Share the email + temporary password with the person; they can sign in right
            away and you (or they, via you) can reset it any time.
          </div>
        </>
      )}
    </div>
  );
}
