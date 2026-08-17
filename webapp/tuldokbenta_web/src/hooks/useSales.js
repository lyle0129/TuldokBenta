// hooks/useSales.js
import { useState, useCallback } from "react";
import { API_BASE_URL } from "../api";

export const useSales = () => {
  const [openSales, setOpenSales] = useState([]);
  const [closedSales, setClosedSales] = useState([]);
  const [closedSalesbyDate, setClosedSalesbyDate] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ---------- FETCHERS ---------- //
  const fetchOpenSales = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/open-sales`);
      const data = await res.json();
      setOpenSales(data);
    } catch (error) {
      console.error("Error fetching open sales:", error);
    }
  }, []);

  const fetchClosedSales = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/closed-sales`);
      const data = await res.json();
      setClosedSales(data);
    } catch (error) {
      console.error("Error fetching closed sales:", error);
    }
  }, []);

  // ✅ Date-filtered versions (for reports)
  const fetchOpenSalesByDate = useCallback(async (lowdate, highdate) => {
    try {
      const res = await fetch(`${API_BASE_URL}/open-sales?lowdate=${lowdate}&highdate=${highdate}`);
      const data = await res.json();
      return data;
    } catch (error) {
      console.error("Error fetching open sales by date:", error);
      return [];
    }
  }, []);

  const fetchClosedSalesByDate = useCallback(async (lowdate, highdate) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/closed-sales?lowdate=${lowdate}&highdate=${highdate}`
      );
      const data = await res.json();
      setClosedSalesbyDate(data); // ✅ update the table with filtered data
    } catch (error) {
      console.error("Error fetching closed sales by date:", error);
    }
  }, []);
  

  const loadSales = useCallback(async () => {
    setIsLoading(true);
    try {
      const now = new Date();

    // Convert to local YYYY-MM-DD
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;

    // Build local time range for today
    const lowdateLocal = new Date(`${today}T00:00:00`);
    const highdateLocal = new Date(`${today}T23:59:59`);

    // ✅ Convert to "YYYY-MM-DD HH:MM:SS" (already in UTC)
    const formatDate = (d) => d.toISOString().slice(0, 19).replace("T", " ");

      console.log(lowdateLocal)
      console.log(highdateLocal)
  
      await Promise.all([
        fetchOpenSales(),
        fetchClosedSales(),
        fetchClosedSalesByDate(formatDate(lowdateLocal), formatDate(highdateLocal)), // ✅ works now
      ]);
    } catch (error) {
      console.error("Error loading sales:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchOpenSales, fetchClosedSales, fetchClosedSalesByDate]);  

  // ---------- MUTATIONS ---------- //

  /**
   * Pulls the server's explanation out of a failed response.
   *
   * The backend answers oversell with 400 {"message":"Not enough stock for X"};
   * that used to be discarded, so the edit modal just sat there with no
   * feedback and the sale looked like it had saved.
   */
  const errorMessageFrom = async (res, fallback) => {
    try {
      const body = await res.json();
      return body?.message || fallback;
    } catch {
      return fallback;
    }
  };

  const createOpenSale = async (sale) => {
    try {
      const res = await fetch(`${API_BASE_URL}/open-sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale),
      });
      if (!res.ok) {
        return { ok: false, message: await errorMessageFrom(res, "Failed to create open sale") };
      }
      await loadSales();
      return { ok: true, message: null };
    } catch (error) {
      console.error("Error creating open sale:", error);
      return { ok: false, message: "Could not reach the server. Check your connection." };
    }
  };

  const updateOpenSale = async (id, sale) => {
    try {
      const res = await fetch(`${API_BASE_URL}/open-sales/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Only `items` is read server-side, but sending the whole sale keeps
        // this callable with a row straight out of the list.
        body: JSON.stringify(sale),
      });
      if (!res.ok) {
        return { ok: false, message: await errorMessageFrom(res, "Failed to update open sale") };
      }
      await loadSales();
      return { ok: true, message: null };
    } catch (error) {
      console.error("Error updating open sale:", error);
      return { ok: false, message: "Could not reach the server. Check your connection." };
    }
  };

  const deleteOpenSale = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/open-sales/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete open sale");
      await loadSales();
    } catch (error) {
      console.error("Error deleting open sale:", error);
    }
  };

  const paySale = async (id, paid_using) => {
    try {
      const res = await fetch(`${API_BASE_URL}/pay-sale/${id}`, {
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
      const res = await fetch(`${API_BASE_URL}/revert-sale/${id}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to revert sale");
      await loadSales();
    } catch (error) {
      console.error("Error reverting sale:", error);
    }
  };

  const deleteClosedSale = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/closed-sales/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete closed sale");
      await loadSales();
    } catch (error) {
      console.error("Error deleting closed sale:", error);
    }
  };

  return {
    openSales,
    closedSales,
    closedSalesbyDate,
    isLoading,
    loadSales,
    createOpenSale,
    updateOpenSale,   // ✅ added update here
    fetchOpenSalesByDate,   // ✅ new
    fetchClosedSalesByDate, // ✅ new
    deleteOpenSale,
    paySale,
    revertSale,
    deleteClosedSale,
  };
};
