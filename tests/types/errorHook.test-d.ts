import { expectTypeOf } from "expect-type";
import type {
  FacebookError,
  FacebookErrorHook,
  FacebookErrorCategory,
  FacebookErrorContext,
  FacebookAuthError,
  FacebookRateLimitError,
  FacebookNetworkError,
  RateLimitUsage,
} from "../../src/errors.js";

declare const err: FacebookError;

// 1. The discriminant covers every category.
expectTypeOf(err.category).toEqualTypeOf<FacebookErrorCategory>();

// 2. Narrowing on `.category` resolves to the concrete class (discriminated union).
if (err.category === "auth") {
  expectTypeOf(err).toEqualTypeOf<FacebookAuthError>();
  // code/subcode stay OPEN `number` — the code space is not closed into literals.
  expectTypeOf(err.code).toEqualTypeOf<number>();
  expectTypeOf(err.subcode).toEqualTypeOf<number | undefined>();
}

if (err.category === "rate_limit") {
  expectTypeOf(err).toEqualTypeOf<FacebookRateLimitError>();
  expectTypeOf(err.usage).toEqualTypeOf<RateLimitUsage | undefined>();
}

if (err.category === "network") {
  expectTypeOf(err).toEqualTypeOf<FacebookNetworkError>();
  // A transport error has no Graph envelope, so no `code`.
  // @ts-expect-error - `code` exists only on FacebookGraphError members
  err.code;
}

// 3. `usage` is gated to rate-limit errors — not reachable on the bare union.
// @ts-expect-error - usage is not a member of every error in the union
err.usage;

// 4. `raw` is always present as the escape hatch.
expectTypeOf(err.raw).toEqualTypeOf<unknown>();

// 5. The hook receives the full union plus the call context.
expectTypeOf<FacebookErrorHook>().toEqualTypeOf<
  (error: FacebookError, context: FacebookErrorContext) => void
>();

// 6. `source` is a closed literal union — exhaustively switchable.
expectTypeOf<FacebookErrorContext["source"]>().toEqualTypeOf<"request" | "batch">();
