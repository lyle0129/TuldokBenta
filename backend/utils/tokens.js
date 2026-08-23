// utils/tokens.js
// The only place tokens are signed and the only place they are verified.
//
// Pure in the sense the rest of utils/ is: no `sql`, no `req`/`res`. Its one
// dependency beyond jsonwebtoken is config/env.js, which by then has already
// refused to boot if either secret is missing, short, or equal to the other —
// so nothing here has to defend against an unset key.
//
// Keeping signing and verification in one module is the point. Split across the
// controller that issues and the middleware that checks, the two halves drift:
// one starts putting the role in the refresh token, or one starts verifying
// with the wrong key, and neither change looks wrong on its own.

import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

/**
 * The short-lived half. Carries everything a request needs to be authorised.
 *
 * `shops` rides along on purpose: it is what lets requireAuth and resolveShop
 * run with no database round trip at all, keeping the hot path — every till
 * request — at the one query the controller itself makes. The cost is
 * staleness. A shop assignment changed by a super admin does not reach the user
 * until their next refresh, up to ACCESS_TOKEN_TTL. That is accepted and
 * recorded in the program's risk register.
 *
 * @param {{id: number, username: string, role: string}} user
 * @param {number[]} shopIds
 */
export const signAccessToken = (user, shopIds = []) =>
  jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      shops: shopIds,
    },
    env.accessSecret,
    { expiresIn: env.accessTokenTtl }
  );

/**
 * The long-lived half. Deliberately minimal.
 *
 * No role and no shop list. This token lives for thirty days, so anything
 * baked into it is a claim that survives a demotion for thirty days — a user
 * dropped from manager to worker could keep minting manager access tokens for
 * a month. /api/auth/refresh re-reads both from the database every time
 * instead.
 *
 * `tv` is the user's token_version. Bumping the stored value invalidates every
 * refresh token ever issued to that account, which is the "sign out
 * everywhere" lever for the case that cannot wait for expiry.
 *
 * @param {{id: number, token_version: number}} user
 */
export const signRefreshToken = (user) =>
  jwt.sign({ sub: user.id, tv: Number(user.token_version ?? 0) }, env.refreshSecret, {
    expiresIn: env.refreshTokenTtl,
  });

/**
 * Verification returns the payload, or null.
 *
 * Null rather than a throw so callers branch instead of wrapping every call in
 * a try — and, more to the point, so no caller can accidentally let an expired
 * token through by catching too broadly. Expired, malformed, tampered with and
 * signed-with-the-other-key all arrive here as the same answer: no.
 */
const verifyWith = (secret) => (token) => {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
};

export const verifyAccessToken = verifyWith(env.accessSecret);
export const verifyRefreshToken = verifyWith(env.refreshSecret);
