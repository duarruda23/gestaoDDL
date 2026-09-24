import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { GestaoProvider } from "@/lib/store";
import { Nav } from "@/components/Nav";
import { ExigeConta } from "@/components/ExigeConta";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gestão Donas de Loja",
  description: "Pedidos, prazos e cobranças da equipe Donas de Loja (protótipo interno)",
  robots: { index: false, follow: false },
};

// Script mínimo que aplica o tema salvo antes da pintura (evita piscar claro/escuro).
const TEMA_INICIAL = `try{var t=localStorage.getItem("gestao-donas:tema");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} />
      </head>
      <body className="min-h-full flex flex-col">
        <GestaoProvider>
          <ExigeConta>
            <Nav />
            <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-16">{children}</main>
            <footer className="text-center text-xs text-ink-subtle py-6 px-4">
              Protótipo interno. Ana, Bruno, Camila e Diego são contas de exemplo.
            </footer>
          </ExigeConta>
        </GestaoProvider>
      </body>
    </html>
  );
}
