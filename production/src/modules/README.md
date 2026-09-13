# Production modules

The production app keeps the major Smart Basket responsibilities separate so they can evolve independently.

- `retailers/` — one adapter per retailer. Added during the price-engine build.
- `matching/` — canonical product and equivalent-product matching. Added during product-matching build.
- `optimizer/` — basket recommendation logic. Added during basket-optimizer build.
- `photo/` — replaceable shelf-photo extraction provider. The UI must not depend directly on a particular OCR/vision vendor.
- `shopping/` — Shopping Mode orchestration. Added during Shopping Mode build.

Step 5 creates only the project foundation. Feature implementations are intentionally deferred to their numbered checklist steps.
