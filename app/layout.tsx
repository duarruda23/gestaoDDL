import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { AvisosProvider } from "@/components/Avisos";
import { obterConta } from "@/lib/servidor/dal";
import { sair } from "./entrar/acoes";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gestão Donas de Loja",
  description: "Pedidos, prazos e cobranças da equipe Donas de Loja",
  robots: { index: false, follow: false },
};

// Script mínimo que aplica o tema salvo antes da pintura (evita piscar claro/escuro).
const TEMA_INICIAL = `try{var t=localStorage.getItem("gestao-donas:tema");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // A conta vem da sessão no servidor (DAL). Sem sessão, só a tela de entrar aparece.
  const conta = await obterConta();

  return (
    <html lang="pt-BR" className={`${montserrat.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AvisosProvider>
          <Nav conta={conta ? { nome: conta.nome } : null} sair={sair} />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-16">{children}</main>
        </AvisosProvider>
      </body>
    </html>
  );
}
