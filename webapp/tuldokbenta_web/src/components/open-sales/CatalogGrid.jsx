// components/open-sales/CatalogGrid.jsx
import { useMemo, useState } from "react";
import SearchInput from "../shared/SearchInput";
import { formatCurrency } from "../../utils/format";
import {
  subcategoriesOf,
  subcategoryLabel,
  matchesSubcategory,
} from "../../utils/subcategory";

/**
 * Searchable inventory + services picker, shared by the online and offline
 * sale pages.
 *
 * Replaces the two side-by-side desktop columns those pages used to render.
 * On a phone the columns stacked, so services sat a full screen below
 * inventory and the only way to find anything was to scroll.
 *
 * The subcategory chips are the second pass at the same problem: 7 services
 * and 14 items in one flat grid is a lot of tiles to read past, and the groups
 * were already sitting in the data unused.
 */

const TABS = [
  { id: "all", label: "All" },
  { id: "items", label: "Items" },
  { id: "services", label: "Services" },
];

const ALL_SUB = "__all__";

const CatalogGrid = ({ inventory = [], services = [], onAddItem, onAddService }) => {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [subcategory, setSubcategory] = useState(ALL_SUB);

  const term = query.trim().toLowerCase();

  const subcategories = useMemo(() => subcategoriesOf(inventory), [inventory]);

  // An item edit can retire the selected subcategory out from under us, which
  // would otherwise leave the grid permanently empty with no chip highlighted.
  const activeSub = subcategories.some(
    (s) => s.toLowerCase() === subcategory.toLowerCase()
  )
    ? subcategory
    : ALL_SUB;

  // Only one group is worth chips; a lone chip filters nothing.
  const showSubcategories = tab !== "services" && subcategories.length > 1;

  const shownItems = useMemo(() => {
    if (tab === "services") return [];

    const inGroup =
      activeSub === ALL_SUB
        ? inventory
        : inventory.filter((i) => matchesSubcategory(i, activeSub));

    if (!term) return inGroup;
    return inGroup.filter(
      (i) =>
        i.item_name?.toLowerCase().includes(term) ||
        i.item_classification?.toLowerCase().includes(term)
    );
  }, [inventory, tab, term, activeSub]);

  const shownServices = useMemo(() => {
    if (tab === "items") return [];
    if (!term) return services;
    return services.filter(
      (s) =>
        s.service_name?.toLowerCase().includes(term) ||
        (s.freebies || []).some((f) => f.toLowerCase().includes(term))
    );
  }, [services, tab, term]);

  const selectTab = (id) => {
    setTab(id);
    setSubcategory(ALL_SUB);
  };

  const selectSubcategory = (value) => {
    setSubcategory(value);
    // Picking a subcategory means you are browsing items, so move off "All"
    // rather than leaving every service sitting above the filtered group. The
    // Items tab lighting up is also what explains where the services went.
    if (value !== ALL_SUB && tab === "all") setTab("items");
  };

  const isEmpty = shownItems.length === 0 && shownServices.length === 0;

  const chipClass = (active) =>
    `px-4 min-h-11 rounded-full border text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
      active
        ? "bg-blue-600 border-blue-600 text-white"
        : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

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
              onClick={() => selectTab(t.id)}
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

      {showSubcategories && (
        <div
          role="tablist"
          aria-label="Filter items by subcategory"
          className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 mb-4"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSub === ALL_SUB}
            onClick={() => selectSubcategory(ALL_SUB)}
            className={chipClass(activeSub === ALL_SUB)}
          >
            All Items
          </button>
          {subcategories.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={activeSub === name}
              onClick={() => selectSubcategory(name)}
              className={chipClass(activeSub === name)}
            >
              {subcategoryLabel(name)}
            </button>
          ))}
        </div>
      )}

      {isEmpty ? (
        <p className="py-10 text-center text-sm italic text-gray-500 dark:text-gray-400">
          {term
            ? `Nothing matches “${query}”${
                activeSub === ALL_SUB ? "" : ` in ${subcategoryLabel(activeSub)}`
              }.`
            : "Nothing in the catalog yet."}
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
              {/* No "Service" eyebrow: everything in this group is one, and the
                  purple border already says so. The name is the heading. */}
              <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">
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