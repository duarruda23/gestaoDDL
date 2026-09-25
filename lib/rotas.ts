// Telas do sistema real, na ordem da navegação. `pronta` diz se a tela já
// foi religada ao banco (bloco A da Fase 5). A navegação só mostra as
// prontas; as outras voltam conforme A4–A8 forem entregues.

export interface Rota {
  href: string;
  rotulo: string;
  pronta: boolean;
}

export const ROTAS: Rota[] = [
  { href: "/", rotulo: "Início", pronta: true },
  { href: "/nova", rotulo: "Pedir", pronta: false }, // A7 (formulário) / bloco B (IA)
  { href: "/quadro", rotulo: "Quadro", pronta: false }, // A6
  { href: "/triagem", rotulo: "Triagem", pronta: false }, // A6
  { href: "/painel", rotulo: "Painel", pronta: false }, // A6
  { href: "/cobrancas", rotulo: "Cobranças", pronta: false }, // A8
  { href: "/equipe", rotulo: "Equipe", pronta: true }, // A4/A5 (25/09)
];

export function rotaPronta(href: string): boolean {
  return ROTAS.some((r) => r.href === href && r.pronta);
}
