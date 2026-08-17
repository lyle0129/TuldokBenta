// components/open-sales/CatalogGrid.jsx
import { useMemo, useState } from "react";
import SearchInput from "../shared/SearchInput";
import { formatCurrency } from "../../utils/format";

/**
 * Searchable inventory + services picker, shared by the online and offline
 * sale pages.
 *
 * Replaces the two side-by-side desktop columns those pages used to render.
 * On a phone the columns stacked, so services sat a full screen below
 * inventory and the only way to find anything was to scroll.
 */

const TABS = [
  { id: "all", label: "All" },
  { id: "items", label: "Items" },
  { id: "services", label: "Services" },
];

const CatalogGrid = ({ inventory = [], services = [], onAddItem, onAddService }) => {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");

  const term = query.trim().toLowerCase();

  const shownItems = useMemo(() => {
    if (tab === "services") return [];
    if (!term) return inventory;
    return inventory.filter(
      (i) =>
        i.item_name?.toLowerCase().includes(term) ||
        i.item_classification?.toLowerCase().includes(term)
    );
  }, [inventory, tab, term]);

  const shownServices = useMemo(() => {
    if (tab === "items") return [];
    if (!term) return services;
    return services.filter(
      (s) =>
        s.service_name?.toLowerCase().includes(term) ||
        (s.freebies || []).some((f) => f.toLowerCase().includes(term))
    );
  }, [services, tab, term]);

  const isEmpty = shownItems.length === 0 && shownServices.length === 0;

  return (
    <section>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search items and services…"
          ariaLabel="Search catalog"
          className="flex-1"
        />

        <div
          role="tablist"
          aria-label="Filter catalog"
          className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600 flex-shrink-0"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 sm:flex-none px-4 min-h-11 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <p className="py-10 text-center text-sm italic text-gray-500 dark:text-gray-400">
          {term ? `Nothing matches “${query}”.` : "Nothing in the catalog yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {shownServices.map((service) => (
            <button
              key={`service-${service.id}`}
              type="button"
              onClick={() => onAddService(service)}
              className="text-left flex flex-col rounded-xl border border-purple-200 dark:border-purple-900 bg-white dark:bg-gray-800 p-3 shadow-sm hover:shadow-md hover:border-purple-500 active:scale-95 transition"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
                Service
              </span>
              <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 mt-0.5">
                {service.service_name}
              </span>
              <span className="mt-auto pt-2 font-bold text-gray-800 dark:text-gray-100">
                {formatCurrency(service.price)}
              </span>
              {service.freebies?.length > 0 && (
                <span className="text-[11px] text-green-600 dark:text-green-400 mt-0.5">
                  Free: {service.freebies.join(", ")}
                </span>
              )}
            </button>
          ))}

          {shownItems.map((item) => {
            const outOfStock = Number(item.stock) === 0;
            return (
              <button
                key={`item-${item.id}`}
                type="button"
                onClick={() => onAddItem(item)}
                className={`text-left flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm hover:shadow-md hover:border-blue-500 active:scale-95 transition ${
                  outOfStock ? "opacity-60" : ""
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  {item.item_classification}
                </span>
                <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 mt-0.5">
                  {item.item_name}
                </span>
                <span className="mt-auto pt-2 font-bold text-gray-800 dark:text-gray-100">
                  {formatCurrency(item.price)}
                </span>
                <span
                  className={`text-[11px] mt-0.5 ${
                    outOfStock
                      ? "text-red-600 dark:text-red-400 font-semibold"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {outOfStock ? "Out of stock" : `Stock: ${item.stock}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default CatalogGrid;
