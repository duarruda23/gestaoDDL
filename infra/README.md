---
tags:
  - projeto
  - donas-de-loja
  - infraestrutura
date: 2026-09-24
---

# Infraestrutura na VPS pessoal

Como o sistema roda em produção na VPS pessoal do Eduardo (decisão de 24/09): app Next.js + PostgreSQL 17 em Docker, atrás do Traefik que já existe na VPS. **Ainda não foi testado numa VPS real**: falta o acesso para o inventário (passo 1).

## Desenho

```
internet ──HTTPS──> Traefik ──rede "traefik"──> app (Next.js, porta 3000)
                                                   │
                                          rede "interna" (sem saída)
                                                   │
                                   postgres:17 ◄── backup (pg_dump diário)
                                        ▲
                                  migrar (roda e termina antes do app)
```

- O Postgres **não publica porta**. Só `app`, `migrar` e `backup` falam com ele, pela rede interna.
- Dois usuários no banco: **admin** (migrações e backup) e **app** (só lê e grava dados; não mexe no schema).
- O app chega à internet pela rede do Traefik (para a IA e, depois, o n8n).

## Passo a passo

1. **Inventário da VPS** (antes de tudo):
   - `docker ps` e `docker network ls`: nome da rede do Traefik, entrypoint e certresolver usados pelos outros serviços;
   - portas em uso, espaço em disco (`df -h`), memória livre;
   - `ufw status`: só 22, 80 e 443 abertos, SSH só com chave.
2. **DNS:** apontar o subdomínio escolhido para o IP da VPS.
3. **Código:** clonar `github.com/duarruda23/gestaoDDL` na VPS.
4. **Segredos:** `cp infra/.env.example infra/.env` e preencher. Gerar senhas com `openssl rand -base64 32`. O `.env` nunca vai para o git.
5. **Subir:** `docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build`.
   - `migrar` aplica as migrações de `drizzle/` e termina; o `app` só sobe se ele der certo.
   - Primeira vez: o script de `postgres-init/` cria o usuário da aplicação.
6. **Conferir:**
   - `docker compose ... ps`: `app` e `postgres` saudáveis, `migrar` com saída 0;
   - o site responde em HTTPS com o header `X-Robots-Tag: noindex`;
   - de fora da VPS, a porta 5432 está fechada (`nc -zv IP 5432` deve falhar).
7. **Backup fora da VPS** (obrigatório antes de usar de verdade): o container `backup` grava um dump por dia no volume `gestao_donas_backups`, mas isso não sobrevive à perda da VPS. Configurar cópia diária para fora (rclone para Google Drive ou Backblaze; decidir).
8. **Testar a restauração** numa base separada antes da produção (critério da Fase 6):
   ```sh
   docker compose ... exec postgres createdb -U gestao_admin restauracao_teste
   docker compose ... exec -T postgres pg_restore -U gestao_admin -d restauracao_teste < arquivo.dump
   ```
   Conferir contagens de `usuarios`, `tarefas` e `eventos_tarefa` contra a base original.

## Atualizar

`git pull` e o mesmo comando do passo 5. Migrações novas rodam sozinhas pelo `migrar`.

## Pendências conhecidas

- Imagem Docker e compose **escritos mas não construídos** ainda (sem Docker na máquina de desenvolvimento). Validar na primeira subida.
- Destino do backup externo.
- Homologação: um segundo compose com outro `name:`, outro subdomínio e outro volume.
