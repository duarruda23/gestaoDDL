import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { montarInicio } from "@/lib/servidor/consultas";
import { cobrancasRecebidas } from "@/lib/servidor/cobranca-nucleo";
import Link from "next/link";
import { diaSemana, formatarDataHora, hojeISO } from "@/lib/datas";
import type { TarefaVisao } from "@/lib/visao";
import { CartaoTarefa, Contador, TituloPagina, TituloSecao, Vazio } from "@/components/ui";

// Início: quem te cobrou, o que está com você e o que você pediu.

function Grade({ tarefas }: { tarefas: TarefaVisao[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tarefas.map((t) => (
        <CartaoTarefa key={t.id} tarefa={t} />
      ))}
    </div>
  );
}

export default async function Inicio() {
  const conta = await exigirConta();
  const banco = obterBanco();
  const [inicio, cobrancas] = await Promise.all([montarInicio(banco, conta.id), cobrancasRecebidas(banco, conta.id)]);
  const primeiroNome = conta.nome.split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      <TituloPagina
        chapeu={`Hoje é ${diaSemana(hojeISO())}`}
        titulo={`Olá, ${primeiroNome}`}
        subtitulo="O que está com você e o que você pediu para os outros."
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Contador valor={inicio.comVoce.length} rotulo="Com você" />
        <Contador valor={inicio.vencidasComVoce.length} rotulo="Vencidas com você" tom="danger" />
        <Contador valor={inicio.vocePediu.length} rotulo="Você pediu, em aberto" />
        <Contador valor={inicio.vocePediuVencidas} rotulo="Você pediu, vencidas" tom="warning" />
      </section>

      {cobrancas.length > 0 && (
        <section>
          <TituloSecao>Te cobraram</TituloSecao>
          <ul className="dl-panel !p-0 divide-y divide-line overflow-hidden">
            {cobrancas.map((m) => (
              <li key={m.id}>
                <Link href={`/tarefa/${m.tarefa!.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 hover:bg-surface-section">
                  <span className="text-sm">
                    <strong>{m.autor?.nome}</strong> cobrou <strong>{m.tarefa!.titulo}</strong>
                  </span>
                  <span className="text-xs text-ink-subtle">{formatarDataHora(m.criadoEm)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inicio.vencidasComVoce.length > 0 && (
        <section>
          <TituloSecao tom="danger">Vencidas com você</TituloSecao>
          <Grade tarefas={inicio.vencidasComVoce} />
        </section>
      )}

      <section>
        <TituloSecao>Próximas com você</TituloSecao>
        {inicio.proximasComVoce.length ? <Grade tarefas={inicio.proximasComVoce} /> : <Vazio>Nada pendente com você.</Vazio>}
      </section>

      {inicio.bloqueadasComVoce.length > 0 && (
        <section>
          <TituloSecao>Bloqueadas com você</TituloSecao>
          <Grade tarefas={inicio.bloqueadasComVoce} />
        </section>
      )}

      <section>
        <TituloSecao>Você pediu</TituloSecao>
        {inicio.vocePediu.length ? (
          <Grade tarefas={inicio.vocePediu} />
        ) : (
          <Vazio>Você não tem pedidos em aberto com outras pessoas.</Vazio>
        )}
      </section>
    </div>
  );
}
