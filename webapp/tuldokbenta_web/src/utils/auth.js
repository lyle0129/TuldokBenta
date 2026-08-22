// utils/auth.js
// The admin session flag, and who to tell when it changes.

import { AUTH_KEY } from "./storage";

/**
 * A subscribable flag rather than a bare localStorage read.
 *
 * The navbar hides the admin sections while signed out, so it has to re-render
 * the moment the password gate accepts. Reading localStorage during render
 * can't do that — nothing notifies — and the previous navbar papered over it by
 * only ever showing the right thing after a full page reload.
 */
const listeners = new Set();

/**
 * Reads through to storage every time rather than caching in a module variable.
 *
 * It is safe as a useSyncExternalStore snapshot because the value is a boolean,
 * compared by value. Caching would be marginally cheaper but would go stale
 * whenever something clears storage behind our back — which the ProtectedRoute
 * tests do between every run.
 */
export const isAuthenticated = () => {
  try {
    return localStorage.getItem(AUTH_KEY) === "true";
  } catch (error) {
    // Storage blocked (private mode, embedded webview). Fail closed.
    console.error("Could not read the auth flag:", error);
    return false;
  }
};

export const subscribeAuth = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => listeners.forEach((listener) => listener());

/** Called by the password gate once the password checks out. */
export const signIn = () => {
  try {
    localStorage.setItem(AUTH_KEY, "true");
  } catch (error) {
    console.error("Could not persist the auth flag:", error);
  }
  notify();
};

export const signOut = () => {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch (error) {
    console.error("Could not clear the auth flag:", error);
  }
  notify();
};
