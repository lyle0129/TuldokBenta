// hooks/useSales.js
import { useState, useCallback } from "react";

const API_URL = "http://localhost:5001/api"; // change for production
// const API_URL = "https://backend-cashly.onrender.com/api"; 

export const useSales = () => {
  const [openSales, setOpenSales] = useState([]);
  const [closedSales, setClosedSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ---------- FETCHERS ---------- //
  const fetchOpenSales = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/open-sales`);
      const data = await res.json();
      setOpenSales(data);
    } catch (error) {
      console.error("Error fetching open sales:", error);
    }
  }, []);

  const fetchClosedSales = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/closed-sales`);
      const data = await res.json();
      setClosedSales(data);
    } catch (error) {
      console.error("Error fetching closed sales:", error);
    }
  }, []);

  const loadSales = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchOpenSales(), fetchClosedSales()]);
    } catch (error) {
      console.error("Error loading sales:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchOpenSales, fetchClosedSales]);

  // ---------- MUTATIONS ---------- //
  const createOpenSale = async (sale) => {
    try {
      const res = await fetch(`${API_URL}/open-sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale),
      });
      if (!res.ok) throw new Error("Failed to create open sale");
      await loadSales();
      return true;
    } catch (error) {
      console.error("Error creating open sale:", error);
      return false;
    }
  };

  const updateOpenSale = async (id, sale) => {
    try {
      const res = await fetch(`${API_URL}/open-sales/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale), // send full sale
      });
      if (!res.ok) throw new Error("Failed to update open sale");
      await loadSales();
      return true;
    } catch (error) {
      console.error("Error updating open sale:", error);
      return false;
    }
  };

  const deleteOpenSale = async (id) => {
    try {
      const res = await fetch(`${API_URL}/open-sales/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete open sale");
      await loadSales();
    } catch (error) {
      console.error("Error deleting open sale:", error);
    }
  };

  const paySale = async (id, paid_using) => {
    try {
      const res = await fetch(`${API_URL}/pay-sale/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_using }),
      });
      if (!res.ok) throw new Error("Failed to pay sale");
      await loadSales();
    } catch (error) {
      console.error("Error paying sale:", error);
    }
  };

  const revertSale = async (id) => {
    try {
      const res = await fetch(`${API_URL}/revert-sale/${id}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to revert sale");
      await loadSales();
    } catch (error) {
      console.error("Error reverting sale:", error);
    }
  };

  const deleteClosedSale = async (id) => {
    try {
      const res = await fetch(`${API_URL}/closed-sales/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete closed sale");
      await loadSales();
    } catch (error) {
      console.error("Error deleting closed sale:", error);
    }
  };

  return {
    openSales,
    closedSales,
    isLoading,
    loadSales,
    createOpenSale,
    updateOpenSale,   // ✅ added update here
    deleteOpenSale,
    paySale,
    revertSale,
    deleteClosedSale,
  };
};
