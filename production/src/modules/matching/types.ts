import type { NormalizedRetailerPrice } from "@/modules/retailers/normalize-record";
import type { RetailerKey } from "@/modules/retailers/types";

export type RequestedPackage = {
  value: number;
  unit: string;
};

export type MatchRequest = {
  query: string;
  brand?: string | null;
  alternativesAllowed?: boolean;
  requestedPackage?: RequestedPackage | null;
};

export type RetrievedCandidate = {
  retailer: RetailerKey;
  record: NormalizedRetailerPrice;
  sourceRank: number;
};

export type MatchReason =
  | "brand_exact"
  | "brand_alternative"
  | "brand_mismatch"
  | "text_strong"
  | "text_partial"
  | "product_form_conflict"
  | "variant_conflict"
  | "variant_unspecified"
  | "retailer_identity_conflict"
  | "retailer_category_conflict"
  | "retrieval_relevant"
  | "size_exact"
  | "size_similar"
  | "size_different"
  | "size_unknown"
  | "unit_incompatible";

export type RankedMatch = RetrievedCandidate & {
  confidence: number;
  accepted: boolean;
  requiresConfirmation: boolean;
  requestedBrand: string | null;
  alternativesAllowed: boolean;
  reasons: MatchReason[];
};
