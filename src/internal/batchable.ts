import { BatchableRequest } from "../client.js";
import { toSnakeCase } from "../lib/transformCase.js";

export function createBatchableRequest<T>(
  method: string,
  relativeUrl: string,
  executor: () => Promise<T>,
): BatchableRequest<T> {
  return {
    method,
    relative_url: relativeUrl,
    then(onFulfilled, onRejected) {
      return executor().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return executor().then(undefined, onRejected);
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
