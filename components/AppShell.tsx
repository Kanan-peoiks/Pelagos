"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import type { NavId } from "@/lib/nav";
import { isAuthenticated, logout, refreshCurrentUser, type UserRole } from "@/lib/auth";
import { useIncidentStore } from "@/lib/incident-store";

type Props = {
  active: NavId;
  children: React.ReactNode;
};

const ROLE_LABEL: Record<UserRole, string> = {
  viewer: "Viewer",
  operator: "Operator",
  admin: "Admin",
};

// proxy.ts is the real gate (checks the httpOnly session cookie
// server-side). This client-side check just avoids briefly flashing
// authenticated content if the client's view is stale. The role shown
// below is always re-fetched from the backend on mount (refreshCurrentUser)
// rather than trusted from a possibly-stale localStorage cache — a
// left-over role from testing a different account in the same browser
// should never be displayed as if it were the current one.
export default function AppShell({ active, children }: Props) {
  const router = useRouter();
  const { loading: incidentsLoading } = useIncidentStore();
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState("Operator");
  const [userRole, setUserRole] = useState<UserRole>("viewer");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      const user = await refreshCurrentUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserName(user.name);
      setUserRole(user.role);
      setMounted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  if (!mounted) return null;

  if (incidentsLoading) {
    return (
      <div className="dashboard-shell">
        <Header
          onLogout={handleLogout}
          onMenuClick={() => setSidebarExpanded((v) => !v)}
          userName={userName}
          userRole={ROLE_LABEL[userRole]}
        />
        <div className="dashboard-body">
          <Sidebar active={active} expanded={sidebarExpanded} />
          <main
            className="dashboard-main"
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              Loading incidents… (the backend may take up to a minute to wake up)
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <Header
        onLogout={handleLogout}
        onMenuClick={() => setSidebarExpanded((v) => !v)}
        userName={userName}
        userRole={ROLE_LABEL[userRole]}
      />
      <div className="dashboard-body">
        <Sidebar active={active} expanded={sidebarExpanded} />
        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  );
}
