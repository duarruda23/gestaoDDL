// Nome e opções do cookie de sessão. Sem dependências: o proxy.ts importa
// este arquivo e não pode puxar nada que toque no banco.

export const COOKIE_SESSAO = "gdl_sessao";

export function opcoesDoCookie(expiraEm: Date) {
  return {
    httpOnly: true, // JavaScript da página não lê o token
    secure: process.env.NODE_ENV === "production", // só HTTPS em produção
    sameSite: "lax" as const, // não vai em requisições de outros sites (CSRF)
    path: "/",
    expires: expiraEm,
  };
}

// Rotas que funcionam sem sessão.
export function rotaPublica(caminho: string): boolean {
  return (
    caminho === "/entrar" ||
    caminho.startsWith("/convite/") ||
    caminho.startsWith("/api/n8n/") // autenticadas por N8N_TOKEN, não por cookie
  );
}
