import { redirect } from "next/navigation";
import { obterConta } from "@/lib/servidor/dal";
import { FormEsqueci } from "@/components/FormEsqueci";

export const metadata = { title: "Esqueci minha senha · Gestão Donas de Loja" };

export default async function Esqueci() {
  if (await obterConta()) redirect("/");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-6">
      <header>
        <p className="dl-eyebrow">Equipe Donas de Loja</p>
        <h1 className="dl-heading">Esqueci minha senha</h1>
        <p className="dl-subheading">
          Digite o e-mail da sua conta. A gente manda um link pro seu WhatsApp cadastrado pra você criar uma senha nova.
        </p>
      </header>
      <FormEsqueci />
    </div>
  );
}
