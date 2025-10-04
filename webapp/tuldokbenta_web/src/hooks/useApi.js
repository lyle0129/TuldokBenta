// src/hooks/useApi.js
import { useState, useCallback } from "react";
import axios from "axios";

export function useApi(baseUrl) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // GET all
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(baseUrl);
      setData(res.data);
    } catch (err) {
      setError(err);
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  // POST new
  const createData = useCallback(
    async (newItem) => {
      try {
        await axios.post(baseUrl, newItem);
        fetchData();
      } catch (err) {
        setError(err);
        console.error("Create error:", err);
      }
    },
    [baseUrl, fetchData]
  );

  // DELETE
  const deleteData = useCallback(
    async (id) => {
      try {
        await axios.delete(`${baseUrl}/${id}`);
        fetchData();
      } catch (err) {
        setError(err);
        console.error("Delete error:", err);
      }
    },
    [baseUrl, fetchData]
  );

  return { data, loading, error, fetchData, createData, deleteData };
}
