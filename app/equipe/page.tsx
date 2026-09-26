import { and, asc, gt, isNull, notInArray, sql } from "drizzle-orm";
import { obterBanco } from "@/db";
import { convites, tarefas, usuarios } from "@/db/schema";
import { exigirConta } from "@/lib/servidor/dal";
import { podeDelegarAcessos, podeGerenciarAcessos, recusaParaMexerNoAcesso } from "@/lib/servidor/permissoes";
import { formatarDataHora } from "@/lib/datas";
import { FormMeusDados } from "@/components/equipe/FormMeusDados";
import { FormConvidar } from "@/components/equipe/FormConvidar";
import { ListaAcessos, type PessoaAcesso, type PessoaSemAcesso } from "@/components/equipe/ListaAcessos";
import { ListaModelos } from "@/components/equipe/ListaModelos";
import { listarModelos } from "@/lib/servidor/modelos-nucleo";

export const metadata = { title: "Equipe · Gestão Donas de Loja" };

export default async function Equipe() {
  const eu = await exigirConta();
  const banco = obterBanco();

  const [contas, abertasPorPessoa, pendentes, modelos] = await Promise.all([
    banco.select().from(usuarios).orderBy(asc(usuarios.criadoEm)),
    banco
      .select({ id: tarefas.responsavelId, n: sql<number>`count(*)::int` })
      .from(tarefas)
      .where(notInArray(tarefas.estado, ["concluida", "arquivada"]))
      .groupBy(tarefas.responsavelId),
    banco
      .select({ nome: convites.nome, email: convites.email, criadoPorId: convites.criadoPorId, expiraEm: convites.expiraEm })
      .from(convites)
      .where(and(isNull(convites.usadoEm), gt(convites.expiraEm, new Date())))
      .orderBy(asc(convites.expiraEm)),
    listarModelos(banco),
  ]);

  const nomeDe = (id: string | null) => contas.find((c) => c.id === id)?.nome ?? "—";
  const abertas = new Map(abertasPorPessoa.map((a) => [a.id, a.n]));
  const gerencio = podeGerenciarAcessos(eu);
  const souDono = podeDelegarAcessos(eu);

  const pessoas: PessoaAcesso[] = contas
    .filter((c) => c.ativo)
    .sort((a, b) => Number(b.dono) - Number(a.dono))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      funcao: c.funcao,
      email: c.email,
      whatsapp: c.telefoneWhatsapp,
      dono: c.dono,
      gerenciaAcessos: c.gerenciaAcessos,
      tarefasAbertas: abertas.get(c.id) ?? 0,
      souEu: c.id === eu.id,
      podeRemover: recusaParaMexerNoAcesso(eu, c) === null,
      podeMudarPermissao: souDono && !c.dono,
    }));

  const semAcesso: PessoaSemAcesso[] = contas
    .filter((c) => !c.ativo)
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      removidoPor: nomeDe(c.acessoRemovidoPorId),
      removidoEm: c.acessoRemovidoEm ? formatarDataHora(c.acessoRemovidoEm.toISOString()) : "—",
    }));

  const gestores = contas.filter((c) => c.ativo && (c.dono || c.gerenciaAcessos)).map((c) => c.nome);
  const emailsComConta = new Set(contas.map((c) => c.email.toLowerCase()));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="dl-eyebrow">Equipe</p>
        <h1 className="dl-heading">Quem está no sistema</h1>
        <p className="dl-subheading">
          Todo mundo tem a mesma conta: pede, faz, cobra e é cobrado. A única exceção é tirar acesso, que fica com o Ítalo e quem ele autorizar.
        </p>
      </header>

      <FormMeusDados nome={eu.nome} funcao={eu.funcao} whatsapp={eu.telefoneWhatsapp} />
      <FormConvidar podeRedefinir={gerencio} />

      {pendentes.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="dl-eyebrow">Convites esperando a pessoa criar a senha</p>
          <ul className="flex flex-col gap-2">
            {pendentes.map((c, i) => (
              <li key={i} className="dl-panel !p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{c.nome}</strong>
                  <span className="text-ink-muted"> · {c.email}</span>
                  {c.email && emailsComConta.has(c.email.toLowerCase()) && (
                    <span className="ml-2 dl-tag dl-tag-media">Nova senha</span>
                  )}
                </span>
                <span className="text-xs text-ink-subtle">
                  Convite de {nomeDe(c.criadoPorId)} · vence {formatarDataHora(c.expiraEm.toISOString())}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ListaAcessos pessoas={pessoas} semAcesso={semAcesso} gestores={gestores} gerencio={gerencio} souDono={souDono} />

      <ListaModelos modelos={modelos} />
    </div>
  );
}
