import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { carregarEquipe, propostasAbertas } from "@/lib/servidor/pedidos-nucleo";
import { escolherProvedor } from "@/lib/provedor-ia";
import { Pedir } from "@/components/pedir/Pedir";
import { listarModelos } from "@/lib/servidor/modelos-nucleo";

export const metadata = { title: "Pedir · Gestão Donas de Loja" };

// Pedir: texto livre interpretado pela IA (bloco B) ou formulário manual.
// Propostas ainda não revisadas voltam aqui, mesmo depois de fechar a aba.
export default async function PaginaPedir() {
  const conta = await exigirConta();
  const banco = obterBanco();
  const [{ pessoas, frentes }, abertas, modelos] = await Promise.all([carregarEquipe(banco), propostasAbertas(banco, conta.id), listarModelos(banco)]);
  return (
    <Pedir
      pessoas={pessoas.map(({ id, nome, funcao }) => ({ id, nome, funcao }))}
      frentes={frentes.map(({ id, nome }) => ({ id, nome }))}
      euId={conta.id}
      abertas={abertas}
      temIA={escolherProvedor() !== null}
      modelos={modelos.map((m) => ({ id: m.id, nome: m.nome, itens: m.itens, frenteId: m.frente?.id ?? null }))}
    />
  );
}
