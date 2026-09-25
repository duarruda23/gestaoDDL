import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { listarTriagem } from "@/lib/servidor/consultas";
import { pendenciasParaLiberar } from "@/lib/regras";
import { CartaoTarefa, TituloPagina, Vazio } from "@/components/ui";

export const metadata = { title: "Triagem · Gestão Donas de Loja" };

// Triagem: pedidos que ainda não têm dono, prazo ou frente. Qualquer pessoa
// pode completar e liberar (modelo horizontal), pela tela da tarefa.
export default async function Triagem() {
  await exigirConta();
  const tarefas = await listarTriagem(obterBanco());

  return (
    <div>
      <TituloPagina
        chapeu="Triagem"
        titulo="Pedidos esperando alguém"
        subtitulo="Para sair daqui, o pedido precisa de responsável, prazo e frente."
      />
      {tarefas.length === 0 ? (
        <Vazio>Nada na triagem. Todo pedido já tem dono.</Vazio>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tarefas.map((t) => {
            const faltam = pendenciasParaLiberar({ responsavelId: t.responsavel?.id ?? null, prazo: t.prazo, frenteId: t.frente?.id ?? null });
            return (
              <div key={t.id} className="flex flex-col gap-2">
                <CartaoTarefa tarefa={t} />
                {faltam.length > 0 && <p className="px-1 text-xs text-ink-muted">Falta: {faltam.join(", ")}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
