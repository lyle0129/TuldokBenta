// hooks/useServices.js
import { useState, useCallback } from "react";

const API_URL = "http://localhost:5001/api"; // change for production
// const API_URL = "https://backend-cashly.onrender.com/api"; 

export const useServices = () => {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ---------- FETCH ---------- //
  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/services`);
      const data = await res.json();
      setServices(data);
    } catch (error) {
      console.error("Error fetching services:", error);
    }
  }, []);

  const loadServices = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchServices();
    } finally {
      setIsLoading(false);
    }
  }, [fetchServices]);

  // ---------- MUTATIONS ---------- //
  const createService = async (service) => {
    try {
      const res = await fetch(`${API_URL}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(service),
      });
      if (!res.ok) throw new Error("Failed to create service");
      await loadServices();
      return true;
    } catch (error) {
      console.error("Error creating service:", error);
      return false;
    }
  };

  const updateService = async (id, updates) => {
    try {
      const res = await fetch(`${API_URL}/services/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update service");
      await loadServices();
      return true;
    } catch (error) {
      console.error("Error updating service:", error);
      return false;
    }
  };

  const deleteService = async (id) => {
    try {
      const res = await fetch(`${API_URL}/services/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete service");
      await loadServices();
    } catch (error) {
      console.error("Error deleting service:", error);
    }
  };

  return {
    services,
    isLoading,
    loadServices,
    createService,
    updateService,
    deleteService,
  };
};
