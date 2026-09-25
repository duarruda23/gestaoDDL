#!/bin/sh
# Deploy na VPS trafegodeloja (Docker Swarm). Rodar como usuário "gestao" em /opt/gestao-ddl:
#   sh infra/deploy.sh
# Passos: atualiza o código, constrói a imagem, faz o deploy da stack e aplica
# as migrações (usuário admin).
# ATENÇÃO (Fase 5): hoje o app ainda não usa o banco, então a ordem não
# importa. Quando passar a usar, migrar ANTES de atualizar o serviço do app.
set -eu

cd /opt/gestao-ddl
[ -f infra/.env ] || { echo "Falta infra/.env (copie de infra/.env.example)"; exit 1; }
set -a; . infra/.env; set +a

git pull --ff-only
VERSAO="$(git rev-parse --short HEAD)"
export VERSAO

echo "== Construindo gestao-donas-app:$VERSAO"
docker build -f infra/Dockerfile -t "gestao-donas-app:$VERSAO" .

echo "== Subindo/atualizando a stack (Postgres primeiro)"
docker stack deploy --detach=false -c infra/stack.yml gestao-donas

echo "== Esperando o Postgres ficar saudável"
i=0
until docker run --rm --network gestao-donas_interna postgres:17 \
  pg_isready -h postgres -U "$PG_ADMIN_USER" -d gestao_donas >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 30 ] && { echo "Postgres não respondeu"; exit 1; }
  sleep 2
done

echo "== Aplicando migrações"
docker run --rm --network gestao-donas_interna \
  -e MIGRACAO_DATABASE_URL="postgres://$PG_ADMIN_USER:$PG_ADMIN_PASSWORD@postgres:5432/gestao_donas" \
  "gestao-donas-app:$VERSAO" node db/migrar.mjs

echo "== Pronto: gestao-donas-app:$VERSAO em https://$DOMINIO"
docker service ls --filter name=gestao-donas
