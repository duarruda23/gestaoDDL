import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, rotaPublica } from "@/lib/servidor/cookie";

// Checagem otimista (Next 16: "proxy" é o antigo "middleware"): só olha se
// existe cookie de sessão, sem consultar o banco. A validação de verdade é a
// da DAL (lib/servidor/dal.ts), em toda leitura e gravação.

export function proxy(request: NextRequest) {
  const caminho = request.nextUrl.pathname;
  if (rotaPublica(caminho)) return NextResponse.next();

  if (!request.cookies.has(COOKIE_SESSAO)) {
    const entrar = new URL("/entrar", request.url);
    if (caminho !== "/") entrar.searchParams.set("voltar", caminho);
    return NextResponse.redirect(entrar);
  }
  return NextResponse.next();
}

export const config = {
  // Não roda em arquivos estáticos, imagens e ícones.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.(?:png|webp|svg|ico)$).*)"],
};
