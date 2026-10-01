#!/bin/sh
# Backup diário do Postgres (pg_dump em formato custom) e dos anexos (tar),
# guardando MANTER_DIAS dias.
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
  # Anexos: os arquivos ficam num volume, fora do banco.
  if [ -d /anexos ]; then
    pacote="/backups/anexos_$(date +%Y-%m-%d_%H%M).tar.gz"
    if tar -czf "$pacote.parcial" -C /anexos .; then mv "$pacote.parcial" "$pacote"; echo "backup ok: $pacote"
    else rm -f "$pacote.parcial"; echo "BACKUP DOS ANEXOS FALHOU em $(date)" >&2; fi
  fi
  find /backups \( -name 'gestao_donas_*.dump' -o -name 'anexos_*.tar.gz' \) -mtime +"${MANTER_DIAS:-14}" -delete
  sleep 86400
done
