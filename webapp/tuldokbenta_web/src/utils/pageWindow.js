// utils/pageWindow.js

/**
 * The page numbers a pager should show, e.g. [1, "…", 4, 5, 6, "…", 20].
 *
 * The hand-rolled pagers this replaces rendered one button per page. That was
 * survivable while closed sales only ever showed today; now that any day is
 * reachable, the strip has to stay a fixed width.
 */
export const pageWindow = (currentPage, totalPages, edge = 1) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set([1, totalPages]);
  for (let p = currentPage - edge; p <= currentPage + edge; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const withGaps = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) withGaps.push("…");
    withGaps.push(p);
  });
  return withGaps;
};
