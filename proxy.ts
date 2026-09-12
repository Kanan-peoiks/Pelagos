import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const AUTH_PAGES = ["/login", "/register", "/forgot-password"];
// Must stay reachable regardless of session state — an emailed reset link
// can be opened on a browser that's currently logged in on another account.
const ALWAYS_PUBLIC_PAGES = ["/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = Boolean(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  if (ALWAYS_PUBLIC_PAGES.includes(pathname)) {
    return NextResponse.next();
  }

  if (AUTH_PAGES.includes(pathname)) {
    if (authenticated) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/incidents/:path*",
    "/vessels/:path*",
    "/ai-analysis/:path*",
    "/response/:path*",
    "/reports/:path*",
    "/account/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ],
};
