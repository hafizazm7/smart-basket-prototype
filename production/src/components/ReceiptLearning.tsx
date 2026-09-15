"use client";

import Script from "next/script";
import { useMemo, useState } from "react";
import {
  extractReceiptProducts,
  suggestReceiptLinks,
  type ReceiptListItem,
} from "@/modules/matching/receipt-learning";
import { saveReceiptMappings } from "@/modules/matching/receipt-memory";

type TesseractProgress = {
  status?: string;
  progress?: number;
};

type TesseractResult = {
  data?: { text?: string };
};

declare global {
  interface Window {
    Tesseract?: {
      recognize: (
        image: File,
        languages: string,
        options?: { logger?: (message: TesseractProgress) => void },
      ) => Promise<TesseractResult>;
    };
  }
}

export default function ReceiptLearning({
  items,
  onLearned,
}: {
  items: ReceiptListItem[];
  onLearned?: (count: number) => void;
}) {
  const [readerReady, setReaderReady] = useState(false);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [receiptProducts, setReceiptProducts] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCount = useMemo(
    () => Object.values(selections).filter(Boolean).length,
    [selections],
  );

  async function readReceipt(file: File) {
    if (!window.Tesseract) {
      setMessage("The receipt reader is still loading. Please try again in a moment.");
      return;
    }

    setReading(true);
    setProgress(0);
    setMessage("Reading your receipt on this device…");

    try {
      const result = await window.Tesseract.recognize(file, "nld+eng", {
        logger: (update) => {
          if (update.status === "recognizing text" && Number.isFinite(update.progress)) {
            setProgress(Math.round((update.progress ?? 0) * 100));
          }
        },
      });
      const products = extractReceiptProducts(result.data?.text ?? "");
      const suggestions = suggestReceiptLinks(items, products);
      const suggestedSelections = Object.fromEntries(
        suggestions
          .filter((suggestion) => suggestion.automatic && suggestion.receiptLabel)
          .map((suggestion) => [suggestion.itemId, suggestion.receiptLabel as string]),
      );

      setReceiptProducts(products);
      setSelections(suggestedSelections);
      setMessage(products.length
        ? `${Object.keys(suggestedSelections).length}/${items.length} items linked automatically. Check only the missing ones.`
        : "No product lines were found. Try a clearer, straighter photo of the full receipt.");
    } catch {
      setReceiptProducts([]);
      setSelections({});
      setMessage("The receipt could not be read. Try a clearer photo with the full receipt visible.");
    } finally {
      setReading(false);
    }
  }

  function saveLearning() {
    const mappings = items.flatMap((item) => {
      const receiptLabel = selections[item.id]?.trim();
      return receiptLabel ? [{ query: item.text, receiptLabel }] : [];
    });
    const saved = saveReceiptMappings(mappings);
    setMessage(saved
      ? `${saved} product match${saved === 1 ? "" : "es"} learned for future lists.`
      : "Select at least one receipt product to learn.");
    if (saved) onLearned?.(saved);
  }

  return (
    <section className="soft-card receipt-card" aria-label="Learn product matches from a receipt">
      <Script
        id="tesseract-receipt-reader"
        src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
        strategy="lazyOnload"
        onLoad={() => setReaderReady(true)}
        onError={() => setMessage("The receipt reader could not be loaded. Please try again later.")}
      />

      <div className="row space">
        <div>
          <div className="photo-title">Teach Smart Basket from a receipt</div>
          <div className="helper">Photograph your receipt once. Confirm only uncertain links; they will be reused next time.</div>
        </div>
        <button
          className="secondary photo-action"
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label="Scan a receipt"
        >🧾</button>
      </div>

      {expanded && (
        <div className="stack receipt-workspace">
          <label className={`secondary full receipt-upload${!readerReady || reading || !items.length ? " disabled" : ""}`}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={!readerReady || reading || !items.length}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readReceipt(file);
                event.target.value = "";
              }}
            />
            {reading
              ? `Reading receipt${progress ? ` · ${progress}%` : "…"}`
              : !items.length
                ? "Keep your shopping list to teach matches"
                : readerReady
                  ? "Take or choose receipt photo"
                  : "Preparing receipt reader…"}
          </label>

          <div className="helper">Your photo stays on this device and is not uploaded.</div>

          {receiptProducts.length > 0 && (
            <div className="receipt-links">
              {items.map((item) => (
                <label className="receipt-link" key={item.id}>
                  <span>
                    <strong>{item.text}</strong>
                    <span className="helper">{selections[item.id] ? "Linked" : "Quick check"}</span>
                  </span>
                  <select
                    className="text-input"
                    value={selections[item.id] ?? ""}
                    onChange={(event) => setSelections((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))}
                  >
                    <option value="">Choose receipt product…</option>
                    {receiptProducts.map((product) => (
                      <option value={product} key={product}>{product}</option>
                    ))}
                  </select>
                </label>
              ))}

              <button className="primary" type="button" disabled={!selectedCount} onClick={saveLearning}>
                Save {selectedCount || ""} learned match{selectedCount === 1 ? "" : "es"}
              </button>
            </div>
          )}

          {message && <div className="receipt-message" aria-live="polite">{message}</div>}
        </div>
      )}
    </section>
  );
}
