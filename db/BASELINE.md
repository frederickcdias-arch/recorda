# Database Migrations Baseline

## Current State
- **50 migrations** (001 through 050)
- Applied sequentially via `packages/backend/src/infrastructure/database/migrate.ts`
- Tracked in `schema_migrations` table
- Migration system supports **baseline files** in `db/baseline/`

## How to Consolidate

Run the consolidation script against a **running database** with all migrations applied:

```bash
node db/scripts/consolidate.mjs
```

This will:
1. `pg_dump` the schema → `db/baseline/000_baseline_schema.sql`
2. `pg_dump` seed data (checklist_modelos, classificacoes, schema_migrations) → `db/baseline/000_baseline_data.sql`
3. Archive all 50 migrations to `db/migrations/archive/`

### Prerequisites
- PostgreSQL running with all migrations applied
- `pg_dump` available in PATH
- Environment variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

## How the Baseline Works

The migration system in `migrate.ts` automatically detects baselines:
1. If `schema_migrations` is empty **and** `db/baseline/*.sql` files exist → apply baseline first
2. Then apply any incremental migrations from `db/migrations/` (051+)
3. Existing databases with migrations already applied are unaffected

## Rules for New Migrations

1. New migrations go in `db/migrations/` with sequential numbering (e.g., `051_*.sql`)
2. Each migration must be **idempotent** (use `IF NOT EXISTS`, `IF EXISTS`, etc.)
3. Never modify an already-applied migration file
4. Use `ALTER TABLE` for schema changes, never `DROP TABLE` + `CREATE TABLE`
5. Include a comment header with description and date

## Re-consolidation

When the migration count grows again (100+), re-run `consolidate.mjs` to generate a fresh baseline.
