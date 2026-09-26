import { redirect } from "next/navigation";
import { obterConta } from "@/lib/servidor/dal";
import { destinoSeguro } from "@/lib/servidor/login-nucleo";
import { FormEntrar } from "@/components/FormEntrar";

export const metadata = { title: "Entrar · Gestão Donas de Loja" };

export default async function Entrar({ searchParams }: PageProps<"/entrar">) {
  const { voltar } = await searchParams;
  const destino = destinoSeguro(typeof voltar === "string" ? voltar : null);
  // Quem já está com sessão válida não precisa entrar de novo.
  if (await obterConta()) redirect(destino);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-6">
      <header>
        <p className="dl-eyebrow">Equipe Donas de Loja</p>
        <h1 className="dl-heading">Entrar</h1>
        <p className="dl-subheading">
          Aqui todo mundo pede, entrega e cobra todo mundo, o Ítalo incluído. Entre com o e-mail e a senha que você criou no convite.
        </p>
      </header>
      <FormEntrar voltar={destino} />
    </div>
  );
}
