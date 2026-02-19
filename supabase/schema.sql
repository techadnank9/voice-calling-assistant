create extension if not exists pgcrypto;

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  twilio_call_sid text unique not null,
  from_number text,
  to_number text,
  status text not null default 'ringing',
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec int,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists call_messages (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls(id) on delete cascade,
  role text not null,
  text text not null,
  confidence numeric,
  created_at timestamptz not null default now()
);

create table if not exists call_events (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references menu_categories(id) on delete set null,
  name text not null,
  description text,
  price_cents int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists menu_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  price_delta_cents int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  caller_phone text,
  customer_name text not null,
  pickup_time text not null,
  status text not null default 'new',
  notes text,
  total_cents int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  qty int not null,
  modifier_json jsonb not null default '[]'::jsonb,
  line_total_cents int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  caller_phone text,
  guest_name text not null,
  party_size int not null,
  reservation_time text not null,
  status text not null default 'confirmed',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists restaurant_settings (
  id uuid primary key default gen_random_uuid(),
  timezone text not null default 'America/New_York',
  open_hours_json jsonb not null default '{}'::jsonb,
  slot_minutes int not null default 30,
  max_party_size int not null default 8,
  max_covers_per_slot int not null default 20,
  escalation_phone text,
  created_at timestamptz not null default now()
);

alter publication supabase_realtime add table calls;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table reservations;
