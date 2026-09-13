create extension if not exists pgcrypto;

create table if not exists public.retailers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid references public.retailers(id) on delete cascade,
  name text not null,
  branch_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  brand text,
  name text not null,
  description text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.retailer_products (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers(id) on delete cascade,
  external_id text,
  product_id uuid references public.products(id) on delete set null,
  raw_name text not null,
  brand text,
  description text,
  size_value numeric,
  size_unit text,
  product_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists retailer_products_external_unique
  on public.retailer_products(retailer_id, external_id)
  where external_id is not null;

create table if not exists public.price_observations (
  id uuid primary key default gen_random_uuid(),
  retailer_product_id uuid not null references public.retailer_products(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  price numeric(10,2) not null check (price > 0),
  currency text not null default 'EUR',
  unit_price numeric(12,4),
  unit_price_unit text,
  source_type text not null check (source_type in ('web','shelf_photo','manual')),
  source_url text,
  observed_at timestamptz not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists price_observations_lookup
  on public.price_observations(retailer_product_id, observed_at desc);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  retailer_product_id uuid not null references public.retailer_products(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  kind text not null,
  label text not null,
  min_quantity integer,
  pay_quantity integer,
  promo_price numeric(10,2),
  starts_at timestamptz,
  ends_at timestamptz,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.product_matches (
  id uuid primary key default gen_random_uuid(),
  retailer_product_id uuid not null unique references public.retailer_products(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  confidence numeric(5,4),
  status text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  method text not null default 'rules',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.retailers enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.retailer_products enable row level security;
alter table public.price_observations enable row level security;
alter table public.promotions enable row level security;
alter table public.product_matches enable row level security;

create policy "public read retailers" on public.retailers for select using (true);
create policy "public read stores" on public.stores for select using (true);
create policy "public read products" on public.products for select using (true);
create policy "public read retailer products" on public.retailer_products for select using (true);
create policy "public read price observations" on public.price_observations for select using (true);
create policy "public read promotions" on public.promotions for select using (true);
create policy "public read product matches" on public.product_matches for select using (true);

insert into public.retailers (key, name) values
  ('ah', 'Albert Heijn'),
  ('aldi', 'ALDI'),
  ('action', 'Action'),
  ('etos', 'Etos'),
  ('kruidvat', 'Kruidvat')
on conflict (key) do nothing;
