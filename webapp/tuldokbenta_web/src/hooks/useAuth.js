// hooks/useAuth.js
import { useSyncExternalStore } from "react";
import { getSession, subscribeSession } from "../utils/session";

/**
 * The current session, re-rendering when it changes.
 *
 * The navbar, the route guards and the two auth pages all read it, so signing in
 * on one reveals the right links on the other without a page reload.
 *
 * Returns the session object rather than the boolean this used to, because the
 * callers now need the role and the user's name, not just whether anyone is
 * signed in. `getSession` is passed as both the client and the server snapshot
 * for the same reason it always was: there is no SSR here.
 *
 * @returns {{accessToken: string, refreshToken: string, user: object, shops: Array}|null}
 */
export function useAuth() {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}
