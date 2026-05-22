# Data safety

stash stores user data in one local SQLite database. The database path defaults
to:

```sh
${XDG_DATA_HOME:-$HOME/.local/share}/stash/stash.db
```

Override it with `STASH_DB_PATH`. Backups default to a `backups/` directory next
to that database, for example:

```sh
${XDG_DATA_HOME:-$HOME/.local/share}/stash/backups/
```

Override the backup directory with `STASH_BACKUP_DIR`.

## Manual backup

Run:

```sh
bun run db:backup
```

The command prints the backup file path on stdout and writes a SQLite
`VACUUM INTO` snapshot named like:

```text
stash-backup-2026-05-20T00-00-00-000Z-manual.db
```

To back up a non-default database:

```sh
STASH_DB_PATH=/tmp/stash-demo.db bun run db:backup
```

## Restore

Stop the stash server before restoring. Then run:

```sh
bun run db:restore -- /path/to/stash-backup-2026-05-20T00-00-00-000Z-manual.db
```

The restore command verifies the backup with `PRAGMA quick_check`, writes a
pre-restore backup of the current database, replaces the database file, removes
stale WAL/SHM sidecar files, and verifies the restored database.

To restore into a non-default database:

```sh
STASH_DB_PATH=/tmp/stash-demo.db bun run db:restore -- /path/to/backup.db
```

## Migration safety

When stash opens an existing on-disk database through the normal server startup
path, it checks for pending migrations. If any migration is pending, stash writes
a pre-migration backup before applying the first migration.

Pre-migration backups use the same backup directory and are named like:

```text
stash-backup-2026-05-20T00-00-00-000Z-migration.db
```

In-memory test databases and brand-new database files are not backed up before
their initial schema creation.
