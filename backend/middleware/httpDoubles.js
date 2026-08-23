// middleware/httpDoubles.js
// Test-only. Minimal stand-ins for Express's req/res, shared by auth.test.js,
// auth.legacy.test.js and shopScope.test.js.
//
// Not named *.test.js on purpose: node --test would otherwise treat it as a
// suite of its own, and importing it from three real suites would register
// those tests three times over.
//
// The middlewares under test touch very little of either object — a header
// lookup on one side, status().json() on the other — so a double beats standing
// up an Express app, and it keeps every case synchronous and inspectable.

/** @param {Record<string, string>} headers lowercase header names to values */
export const fakeReq = (headers = {}) => ({
  header: (name) => headers[name.toLowerCase()],
});

/** Records the last status and body rather than writing anything. */
export const fakeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

/**
 * Runs a middleware to completion and reports whether it called next().
 *
 * `nexted` is the assertion that matters most: a guard that answers 401 *and*
 * calls next() has still let the request through, and checking only the status
 * code would not notice.
 */
export const run = async (middleware, req, res = fakeRes()) => {
  let nexted = false;
  await middleware(req, res, () => {
    nexted = true;
  });
  return { nexted, res, req };
};
