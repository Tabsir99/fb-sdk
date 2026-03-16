import FormData from "form-data";
import type { HttpClient } from "../httpClient.js";
import type { BatchableRequest, BatchSubRequest, BatchSubResponse } from "../types/shared.js";
import { toCamel } from "../lib/transformCase.js";

export interface BatchRequestOptions {
  includeHeaders?: boolean;
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

export function createBatchResource(http: HttpClient) {
  const batch = async <const T extends readonly BatchSubRequest[]>(
    requests: T,
    options?: BatchRequestOptions,
  ): Promise<BatchResponses<T>> => {
    const finalResponses: any[] = [];
    const includeHeaders = options?.includeHeaders ?? false;

    for (let i = 0; i < requests.length; i += 50) {
      const chunk = requests.slice(i, i + 50);
      const form = new FormData();

      form.append("batch", JSON.stringify(chunk));
      form.append("include_headers", includeHeaders ? "true" : "false");

      const responses = await http.post<BatchSubResponse[]>("/", form);

      for (let idx = 0; idx < responses.length; idx++) {
        finalResponses.push(processResponse(chunk[idx]!, responses[idx]!));
      }
    }

    return finalResponses as BatchResponses<T>;
  };

  return batch;
}
