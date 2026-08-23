import { clearQueryCache } from "./queryClient";
import { clearSession, getSession, setSession } from "./utils/session";

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
 * Which shop a request acts on. TICKET 08 REPLACES THIS WITH THE PICKER.
 *
 * A stopgap, and worth explaining because ticket 07's requirements claim it is
 * unnecessary: "the frontend sends no X-Shop-Id header, and the backend's legacy
 * fallback supplies Shop 1". That is not what the backend does. resolveShop's
 * fallback is guarded on `req.user.legacy` — the synthetic actor built only when
 * a request arrives with NO Authorization header — and ticket 04 narrowed it
 * there deliberately, so that an authenticated request which forgot the header
 * gets a 400 rather than silently acting on shop 1. Correct, and it means the
 * moment this ticket starts sending a token, every scoped endpoint answers
 * `400 No shop selected` until a shop is named.
 *
 * The lowest id rather than `shops[0]`: the list arrives ordered by name, so
 * first-in-the-array is alphabetical and arbitrary. The lowest id is the shop
 * that existed first — Shop 1, the real one — which is what someone signing in
 * during the rollout expects to be looking at.
 */
const activeShopId = (session) =>
  session?.shops?.length ? Math.min(...session.shops.map((shop) => shop.id)) : null;

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
  const shopId = activeShopId(session);

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
    throw new ApiError(
      await messageFrom(res, `Request failed (${res.status})`),
      res.status
    );
  }

  if (res.status === 204) return null;
  return res.json();
};
