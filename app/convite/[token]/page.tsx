import Link from "next/link";
import { obterBanco } from "@/db";
import { lerConvite } from "@/lib/servidor/convite-nucleo";
import { FormConvite } from "@/components/FormConvite";

export const metadata = { title: "Convite · Gestão Donas de Loja" };

const MENSAGENS = {
  usado: "Este convite já foi usado. Se você já criou a senha, é só entrar.",
  vencido: "Este convite venceu (vale por 72 horas). Peça um novo a quem te convidou.",
  inexistente: "Este link de convite não existe. Confira se copiou o endereço inteiro.",
} as const;

export default async function Convite({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const { situacao, convite, contaExistente } = await lerConvite(obterBanco(), token);

  if (situacao !== "valido" || !convite) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 pt-6">
        <header>
          <p className="dl-eyebrow">Convite</p>
          <h1 className="dl-heading">Não deu para usar este convite</h1>
          <p className="dl-subheading">{MENSAGENS[situacao === "valido" ? "inexistente" : situacao]}</p>
        </header>
        <Link href="/entrar" className="dl-btn dl-btn-secondary self-start">
          Ir para a tela de entrar
        </Link>
      </div>
    );
  }

  const primeiroNome = convite.nome.split(" ")[0];
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-6">
      <header>
        <p className="dl-eyebrow">Equipe Donas de Loja</p>
        <h1 className="dl-heading">{contaExistente ? `${primeiroNome}, defina sua senha` : `Boas-vindas à equipe, ${primeiroNome}`}</h1>
        <p className="dl-subheading">
          {contaExistente
            ? "Crie uma senha para entrar no sistema de gestão. Se você tinha uma senha antes, ela deixa de valer."
            : "Aqui todo mundo pede, entrega e cobra todo mundo, o Ítalo incluído. Crie sua senha para entrar."}
        </p>
      </header>
      <FormConvite token={token} email={convite.email ?? ""} redefinir={Boolean(contaExistente)} />
    </div>
  );
}
