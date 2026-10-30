#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
: "${BACKUP_KEY_FILE:?Set an independent backup key file outside the project}"
command -v docker >/dev/null
command -v node >/dev/null
backup_dir="${1:-./backups}"
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
was_running="$(docker compose ps --status running -q app)"
cleanup() {
  rm -rf "$work"
  if [[ -n "$was_running" ]]; then docker compose start app >/dev/null || true; fi
}
trap cleanup EXIT
# Freeze app writes so DB and encrypted attachments belong to one checkpoint.
docker compose stop app
# No passwords in command arguments or logs.
docker compose exec -T db sh -c 'MYSQL_PWD="$(cat /run/secrets/db_root_password)" exec mysqldump -uroot --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF seruchat' > "$work/database.sql"
docker compose run --rm --no-deps -T --entrypoint tar app -C /app/.data/encrypted-files -czf - . > "$work/ciphertext.tar.gz"
printf 'Seruchat backup v1\nUTC=%s\nDatabase=seruchat\nSecrets are excluded; preserve RECOVERY_MASTER_KEY separately.\n' "$stamp" > "$work/manifest.txt"
tar -C "$work" -czf "$work/bundle.tar.gz" database.sql ciphertext.tar.gz manifest.txt
node deploy/backup-crypt.js encrypt "$work/bundle.tar.gz" "$backup_dir/seruchat-$stamp.scbackup"
printf 'Backup created: %s\n' "$backup_dir/seruchat-$stamp.scbackup"
