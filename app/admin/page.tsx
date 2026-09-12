"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { getCurrentUser, isAdmin, type UserRole } from "@/lib/auth";
import { Users, ShieldCheck, UserCog, LogIn, MessageSquare } from "lucide-react";

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
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
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

  if (!admin) {
    return (
      <div className="dashboard-scroll">
        <PageHeader title="Admin" subtitle="Access denied." />
        <div className="panel">
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

          <div className="panel" style={{ marginTop: 16 }}>
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

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <span className="panel-title">Users</span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{users.length} total</span>
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
                  {users.map((u) => (
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

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <span className="panel-title">
                <MessageSquare size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                Feedback
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{feedback.length} submitted</span>
            </div>
            <div className="panel-body" style={{ display: "grid", gap: 10, padding: 16 }}>
              {feedback.length === 0 ? (
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>No feedback yet.</span>
              ) : (
                feedback.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid var(--glass-border)",
                      background: "var(--surface-muted)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                      <span style={{ fontWeight: 650, textTransform: "capitalize" }}>{f.kind}</span>
                      <span style={{ color: "var(--text-tertiary)" }}>
                        {f.userName} · {new Date(f.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 13 }}>{f.message}</div>
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
