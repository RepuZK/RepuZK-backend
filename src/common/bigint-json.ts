/**
 * `@stellar/stellar-sdk`'s `scValToNative` returns a JS `bigint` for
 * Soroban's 64/128-bit integer types (u64 timestamps like `calculated_at`,
 * i128 amounts like an `Order.amount` or `Listing.price`), since those can
 * exceed `Number.MAX_SAFE_INTEGER`. `JSON.stringify` — used both by
 * Express's `res.json()` for every API response and by every
 * `JSON.stringify(...)` call this app makes before caching on-chain data in
 * Redis — throws on a bare `bigint` with no `toJSON`.
 *
 * Rather than patch every call site that happens to touch on-chain data
 * today (and re-discover this the next time a new one does), stringify
 * bigints once, globally, as decimal strings — preserving full i128
 * precision, unlike converting to `number`. Import this once for its side
 * effect before the app does anything else.
 */
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};
