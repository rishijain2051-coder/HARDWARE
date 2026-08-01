import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

/**
 * Optimistic auth check (Next 16 renamed `middleware.ts` to `proxy.ts`).
 *
 * This is a cheap first pass only: it looks at the session *cookie* and bounces
 * anonymous visitors to /login before a protected page starts rendering. It
 * deliberately performs no database work, because the proxy runs on every
 * request including link prefetches.
 *
 * It is NOT the security boundary. Real authorisation happens close to the data
 * in `lib/dal.ts` — every page, server action, and route handler re-checks the
 * session and the role's permissions against the database.
 */

const PUBLIC_ROUTES = ["/login"]

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  )

  // Presence of the cookie only — its validity is verified server-side.
  const hasSession = Boolean(getSessionCookie(request))

  if (!hasSession && !isPublic) {
    const loginUrl = new URL("/login", request.nextUrl)
    // Preserve where they were headed so login can send them back.
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  // Skip API routes, Next internals, and static assets.
  //
  // API routes are excluded deliberately: redirecting them to /login would
  // answer a fetch() with an HTML page instead of a status code. Each route
  // handler runs its own `guardRoute` check and returns a proper 401/403.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
