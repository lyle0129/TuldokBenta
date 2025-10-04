// hooks/useInventory.js
import { useState, useCallback } from "react";

const API_URL = "http://localhost:5001/api"; // change for production
// const API_URL = "https://backend-cashly.onrender.com/api"; 

export const useInventory = () => {
  const [inventory, setInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ---------- FETCH ---------- //
  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/inventory`);
      const data = await res.json();
      setInventory(data);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    }
  }, []);

  const loadInventory = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchInventory();
    } finally {
      setIsLoading(false);
    }
  }, [fetchInventory]);

  // ---------- MUTATIONS ---------- //
  const createInventoryItem = async (item) => {
    try {
      const res = await fetch(`${API_URL}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error("Failed to create inventory item");
      await loadInventory();
      return true;
    } catch (error) {
      console.error("Error creating inventory item:", error);
      return false;
    }
  };

  const updateInventoryItem = async (id, updates) => {
    try {
      const res = await fetch(`${API_URL}/inventory/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update inventory item");
      await loadInventory();
      return true;
    } catch (error) {
      console.error("Error updating inventory item:", error);
      return false;
    }
  };

  const deleteInventoryItem = async (id) => {
    try {
      const res = await fetch(`${API_URL}/inventory/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete inventory item");
      await loadInventory();
    } catch (error) {
      console.error("Error deleting inventory item:", error);
    }
  };

  return {
    inventory,
    isLoading,
    loadInventory,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
  };
};
