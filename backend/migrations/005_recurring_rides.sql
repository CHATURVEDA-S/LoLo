-- Migration 005: Add is_daily and recurring_days to rides table
ALTER TABLE rides ADD COLUMN IF NOT EXISTS is_daily BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS recurring_days TEXT NOT NULL DEFAULT '';
