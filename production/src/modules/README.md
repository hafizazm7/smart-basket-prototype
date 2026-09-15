# Production modules

The production app keeps the major Smart Basket responsibilities separate so they can evolve independently.

- `pricing/` — Step 7 price engine: unit-price normalization, promotion maths, freshness labels, and freshest-reliable price selection.
- `retailers/` — Step 7 retailer adapter contract, official source registry, and normalized retailer price records. Individual live collectors are wired retailer-by-retailer during Step 7.
- `matching/` — canonical product matching plus local receipt-learning aliases. Receipt photos are read on-device and confirmed mappings are reused during Step 8 matching.
- `optimizer/` — Step 9 deterministic basket recommendation logic: quantity-aware totals, public promotions, store limits, missing-price handling, and single-store comparison.
- `photo/` — replaceable shelf-photo extraction provider. The UI must not depend directly on a particular OCR/vision vendor.
- `shopping/` — Shopping Mode orchestration. Added during Shopping Mode build.

Step 7 must not perform product matching or basket optimization. It is responsible only for collecting, normalizing, storing, selecting, and exposing trustworthy price and promotion observations.
