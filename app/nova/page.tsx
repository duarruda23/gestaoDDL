import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { listarPessoasEFrentes } from "@/lib/servidor/consultas";
import { FormNovaTarefa } from "@/components/tarefa/FormNovaTarefa";
import { TituloPagina } from "@/components/ui";

export const metadata = { title: "Pedir · Gestão Donas de Loja" };

// Pedir: formulário manual (A7). O pedido em texto livre interpretado pela IA
// volta no bloco B, já gravando no banco.
export default async function Pedir() {
  const conta = await exigirConta();
  const { pessoas, frentes } = await listarPessoasEFrentes(obterBanco());
  return (
    <div className="mx-auto max-w-2xl">
      <TituloPagina
        chapeu="Pedir"
        titulo="O que precisa ser feito?"
        subtitulo="Qualquer pessoa pode pedir para qualquer outra, inclusive para si mesma."
      />
      <FormNovaTarefa pessoas={pessoas} frentes={frentes} euId={conta.id} />
    </div>
  );
}
