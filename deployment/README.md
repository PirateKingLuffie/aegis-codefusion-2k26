# Oracle Always Free-compatible deployment

These assets use only open-source, self-hosted services and target one Ubuntu ARM64 or AMD64 Oracle Compute instance that fits the owner's current Always Free allowance. Oracle account eligibility, regional capacity and future pricing are external to AEGIS. The scripts do not create an account, instance, VCN, DNS record or TLS certificate because those operations require the owner's credentials and domain control.

1. Create the Oracle instance, attach a public IP, and allow TCP 22/80/443 in the VCN security list or network security group.
2. Copy the repository to the instance and run `sudo sh deployment/scripts/oracle-bootstrap.sh`. Log out and back in once if the script added the operator to the `docker` group.
3. Copy `deployment/.env.example` to `deployment/.env`; generate a long random database password (for example, `openssl rand -hex 32`), replace the example origin, and keep `AEGIS_TLS_ENABLED=false` for the first HTTP check.
4. Run `sh deployment/scripts/preflight.sh`, `sh deployment/scripts/migrate.sh`, then `docker compose --env-file deployment/.env up --build -d` and `sh deployment/scripts/healthcheck.sh`.
5. Point the chosen DNS record to the instance. Use a free ACME client to obtain the certificate, then place its `fullchain.pem` and `privkey.pem` in `deployment/certs/` with access limited to the deployment operator/root.
6. Set `AEGIS_PUBLIC_URL=https://your-domain`, `AEGIS_ALLOWED_ORIGINS=https://your-domain`, and `AEGIS_TLS_ENABLED=true`. Start with `docker compose --env-file deployment/.env -f docker-compose.yml -f docker-compose.tls.yml up -d`.
7. Schedule `sh deployment/scripts/backup.sh` and ACME renewal with systemd timers or cron. The Redis service is intentionally non-persistent because it stores disposable cache entries; PostgreSQL is the system of record.

## Operations

- `sh deployment/scripts/preflight.sh` rejects the example/short database password, locks the environment file to mode 600, checks TLS files when enabled, and validates the merged Compose configuration.
- `sh deployment/scripts/update.sh` refuses a dirty checkout, backs up a running database, applies the idempotent PostGIS schema, rebuilds, restarts, and waits for both health endpoints.
- `sh deployment/scripts/rollback.sh` builds the prior Git revision in a detached temporary worktree and leaves the primary checkout unchanged. Database changes in this release are additive; application rollback does not rewrite data.
- `sh deployment/scripts/backup.sh` creates a compressed PostgreSQL dump plus SHA-256 checksum and removes backup pairs older than 14 days.
- `sh deployment/scripts/restore.sh --confirm deployment/backups/aegis-TIMESTAMP.dump` verifies the checksum and replaces only the configured AEGIS database. This is intentionally explicit and destructive.
- `sh deployment/scripts/healthcheck.sh https://your-domain` retries for up to 60 seconds and verifies the web gateway and durable API.

Never commit `deployment/.env`, database dumps, certificates or provider credentials. Public map/live providers do not need keys. Restrict SSH to the operator's IP when practical, keep unattended security updates enabled, and retain only the documented ports.
