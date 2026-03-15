import FormData from "form-data";
import type { HttpClient } from "../httpClient.js";
import type { BatchSubRequest, BatchSubResponse } from "../types/shared.js";

export interface BatchRequestOptions {
  includeHeaders?: boolean;
}

export interface BatchResult<T> {
  successes: { index: number; data: any; original: T }[];
  failures: { index: number; code: number; original: T }[];
}

export type FBatch = <T>(
  data: T[],
  mapper: (data: T) => BatchSubRequest,
  options?: BatchRequestOptions,
) => Promise<BatchResult<T>>;

export function createBatchResource(http: HttpClient) {
  const batch: FBatch = async (data, mapper, options) => {
    const allResponses: { response: BatchSubResponse; original: (typeof data)[number] }[] = [];
    const includeHeaders = options?.includeHeaders ?? false;

    for (let i = 0; i < data.length; i += 50) {
      const chunk = data.slice(i, i + 50);
      const form = new FormData();
      form.append("batch", JSON.stringify(chunk.map(mapper)));
      form.append("include_headers", includeHeaders ? "true" : "false");

      const responses = await http.post<BatchSubResponse[]>("/", form);
      const responseArray = Array.isArray(responses) ? responses : [];

      responseArray.forEach((response, j) => {
        allResponses.push({ response, original: chunk[j]! });
      });
    }

    const successes: BatchResult<any>["successes"] = [];
    const failures: BatchResult<any>["failures"] = [];

    allResponses.forEach(({ response, original }, index) => {
      if (response.code === 200) {
        const parsed = JSON.parse(response.body);
        successes.push({
          index,
          data: parsed,
          original,
        });
      } else {
        failures.push({ index, code: response.code, original });
      }
    });

    return { successes, failures };
  };

  return batch;
}
