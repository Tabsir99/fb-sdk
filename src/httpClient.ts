import axios, { type AxiosRequestConfig } from "axios";
import { toCamel, toSnakeObj } from "./lib/transformCase.js";
import FormData from "form-data";
import { createBatchableRequest, buildRelativeUrl, toUrlEncodedBody } from "./internal/batchable.js";
import { type BatchableRequest } from "./client.js";

const DEFAULT_TIMEOUT_MS = 60_000;

export const api = axios.create({ family: 4, timeout: DEFAULT_TIMEOUT_MS });

const fbApi = axios.create({
  baseURL: "https://graph.facebook.com/v25.0",
  family: 4,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { "Accept-Encoding": "gzip, deflate, br" },
  // Camelizes KEYS of every JSON response. Non-JSON bodies (proxy HTML, empty
  // responses) pass through raw instead of masking the real error with a SyntaxError.
  transformResponse: (data: unknown) => {
    if (typeof data !== "string" || data.length === 0) return data;
    try {
      return toCamel(JSON.parse(data));
    } catch {
      return data;
    }
  },
});

type Data = FormData | Record<string, unknown> | null;

export interface HttpClient {
  get<T>(path: string, options?: AxiosRequestConfig): BatchableRequest<T>;
  post<T>(path: string, data: Data, options?: AxiosRequestConfig): BatchableRequest<T>;
  delete<T>(path: string, options?: AxiosRequestConfig): BatchableRequest<T>;
  getToken(): string;
}

export function createHttpClient(accessToken: string): HttpClient {
  return {
    get: (path, options) => {
      const params = options?.params ?? {};
      return createBatchableRequest("GET", buildRelativeUrl(path, params), async () => {
        // options is spread FIRST so the merged params (with access_token) always win.
        const res = await fbApi.get(path, {
          ...options,
          params: { access_token: accessToken, ...params },
        });
        return res.data;
      });
    },
    post: (path, data, options) => {
      const params = options?.params ?? {};
      const isForm = data instanceof FormData;
      // Captured at construction so the request carries its body into sdk.batch([...]).
      // FormData bodies (media uploads) cannot be embedded in a batch.
      const body =
        !isForm && data ? toUrlEncodedBody(toSnakeObj(data) as Record<string, unknown>) : undefined;

      return createBatchableRequest(
        "POST",
        buildRelativeUrl(path, params),
        async () => {
          const res = await fbApi.post(path, isForm ? data : toSnakeObj(data), {
            ...options,
            headers: { ...options?.headers, ...(isForm ? data.getHeaders() : {}) },
            params: { access_token: accessToken, ...params },
          });
          return res.data;
        },
        undefined,
        body,
      );
    },
    delete: (path, options) => {
      const params = options?.params ?? {};
      return createBatchableRequest("DELETE", buildRelativeUrl(path, params), async () => {
        const res = await fbApi.delete(path, {
          ...options,
          params: { access_token: accessToken, ...params },
        });
        return res.data;
      });
    },
    getToken: () => accessToken,
  };
}
