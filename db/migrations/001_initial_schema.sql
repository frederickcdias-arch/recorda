-- Migration: 001_initial_schema
-- Description: Initial database schema setup
-- Created: 2024-01-01

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version)
SELECT '001_initial_schema'
WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '001_initial_schema'
);
