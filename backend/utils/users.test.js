import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { toPublicUser, isRole, ROLES } from "./users.js";

describe("toPublicUser", () => {
  test("keeps the fields a client needs", () => {
    const row = {
      id: 4,
      username: "maria",
      full_name: "Maria Santos",
      role: "manager",
      is_active: true,
      must_change_password: false,
      last_login_at: "2026-08-23 09:00:00",
    };
    assert.deepEqual(toPublicUser(row), row);
  });

  // P4 — the two dangerous columns never survive, whatever the row carries.
  //
  // The realistic way they leak is `SELECT *`, which is what every read in
  // authController and adminUsersController does, so the property is stated over
  // a row with arbitrary extra columns rather than over the known shape.
  test("P4: never returns password_hash or token_version", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
        fc.string({ minLength: 1 }),
        fc.integer(),
        (extras, hash, version) => {
          const row = { ...extras, password_hash: hash, token_version: version };
          const publicUser = toPublicUser(row);

          assert.equal(Object.hasOwn(publicUser, "password_hash"), false);
          assert.equal(Object.hasOwn(publicUser, "token_version"), false);
          // The stronger statement, and the one that actually holds the line:
          // the key set is fixed, so a column invented next year cannot ride
          // along either. Checking the two names alone would pass a helper that
          // spread the row and deleted them.
          assert.deepEqual(Object.keys(publicUser), [
            "id",
            "username",
            "full_name",
            "role",
            "is_active",
            "must_change_password",
            "last_login_at",
          ]);
        }
      ),
      { numRuns: 300 }
    );
  });
});

describe("isRole", () => {
  test("accepts the three roles and nothing else", () => {
    for (const role of ROLES) assert.equal(isRole(role), true, role);
    for (const not of ["admin", "Super_Admin", "", null, undefined, 1]) {
      assert.equal(isRole(not), false, `${not}`);
    }
  });

  test("matches the CHECK constraint on users.role", () => {
    assert.deepEqual([...ROLES], ["super_admin", "manager", "worker"]);
  });
});
