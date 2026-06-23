import { type FacebookMedia } from "../types/facebookmedia.js";
import { toCamel } from "../lib/transformCase.js";
import type {
  AppUsage,
  BusinessUseCaseUsage,
  FacebookErrorCategory,
  RateLimitUsage,
  RawFacebookError,
} from "../types/facebookerror.js";

export class FacebookUploadError extends Error {
  constructor(
    message: string,
    public readonly status?: FacebookMedia["status"],
  ) {
    super(message);
    this.name = "FacebookUploadError";
  }
}

// ─── Typed Graph API error model ───
//
// A class-based discriminated union: narrow on `.category`, or use `instanceof`
// (FacebookErrorBase = any SDK error, FacebookGraphError = any error carrying a
// Graph envelope). `code`/`subcode` are kept `number` on purpose — Facebook's
// code space is open-ended and version-volatile (see types/facebookerror.ts).

/** Common base for every error this SDK surfaces (Graph envelope or transport). */
export abstract class FacebookErrorBase extends Error {
  abstract readonly category: FacebookErrorCategory;
  /** Unprocessed payload behind this error — the escape hatch when the typed surface is too narrow. */
  abstract readonly raw: unknown;
  /** HTTP status that carried the error (`0` when there was no response). */
  readonly httpStatus: number;
  /** `true` when an immediate retry of the same request is likely to succeed. */
  readonly isTransient: boolean;

  constructor(message: string, httpStatus: number, isTransient: boolean) {
    super(message);
    this.name = new.target.name;
    this.httpStatus = httpStatus;
    this.isTransient = isTransient;
  }
}

interface GraphErrorInit {
  message: string;
  type: string;
  code: number;
  subcode: number | undefined;
  traceId: string | undefined;
  userTitle: string | undefined;
  userMessage: string | undefined;
  isTransient: boolean;
  httpStatus: number;
  raw: RawFacebookError;
}

/** Base for any error that arrived with a Graph API error envelope. */
export abstract class FacebookGraphError extends FacebookErrorBase {
  readonly raw: RawFacebookError;
  /** Primary Facebook error code. Open-ended — compare against {@link FacebookErrorCode}. */
  readonly code: number;
  /** Facebook `type` string (e.g. `"OAuthException"`). Not a reliable discriminant. */
  readonly type: string;
  /** Facebook `error_subcode`, when present. Compare against {@link FacebookAuthSubcode} etc. */
  readonly subcode?: number;
  /** `fbtrace_id` — include when reporting to Meta. */
  readonly traceId?: string;
  /** End-user-safe dialog title, when Facebook provided one. */
  readonly userTitle?: string;
  /** End-user-safe message, when Facebook provided one. */
  readonly userMessage?: string;

  constructor(init: GraphErrorInit) {
    super(init.message, init.httpStatus, init.isTransient);
    this.raw = init.raw;
    this.code = init.code;
    this.type = init.type;
    if (init.subcode !== undefined) this.subcode = init.subcode;
    if (init.traceId !== undefined) this.traceId = init.traceId;
    if (init.userTitle !== undefined) this.userTitle = init.userTitle;
    if (init.userMessage !== undefined) this.userMessage = init.userMessage;
  }
}

/** Access-token problem (190, 102): expired/revoked/invalid. Re-authenticate; do not retry. */
export class FacebookAuthError extends FacebookGraphError {
  readonly category = "auth" as const;
}

/** Missing/removed permission or insufficient Page role (10, 3, 200–299, 190+492). */
export class FacebookPermissionError extends FacebookGraphError {
  readonly category = "permission" as const;
}

/** Temporary integrity/policy block (368). Retryable after a wait. */
export class FacebookPolicyBlockError extends FacebookGraphError {
  readonly category = "policy_block" as const;
}

/** Throttled (4, 17, 32, 341, 613, 80000–80014). Stop, honor usage headers, back off. */
export class FacebookRateLimitError extends FacebookGraphError {
  readonly category = "rate_limit" as const;
  /** Throttling telemetry from rate-limit headers, when available (direct requests only). */
  readonly usage?: RateLimitUsage;

  constructor(init: GraphErrorInit & { usage: RateLimitUsage | undefined }) {
    super(init);
    if (init.usage !== undefined) this.usage = init.usage;
  }
}

/** Bad request, params, or object (100, 324, 379, 506, 803, 1609005, GraphMethodException). Not retryable as-is. */
export class FacebookInvalidParamError extends FacebookGraphError {
  readonly category = "invalid_param" as const;
}

/** Temporary server-side failure (1, 2, or `is_transient`/5xx). Immediate retry likely succeeds. */
export class FacebookTransientError extends FacebookGraphError {
  readonly category = "transient" as const;
}

/** A Graph error envelope this SDK did not recognize. Inspect `code`/`raw`. */
export class FacebookUnknownError extends FacebookGraphError {
  readonly category = "unknown" as const;
}

/** No Graph envelope: network/DNS/socket failure, timeout, batch sub-request timeout, or non-JSON body. */
export class FacebookNetworkError extends FacebookErrorBase {
  readonly category = "network" as const;
  readonly raw: unknown;

  constructor(cause: unknown, httpStatus = 0) {
    super(cause instanceof Error ? cause.message : "Network or transport error", httpStatus, true);
    this.raw = cause;
    this.cause = cause;
  }
}

/** Errors that arrived with a Graph API envelope (everything except {@link FacebookNetworkError}). */
export type FacebookGraphErrorUnion =
  | FacebookAuthError
  | FacebookPermissionError
  | FacebookPolicyBlockError
  | FacebookRateLimitError
  | FacebookInvalidParamError
  | FacebookTransientError
  | FacebookUnknownError;

/** Every error this SDK reports to an {@link FacebookErrorHook}. Narrow on `.category`. */
export type FacebookError = FacebookGraphErrorUnion | FacebookNetworkError;

/**
 * Hook invoked after a response is received but before it is returned/thrown,
 * whenever an error is detected — for direct requests AND individual batch
 * sub-responses. Purely observational: it does not change what the SDK
 * throws/returns, and a handler that throws (or rejects) is ignored so it can
 * never mask the underlying error.
 */
export type FacebookErrorHook = (error: FacebookError) => void;

/** Named constants for the curated, documented `code` values. `code` itself stays `number`. */
export const FacebookErrorCode = {
  UNKNOWN: 1,
  SERVICE: 2,
  METHOD: 3,
  TOO_MANY_CALLS: 4,
  PERMISSION_DENIED: 10,
  USER_TOO_MANY_CALLS: 17,
  PAGE_RATE_LIMIT: 32,
  INVALID_PARAM: 100,
  SESSION: 102,
  ACCESS_TOKEN: 190,
  APP_ACTION_LIMIT: 341,
  POLICY_BLOCK: 368,
  DUPLICATE_POST: 506,
  CUSTOM_RATE_LIMIT: 613,
  LINK_SCRAPE: 1609005,
} as const;

/** Documented `error_subcode` values under code 190 (`ACCESS_TOKEN`). */
export const FacebookAuthSubcode = {
  APP_NOT_INSTALLED: 458,
  USER_CHECKPOINTED: 459,
  PASSWORD_CHANGED: 460,
  EXPIRED: 463,
  UNCONFIRMED_USER: 464,
  INVALID_ACCESS_TOKEN: 467,
  /** User behind the Page token lacks an appropriate Page role — a permission case, not auth. */
  INVALID_PAGE_ROLE: 492,
} as const;

// ─── Detection & construction ───

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const numberField = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const stringField = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Extracts the `error` object from a (camelized) payload, or `null` when it isn't a Graph error. */
function extractEnvelope(payload: unknown): Record<string, unknown> | null {
  if (!isObject(payload)) return null;
  const err = payload["error"];
  if (!isObject(err)) return null;
  // A real envelope always carries a numeric code; require code or message to avoid false positives.
  if (typeof err["code"] !== "number" && typeof err["message"] !== "string") return null;
  return err;
}

/**
 * Maps a `(code, subcode, isTransient, type)` tuple to a category via Facebook's
 * documented precedence (transient → rate_limit → page-role → auth → permission
 * → policy → invalid_param → soft OAuth fallback → unknown). `type` is used only
 * as a last-resort hint because OAuthException is overloaded.
 */
function classify(
  code: number,
  subcode: number | undefined,
  isTransient: boolean,
  type: string,
): Exclude<FacebookErrorCategory, "network"> {
  if (isTransient) return "transient";
  if (code === 1 || code === 2) return "transient";
  if (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 341 ||
    code === 613 ||
    (code >= 80000 && code <= 80014)
  ) {
    return "rate_limit";
  }
  if (code === 190 && subcode === 492) return "permission";
  if (code === 190 || code === 102) return "auth";
  if (code === 3 || code === 10 || (code >= 200 && code <= 299)) return "permission";
  if (code === 368) return "policy_block";
  if (
    code === 100 ||
    code === 324 ||
    code === 379 ||
    code === 506 ||
    code === 803 ||
    code === 1609005 ||
    type === "GraphMethodException"
  ) {
    return "invalid_param";
  }
  if (type === "OAuthException") return "auth";
  return "unknown";
}

function parseJsonHeader(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort parse of rate-limit usage headers into camelized telemetry. Never throws. */
function parseUsageHeaders(headers: unknown): RateLimitUsage | undefined {
  if (!isObject(headers)) return undefined;
  const usage: RateLimitUsage = {};
  const app = parseJsonHeader(headers["x-app-usage"]);
  if (app) usage.appUsage = toCamel(app) as AppUsage;
  const buc = parseJsonHeader(headers["x-business-use-case-usage"]);
  if (buc) usage.businessUseCaseUsage = toCamel(buc) as Record<string, BusinessUseCaseUsage[]>;
  if (usage.appUsage === undefined && usage.businessUseCaseUsage === undefined) return undefined;
  return usage;
}

/**
 * Builds a strictly-typed Graph error from a (already key-camelized) response
 * payload, or returns `null` when the payload carries no error envelope.
 *
 * @param headers - response headers; only read to enrich rate-limit errors.
 */
export function toFacebookError(
  payload: unknown,
  httpStatus: number,
  headers?: unknown,
): FacebookGraphErrorUnion | null {
  const env = extractEnvelope(payload);
  if (!env) return null;

  const code = numberField(env["code"]) ?? 0;
  const subcode = numberField(env["errorSubcode"]);
  const type = stringField(env["type"]) ?? "";
  const isTransient = env["isTransient"] === true || code === 1 || code === 2 || httpStatus >= 500;

  const init: GraphErrorInit = {
    code,
    subcode,
    type,
    message: stringField(env["message"]) ?? "Unknown Facebook error",
    traceId: stringField(env["fbtraceId"]),
    userTitle: stringField(env["errorUserTitle"]),
    userMessage: stringField(env["errorUserMsg"]),
    isTransient,
    httpStatus,
    raw: env as RawFacebookError,
  };

  switch (classify(code, subcode, isTransient, type)) {
    case "auth":
      return new FacebookAuthError(init);
    case "permission":
      return new FacebookPermissionError(init);
    case "policy_block":
      return new FacebookPolicyBlockError(init);
    case "rate_limit":
      return new FacebookRateLimitError({ ...init, usage: parseUsageHeaders(headers) });
    case "invalid_param":
      return new FacebookInvalidParamError(init);
    case "transient":
      return new FacebookTransientError(init);
    case "unknown":
      return new FacebookUnknownError(init);
  }
}

/** Wraps a transport-level failure (no Graph envelope) as a {@link FacebookNetworkError}. */
export function toNetworkError(cause: unknown, httpStatus = 0): FacebookNetworkError {
  return new FacebookNetworkError(cause, httpStatus);
}

/** Invokes an error hook defensively: a throwing or rejecting handler is swallowed. */
export function invokeErrorHook(hook: FacebookErrorHook, error: FacebookError): void {
  try {
    const result = hook(error) as unknown;
    if (isObject(result) && typeof result["then"] === "function") {
      (result as unknown as PromiseLike<unknown>).then(undefined, () => {});
    }
  } catch {
    // A buggy onError handler must never mask the underlying API error.
  }
}

// Retry/backoff is intentionally NOT implemented here — the current direction is
// to leave retries to the caller (see README → Contributing). The typed errors
// above expose what a retry layer needs: `category` (rate_limit/transient/
// policy_block are retryable), `isTransient`, and FacebookRateLimitError.usage.
