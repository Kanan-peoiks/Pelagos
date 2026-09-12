"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { getCurrentUser, isAdmin, type UserRole } from "@/lib/auth";
import { Users, ShieldCheck, UserCog, LogIn, MessageSquare, Search, CheckCircle2, Undo2 } from "lucide-react";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isDemo: boolean;
  createdAt: string;
};

type Stats = {
  totalUsers: number;
  totalOperators: number;
  totalAdmins: number;
  loginsToday: number;
  loginsLast7Days: { date: string; count: number }[];
};

type FeedbackItem = {
  id: string;
  kind: "feedback" | "suggestion" | "question";
  message: string;
  userName: string;
  userEmail: string;
  createdAt: string;
  resolved: boolean;
};

export default function AdminPage() {
  return (
    <AppShell active="admin">
      <AdminContent />
    </AppShell>
  );
}

function AdminContent() {
  const admin = isAdmin(getCurrentUser());
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState<"open" | "resolved" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const [statsRes, usersRes, feedbackRes] = await Promise.all([
          fetch("/api/admin/stats", { cache: "no-store" }),
          fetch("/api/admin/users", { cache: "no-store" }),
          fetch("/api/feedback", { cache: "no-store" }),
        ]);
        if (!statsRes.ok || !usersRes.ok) throw new Error("Failed to load admin data.");
        if (cancelled) return;
        setStats(await statsRes.json());
        setUsers(await usersRes.json());
        setFeedback(feedbackRes.ok ? await feedbackRes.json() : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load admin data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [admin]);

  const changeRole = async (userId: string, role: UserRole) => {
    setUpdatingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to update role.");
      }
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role.");
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleResolved = async (item: FeedbackItem) => {
    setUpdatingId(item.id);
    try {
      const res = await fetch(`/api/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !item.resolved }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to update feedback.");
      }
      const updated = await res.json();
      setFeedback((prev) => prev.map((f) => (f.id === item.id ? updated : f)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update feedback.");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const unresolvedCount = feedback.filter((f) => !f.resolved).length;
  const filteredFeedback = useMemo(() => {
    if (feedbackFilter === "all") return feedback;
    return feedback.filter((f) => (feedbackFilter === "resolved" ? f.resolved : !f.resolved));
  }, [feedback, feedbackFilter]);

  if (!admin) {
    return (
      <div className="dashboard-scroll">
        <PageHeader title="Admin" subtitle="Access denied." />
        <div className="panel panel-static">
          <div className="panel-body" style={{ padding: 24, fontSize: 13, color: "var(--text-secondary)" }}>
            Your account doesn&apos;t have admin access.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-scroll">
      <PageHeader title="Admin" subtitle="User management and usage stats — visible to admins only." />

      {error && (
        <div className="auth-error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, fontSize: 13, color: "var(--text-secondary)" }}>Loading…</div>
      ) : (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }} className="report-stat-grid">
            <StatCard label="Total Users" value={stats?.totalUsers ?? 0} icon={<Users size={15} />} />
            <StatCard label="Operators" value={stats?.totalOperators ?? 0} icon={<UserCog size={15} />} />
            <StatCard label="Admins" value={stats?.totalAdmins ?? 0} icon={<ShieldCheck size={15} />} />
            <StatCard label="Logins Today" value={stats?.loginsToday ?? 0} icon={<LogIn size={15} />} />
          </section>

          <div className="panel panel-static" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <span className="panel-title">Logins — last 7 days</span>
            </div>
            <div className="panel-body" style={{ padding: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
              {(stats?.loginsLast7Days ?? []).length === 0 ? (
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>No logins recorded yet.</span>
              ) : (
                stats?.loginsLast7Days.map((d) => (
                  <div key={d.date} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{d.count}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{d.date}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel panel-static" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <span className="panel-title">Users</span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {filteredUsers.length} of {users.length}
              </span>
            </div>
            <div style={{ padding: "12px 16px 0" }}>
              <div style={{ position: "relative", maxWidth: 320 }}>
                <Search
                  size={14}
                  style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }}
                />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  style={{
                    width: "100%",
                    padding: "8px 10px 8px 32px",
                    borderRadius: 8,
                    border: "1px solid var(--glass-border)",
                    background: "var(--bg-base)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>
            <div className="panel-body" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-tertiary)", fontSize: 11 }}>
                    <th style={{ padding: "8px 12px" }}>Name</th>
                    <th style={{ padding: "8px 12px" }}>Email</th>
                    <th style={{ padding: "8px 12px" }}>Role</th>
                    <th style={{ padding: "8px 12px" }}>Joined</th>
                    <th style={{ padding: "8px 12px" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-secondary)" }}>
                        No users match your search.
                      </td>
                    </tr>
                  )}
                  {filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderTop: "1px solid var(--border-muted)" }}>
                      <td style={{ padding: "10px 12px" }}>
                        {u.name} {u.isDemo && <span style={{ color: "var(--text-tertiary)" }}>(demo)</span>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{u.email}</td>
                      <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>{u.role}</td>
                      <td style={{ padding: "10px 12px" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {u.isDemo ? (
                          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Fixed</span>
                        ) : (
                          <select
                            value={u.role}
                            disabled={updatingId === u.id}
                            onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                            style={{
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid var(--glass-border)",
                              background: "var(--bg-base)",
                              color: "var(--text-primary)",
                              fontSize: 12,
                              fontFamily: "inherit",
                            }}
                          >
                            <option value="viewer">viewer</option>
                            <option value="operator">operator</option>
                            <option value="admin">admin</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel panel-static" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <span className="panel-title">
                <MessageSquare size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                Feedback
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {unresolvedCount} open · {feedback.length} total
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "12px 16px 0" }}>
              {(["open", "resolved", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFeedbackFilter(f)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--glass-border)",
                    background: feedbackFilter === f ? "var(--accent)" : "transparent",
                    color: feedbackFilter === f ? "#fff" : "var(--text-secondary)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textTransform: "capitalize",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="panel-body" style={{ display: "grid", gap: 10, padding: 16 }}>
              {filteredFeedback.length === 0 ? (
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Nothing here.</span>
              ) : (
                filteredFeedback.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid var(--glass-border)",
                      background: f.resolved ? "transparent" : "var(--surface-muted)",
                      opacity: f.resolved ? 0.7 : 1,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, gap: 8 }}>
                        <span style={{ fontWeight: 650, textTransform: "capitalize" }}>{f.kind}</span>
                        <span style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                          {f.userName} · {new Date(f.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 13 }}>{f.message}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleResolved(f)}
                      disabled={updatingId === f.id}
                      title={f.resolved ? "Reopen" : "Mark resolved"}
                      style={{
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--glass-border)",
                        background: "transparent",
                        color: f.resolved ? "var(--text-secondary)" : "var(--accent)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {f.resolved ? <Undo2 size={13} /> : <CheckCircle2 size={13} />}
                      {f.resolved ? "Reopen" : "Resolve"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
