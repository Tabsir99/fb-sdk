import type { BatchableRequest } from "../client.js";
import { toSnakeCase } from "../lib/transformCase.js";

/**
 * Build a {@link BatchableRequest}: await it to run `executor`, or collect it into a Graph batch; `.transform()` maps the resolved value.
 * @remarks Single-flight — `executor` runs at most once however many times it's awaited; `.transform()` children share the parent's in-flight call.
 */
export function createBatchableRequest<T>(
  method: string,
  relativeUrl: string,
  executor: () => Promise<T>,
  _transform?: (raw: any) => any,
  body?: string,
): BatchableRequest<T> {
  let inflight: Promise<T> | undefined;
  const run = () => (inflight ??= executor());

  const req: any = {
    method,
    relative_url: relativeUrl,
    then(onFulfilled?: any, onRejected?: any) {
      return run().then(onFulfilled, onRejected);
    },
    catch(onRejected?: any) {
      return run().then(undefined, onRejected);
    },
    transform<U>(fn: (raw: T) => U): BatchableRequest<U> {
      const prev = _transform;
      return createBatchableRequest<U>(
        method,
        relativeUrl,
        () => run().then(fn),
        (raw: any) => fn(prev ? prev(raw) : raw),
        body,
      );
    },
  };

  if (_transform) req._transform = _transform;
  if (body !== undefined) req.body = body;

  return req;
}

/** Build a Graph relative URL (`path?snake_key=encoded&...`), skipping undefined params. */
export function buildRelativeUrl(path: string, params: Record<string, unknown>): string {
  const stripped = path.startsWith("/") ? path.slice(1) : path;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(`${toSnakeCase(key)}=${encodeURIComponent(String(value))}`);
  }

  return parts.length > 0 ? `${stripped}?${parts.join("&")}` : stripped;
}

/**
 * Serializes a (already snake_cased) JSON body into the urlencoded string
 * Facebook's batch API expects in a sub-request's `body` field.
 * Object/array values are JSON-encoded, matching Graph API conventions.
 */
export function toUrlEncodedBody(obj: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    params.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return params.toString();
}
