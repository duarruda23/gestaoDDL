import { exigirConta } from "@/lib/servidor/dal";
import { diaSemana, hojeISO } from "@/lib/datas";

// Início do sistema real. Por enquanto só confirma a sessão: as listas
// ("com você", "você pediu", "te cobraram") voltam na A6, já lendo do banco.

export default async function Inicio() {
  const conta = await exigirConta();
  const primeiroNome = conta.nome.split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="dl-eyebrow">Hoje é {diaSemana(hojeISO())}</p>
        <h1 className="dl-heading">Olá, {primeiroNome}</h1>
        <p className="dl-subheading">
          Você entrou no sistema de gestão do Donas de Loja. As telas de tarefas estão sendo ligadas ao banco e aparecem aqui assim que ficarem prontas.
        </p>
      </header>

      <section className="dl-panel flex flex-col gap-2 max-w-2xl">
        <p className="dl-eyebrow">Sua conta</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="dl-field-label">Nome</dt>
          <dd className="font-semibold">{conta.nome}</dd>
          <dt className="dl-field-label">E-mail</dt>
          <dd className="font-semibold">{conta.email}</dd>
          <dt className="dl-field-label">WhatsApp</dt>
          <dd className="font-semibold">{conta.telefoneWhatsapp}</dd>
          {(conta.dono || conta.gerenciaAcessos) && (
            <>
              <dt className="dl-field-label">Acessos</dt>
              <dd className="font-semibold">{conta.dono ? "Dono do sistema" : "Pode gerenciar acessos"}</dd>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}
