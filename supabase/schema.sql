-- ============================================================================
-- Sleepy Owl RTD Dashboard — Supabase schema
-- Run this ONCE in the Supabase SQL Editor (see README for click-by-click).
-- Safe to re-run: it uses IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

-- Product master: the 12 tracked SKUs (canonical -C24 / -C12 codes).
create table if not exists sku_master (
  sku            text primary key,
  root           text not null,
  name           text not null,
  category       text not null,
  units_per_case int  not null
);

-- One row per batch x location (JWL racks, Low Shelf Life, and Vendor/Lotus).
create table if not exists inventory_batches (
  id                    bigserial primary key,
  sku                   text not null,
  root_code             text not null,
  name                  text not null,
  category              text not null,
  location_type         text not null,   -- 'JWL' | 'VENDOR'
  source                text not null,   -- 'JWL_RACKS' | 'LOW_SHELF_LIFE' | 'VENDOR_LOTUS'
  location              text,
  batch_no              text,
  mfd                   date,
  exp                   date,
  total_shelf_life_days int,
  cases                 numeric not null default 0
);
create index if not exists idx_batches_sku on inventory_batches (sku);
create index if not exists idx_batches_loc on inventory_batches (location_type);

-- Month-to-date sales per SKU (current-month snapshot, in cases).
create table if not exists sales_mtd (
  sku   text primary key,
  cases numeric not null default 0
);

-- Current-month demand plan per SKU (in cases).
create table if not exists demand_plan (
  sku       text primary key,
  root_code text not null,
  category  text not null,
  cases     numeric not null default 0
);

-- A record of every data refresh, with any data-quality issues found.
create table if not exists sync_log (
  id         bigserial primary key,
  ran_at     timestamptz not null default now(),
  status     text not null,
  batch_rows int,
  issues     jsonb,
  note       text
);

-- Security: only the server (service-role key) touches these tables, so we
-- enable Row Level Security with no policies. That blocks the public anon key
-- while the service-role key (used only on the server) bypasses RLS.
alter table sku_master        enable row level security;
alter table inventory_batches enable row level security;
alter table sales_mtd         enable row level security;
alter table demand_plan       enable row level security;
alter table sync_log          enable row level security;
