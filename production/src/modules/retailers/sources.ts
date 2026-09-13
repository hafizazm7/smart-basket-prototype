import type { RetailerKey } from "./types";

export type RetailerSourceDefinition = {
  key: RetailerKey;
  name: string;
  officialBaseUrl: string;
};

export const RETAILER_SOURCES: Record<RetailerKey, RetailerSourceDefinition> = {
  ah: {
    key: "ah",
    name: "Albert Heijn",
    officialBaseUrl: "https://www.ah.nl",
  },
  aldi: {
    key: "aldi",
    name: "ALDI",
    officialBaseUrl: "https://www.aldi.nl",
  },
  action: {
    key: "action",
    name: "Action",
    officialBaseUrl: "https://www.action.com/nl-nl",
  },
  etos: {
    key: "etos",
    name: "Etos",
    officialBaseUrl: "https://www.etos.nl",
  },
  kruidvat: {
    key: "kruidvat",
    name: "Kruidvat",
    officialBaseUrl: "https://www.kruidvat.nl",
  },
};

export const RETAILER_KEYS = Object.keys(RETAILER_SOURCES) as RetailerKey[];
