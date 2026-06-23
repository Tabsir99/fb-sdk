/**
 * Strictly-typed model of Facebook Graph API (v25.0) errors.
 *
 * Facebook does NOT publish an exhaustive, versioned enum of error codes — the
 * "Handle Errors" guide lists only a curated subset and high-numbered subcodes
 * are effectively open-ended. So `code`/`subcode` stay `number` and the typed
 * surface is the discriminated `category` (always with an `"unknown"` arm),
 * derived from `code`/`error_subcode` — never from `type` (OAuthException is
 * reused across auth, rate-limit, and invalid-param errors).
 *
 * @see https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */

/** Discriminant tag for the {@link FacebookError} union. */
export type FacebookErrorCategory =
  | "auth" // token expired/revoked/invalid — re-authenticate; not retryable
  | "permission" // missing/removed permission or Page role — not retryable
  | "policy_block" // integrity/abuse block (code 368) — retryable after a wait
  | "rate_limit" // throttled — stop, honor usage headers, back off
  | "invalid_param" // bad request/params/object — fix the call; not retryable
  | "transient" // temporary server-side error — immediate retry likely succeeds
  | "unknown" // a Graph error envelope we could not classify
  | "network"; // no Graph envelope: timeout, DNS, socket, non-JSON proxy body

/**
 * The Graph API error envelope, as surfaced by this SDK — i.e. with KEYS
 * camelized (the SDK camelizes every response). Only `message`/`type`/`code`/
 * `fbtraceId` are guaranteed present on a real error; everything else is
 * optional. The index signature is the escape hatch: undocumented fields
 * Facebook may add are preserved and reachable via `raw["some_field"]`.
 */
export interface RawFacebookError {
  /** Human-readable description. NOT safe for end-user display — see {@link RawFacebookError.errorUserMsg}. */
  message: string;
  /** Classification string, e.g. `"OAuthException"`, `"GraphMethodException"`. */
  type: string;
  /** Primary numeric error identifier. */
  code: number;
  /** Refines `code` for some errors (e.g. 460 = password changed under code 190). */
  errorSubcode?: number;
  /** Title of the dialog to show the user, when present. Safe to display. */
  errorUserTitle?: string;
  /** The only message Facebook sanctions for end-user display, when present. */
  errorUserMsg?: string;
  /** Internal support identifier; include when reporting issues to Meta. */
  fbtraceId?: string;
  /** When `true`, an immediate retry of the same request is likely to succeed. */
  isTransient?: boolean;
  /** Error-specific structured data (e.g. checkpoint URLs); shape varies. */
  errorData?: unknown;
  /** Escape hatch for fields not modeled above. */
  [key: string]: unknown;
}

/** Parsed `X-App-Usage` header (platform/app-level throttling, % of a rolling 1h window). */
export interface AppUsage {
  callCount?: number;
  totalCputime?: number;
  totalTime?: number;
}

/** One entry of the `X-Business-Use-Case-Usage` header (per business id, per BUC type). */
export interface BusinessUseCaseUsage {
  type?: string;
  callCount?: number;
  totalCputime?: number;
  totalTime?: number;
  /** Minutes until throttling ends (`0` when not throttled) — prefer this over blind backoff. */
  estimatedTimeToRegainAccess?: number;
  adsApiAccessTier?: string;
}

/**
 * Throttling telemetry parsed from rate-limit response headers, when present.
 * Only populated on direct (non-batch) requests, where response headers are
 * available. Either field may be absent depending on the token/endpoint.
 */
export interface RateLimitUsage {
  appUsage?: AppUsage;
  businessUseCaseUsage?: Record<string, BusinessUseCaseUsage[]>;
}

/**
 * Identifies the call that produced an error — the second argument to an
 * error hook. Tells you *which* request failed (the error itself only says
 * *what* went wrong).
 */
export interface FacebookErrorContext {
  /** HTTP method of the failing call (`"GET"`, `"POST"`, `"DELETE"`). */
  method: string;
  /** Relative URL (path + query) of the failing call — the value embedded in a batch sub-request. */
  relativeUrl: string;
  /**
   * The access token the failing call used. For multi-page apps this is the
   * unique key to the page/channel the request belongs to — e.g. to mark that
   * channel revoked on an `auth` error. (It's also on the thrown AxiosError's
   * `config.params`; surfaced here for convenience.)
   */
  accessToken: string;
  /** Whether the failure came from a direct request or a batch sub-response. */
  source: "request" | "batch";
}
