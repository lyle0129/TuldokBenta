// hooks/useAuth.js
import { useSyncExternalStore } from "react";
import { isAuthenticated, subscribeAuth } from "../utils/auth";

/**
 * Whether the admin session is open, re-rendering when that changes.
 *
 * Both the navbar and the password gate read it, so signing in on one unhides
 * the admin links on the other without a page reload.
 *
 * @returns {boolean}
 */
export function useAuth() {
  return useSyncExternalStore(subscribeAuth, isAuthenticated, isAuthenticated);
}
