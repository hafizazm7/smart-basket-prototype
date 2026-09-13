# Smart Basket — production app

This folder is the production application foundation. The frozen HTML prototype remains at the repository root for reference and GitHub Pages validation.

## Stack

- Next.js + TypeScript
- Mobile-first PWA
- Vercel hosting
- Supabase/PostgreSQL for shared product, retailer, price and promotion data
- Personal shopping-list/history data stays local for the MVP

## Local setup

1. Use Node 22.
2. Copy `.env.example` to `.env.local`.
3. Add Supabase values when the Supabase project is created.
4. Run `npm install`.
5. Run `npm run dev`.

## Boundaries

This is Step 5 only: project structure, database foundation, environment template and CI. The shopping-list feature is intentionally not implemented here yet.

Major modules are kept separate so retailer collectors, product matching, basket optimization and shelf-photo recognition can be replaced without rebuilding the whole app.
