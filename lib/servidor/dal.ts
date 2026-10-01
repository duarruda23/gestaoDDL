import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { obterBanco } from "@/db";
import { COOKIE_SESSAO } from "./cookie";
import { validarSessao, type ContaDaSessao } from "./sessao-nucleo";

// Camada de acesso a dados (DAL). A checagem de verdade acontece aqui, em
// toda leitura e gravação — o proxy.ts só faz a checagem otimista do cookie.
// `cache` faz a sessão ser validada uma vez por requisição, mesmo que várias
// partes da página chamem obterConta().

export const obterConta = cache(async (): Promise<ContaDaSessao | null> => {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null; // sem cookie, nem abre conexão com o banco
  return validarSessao(obterBanco(), token);
});

// Para páginas e server actions que exigem conta: sem sessão válida (ou com
// o acesso removido), vai para /entrar.
export async function exigirConta(): Promise<ContaDaSessao> {
  const conta = await obterConta();
  if (!conta) redirect("/entrar");
  return conta;
}
