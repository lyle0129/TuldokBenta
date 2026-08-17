export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:5001/api";

/**
 * A failed request, carrying the server's own explanation.
 *
 * The backend answers oversell with 400 {"message":"Not enough stock for X"};
 * mutations surface `error.message` to the user, so that reason has to survive
 * the trip out of fetch rather than being flattened to "request failed".
 */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const messageFrom = async (res, fallback) => {
  try {
    const body = await res.json();
    return body?.message || fallback;
  } catch {
    return fallback;
  }
};

/**
 * The single fetch wrapper every query and mutation goes through.
 *
 * Throws on a non-2xx or an unreachable server, which is what TanStack Query
 * needs in order to tell a failed query from an empty one — the hand-rolled
 * hooks this replaced caught everything and left the UI showing an empty list.
 *
 * @param {string} path path below API_BASE_URL, e.g. "/inventory"
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} [options]
 * @returns {Promise<any>} the parsed JSON body, or null for 204
 */
export const apiRequest = async (path, { method = "GET", body, signal } = {}) => {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // An aborted request is Query retiring a superseded fetch, not a failure
    // worth reporting — let it propagate untranslated.
    if (error?.name === "AbortError") throw error;
    throw new ApiError("Could not reach the server. Check your connection.", 0);
  }

  if (!res.ok) {
    throw new ApiError(
      await messageFrom(res, `Request failed (${res.status})`),
      res.status
    );
  }

  if (res.status === 204) return null;
  return res.json();
};
