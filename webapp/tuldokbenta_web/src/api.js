import axios from "axios";

// Read the base URL from the environment; fall back to localhost for local dev.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:5001/api";

const api = axios.create({ baseURL: API_BASE_URL });

export default api;