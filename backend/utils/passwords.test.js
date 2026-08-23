import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  hashPassword,
  verifyPassword,
  assertPasswordPolicy,
  normalizeUsername,
  DUMMY_HASH,
  MIN_PASSWORD_LENGTH,
} from "./passwords.js";

// bcrypt at cost 10 is deliberately slow — around 100ms per hash in pure JS.
// A property test that hashes a hundred passwords would take ten seconds, so
// the hashing properties run a small number of cases on purpose. The point of
// P4 is that the round trip holds across shapes of input, not that it holds
// hundreds of times.
const HASH_RUNS = 8;

describe("utils/passwords hashing", () => {
  // P4 — for any acceptable password, the hash verifies, and a different
  // password does not verify against it.
  test("round-trips any password of 8 or more characters", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: MIN_PASSWORD_LENGTH, maxLength: 64 }),
        async (password) => {
          const hash = await hashPassword(password);
          assert.equal(await verifyPassword(password, hash), true);
        }
      ),
      { numRuns: HASH_RUNS }
    );
  });

  test("never verifies a different password", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: MIN_PASSWORD_LENGTH, maxLength: 32 }),
        fc.string({ minLength: MIN_PASSWORD_LENGTH, maxLength: 32 }),
        async (a, b) => {
          fc.pre(a !== b);
          const hash = await hashPassword(a);
          assert.equal(await verifyPassword(b, hash), false);
        }
      ),
      { numRuns: HASH_RUNS }
    );
  });

  test("stores a bcrypt hash, never the password itself", async () => {
    const password = "correct horse battery";
    const hash = await hashPassword(password);

    assert.match(hash, /^\$2[aby]\$10\$/); // bcrypt, cost 10
    assert.ok(!hash.includes(password));
  });

  test("hashes the same password differently every time", async () => {
    // Each hash carries its own salt. Two equal hashes would mean the salt was
    // fixed, which would let one rainbow table cover every account at once.
    const [first, second] = await Promise.all([
      hashPassword("same password"),
      hashPassword("same password"),
    ]);

    assert.notEqual(first, second);
    assert.equal(await verifyPassword("same password", first), true);
    assert.equal(await verifyPassword("same password", second), true);
  });
});

describe("utils/passwords DUMMY_HASH", () => {
  // Its whole job is to make an unknown username cost the same as a known one,
  // which only works if it is a real hash bcrypt is willing to work through.
  test("is a real bcrypt hash at the same cost as a live one", () => {
    assert.match(DUMMY_HASH, /^\$2[aby]\$10\$/);
  });

  test("does not verify against a plausible password", async () => {
    assert.equal(await verifyPassword("admin", DUMMY_HASH), false);
    assert.equal(await verifyPassword("password123", DUMMY_HASH), false);
  });
});

describe("utils/passwords policy", () => {
  test("rejects one character under the minimum", () => {
    assert.throws(() => assertPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH - 1)), {
      status: 400,
    });
  });

  test("accepts exactly the minimum", () => {
    assert.doesNotThrow(() => assertPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH)));
  });

  test("rejects a non-string", () => {
    // A JSON body can carry anything; `null.length` would be a 500 rather than
    // the 400 this is.
    for (const value of [undefined, null, 12345678, {}, ["abcdefgh"]]) {
      assert.throws(() => assertPasswordPolicy(value), { status: 400 });
    }
  });

  test("throws through the shared badRequest shape", () => {
    // toErrorResponse in saleItems.js branches on `.status === 400`, so this is
    // what keeps auth errors out of the generic 500 path.
    try {
      assertPasswordPolicy("short");
      assert.fail("expected a throw");
    } catch (error) {
      assert.equal(error.status, 400);
      assert.match(error.message, new RegExp(`${MIN_PASSWORD_LENGTH} characters`));
    }
  });
});

describe("utils/passwords normalizeUsername", () => {
  // P5, first half — normalising twice is the same as normalising once. Holds
  // for arbitrary Unicode: lowercase mappings are idempotent, and lowercasing
  // never reintroduces surrounding whitespace.
  test("is idempotent", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), (raw) => {
        const once = normalizeUsername(raw);
        assert.equal(normalizeUsername(once), once);
      })
    );
  });

  // P5, second half — case is not part of a username's identity.
  //
  // Scoped to fc.string()'s printable-ASCII alphabet on purpose. The property
  // is genuinely false over all of Unicode: "ß".toUpperCase() is "SS", which
  // lowercases to "ss" rather than back to "ß", and the ligature "ﬁ" behaves
  // the same way. Usernames here are ASCII, so this is the range worth
  // asserting over rather than one worth pretending about.
  test("folds case", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        assert.equal(normalizeUsername(raw), normalizeUsername(raw.toUpperCase()));
      })
    );
  });

  test("trims and lowercases", () => {
    assert.equal(normalizeUsername("  Maria  "), "maria");
    assert.equal(normalizeUsername("MARIA"), "maria");
  });

  test("collapses absent values to an empty string", () => {
    // The callers check for empty and return a 400; what matters here is that
    // none of these reach the SQL layer as `null.trim()`.
    assert.equal(normalizeUsername(undefined), "");
    assert.equal(normalizeUsername(null), "");
    assert.equal(normalizeUsername("   "), "");
  });
});
