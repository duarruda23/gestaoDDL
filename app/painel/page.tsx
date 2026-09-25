import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { montarPainel } from "@/lib/servidor/consultas";
import type { TarefaVisao } from "@/lib/visao";
import { CartaoTarefa, Contador, TituloPagina, TituloSecao, Vazio } from "@/components/ui";

export const metadata = { title: "Painel · Gestão Donas de Loja" };

function Lista({ tarefas, vazio }: { tarefas: TarefaVisao[]; vazio: string }) {
  if (!tarefas.length) return <Vazio>{vazio}</Vazio>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tarefas.map((t) => (
        <CartaoTarefa key={t.id} tarefa={t} compacto />
      ))}
    </div>
  );
}

// Painel: a visão da operação inteira. Todo mundo vê (modelo horizontal).
export default async function Painel() {
  await exigirConta();
  const p = await montarPainel(obterBanco());

  return (
    <div className="flex flex-col gap-8">
      <TituloPagina chapeu="Painel" titulo="Como está a operação" subtitulo="O que está atrasado, parado ou sem dono, e com quem." />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Contador valor={p.vencidas.length} rotulo="Vencidas" tom="danger" />
        <Contador valor={p.vencendo.length} rotulo="Vencem em breve" tom="warning" />
        <Contador valor={p.bloqueadas.length} rotulo="Bloqueadas" tom="warning" />
        <Contador href="/triagem" valor={p.semDono.length} rotulo="Sem dono" tom="warning" />
        <Contador href="/cobrancas?status=falhou" valor={p.falhasWhatsapp} rotulo="Falhas no WhatsApp" tom="danger" />
      </section>

      <section>
        <TituloSecao>Por pessoa</TituloSecao>
        <div className="dl-panel !p-0 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="p-3 font-semibold">Pessoa</th>
                <th className="p-3 font-semibold text-right">Com ela</th>
                <th className="p-3 font-semibold text-right">Vencidas</th>
                <th className="p-3 font-semibold text-right">Pediu, em aberto</th>
                <th className="p-3 font-semibold text-right">Cobrou</th>
                <th className="p-3 font-semibold text-right">Foi cobrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {p.porPessoa.map((l) => (
                <tr key={l.pessoa.id}>
                  <td className="p-3 font-bold">{l.pessoa.nome}</td>
                  <td className="p-3 text-right tabular-nums">{l.comEla}</td>
                  <td className={`p-3 text-right tabular-nums ${l.vencidasComEla ? "text-danger font-extrabold" : ""}`}>{l.vencidasComEla}</td>
                  <td className="p-3 text-right tabular-nums">{l.pediuEmAberto}</td>
                  <td className="p-3 text-right tabular-nums">{l.cobrou}</td>
                  <td className="p-3 text-right tabular-nums">{l.foiCobrada}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <TituloSecao tom="danger">Vencidas</TituloSecao>
        <Lista tarefas={p.vencidas} vazio="Nada vencido." />
      </section>
      <section>
        <TituloSecao>Bloqueadas</TituloSecao>
        <Lista tarefas={p.bloqueadas} vazio="Nada bloqueado." />
      </section>
      <section>
        <TituloSecao>Vencem em breve</TituloSecao>
        <Lista tarefas={p.vencendo} vazio="Nada vencendo nos próximos dias." />
      </section>
    </div>
  );
}
