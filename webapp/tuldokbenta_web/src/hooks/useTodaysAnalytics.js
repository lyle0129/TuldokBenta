import { useMemo } from "react";

export function useTodaysAnalytics({ openSales, closedSales }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaysOpenSales = useMemo(() => {
    return openSales.filter(sale => {
      const saleDate = new Date(sale.created_at);
      return saleDate >= today && saleDate < tomorrow;
    });
  }, [openSales, today, tomorrow]);

  const todaysClosedSales = useMemo(() => {
    return closedSales.filter(sale => {
      const saleDate = new Date(sale.created_at);
      return saleDate >= today && saleDate < tomorrow;
    });
  }, [closedSales, today, tomorrow]);

  const closedSalesTodayFromPrevious = useMemo(() => {
    return closedSales.filter(sale => {
      if (!sale.paid_at) return false;
      const createdDate = new Date(sale.created_at);
      const paidDate = new Date(sale.paid_at);
      return createdDate < today && paidDate >= today && paidDate < tomorrow;
    });
  }, [closedSales, today, tomorrow]);

  const todaysOpenTotal = useMemo(() => {
    return todaysOpenSales.reduce((sum, sale) =>
      sum + sale.items.reduce((itemSum, item) => itemSum + (item.price * (item.qty || 1)), 0), 0
    );
  }, [todaysOpenSales]);

  const todaysClosedTotal = useMemo(() => {
    return todaysClosedSales.reduce((sum, sale) =>
      sum + sale.items.reduce((itemSum, item) => itemSum + (item.price * (item.qty || 1)), 0), 0
    );
  }, [todaysClosedSales]);

  const previousDaysClosedTotal = useMemo(() => {
    return closedSalesTodayFromPrevious.reduce((sum, sale) =>
      sum + sale.items.reduce((itemSum, item) => itemSum + (item.price * (item.qty || 1)), 0), 0
    );
  }, [closedSalesTodayFromPrevious]);

  const paymentMethodBreakdown = useMemo(() => {
    const allPaidToday = [...todaysClosedSales, ...closedSalesTodayFromPrevious];
    const breakdown = {};
    allPaidToday.forEach(sale => {
      const paymentMethod = sale.paid_using || 'Unknown';
      const saleTotal = sale.items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
      if (!breakdown[paymentMethod]) {
        breakdown[paymentMethod] = { count: 0, total: 0 };
      }
      breakdown[paymentMethod].count += 1;
      breakdown[paymentMethod].total += saleTotal;
    });
    return breakdown;
  }, [todaysClosedSales, closedSalesTodayFromPrevious]);

  const todaysItemsAndServices = useMemo(() => {
    const allTodaysSales = [...todaysOpenSales, ...todaysClosedSales, ...closedSalesTodayFromPrevious];
    const todaysCreatedSales = [...todaysOpenSales, ...todaysClosedSales];

    let itemCount = 0;
    let serviceCount = 0;
    let freebieCount = 0;
    let itemRevenue = 0;
    let serviceRevenue = 0;

    const serviceTypes = new Set();
    const itemTypes = new Set();
    const freebieTypes = new Set();
    const inventoryUsed = {};
    const serviceBreakdown = {};
    const itemGroups = {};

    allTodaysSales.forEach(sale => {
      sale.items.forEach(item => {
        const qty = item.qty || 1;
        const price = Number(item.price) || 0;
        const revenue = price * qty;
        if (item.type === 'service') {
          serviceCount += qty;
          serviceRevenue += revenue;
          serviceTypes.add(item.service_name);
        } else if (item.type === 'item') {
          if (price > 0) {
            itemCount += qty;
            itemRevenue += revenue;
            itemTypes.add(item.item_name);
          } else {
            freebieCount += qty;
            freebieTypes.add(item.item_name);
          }
        }
      });
    });

    todaysCreatedSales.forEach(sale => {
      sale.items.forEach(item => {
        const qty = item.qty || 1;
        const price = Number(item.price) || 0;
        const revenue = price * qty;
        if (item.type === 'service') {
          const serviceName = item.service_name;
          if (!serviceBreakdown[serviceName]) {
            serviceBreakdown[serviceName] = { qty: 0, price: Number(item.price) || 0, total: 0 };
          }
          serviceBreakdown[serviceName].qty += qty;
          serviceBreakdown[serviceName].total += revenue;
        } else if (item.type === 'item') {
          const itemName = item.item_name;
          const spaceIndex = itemName.indexOf(' ');
          const category = spaceIndex > 0 ? itemName.substring(0, spaceIndex) : itemName;
          if (!itemGroups[category]) {
            itemGroups[category] = { count: 0, revenue: 0, items: new Set() };
          }
          itemGroups[category].count += qty;
          itemGroups[category].revenue += revenue;
          itemGroups[category].items.add(itemName);
          if (!inventoryUsed[itemName]) {
            inventoryUsed[itemName] = { count: 0, revenue: 0, isFreebie: price === 0 };
          }
          inventoryUsed[itemName].count += qty;
          inventoryUsed[itemName].revenue += revenue;
        }
      });
    });

    return {
      itemCount,
      serviceCount,
      freebieCount,
      itemRevenue,
      serviceRevenue,
      uniqueServices: serviceTypes.size,
      uniqueItems: itemTypes.size,
      uniqueFreebies: freebieTypes.size,
      serviceBreakdown: Object.entries(serviceBreakdown)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total),
      itemGroups: Object.entries(itemGroups)
        .map(([category, data]) => ({
          category,
          count: data.count,
          revenue: data.revenue,
          uniqueItems: data.items.size
        }))
        .sort((a, b) => b.count - a.count),
      inventoryUsed: Object.entries(inventoryUsed)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
    };
  }, [todaysOpenSales, todaysClosedSales, closedSalesTodayFromPrevious]);

  const todaysGrandTotal = todaysOpenTotal + todaysClosedTotal;
  const todaysPaidTotal = todaysClosedTotal + previousDaysClosedTotal;

  return {
    todaysOpenSales,
    todaysClosedSales,
    closedSalesTodayFromPrevious,
    todaysOpenTotal,
    todaysClosedTotal,
    previousDaysClosedTotal,
    paymentMethodBreakdown,
    todaysItemsAndServices,
    todaysGrandTotal,
    todaysPaidTotal,
  };
}
