import "server-only";
import { cookies, headers } from "next/headers";
import { obterBanco } from "@/db";
import { COOKIE_SESSAO, opcoesDoCookie } from "./cookie";
import { criarSessao, encerrarSessao } from "./sessao-nucleo";

// Integração da sessão com o Next: lê e grava o cookie e chama o núcleo.
// Só pode ser chamado de server actions e route handlers (que gravam cookie).

export async function iniciarSessao(usuarioId: string): Promise<void> {
  const userAgent = (await headers()).get("user-agent");
  const { token, expiraEm } = await criarSessao(obterBanco(), usuarioId, userAgent);
  (await cookies()).set(COOKIE_SESSAO, token, opcoesDoCookie(expiraEm));
}

export async function sairDaSessao(): Promise<void> {
  const jarra = await cookies();
  await encerrarSessao(obterBanco(), jarra.get(COOKIE_SESSAO)?.value);
  jarra.delete(COOKIE_SESSAO);
}
