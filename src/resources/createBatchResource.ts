import FormData from "form-data";
import type { HttpClient } from "../httpClient.js";
import type { BatchableRequest, BatchSubRequest, BatchSubResponse } from "../types/shared.js";
import { toCamel } from "../lib/transformCase.js";
import {
  toFacebookError,
  toNetworkError,
  invokeErrorHook,
  type FacebookError,
  type FacebookErrorHook,
} from "../internal/error.js";

/** Per-call options for the batch executor. */
export interface BatchRequestOptions {
  includeHeaders?: boolean;
}

/** Options for creating the batch resource. */
export interface CreateBatchResourceOptions {
  /** Invoked with a strictly-typed error for each failed batch sub-response. */
  onError?: FacebookErrorHook | undefined;
}

/**
 * Reports a failed batch sub-response through the error hook. The outer batch
 * call succeeds with HTTP 200 even when a sub-request fails; the failure lives
 * in the sub-response's stringified `body` (or non-JSON on transport failure).
 */
function reportSubResponseError(
  req: BatchSubRequest,
  res: BatchSubResponse,
  onError: FacebookErrorHook,
  accessToken: string,
): void {
  let fbError: FacebookError | null = null;
  if (res.body) {
    try {
      fbError = toFacebookError(toCamel(JSON.parse(res.body)), res.code);
    } catch {
      // Body wasn't JSON — fall through to a transport-level error below.
    }
  }
  invokeErrorHook(
    onError,
    fbError ?? toNetworkError(new Error(`Batch sub-request failed with status ${res.code}`), res.code),
    { method: req.method, relativeUrl: req.relative_url, accessToken, source: "batch" },
  );
}

type BatchResponses<T extends readonly BatchSubRequest[]> = {
  -readonly [K in keyof T]: T[K] extends BatchableRequest<infer R>
    ? { status: number; data: R }
    : { status: number; data: any };
};

const processResponse = (req: BatchSubRequest, res: BatchSubResponse) => {
  if (res.code === 200) {
    const parsed = toCamel(JSON.parse(res.body));
    const data = req._transform ? req._transform(parsed) : parsed;
    return { status: 200, data };
  }
  return { status: res.code, data: res.body };
};

/** Creates the batch executor: sends many Graph requests in a single HTTP call. */
export function createBatchResource(http: HttpClient, options?: CreateBatchResourceOptions) {
  const onError = options?.onError;
  // All sub-requests in a batch share the client's token (the batch's access_token).
  const accessToken = onError ? http.getToken() : "";

  /** Runs the requests in chunks of 50; resolves to ordered `{ status, data }` results. */
  const batch = async <const T extends readonly BatchSubRequest[]>(
    requests: T,
    batchOptions?: BatchRequestOptions,
  ): Promise<BatchResponses<T>> => {
    const finalResponses: any[] = [];
    const includeHeaders = batchOptions?.includeHeaders ?? false;

    for (let i = 0; i < requests.length; i += 50) {
      const chunk = requests.slice(i, i + 50);
      const form = new FormData();

      form.append("batch", JSON.stringify(chunk));
      form.append("include_headers", includeHeaders ? "true" : "false");

      const responses = await http.post<(BatchSubResponse | null)[]>("/", form);

      for (let idx = 0; idx < chunk.length; idx++) {
        const req = chunk[idx]!;
        const res = responses[idx];
        if (!res) {
          // Facebook returns null for sub-requests that timed out within the batch.
          if (onError) {
            invokeErrorHook(
              onError,
              toNetworkError(new Error("Batch sub-request did not complete (timed out)")),
              { method: req.method, relativeUrl: req.relative_url, accessToken, source: "batch" },
            );
          }
          finalResponses.push({ status: 0, data: null });
          continue;
        }
        if (onError && res.code >= 400) reportSubResponseError(req, res, onError, accessToken);
        finalResponses.push(processResponse(req, res));
      }
    }

    return finalResponses as BatchResponses<T>;
  };

  return batch;
}
