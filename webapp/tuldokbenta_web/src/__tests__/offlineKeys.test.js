/**
 * Feature: the offline page's namespaced storage keys
 * Subject: utils/storage.js
 *
 * P3 and the structural property SP1 from
 * docs/specs/multipos/11-offline-multi-shop/design.md.
 *
 * SP1 is the one that earns its keep over time. This file exists because the
 * queue key was once spelled "offline_sales" in four places and "offlineSales"
 * in a fifth, so an edit wrote to an orphan key and vanished on reload. Now that
 * the key is *computed*, the same mistake is easier to make and no louder when
 * made — a hand-built `offline_sales:${id}` somewhere would work in every test
 * anyone would think to write, and break the day the format changes.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import {
  LEGACY_OFFLINE_CATALOG_KEY,
  LEGACY_OFFLINE_NEXT_INVOICE_KEY,
  LEGACY_OFFLINE_SALES_KEY,
  offlineCatalogKey,
  offlineNextInvoiceKey,
  offlineSalesKey,
} from "../utils/storage";

const BUILDERS = [
  ["offlineSalesKey", offlineSalesKey],
  ["offlineCatalogKey", offlineCatalogKey],
  ["offlineNextInvoiceKey", offlineNextInvoiceKey],
];

const LEGACY_NAMES = [
  LEGACY_OFFLINE_SALES_KEY,
  LEGACY_OFFLINE_CATALOG_KEY,
  LEGACY_OFFLINE_NEXT_INVOICE_KEY,
];

const shopId = () => fc.integer({ min: 1, max: 10_000 });

describe("P3 — keys are shop-distinct", () => {
  it("produces a different key for every distinct shop id", () => {
    fc.assert(
      fc.property(shopId(), shopId(), (a, b) => {
        fc.pre(a !== b);
        for (const [name, build] of BUILDERS) {
          expect(build(a), name).not.toBe(build(b));
        }
      })
    );
  });

  it("never produces one resource's key from another's builder", () => {
    // The three live in the same namespace and would be trivial to collide by
    // reusing a base name. A queue read out of the catalog's key is a queue that
    // reads as empty.
    fc.assert(
      fc.property(shopId(), (id) => {
        const keys = BUILDERS.map(([, build]) => build(id));
        expect(new Set(keys).size).toBe(keys.length);
      })
    );
  });

  it("never produces a bare legacy name", () => {
    // A builder returning "offline_sales" would silently un-namespace the queue
    // and put every shop back in one bucket.
    fc.assert(
      fc.property(shopId(), (id) => {
        for (const [name, build] of BUILDERS) {
          expect(LEGACY_NAMES, name).not.toContain(build(id));
        }
      })
    );
  });
});

/**
 * Source with comments removed.
 *
 * The property is about *building* a key, not about naming one. Several comments
 * quote these strings deliberately — queryClient.js explains why the queue must
 * never be swept away with the cache, and OpenSalesOffline.jsx records the
 * orphan-key bug that put the names in one file to begin with. Matching those
 * would push the explanations out of the code to satisfy a test, which is the
 * wrong trade.
 */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every .js/.jsx file under src, as repo-relative paths. */
const sourceFiles = (dir, found = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.jsx?$/.test(entry)) found.push(full);
  }
  return found;
};

describe("SP1 — no offline key is built outside storage.js", () => {
  it("names the three offline keys only where they are declared and migrated", () => {
    // Relative to this file rather than to the working directory, so the sweep
    // covers `src` whichever directory vitest was started from.
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    // The migration is allowed to name them because moving them is its whole
    // job; storage.js because it is where they are declared. The tests name them
    // by importing the builders, which is the point.
    const allowed = [
      join("utils", "storage.js"),
      join("utils", "offlineMigration.js"),
      "__tests__",
    ];

    const offenders = sourceFiles(src).filter((file) => {
      const rel = relative(src, file);
      if (allowed.some((ok) => rel.startsWith(ok))) return false;
      const code = withoutComments(readFileSync(file, "utf8"));
      return LEGACY_NAMES.some((key) => code.includes(key));
    });

    expect(offenders.map((f) => relative(src, f))).toEqual([]);
  });
});
