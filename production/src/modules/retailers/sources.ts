import type { RetailerKey } from "./types";

export type RetailerSourceDefinition = {
  key: RetailerKey;
  name: string;
  officialBaseUrl: string;
  searchUrl: (query: string) => string;
};

function q(value: string): string {
  return encodeURIComponent(value.trim());
}

export const RETAILER_SOURCES: Record<RetailerKey, RetailerSourceDefinition> = {
  ah: {
    key: "ah",
    name: "Albert Heijn",
    officialBaseUrl: "https://www.ah.nl",
    searchUrl: (query) => `https://www.ah.nl/zoeken?query=${q(query)}`,
  },
  aldi: {
    key: "aldi",
    name: "ALDI",
    officialBaseUrl: "https://www.aldi.nl",
    searchUrl: (query) => `https://www.aldi.nl/zoeken.html?search=${q(query)}`,
  },
  action: {
    key: "action",
    name: "Action",
    officialBaseUrl: "https://www.action.com/nl-nl",
    searchUrl: (query) => `https://www.action.com/nl-nl/search/?q=${q(query)}`,
  },
  etos: {
    key: "etos",
    name: "Etos",
    officialBaseUrl: "https://www.etos.nl",
    searchUrl: (query) => `https://www.etos.nl/search?q=${q(query)}`,
  },
  kruidvat: {
    key: "kruidvat",
    name: "Kruidvat",
    officialBaseUrl: "https://www.kruidvat.nl",
    searchUrl: (query) => `https://www.kruidvat.nl/search?q=${q(query)}`,
  },
};

export const RETAILER_KEYS = Object.keys(RETAILER_SOURCES) as RetailerKey[];
