-- Step 7: do not silently apply loyalty or personalized promotions in MVP totals.

alter table public.promotions
  add column if not exists eligibility text not null default 'public';

alter table public.promotions
  add constraint promotions_eligibility_valid
  check (eligibility in ('public', 'loyalty', 'personalized', 'unknown')) not valid;

drop view if exists public.active_promotions;

create view public.active_promotions
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
  created_at,
  eligibility
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

grant select on public.active_promotions to anon, authenticated;
