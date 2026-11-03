# Backup and Restore Operations

The supported CLI is `pnpm db:backup {backup|verify|restore}`. A backup is
PostgreSQL custom format, streamed to a restricted temporary directory,
encrypted client-side with `age`, and published as a timestamped `.age` file
plus a JSON manifest. The manifest includes database name, PostgreSQL server
and dump-tool versions, latest successful migration, 40-character source SHA,
UTC creation time, backup type, encrypted size and SHA-256. It contains no URL, username,
password, key or cloud token. Plaintext temporary files are removed on success
or failure; backup files are excluded by `.gitignore`.

Required environment for backup:

- `DATABASE_URL`: source PostgreSQL URL, injected at runtime (not a CLI arg).
- `GIT_COMMIT_SHA`: full source commit.
- `METERWERK_BACKUP_AGE_RECIPIENT`: public age recipient key.
- Local tools: `pg_dump`, `pg_restore`, `psql`, `age`.

To also create and verify an independent offsite copy, set
`METERWERK_BACKUP_S3_URI` to a dedicated `s3://bucket/meterwerk-backups/...`
prefix, `METERWERK_BACKUP_S3_KMS_KEY_ID` to a customer-managed KMS key/alias,
and an external AWS role/provider. The uploader uses SSE-KMS and
requires a versioned object whose reported size and KMS encryption match. It
does not accept static credentials as arguments. Provision private access,
separate account/region replication, lifecycle/retention, KMS policy and
recovery IAM independently. No Production values are configured in the
repository.

To verify or restore, supply `METERWERK_BACKUP_AGE_IDENTITY_FILE` from the
authorized secret manager. Verify checks manifest, encrypted byte count and
hash, decryptability, PostgreSQL custom format and `pg_restore --list`. Restore
additionally requires `METERWERK_ENV=test` and a new target matching
`meterwerk_restore_*`; it uses `createdb` and one `pg_restore` transaction.
It never drops, truncates or overwrites an existing database. Always set
`DATABASE_URL` to an isolated test target and confirm its host/account before
running the command. No actual Staging or Production database is a test target.

`pnpm db:restore:verify` fails closed unless the isolated restored database
has the required core tables, a tenant row, a matching successful migration
history, validated foreign keys, no pending Prisma migrations and an
application readiness endpoint. Its machine-readable evidence must pass
`node scripts/verify-recovery-evidence.mjs <evidence.json> <host-loss.json> <negative-evidence-directory>`; missing evidence
is not success.

Use `bash scripts/pitr-drill.sh` for the disposable synthetic PostgreSQL WAL
archive/base-backup/PITR test (Docker required). It proves recovery to a point
before a synthetic error, and cleans up both containers and its temporary
directory. It is not a claim that Production WAL archiving is configured.
Run the weekly `Recovery Validation` workflow for encrypted backup, full
restore, schema/migration/application verification, synthetic migration
failure recovery and PITR. CI uses synthetic seeded data only and retains only
the secret-free manifest and recovery evidence, never the backup or decryption
identity.

Production operations target one encrypted logical backup daily at 02:00 UTC,
35 daily and 12 month-end copies subject to data-retention approval, and a
separate PostgreSQL base+WAL archive with <=5 minute lag. The WAL path,
offsite provider, KMS, external roles, lifecycle and monthly restore of a real
offsite copy must be provisioned and accepted by the responsible operators
before claiming Production backup/PITR readiness. See
[Disaster Recovery](DISASTER-RECOVERY.md) for RPO/RTO, incident handling and
full host restoration.
