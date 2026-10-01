import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { listarPessoasEFrentes, listarTarefas } from "@/lib/servidor/consultas";
import { QuadroFiltravel } from "@/components/QuadroFiltravel";

export const metadata = { title: "Quadro · Gestão Donas de Loja" };

// Quadro: todo mundo vê tudo (modelo horizontal). Os dados vêm do banco; os
// filtros rodam no navegador sobre a lista (a equipe é pequena).
export default async function Quadro() {
  const conta = await exigirConta();
  const banco = obterBanco();
  const [tarefas, { pessoas, frentes }] = await Promise.all([listarTarefas(banco), listarPessoasEFrentes(banco)]);
  return <QuadroFiltravel tarefas={tarefas} pessoas={pessoas} frentes={frentes} euId={conta.id} />;
}
