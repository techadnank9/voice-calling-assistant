-- Add test_schedule_config JSONB column to restaurant_settings
-- Safe to run multiple times (IF NOT EXISTS guard)
ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS test_schedule_config JSONB DEFAULT '{}'::jsonb;
