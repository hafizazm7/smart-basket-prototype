-- Step 7: price-engine support.
-- Price observations remain immutable history; this migration adds promotion structure,
-- read models for current values, and indexes used by price lookups.

alter table public.price_observations
  add constraint price_observations_unit_price_positive
  check (unit_price is null or unit_price > 0) not valid;

alter table public.promotions
  add column if not exists discount_percent numeric(5,2),
  add column if not exists source_url text,
  add column if not exists currency text not null default 'EUR',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.promotions
  add constraint promotions_discount_percent_range
  check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)) not valid;

alter table public.promotions
  add constraint promotions_min_quantity_positive
  check (min_quantity is null or min_quantity > 0) not valid;

alter table public.promotions
  add constraint promotions_pay_quantity_nonnegative
  check (pay_quantity is null or pay_quantity >= 0) not valid;

alter table public.promotions
  add constraint promotions_promo_price_positive
  check (promo_price is null or promo_price > 0) not valid;

create index if not exists stores_retailer_id_idx
  on public.stores(retailer_id);

create index if not exists retailer_products_retailer_id_idx
  on public.retailer_products(retailer_id);

create index if not exists retailer_products_product_id_idx
  on public.retailer_products(product_id);

create index if not exists price_observations_store_id_idx
  on public.price_observations(store_id);

create index if not exists promotions_retailer_product_observed_idx
  on public.promotions(retailer_product_id, observed_at desc);

create index if not exists promotions_store_id_idx
  on public.promotions(store_id);

create index if not exists product_matches_product_id_idx
  on public.product_matches(product_id);

create or replace view public.current_price_observations
with (security_invoker = true)
as
select
  id,
  retailer_product_id,
  store_id,
  price,
  currency,
  unit_price,
  unit_price_unit,
  source_type,
  source_url,
  observed_at,
  confirmed,
  created_at
from (
  select
    po.*,
    row_number() over (
      partition by po.retailer_product_id, po.store_id
      order by
        case
          when po.source_type = 'web' then 1
          when po.confirmed then 1
          else 2
        end,
        po.observed_at desc,
        po.created_at desc
    ) as price_rank
  from public.price_observations po
) ranked
where price_rank = 1;

create or replace view public.active_promotions
with (security_invoker = true)
as
select
  id,
  retailer_product_id,
  store_id,
  kind,
  label,
  min_quantity,
  pay_quantity,
  promo_price,
  discount_percent,
  currency,
  source_url,
  starts_at,
  ends_at,
  observed_at,
  metadata,
  created_at
from (
  select
    p.*,
    row_number() over (
      partition by p.retailer_product_id, p.store_id
      order by p.observed_at desc, p.created_at desc
    ) as promo_rank
  from public.promotions p
  where (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at >= now())
) ranked
where promo_rank = 1;

grant select on public.current_price_observations to anon, authenticated;
grant select on public.active_promotions to anon, authenticated;
