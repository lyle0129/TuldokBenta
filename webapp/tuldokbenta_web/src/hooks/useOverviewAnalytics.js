import { useMemo } from "react";

/**
 * Custom hook that encapsulates all analytics computations for OverviewSummary.
 *
 * @param {Object} params
 * @param {Array}  params.openSales        - Currently visible open sales (may be pre-filtered by parent)
 * @param {Array}  params.closedSales      - Currently visible closed sales (may be pre-filtered by parent)
 * @param {Object|null} params.filters     - Active filter object (contains dateRange.from / dateRange.to)
 * @param {Array|null}  params.allOpenSales   - Unfiltered open sales (used for accurate date filtering)
 * @param {Array|null}  params.allClosedSales - Unfiltered closed sales (used for accurate date filtering)
 * @param {string} params.timePeriod       - Granularity: 'daily' | 'weekly' | 'monthly' | 'yearly'
 *
 * @returns {{
 *   dateFilteredOpenSales: Array,
 *   dateFilteredClosedSales: Array,
 *   previousDaysPaidInRange: Array,
 *   samePeriodCreatedAndPaid: Array,
 *   analytics: Object
 * }}
 */
export function useOverviewAnalytics({
  openSales,
  closedSales,
  filters = null,
  allOpenSales = null,
  allClosedSales = null,
  timePeriod,
}) {
  // ---------------------------------------------------------------------------
  // Helper: apply date-range filters to a sales array
  // ---------------------------------------------------------------------------
  const applyDateFilters = (sales) => {
    if (!filters || (!filters.dateRange.from && !filters.dateRange.to)) {
      return sales;
    }

    const startDate = filters.dateRange.from ? new Date(filters.dateRange.from) : null;
    const endDate = filters.dateRange.to ? new Date(filters.dateRange.to) : null;

    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    return sales.filter((sale) => {
      const createdDate = new Date(sale.created_at);
      const paidDate = sale.paid_at ? new Date(sale.paid_at) : null;

      // PRIORITY 1: Include ALL sales paid within the date range
      if (paidDate) {
        const paidInRange =
          (!startDate || paidDate >= startDate) && (!endDate || paidDate <= endDate);
        if (paidInRange) return true;
      }

      const createdInRange =
        (!startDate || createdDate >= startDate) && (!endDate || createdDate <= endDate);

      // PRIORITY 2: Include unpaid sales created within the range
      if (!paidDate && createdInRange) return true;

      // PRIORITY 3: Include paid sales created in range (even if paid outside range)
      if (paidDate && createdInRange) return true;

      return false;
    });
  };

  // ---------------------------------------------------------------------------
  // Helper: format a period key for display
  // ---------------------------------------------------------------------------
  const formatPeriodLabel = (period, tp) => {
    switch (tp) {
      case "yearly":
        return period;
      case "monthly": {
        const [year, month] = period.split("-");
        return new Date(year, month - 1).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
        });
      }
      case "weekly":
        return new Date(period).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      case "daily":
      default:
        return new Date(period).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
    }
  };

  // ---------------------------------------------------------------------------
  // Helper: group sales by time period, computing chart-ready buckets
  // ---------------------------------------------------------------------------
  const groupSalesByPeriod = (sales, tp) => {
    const grouped = {};

    const getPeriodKey = (date, p) => {
      switch (p) {
        case "yearly":
          return date.getFullYear().toString();
        case "monthly":
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        case "weekly": {
          const startOfWeek = new Date(date);
          startOfWeek.setDate(date.getDate() - date.getDay());
          return startOfWeek.toISOString().split("T")[0];
        }
        case "daily":
        default:
          return date.toISOString().split("T")[0];
      }
    };

    sales.forEach((sale) => {
      const createdDate = new Date(sale.created_at);
      const createdKey = getPeriodKey(createdDate, tp);
      const saleTotal = sale.items.reduce(
        (sum, item) => sum + (Number(item.price) || 0) * (item.qty || 1),
        0
      );

      if (!grouped[createdKey]) {
        grouped[createdKey] = {
          open: [],
          closed: [],
          total: 0,
          revenue: 0,
          paymentsToday: [],
          // Keyed by the raw paid_using code. Was a fixed cash/gcash/other
          // triple, which could not describe a method added at runtime.
          byMethod: {},
        };
      }

      if (sale.paid_at) {
        const paidDate = new Date(sale.paid_at);
        const paidKey = getPeriodKey(paidDate, tp);

        if (!grouped[paidKey]) {
          grouped[paidKey] = {
            open: [],
            closed: [],
            total: 0,
            revenue: 0,
            paymentsToday: [],
            cashPayments: 0,
            gcashPayments: 0,
            otherPayments: 0,
          };
        }

        // Always attribute revenue to the period it was actually paid
        grouped[paidKey].paymentsToday.push(sale);
        grouped[paidKey].revenue += saleTotal;

        const paymentMethod = sale.paid_using || "";
        grouped[paidKey].byMethod[paymentMethod] =
          (grouped[paidKey].byMethod[paymentMethod] || 0) + saleTotal;

        if (createdKey === paidKey) {
          grouped[createdKey].closed.push(sale);
          grouped[createdKey].total += 1;
        } else {
          grouped[createdKey].open.push(sale);
          grouped[createdKey].total += 1;
          grouped[paidKey].closed.push(sale);
        }
      } else {
        grouped[createdKey].open.push(sale);
        grouped[createdKey].total += 1;
      }
    });

    return grouped;
  };

  // ---------------------------------------------------------------------------
  // Memoized computations
  // ---------------------------------------------------------------------------

  const dateFilteredOpenSales = useMemo(
    () => applyDateFilters(allOpenSales || openSales),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allOpenSales, openSales, filters]
  );

  const dateFilteredClosedSales = useMemo(
    () => applyDateFilters(allClosedSales || closedSales),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allClosedSales, closedSales, filters]
  );

  /** Sales created BEFORE the filter range but paid WITHIN it */
  const previousDaysPaidInRange = useMemo(() => {
    if (!filters || (!filters.dateRange.from && !filters.dateRange.to)) {
      return [];
    }

    const startDate = filters.dateRange.from ? new Date(filters.dateRange.from) : null;
    const endDate = filters.dateRange.to ? new Date(filters.dateRange.to) : null;

    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    const allSales = [...(allClosedSales || closedSales)];

    return allSales.filter((sale) => {
      if (!sale.paid_at) return false;

      const createdDate = new Date(sale.created_at);
      const paidDate = new Date(sale.paid_at);

      const paidInRange =
        (!startDate || paidDate >= startDate) && (!endDate || paidDate <= endDate);
      const createdOutsideRange =
        (startDate && createdDate < startDate) || (endDate && createdDate > endDate);

      return paidInRange && createdOutsideRange;
    });
  }, [allClosedSales, closedSales, filters]);

  /** Sales created AND paid within the selected filter range */
  const samePeriodCreatedAndPaid = useMemo(() => {
    if (!filters || (!filters.dateRange.from && !filters.dateRange.to)) {
      return [];
    }

    const startDate = filters.dateRange.from ? new Date(filters.dateRange.from) : null;
    const endDate = filters.dateRange.to ? new Date(filters.dateRange.to) : null;

    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    const allSales = [...(allClosedSales || closedSales)];

    return allSales.filter((sale) => {
      if (!sale.paid_at) return false;

      const createdDate = new Date(sale.created_at);
      const paidDate = new Date(sale.paid_at);

      const createdInRange =
        (!startDate || createdDate >= startDate) && (!endDate || createdDate <= endDate);
      const paidInRange =
        (!startDate || paidDate >= startDate) && (!endDate || paidDate <= endDate);

      return createdInRange && paidInRange;
    });
  }, [allClosedSales, closedSales, filters]);

  /** Comprehensive analytics object used throughout OverviewSummary */
  const analytics = useMemo(() => {
    const allSales = [...dateFilteredOpenSales, ...dateFilteredClosedSales];

    let itemCount = 0;
    let serviceCount = 0;
    let freebieCount = 0;
    let itemRevenue = 0;
    let serviceRevenue = 0;

    const serviceTypes = new Set();
    const itemTypes = new Set();
    const freebieTypes = new Set();
    const serviceBreakdown = {};
    const itemGroups = {};
    const paymentMethodBreakdown = {};
    const inventoryUsed = {};

    // Build chart data grouped by the current time period
    const groupedData = groupSalesByPeriod(allSales, timePeriod);
    const chartData = Object.entries(groupedData)
      .map(([period, data]) => ({
        period,
        openSales: data.open.length,
        closedSales: data.closed.length,
        totalSales: data.total,
        revenue: data.revenue,
        paymentsToday: data.paymentsToday.length,
        byMethod: data.byMethod,
        displayPeriod: formatPeriodLabel(period, timePeriod),
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    allSales.forEach((sale) => {
      // Payment method tracking (closed sales only)
      if (sale.paid_at && sale.paid_using) {
        const paymentMethod = sale.paid_using;
        const saleTotal = sale.items.reduce(
          (sum, item) => sum + (Number(item.price) || 0) * (item.qty || 1),
          0
        );

        if (!paymentMethodBreakdown[paymentMethod]) {
          paymentMethodBreakdown[paymentMethod] = { count: 0, total: 0 };
        }
        paymentMethodBreakdown[paymentMethod].count += 1;
        paymentMethodBreakdown[paymentMethod].total += saleTotal;
      }

      sale.items.forEach((item) => {
        const qty = item.qty || 1;
        const price = Number(item.price) || 0;
        const revenue = price * qty;

        if (item.type === "service") {
          serviceCount += qty;
          serviceRevenue += revenue;
          serviceTypes.add(item.service_name);

          const serviceName = item.service_name;
          if (!serviceBreakdown[serviceName]) {
            serviceBreakdown[serviceName] = { qty: 0, price, total: 0 };
          }
          serviceBreakdown[serviceName].qty += qty;
          serviceBreakdown[serviceName].total += revenue;
        } else if (item.type === "item") {
          if (price > 0) {
            itemCount += qty;
            itemRevenue += revenue;
            itemTypes.add(item.item_name);
          } else {
            freebieCount += qty;
            freebieTypes.add(item.item_name);
          }

          const itemName = item.item_name;
          const spaceIndex = itemName.indexOf(" ");
          const category = spaceIndex > 0 ? itemName.substring(0, spaceIndex) : itemName;

          if (!itemGroups[category]) {
            itemGroups[category] = { count: 0, revenue: 0, items: new Set() };
          }
          itemGroups[category].count += qty;
          itemGroups[category].revenue += revenue;
          itemGroups[category].items.add(itemName);

          if (!inventoryUsed[itemName]) {
            inventoryUsed[itemName] = {
              count: 0,
              revenue: 0,
              isPaidItem: false,
              isFreebie: false,
            };
          }
          inventoryUsed[itemName].count += qty;
          inventoryUsed[itemName].revenue += revenue;
          if (price > 0) {
            inventoryUsed[itemName].isPaidItem = true;
          } else {
            inventoryUsed[itemName].isFreebie = true;
          }
        }
      });
    });

    const openTotal = dateFilteredOpenSales.reduce(
      (sum, sale) =>
        sum + sale.items.reduce((a, i) => a + (Number(i.price) || 0) * (i.qty || 1), 0),
      0
    );

    const closedTotal = dateFilteredClosedSales.reduce(
      (sum, sale) =>
        sum + sale.items.reduce((a, i) => a + (Number(i.price) || 0) * (i.qty || 1), 0),
      0
    );

    return {
      openTotal,
      closedTotal,
      grandTotal: openTotal + closedTotal,
      itemCount,
      serviceCount,
      freebieCount,
      itemRevenue,
      serviceRevenue,
      uniqueServices: serviceTypes.size,
      uniqueItems: itemTypes.size,
      uniqueFreebies: freebieTypes.size,
      chartData,
      serviceBreakdown: Object.entries(serviceBreakdown)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total),
      itemGroups: Object.entries(itemGroups)
        .map(([category, data]) => ({
          category,
          count: data.count,
          revenue: data.revenue,
          uniqueItems: data.items.size,
        }))
        .sort((a, b) => b.count - a.count),
      inventoryUsed: Object.entries(inventoryUsed)
        .map(([name, data]) => ({
          name,
          count: data.count,
          revenue: data.revenue,
          isPaidItem: data.isPaidItem,
          isFreebie: data.isFreebie,
          type:
            data.isPaidItem && data.isFreebie
              ? "Both"
              : data.isPaidItem
              ? "Paid"
              : "Freebie",
        }))
        .sort((a, b) => b.count - a.count),
      paymentMethodBreakdown,
    };
  }, [dateFilteredOpenSales, dateFilteredClosedSales, timePeriod]);

  return {
    dateFilteredOpenSales,
    dateFilteredClosedSales,
    previousDaysPaidInRange,
    samePeriodCreatedAndPaid,
    analytics,
  };
}
