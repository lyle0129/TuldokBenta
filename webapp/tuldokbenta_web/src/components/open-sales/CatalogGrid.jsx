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
 *
 * The third pass dropped the "All" tab. It showed everything, which is the flat
 * grid the chips exist to break up, and a three-button bar is a lot of width to
 * spend on a phone. What is left is a binary: services or items.
 */

const TABS = [
  { id: "services", label: "Services" },
  { id: "items", label: "Items" },
];

const ALL_SUB = "__all__";

const CatalogGrid = ({ inventory = [], services = [], onAddItem, onAddService }) => {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("services");
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

  // Both sides are matched regardless of which one is showing, so the slider
  // can be pointed at whichever actually has results.
  const matchedItems = useMemo(() => {
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
  }, [inventory, term, activeSub]);

  const matchedServices = useMemo(() => {
    if (!term) return services;
    return services.filter(
      (s) =>
        s.service_name?.toLowerCase().includes(term) ||
        (s.freebies || []).some((f) => f.toLowerCase().includes(term))
    );
  }, [services, term]);

  // Search reaches across the slider. Without an "All" tab, a term that only
  // matches the other side would render an empty grid with the answer one tap
  // away and nothing saying so — so the slider goes to the side that has the
  // results. The thumb moving is what explains where they came from, the same
  // way the chips explain themselves.
  const effectiveTab = useMemo(() => {
    if (!term) return tab;
    if (tab === "services" && matchedServices.length === 0 && matchedItems.length > 0)
      return "items";
    if (tab === "items" && matchedItems.length === 0 && matchedServices.length > 0)
      return "services";
    return tab;
  }, [tab, term, matchedItems, matchedServices]);

  const shownItems = effectiveTab === "items" ? matchedItems : [];
  const shownServices = effectiveTab === "services" ? matchedServices : [];

  // Only one group is worth chips; a lone chip filters nothing.
  const showSubcategories = effectiveTab === "items" && subcategories.length > 1;

  const selectTab = (id) => {
    setTab(id);
    setSubcategory(ALL_SUB);
    // Clearing the search is what stops the flip above from fighting the tap:
    // otherwise tapping the side a live query has no matches on would bounce
    // straight back and read as a dead button. Choosing a side means "browse
    // this side", so the term that was steering the view is done.
    setQuery("");
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

        {/* Two positions, so it's a slider rather than a row of buttons: the
            thumb is the only thing that moves, and where it sits is the whole
            state. The track's p-1 makes calc(50% - 0.25rem) exactly half the
            inner width, which is also how far translate-x-full moves it. */}
        <div
          role="tablist"
          aria-label="Filter catalog"
          className="relative flex w-full sm:w-56 flex-shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 p-1"
        >
          <span
            aria-hidden="true"
            className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-blue-600 shadow transition-transform duration-200 motion-reduce:transition-none ${
              effectiveTab === "items" ? "translate-x-full" : "translate-x-0"
            }`}
          />
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={effectiveTab === t.id}
              onClick={() => selectTab(t.id)}
              className={`relative z-10 flex-1 min-h-11 rounded-full text-sm font-medium transition-colors ${
                effectiveTab === t.id
                  ? "text-white"
                  : "text-gray-700 dark:text-gray-300"
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
            onClick={() => setSubcategory(ALL_SUB)}
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
              onClick={() => setSubcategory(name)}
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