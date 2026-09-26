---
tags:
  - projeto
  - donas-de-loja
  - infraestrutura
date: 2026-09-24
---

# Infraestrutura na VPS pessoal (trafegodeloja)

O sistema roda na VPS pessoal do Eduardo, **trafegodeloja (31.97.86.160)**, a mesma do n8n e da Evolution: app Next.js + PostgreSQL 17 numa stack do **Docker Swarm**, atrás do Traefik que já existe lá.

## Inventário (24/09/2026)

| Item | Situação |
|---|---|
| Sistema | Debian 11, 4 vCPU, 15 GB de RAM (~4,4 GB livres), 197 GB de disco (17% em uso) |
| Docker | 28.5.1, **Swarm ativo** (um nó, manager), stacks gerenciadas pelo Portainer |
| Traefik | Rede overlay `trafegodeloja`, entrypoint `websecure`, certresolver `letsencryptresolver` (Let's Encrypt por HTTP) |
| Outras stacks | n8n (editor, webhook, worker, redis), Evolution, Supabase completo, Postgres 14, MongoDB, MinIO, Portainer, wa-transcriber, websocket-virgo |
| Acesso | Usuário `gestao` (grupo docker), chave `claude-code-gestao-ddl`, pasta `/opt/gestao-ddl` |

**Alertas encontrados (não são deste projeto, mas afetam a segurança da VPS):**
- **Sem firewall:** o `ufw` não está instalado. Portas abertas pra internet: 22, 80 e 443 (esperadas), mas também **2377 e 7946** (gerência do Swarm) e **3003** (websocket-virgo, fora do Traefik). Recomendação: o **firewall do painel da Hostinger** liberando só 22, 80 e 443. O `ufw` sozinho não bloqueia porta publicada pelo Docker.
- **`supabase_realtime` em loop de falha** (reinicia a cada ~20 s com saída 1).

## Desenho

```
internet ─HTTPS─> Traefik ─overlay "trafegodeloja"─> app (Next.js :3000)
                                                       │
                                       overlay "gestao-donas_interna"
                                                       │
                              postgres:17  ◄──  backup (pg_dump diário)
                                   ▲
                      migração (container avulso no deploy)
```

- O Postgres **não publica porta**. Só `app`, `backup` e a migração falam com ele, pela rede interna.
- Dois usuários no banco: **admin** (migrações e backup) e **app** (só lê e grava dados).
- Limites de memória: Postgres 1 GB, app 768 MB, backup 256 MB, pra não disputar com o n8n e o Supabase.

## Primeira instalação

1. **DNS:** criar o registro A do subdomínio escolhido apontando para `31.97.86.160` (sem proxy da Cloudflare, igual ao `teste.trafegodeloja.com.br`, pra o Let's Encrypt funcionar por HTTP).
2. **Código:** `git clone https://github.com/duarruda23/gestaoDDL.git /opt/gestao-ddl`.
3. **Segredos:** `cp infra/.env.example infra/.env` e preencher; gerar senhas com `openssl rand -base64 32`. O `.env` nunca vai pro git.
4. **Deploy:** `sh infra/deploy.sh`. Ele constrói a imagem, faz o deploy da stack `gestao-donas` e aplica as migrações.
5. **Conferir:**
   - `docker service ls --filter name=gestao-donas`: tudo `1/1`;
   - o site responde em HTTPS com `X-Robots-Tag: noindex`;
   - de fora, `nc -zv 31.97.86.160 5432` falha (porta fechada).
6. **Backup fora da VPS:** o serviço `backup` grava um dump por dia no volume `gestao-donas_gestao_donas_backups`. Ainda falta uma cópia fora da VPS (rclone para Google Drive ou Backblaze; decidir).
7. **Restauração testada** antes de usar de verdade:
   ```sh
   docker exec -i $(docker ps -qf name=gestao-donas_postgres) createdb -U gestao_admin restauracao_teste
   docker exec -i $(docker ps -qf name=gestao-donas_postgres) pg_restore -U gestao_admin -d restauracao_teste < arquivo.dump
   ```

## Atualizar

`sh infra/deploy.sh` de novo. A imagem ganha a tag do commit, e o Swarm troca o app com `start-first` (sobe o novo antes de derrubar o antigo) e volta à versão anterior se a atualização falhar.

## Pendências

- Subdomínio e registro DNS.
- Destino do backup externo.
- A primeira execução do `deploy.sh` vai validar o Dockerfile (ainda não foi construído).

## Integração com o n8n (WhatsApp)

O n8n não acessa o banco: usa três rotas, todas `POST` com o cabeçalho
`Authorization: Bearer <N8N_TOKEN>` (o mesmo valor do `infra/.env`). Sem
`N8N_TOKEN` configurado, as rotas respondem 503.

| Rota | Quando chamar | Corpo | Resposta |
|---|---|---|---|
| `/api/n8n/gerar` | de hora em hora, das 8h às 18h | — | `{ novas, ignoradas, jaExistiam }` — cria lembretes de véspera, cobranças de vencidas e avisos a quem pediu; repetir no mesmo dia não duplica |
| `/api/n8n/resumo` | uma vez por dia, às 8h | — | `{ novas, ignoradas, jaExistiam }` — resumo da manhã pra cada pessoa com algo em aberto |
| `/api/n8n/reservar` | a cada 1–2 min | `{ "limite": 20 }` (opcional) | `{ mensagens: [{ id, telefone, nome, texto }], motivo? }` — já reservadas por 5 min; fora da janela (8h–19h) volta vazio |
| `/api/n8n/resultado` | depois de cada envio | `{ id, ok, idProvedor?, erro? }` ou `{ resultados: [...] }` | falha volta pra fila (5 e 10 min depois) e na 3ª vira "Falhou" |

`telefone` já vem só com dígitos e DDI (ex.: `5581999990000`), pronto pro
campo `number` da Evolution API. O `texto` usa `*negrito*` do WhatsApp.
Se o n8n cair no meio, a reserva vence em 5 min e a mensagem volta a ser
entregue — por isso o envio precisa responder o `resultado` sempre.

## Anexos

Arquivos anexados às tarefas ficam no volume `gestao_donas_anexos`
(montado em `/dados/anexos` no app), fora do banco. O backup diário guarda
um `anexos_*.tar.gz` junto do dump, com a mesma retenção. Assim como o
dump, isso ainda não sai da VPS (pendência do backup externo).
