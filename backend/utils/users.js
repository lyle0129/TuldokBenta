// utils/users.js
// The one user shape any response is allowed to contain.
//
// Lives in utils/ rather than beside its first caller for the same reason
// passwords.js and saleItems.js do: it is pure, several controllers need it, and
// it has to be importable without a database in the loop. config/db.js pulls in
// config/env.js, which exits the process when DATABASE_URL is unset — so a test
// that reached this helper through a controller could not run at all.

/**
 * Everything user-shaped goes through here so that `password_hash` and
 * `token_version` cannot leak — including from a `SELECT *`, which is how they
 * would leak, and including from a column added to `users` next year by someone
 * who never reads this file.
 *
 * An allowlist, deliberately, rather than deleting the two dangerous keys. A
 * denylist is only correct until the next column is added; this shape stays
 * correct by default and has to be edited on purpose to widen.
 */
export const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  full_name: row.full_name,
  role: row.role,
  is_active: row.is_active,
  must_change_password: row.must_change_password,
  last_login_at: row.last_login_at,
});

/** The three roles, in the order a UI would list them. Matches the CHECK on `users.role`. */
export const ROLES = Object.freeze(["super_admin", "manager", "worker"]);

export const isRole = (value) => ROLES.includes(value);
