import { NextResponse } from "next/server";

// Senha opcional: só é pedida se a variável PAD_PASSWORD existir na Vercel.
export function middleware(req) {
  const password = process.env.PAD_PASSWORD;
  if (!password) return NextResponse.next();
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
