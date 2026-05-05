-- Add Clover POS tracking columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS clover_order_id TEXT,
  ADD COLUMN IF NOT EXISTS clover_status TEXT,   -- 'sent' | 'failed' | null (null = not attempted yet)
  ADD COLUMN IF NOT EXISTS clover_error TEXT;
