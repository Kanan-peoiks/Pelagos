export type NavId =
  | "dashboard"
  | "incidents"
  | "vessels"
  | "ai"
  | "response"
  | "reports"
  | "account"
  | "admin";

export const NAV_ROUTES: Record<NavId, string> = {
  dashboard: "/dashboard",
  incidents: "/incidents",
  vessels: "/vessels",
  ai: "/ai-analysis",
  response: "/response",
  reports: "/reports",
  account: "/account",
  admin: "/admin",
};

/** All operational routes are live in Phase 3. */
export const ENABLED_NAV: NavId[] = [
  "dashboard",
  "incidents",
  "vessels",
  "ai",
  "response",
  "reports",
  "account",
  "admin",
];
