import { BatchableRequest } from "../client.js";
import { toSnakeCase } from "../lib/transformCase.js";

export function createBatchableRequest<T>(
  method: string,
  relativeUrl: string,
  executor: () => Promise<T>,
  _transform?: (raw: any) => any,
): BatchableRequest<T> {
  const req: any = {
    method,
    relative_url: relativeUrl,
    then(onFulfilled?: any, onRejected?: any) {
      return executor().then(onFulfilled, onRejected);
    },
    catch(onRejected?: any) {
      return executor().then(undefined, onRejected);
    },
    transform<U>(fn: (raw: T) => U): BatchableRequest<U> {
      const prev = _transform;
      return createBatchableRequest<U>(
        method,
        relativeUrl,
        () => executor().then(fn),
        (raw: any) => fn(prev ? prev(raw) : raw),
      );
    },
  };

  if (_transform) req._transform = _transform;

  return req;
}

export function buildRelativeUrl(path: string, params: Record<string, unknown>): string {
  const stripped = path.startsWith("/") ? path.slice(1) : path;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(`${toSnakeCase(key)}=${encodeURIComponent(String(value))}`);
  }

  return parts.length > 0 ? `${stripped}?${parts.join("&")}` : stripped;
}
