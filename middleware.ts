import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": "Basic realm=\"Admin\"",
    },
  });
}

function isAdminPath(pathname: string) {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

function isMaintenanceBypassPath(pathname: string) {
  return (
    pathname === "/maintenance" ||
    pathname.startsWith("/maintenance/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/api/")
  );
}

async function readMaintenanceFromCachedApi(req: NextRequest) {
  try {
    const res = await fetch(`${req.nextUrl.origin}/api/settings`, {
      // Use edge cache headers from /api/settings.
      method: "GET",
      headers: { "x-middleware-prefetch": "1" },
      cache: "force-cache",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { isMaintenance?: boolean };
    return Boolean(data.isMaintenance);
  } catch {
    // Fail-open for user traffic if settings endpoint is temporarily unavailable.
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /admin and /api/admin/* with Basic Auth
  if (isAdminPath(pathname)) {
    const user = process.env.ADMIN_BASIC_USER ?? "";
    const pass = process.env.ADMIN_BASIC_PASS ?? "";

    if (!user || !pass) return unauthorized();

    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Basic ")) return unauthorized();

    try {
      const b64 = auth.slice("Basic ".length);
      // Edge Runtime: Buffer is unavailable.
      const decoded = atob(b64);
      const idx = decoded.indexOf(":");
      if (idx < 0) return unauthorized();

      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (u !== user || p !== pass) return unauthorized();
    } catch {
      return unauthorized();
    }

    return NextResponse.next();
  }

  // Redirect normal visitors to /maintenance while maintenance mode is enabled.
  if (!isMaintenanceBypassPath(pathname)) {
    const isMaintenance = await readMaintenanceFromCachedApi(req);
    if (isMaintenance) {
      const url = req.nextUrl.clone();
      url.pathname = "/maintenance";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

