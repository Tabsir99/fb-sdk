import { BatchableRequest } from "../client.js";
import { toSnakeCase } from "../lib/transformCase.js";

export function createBatchableRequest<T, R = T>(
  method: string,
  relativeUrl: string,
  executor: () => Promise<T>,
  transform?: (raw: T) => R,
): BatchableRequest<R> {
  return {
    method,
    relative_url: relativeUrl,
    _transform: transform as any,
    then(onFulfilled, onRejected) {
      const promise = transform ? executor().then(transform) : executor();
      return (promise as any).then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      const promise = transform ? executor().then(transform) : executor();
      return (promise as any).then(undefined, onRejected);
    },
  };
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
