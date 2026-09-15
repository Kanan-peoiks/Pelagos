/** Server-side verification for a Cloudflare Turnstile token — see
 * app/api/auth/register/route.ts. Never trust a Turnstile token without
 * this check; the widget itself only proves a browser solved a challenge,
 * not that the request is legitimate. */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  token: unknown,
  expectedAction: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false; // fail closed if misconfigured

  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return false;
  }

  const allowedHostnames = new Set(
    (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)
  );
  if (allowedHostnames.size === 0) return false;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;

    const result = (await res.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    return (
      result.success === true &&
      result.action === expectedAction &&
      !!result.hostname &&
      allowedHostnames.has(result.hostname)
    );
  } catch {
    return false;
  }
}
