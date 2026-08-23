import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import jwt from "jsonwebtoken";

// config/env.js validates while it is being evaluated and calls process.exit on
// a missing secret, and it deliberately does not read .env — so a static import
// of tokens.js would take this runner down on any machine whose shell happens
// not to export the secrets. Set the environment first, then reach the module
// through a dynamic import.
//
// dotenv never overrides a variable that is already set, so the real
// backend/.env cannot leak into these cases through config/db.js either.
const ACCESS = "a".repeat(40);
const REFRESH = "b".repeat(40);

process.env.DATABASE_URL = "postgresql://user:pass@host.neon.tech/db";
process.env.JWT_ACCESS_SECRET = ACCESS;
process.env.JWT_REFRESH_SECRET = REFRESH;
process.env.ACCESS_TOKEN_TTL = "60m";
process.env.REFRESH_TOKEN_TTL = "30d";

const { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } =
  await import("./tokens.js");

/** The subset of a user row the token functions actually read. */
const anyUser = fc.record({
  id: fc.integer({ min: 1, max: 2 ** 31 - 1 }),
  username: fc.string({ minLength: 1, maxLength: 50 }),
  role: fc.constantFrom("super_admin", "manager", "worker"),
  token_version: fc.integer({ min: 0, max: 10_000 }),
});

const anyShopIds = fc.array(fc.integer({ min: 1, max: 1000 }), { maxLength: 8 });

describe("utils/tokens access tokens", () => {
  // P1 — whatever goes in comes back out.
  test("round-trips id, username, role and shops", () => {
    fc.assert(
      fc.property(anyUser, anyShopIds, (user, shops) => {
        const payload = verifyAccessToken(signAccessToken(user, shops));

        assert.ok(payload);
        assert.equal(payload.sub, user.id);
        assert.equal(payload.username, user.username);
        assert.equal(payload.role, user.role);
        assert.deepEqual(payload.shops, shops);
      })
    );
  });

  test("defaults the shop list to empty rather than undefined", () => {
    // requireAuth reads `payload.shops` straight into req.user, and resolveShop
    // then calls .includes on it. An absent claim would be a TypeError on the
    // first request from a user with no assignments.
    const payload = verifyAccessToken(signAccessToken({ id: 1, username: "a", role: "worker" }));
    assert.deepEqual(payload.shops, []);
  });

  test("carries no password material", () => {
    const token = signAccessToken(
      { id: 1, username: "maria", role: "manager", password_hash: "$2b$10$leak" },
      [1]
    );
    assert.ok(!token.includes("leak"));
    assert.equal(verifyAccessToken(token).password_hash, undefined);
  });
});

describe("utils/tokens refresh tokens", () => {
  test("round-trips only the id and the token version", () => {
    fc.assert(
      fc.property(anyUser, (user) => {
        const payload = verifyRefreshToken(signRefreshToken(user));

        assert.ok(payload);
        assert.equal(payload.sub, user.id);
        assert.equal(payload.tv, user.token_version);

        // The whole reason this token is minimal: it lives for thirty days, so
        // a role baked into it would outlive a demotion by a month.
        assert.equal(payload.role, undefined);
        assert.equal(payload.shops, undefined);
        assert.equal(payload.username, undefined);
      })
    );
  });

  test("treats a missing token_version as 0", () => {
    // Matches the column default, so a row read before that column existed
    // cannot mint a token whose tv is NaN and never matches anything.
    assert.equal(verifyRefreshToken(signRefreshToken({ id: 7 })).tv, 0);
  });
});

describe("utils/tokens key separation", () => {
  // P2 — the property that must not be skipped. If the two keys were
  // interchangeable, a leaked access secret would mint thirty-day refresh
  // tokens, and every reason for having two secrets would evaporate.
  test("neither token verifies with the other's key", () => {
    fc.assert(
      fc.property(anyUser, anyShopIds, (user, shops) => {
        assert.equal(verifyRefreshToken(signAccessToken(user, shops)), null);
        assert.equal(verifyAccessToken(signRefreshToken(user)), null);
      })
    );
  });
});

describe("utils/tokens rejection", () => {
  // P3 — any single-character mutation is detected.
  //
  // Worth knowing why this holds even at the very end of the signature:
  // an HMAC-SHA256 signature is 32 bytes, which base64url-encodes to 43
  // characters carrying 258 bits, so the final character has two bits that
  // decode to nothing and three other characters decode to byte-identical
  // signatures. jsonwebtoken compares the encoded signature *string* it
  // computes rather than the decoded bytes, so those three are rejected too.
  test("rejects any single-character mutation", () => {
    const token = signAccessToken({ id: 1, username: "maria", role: "manager" }, [1]);

    fc.assert(
      fc.property(
        fc.nat({ max: token.length - 1 }),
        fc.constantFrom(..."ABCXYZabcxyz0189-_"),
        (index, replacement) => {
          fc.pre(token[index] !== replacement);
          const mutated = token.slice(0, index) + replacement + token.slice(index + 1);
          assert.equal(verifyAccessToken(mutated), null);
        }
      )
    );
  });

  test("rejects an expired token", () => {
    // Signed with the real key and a negative lifetime, so the only thing wrong
    // with it is that its exp is in the past.
    const expired = jwt.sign({ sub: 1, role: "manager" }, ACCESS, { expiresIn: "-1s" });
    assert.equal(verifyAccessToken(expired), null);

    const expiredRefresh = jwt.sign({ sub: 1, tv: 0 }, REFRESH, { expiresIn: "-1s" });
    assert.equal(verifyRefreshToken(expiredRefresh), null);
  });

  test("rejects a token signed with an unrelated key", () => {
    const forged = jwt.sign({ sub: 1, role: "super_admin" }, "z".repeat(40));
    assert.equal(verifyAccessToken(forged), null);
    assert.equal(verifyRefreshToken(forged), null);
  });

  test("rejects an unsigned `alg: none` token", () => {
    // The classic JWT attack: strip the signature and claim the algorithm is
    // none. jsonwebtoken refuses it whenever a key is supplied, which it always
    // is here — but it costs one assertion to prove rather than assume.
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url"
    )}.${Buffer.from(JSON.stringify({ sub: 1, role: "super_admin" })).toString("base64url")}.`;
    assert.equal(verifyAccessToken(none), null);
  });

  test("returns null rather than throwing on junk", () => {
    for (const junk of ["", "not-a-token", "a.b.c", null, undefined, 42, {}]) {
      assert.equal(verifyAccessToken(junk), null);
      assert.equal(verifyRefreshToken(junk), null);
    }
  });
});
