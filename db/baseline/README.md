# Database Baseline

This directory contains the consolidated database schema baseline.

## Files

- `000_baseline_schema.sql` — Full schema dump (tables, types, functions, triggers, indexes)
- `000_baseline_data.sql` — Seed data (checklist models, classificações, etc.)

## How to Generate

Run the consolidation script against a **fresh database** with all migrations applied:

```bash
cd db
node scripts/consolidate.mjs
```

This will:

1. Connect to the database and dump the current schema
2. Generate `baseline/000_baseline_schema.sql` and `baseline/000_baseline_data.sql`
3. Move old migrations to `migrations/archive/`

## How to Use

After consolidation, the migration system automatically detects the baseline:

- If `schema_migrations` is empty, it applies the baseline first
- Then applies any new migrations (051+) on top
