---
tags:
  - projeto
  - donas-de-loja
  - gestao-de-demandas
  - prototipo
date: 2026-09-24
---

# Gestão Donas de Loja — protótipo navegável

Protótipo da Fase 2 do [[gestao-donas-de-loja-plano]]. Mostra o fluxo do [[gestao-donas-de-loja-spec]] com dados de demonstração, sem banco.

## Rodar

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

A entrada por texto livre usa IA quando há uma chave configurada (veja `.env.example`):

- `OPENAI_API_KEY` (+ `OPENAI_MODEL`, padrão `gpt-4.1-mini`): usada nos testes.
- `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`, padrão `claude-opus-5`): provedor previsto no spec.
- `IA_PROVEDOR=openai|anthropic` força um dos dois quando as duas chaves existirem.

Localmente, coloque em `.env.local` (nunca commitar). Na Vercel, em Settings → Environment Variables. Sem chave nenhuma, ou se a IA falhar, a rota `/api/interpretar` usa um interpretador por regras e avisa na tela.

## Publicar na Vercel

1. Importar o repositório `duarruda23/gestaoDDL` (framework: Next.js, sem configuração extra).
2. Adicionar `OPENAI_API_KEY` (e `OPENAI_MODEL`, se quiser outro modelo) nas variáveis de ambiente.
3. Deploy. O site é `noindex`, mas o link é público: quem tiver o link entra.

## O que o protótipo cobre

Visual do [design system Gestão Donas de Loja](https://claude.ai/artifact/2r2WXo6FMN1oJr4KiJJZZE) (identidade do site do Ítalo). **Modelo horizontal:** não há papéis; todo mundo pede, faz, cobra e é cobrado, inclusive o Ítalo. Única exceção: remover o acesso de alguém é só do Ítalo (dono) e de quem ele autorizar.

| Tela | Rota | O que demonstra |
|---|---|---|
| Entrar | `/entrar` | Escolher a própria conta ou criar uma (sem senha no protótipo) |
| Início | `/` | O que está com você, o que você pediu (com botão Cobrar) e quem te cobrou |
| Pedir | `/nova` | Texto livre → propostas com evidência e dúvidas → revisar, dividir, descartar, confirmar. Formulário manual como alternativa |
| Quadro | `/quadro` | Quadro e lista, filtros por quem faz, quem pediu, frente, prioridade, vencidas |
| Triagem | `/triagem` | Pedidos sem dono/prazo/frente e auditoria dos pedidos em texto livre |
| Detalhe | `/tarefa/[id]` | Quem pediu, botão Cobrar, etapas, bloqueio com motivo, checklist, comentários, histórico, conflito de edição |
| Painel | `/painel` | Igual para todos: vencidas, sem dono, bloqueadas, e pessoa por pessoa (quem cobrou, quem foi cobrado) |
| Cobranças | `/cobrancas` | Fila de WhatsApp: automáticas + cobranças de colegas, idempotência, falha e nova tentativa |
| Equipe | `/equipe` | Contas, criar conta para alguém, **acessos** (remover/restaurar: só o Ítalo e quem ele autorizar), restaurar dados de demonstração |

Botão "Claro/Escuro" no topo troca o tema (escuro é o padrão, como o site).

## Estrutura

- `lib/types.ts`: tipos no formato das tabelas do spec (viram schema Drizzle depois)
- `lib/store.tsx`: estado em memória + localStorage (vira rotas do servidor + Postgres)
- `lib/regras.ts`: estados e transições (sem permissões: modelo horizontal)
- `lib/cobrancas.ts`: regras automáticas, cobrança manual entre colegas e idempotência (o que o n8n vai fazer)
- `lib/interpretacao.ts`: schema da saída da IA, prompt e validação no servidor
- `lib/interpretar-simulado.ts`: interpretador por regras (fallback)
- `app/api/interpretar/route.ts`: única rota de servidor; chama a IA escolhida em `lib/provedor-ia.ts` (chaves só no servidor)

## Banco e infraestrutura (Fase 3)

O protótipo ainda roda com dados no navegador. O sistema real já tem a base pronta:

- `db/schema.ts`: tabelas em Drizzle (Postgres 17). Migrações em `drizzle/` (`pnpm db:generate`, `pnpm db:migrate`, `pnpm db:check`).
- `db/teste-regras.sql`: testa no banco as regras que não podem falhar (um único dono, histórico imutável, remover acesso encerra sessões, idempotência das mensagens...).
- `infra/`: Docker + Traefik para a VPS, backup diário e passo a passo em `infra/README.md`.
- `.github/workflows/ci.yml`: a cada push, tipos + lint + build e migrações + teste de regras num Postgres descartável.

Arquitetura completa: nota `gestao-donas-de-loja-arquitetura` no vault.

## Limites (é protótipo)

- Dados ficam no navegador de quem usa; não há senha (a conta escolhida fica lembrada).
- O envio de WhatsApp é simulado.
- Pessoas e tarefas são exemplos; a lista real sai da validação com o Ítalo.
