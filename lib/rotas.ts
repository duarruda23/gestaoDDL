// Telas do sistema real, na ordem da navegação. `pronta` diz se a tela já
// foi religada ao banco (bloco A da Fase 5). A navegação só mostra as
// prontas; as outras voltam conforme A4–A8 forem entregues.

export interface Rota {
  href: string;
  rotulo: string;
  pronta: boolean;
  gestor?: boolean; // só aparece para quem gerencia acessos (dono e gestores)
}

export const ROTAS: Rota[] = [
  { href: "/", rotulo: "Início", pronta: true },
  { href: "/nova", rotulo: "Pedir", pronta: true }, // A7 formulário (25/09); IA volta no bloco B
  { href: "/series", rotulo: "Séries", pronta: true },
  { href: "/quadro", rotulo: "Quadro", pronta: true }, // A6 (25/09)
  { href: "/triagem", rotulo: "Triagem", pronta: true }, // A6 (25/09)
  { href: "/painel", rotulo: "Painel", pronta: true }, // A6 (25/09)
  { href: "/cobrancas", rotulo: "Cobranças", pronta: true }, // cobrança manual (25/09); envio pelo n8n no bloco C
  { href: "/equipe", rotulo: "Equipe", pronta: true }, // A4/A5 (25/09)
  { href: "/campanhas", rotulo: "Campanhas", pronta: true, gestor: true }, // dashboard por funil
];

export function rotaPronta(href: string): boolean {
  return ROTAS.some((r) => r.href === href && r.pronta);
}

// Rota visível para esta conta? As marcadas `gestor` exigem permissão de gestor.
export function rotaVisivel(href: string, gestor: boolean): boolean {
  const r = ROTAS.find((x) => x.href === href);
  return Boolean(r && r.pronta && (!r.gestor || gestor));
}
