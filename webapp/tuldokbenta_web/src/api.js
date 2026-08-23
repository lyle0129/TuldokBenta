import { clearQueryCache } from "./queryClient";
import {
  clearActiveShop,
  clearSession,
  getActiveShopId,
  getSession,
  setSession,
} from "./utils/session";

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

const CONNECTION_MESSAGE = "Could not reach the server. Check your connection.";

/**
 * The two endpoints that carry a credential in the body instead of a header.
 *
 * These are the ONLY paths that go out without an Authorization header. The
 * other three under /auth mount requireRealAuth on the server and are refused
 * outright without one — /auth/change-password and /auth/logout both need the
 * token of the very session they are acting on.
 *
 * Kept separate from isAuthPath below on purpose. The two rules look similar and
 * are not: this one is about what the server needs in order to identify you, and
 * that one is about what a 401 from a given path means.
 */
const isCredentialPath = (path) =>
  path === "/auth/login" || path === "/auth/refresh";

/**
 * The auth endpoints, which never trigger a silent refresh.
 *
 * A 401 from /auth/login means the password is wrong and a 401 from
 * /auth/change-password means the *current* password is wrong — neither is a
 * stale access token, so refreshing would be answering the wrong question. And a
 * 401 from /auth/refresh itself must not trigger another refresh, or an expired
 * refresh token loops forever.
 */
const isAuthPath = (path) => path.startsWith("/auth/");

/**
 * The paths that must not carry X-Shop-Id.
 *
 * /auth/* identifies the person, not a shop, and two of its endpoints are how a
 * session begins — there is no shop to name yet.
 *
 * /admin/* is the super-admin surface, and it mounts no resolveShop at all: a
 * super admin acts across shops there, and every route takes its subject as an
 * explicit path or body parameter instead (see backend/routes/admin.js). Sending
 * the header would be harmless and misleading — it would read as though the
 * route were scoped by it.
 */
const isShopExemptPath = (path) =>
  path.startsWith("/auth/") || path.startsWith("/admin/");

/**
 * The 403 that means the stored shop is no longer this user's to act on.
 *
 * Matched on the server's own wording (middleware/shopScope.js) because 403 is
 * also what requireRole answers, and those two need opposite handling: a role
 * refusal is a page the user may not see and clearing their shop would not help,
 * while this one is recoverable by choosing a different shop.
 */
const isUnassignedShopMessage = (message) =>
  message === "You are not assigned to that shop" || message === "Shop not found";

/**
 * One refresh, however many requests hit 401 at once.
 *
 * The till fires several queries the moment it mounts. Without this, an expired
 * access token would start a refresh per query, and the last response to land
 * would install a token the earlier ones had already replaced.
 */
let refreshInFlight = null;

// Three outcomes, not two. "The server said no" and "the server did not answer"
// must not be conflated: a cashier whose connection drops would otherwise be
// signed out mid-shift, and signing back in also needs the network — leaving
// them stranded on the one screen built to work without one.
const REFRESHED = "refreshed";
const REFUSED = "refused";
const OFFLINE = "offline";

/**
 * Trades the refresh token for a new access token.
 *
 * A bare fetch on purpose, not a recursive apiRequest: a refresh must not be
 * subject to the 401 handling it exists to implement.
 */
const performRefresh = async () => {
  const session = getSession();
  if (!session?.refreshToken) return REFUSED;

  let res;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
  } catch {
    return OFFLINE;
  }

  if (!res.ok) return REFUSED;

  // The response carries `user` and `shops` alongside the token, re-read from
  // the database rather than copied off the old token, so this is the moment a
  // demotion or a reassignment reaches the UI. It carries no new refreshToken —
  // there is no rotation by design — so the existing one is kept.
  const { accessToken, user, shops } = await res.json();
  setSession({ ...session, accessToken, user, shops });
  return REFRESHED;
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
export const apiRequest = async (
  path,
  // `_retry` is internal and never passed by a caller. It is what makes "at most
  // one retry per 401" structural rather than a matter of care: the retried
  // request cannot itself retry.
  { method = "GET", body, signal, _retry = false } = {}
) => {
  const session = isCredentialPath(path) ? null : getSession();
  const shopId = isShopExemptPath(path) ? null : getActiveShopId();

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined ? null : { "Content-Type": "application/json" }),
        ...(session?.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : null),
        ...(shopId ? { "X-Shop-Id": String(shopId) } : null),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // An aborted request is Query retiring a superseded fetch, not a failure
    // worth reporting — let it propagate untranslated.
    if (error?.name === "AbortError") throw error;
    throw new ApiError(CONNECTION_MESSAGE, 0);
  }

  if (res.status === 401 && !_retry && !isAuthPath(path)) {
    refreshInFlight ??= performRefresh().finally(() => {
      refreshInFlight = null;
    });
    const outcome = await refreshInFlight;

    if (outcome === REFRESHED) {
      return apiRequest(path, { method, body, signal, _retry: true });
    }

    // Unreachable server: the session may well still be good. Fail this one
    // request the way any other network failure fails and leave the user
    // signed in.
    if (outcome === OFFLINE) throw new ApiError(CONNECTION_MESSAGE, 0);

    clearSession();
    clearQueryCache();
    // A hard navigation rather than a router navigate: apiRequest is called from
    // hooks and mutations with no router context, and a full reload is the
    // cleanest way to drop in-memory state alongside the cleared cache.
    window.location.assign("/login");
    return null;
  }

  if (!res.ok) {
    const message = await messageFrom(res, `Request failed (${res.status})`);

    // The shop this request named is not one this user may act on any more.
    // Keeping it selected would 403 every query on the page forever, so drop it
    // and send them back to the picker — the same shape as the 401 path above,
    // and for the same reason: apiRequest is called from hooks and mutations
    // with no router context, and a full reload is the cleanest way to drop
    // in-memory state alongside the cleared cache.
    //
    // clearActiveShop rather than the picker's setShop: importing hooks from
    // here would close the api -> session import edge into a cycle, which is
    // exactly what utils/session.js is factored to avoid.
    if (res.status === 403 && shopId && isUnassignedShopMessage(message)) {
      clearActiveShop();
      clearQueryCache();
      window.location.assign("/select-shop");
      return null;
    }

    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return null;
  return res.json();
};
