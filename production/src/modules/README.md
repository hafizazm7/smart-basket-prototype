# Production modules

The production app keeps the major Smart Basket responsibilities separate so they can evolve independently.

- `pricing/` — Step 7 price engine: unit-price normalization, promotion maths, freshness labels, and freshest-reliable price selection.
- `retailers/` — Step 7 retailer adapter contract, official source registry, and normalized retailer price records. Individual live collectors are wired retailer-by-retailer during Step 7.
- `matching/` — canonical product and equivalent-product matching. Added during product-matching build (Step 8).
- `optimizer/` — basket recommendation logic. Added during basket-optimizer build (Step 9).
- `photo/` — replaceable shelf-photo extraction provider. The UI must not depend directly on a particular OCR/vision vendor.
- `shopping/` — Shopping Mode orchestration. Added during Shopping Mode build.

Step 7 must not perform product matching or basket optimization. It is responsible only for collecting, normalizing, storing, selecting, and exposing trustworthy price and promotion observations.
