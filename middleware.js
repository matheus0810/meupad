import { NextResponse } from "next/server";

// Pede senha (HTTP Basic Auth) em todas as páginas e na API.
export function middleware(req) {
  const password = process.env.PAD_PASSWORD;
  if (!password) {
    return new NextResponse("Defina a variável PAD_PASSWORD na Vercel.", { status: 500 });
  }
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(given, password)) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("Senha necessária", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Meu Pad", charset="UTF-8"' },
  });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
