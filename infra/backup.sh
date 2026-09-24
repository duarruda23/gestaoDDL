#!/bin/sh
# Backup diário do Postgres (pg_dump em formato custom), guardando MANTER_DIAS dias.
# Isto cobre falha do banco, NÃO perda da VPS: copie /backups para fora dela
# (rclone para Google Drive/Backblaze, a decidir) — ver infra/README.md.
set -eu

while true; do
  arquivo="/backups/gestao_donas_$(date +%Y-%m-%d_%H%M).dump"
  if pg_dump --format=custom --no-owner --file="$arquivo.parcial"; then
    mv "$arquivo.parcial" "$arquivo"
    echo "backup ok: $arquivo"
  else
    rm -f "$arquivo.parcial"
    echo "BACKUP FALHOU em $(date)" >&2
  fi
  find /backups -name 'gestao_donas_*.dump' -mtime +"${MANTER_DIAS:-14}" -delete
  sleep 86400
done
