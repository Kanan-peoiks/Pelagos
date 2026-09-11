"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import type { NavId } from "@/lib/nav";
import { getCurrentUser, isAuthenticated, logout } from "@/lib/auth";
import { useIncidentStore } from "@/lib/incident-store";

type Props = {
  active: NavId;
  children: React.ReactNode;
};

// middleware.ts is the real gate (checks the httpOnly session cookie
// server-side). This client-side check just avoids briefly flashing
// authenticated content if the client's view is stale.
export default function AppShell({ active, children }: Props) {
  const router = useRouter();
  const { loading: incidentsLoading } = useIncidentStore();
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState("Operator");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setMounted(true);
    const user = getCurrentUser();
    if (user?.name) setUserName(user.name);
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
          userRole="Admin"
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
        userRole="Admin"
      />
      <div className="dashboard-body">
        <Sidebar active={active} expanded={sidebarExpanded} />
        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  );
}
