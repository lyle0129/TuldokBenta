// utils/passwords.js
// Password hashing, the password policy, and username normalisation.
//
// Pure in the same sense as saleItems.js and paymentMethods.js: no `sql`, no
// `req`/`res`, everything in through parameters. That is what makes the rules
// here testable without a database, and it is the reason the policy lives in
// one place rather than being re-checked in each controller that sets a
// password.
//
// bcryptjs rather than the native `bcrypt`: pure JavaScript, so there is no
// node-gyp step to fail on the deploy host. The API and the cost-factor
// argument are identical, so nothing else in this ticket changes.

import bcrypt from "bcryptjs";

import { badRequest } from "./saleItems.js";

// 10 is the floor the design sets. Raising it later is safe — a bcrypt hash
// records the cost it was made with, so old hashes keep verifying.
const COST = 10;

/** Shortest password we will accept. Enforced at creation, never at login. */
export const MIN_PASSWORD_LENGTH = 8;

export const hashPassword = (plain) => bcrypt.hash(plain, COST);

/**
 * Constant-time verification, delegated to bcrypt.
 *
 * Never compare hashes with `===`: that leaks how many leading characters
 * matched through how long the comparison took.
 */
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

/**
 * A real bcrypt hash of a fixed throwaway string, generated once and committed
 * as a literal.
 *
 * Its only job is to be compared against when a login names a username that
 * does not exist. Without it, an unknown username returns immediately while a
 * known one pays for a bcrypt comparison first, and the difference is large
 * enough to turn the login form into an account enumerator. Nothing knows the
 * string this hashes, and nothing needs to — no password ever verifies against
 * it except by astronomical accident.
 */
export const DUMMY_HASH =
  "$2b$10$I2F0fq4kPKbQsXf0jzUrLeRrWEyiQAopDjRK4UAk43rnKBGmDZta.";

/**
 * Throws if `plain` is not an acceptable new password.
 *
 * Uses the existing `badRequest` helper so the throw travels through the same
 * `toErrorResponse` translation every other 400 in this backend already uses.
 * A second error convention for auth would be one more thing to keep in sync.
 */
export const assertPasswordPolicy = (plain) => {
  if (typeof plain !== "string") {
    throw badRequest("Password must be text");
  }
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
};

/**
 * The one spelling of a username.
 *
 * `users.username` is UNIQUE, but a UNIQUE constraint only stops `maria` from
 * being created twice — it happily allows `Maria` alongside it as a second
 * account. Normalising in one helper, used by both the login lookup and every
 * create path, is what actually enforces "one person, one username".
 */
export const normalizeUsername = (raw) => String(raw ?? "").trim().toLowerCase();
