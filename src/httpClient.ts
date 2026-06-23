import axios, { isAxiosError, type AxiosRequestConfig } from "axios";
import { toCamel, toSnakeObj } from "./lib/transformCase.js";
import FormData from "form-data";
import { createBatchableRequest, buildRelativeUrl, toUrlEncodedBody } from "./internal/batchable.js";
import { type BatchableRequest } from "./client.js";
import {
  toFacebookError,
  toNetworkError,
  invokeErrorHook,
  type FacebookErrorHook,
} from "./internal/error.js";

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

export interface CreateHttpClientOptions {
  /** Invoked with a strictly-typed error whenever a request fails or returns an error body. */
  onError?: FacebookErrorHook | undefined;
}

// A thrown failure: prefer the Graph envelope on the response, else treat it as transport-level.
function reportThrownError(error: unknown, onError: FacebookErrorHook): void {
  if (isAxiosError(error) && error.response) {
    const fbError = toFacebookError(error.response.data, error.response.status, error.response.headers);
    invokeErrorHook(onError, fbError ?? toNetworkError(error, error.response.status));
  } else {
    invokeErrorHook(onError, toNetworkError(error));
  }
}

// A 2xx body that nonetheless carries an `error` envelope (some endpoints do this).
function reportResponseError(data: unknown, status: number, onError: FacebookErrorHook): void {
  const fbError = toFacebookError(data, status);
  if (fbError) invokeErrorHook(onError, fbError);
}

export function createHttpClient(
  accessToken: string,
  options?: CreateHttpClientOptions,
): HttpClient {
  const onError = options?.onError;

  return {
    get: (path, reqOptions) => {
      const params = reqOptions?.params ?? {};
      return createBatchableRequest("GET", buildRelativeUrl(path, params), async () => {
        try {
          // reqOptions is spread FIRST so the merged params (with access_token) always win.
          const res = await fbApi.get(path, {
            ...reqOptions,
            params: { access_token: accessToken, ...params },
          });
          if (onError) reportResponseError(res.data, res.status, onError);
          return res.data;
        } catch (error) {
          if (onError) reportThrownError(error, onError);
          throw error;
        }
      });
    },
    post: (path, data, reqOptions) => {
      const params = reqOptions?.params ?? {};
      const isForm = data instanceof FormData;
      // Captured at construction so the request carries its body into sdk.batch([...]).
      // FormData bodies (media uploads) cannot be embedded in a batch.
      const body =
        !isForm && data ? toUrlEncodedBody(toSnakeObj(data) as Record<string, unknown>) : undefined;

      return createBatchableRequest(
        "POST",
        buildRelativeUrl(path, params),
        async () => {
          try {
            const res = await fbApi.post(path, isForm ? data : toSnakeObj(data), {
              ...reqOptions,
              headers: { ...reqOptions?.headers, ...(isForm ? data.getHeaders() : {}) },
              params: { access_token: accessToken, ...params },
            });
            if (onError) reportResponseError(res.data, res.status, onError);
            return res.data;
          } catch (error) {
            if (onError) reportThrownError(error, onError);
            throw error;
          }
        },
        undefined,
        body,
      );
    },
    delete: (path, reqOptions) => {
      const params = reqOptions?.params ?? {};
      return createBatchableRequest("DELETE", buildRelativeUrl(path, params), async () => {
        try {
          const res = await fbApi.delete(path, {
            ...reqOptions,
            params: { access_token: accessToken, ...params },
          });
          if (onError) reportResponseError(res.data, res.status, onError);
          return res.data;
        } catch (error) {
          if (onError) reportThrownError(error, onError);
          throw error;
        }
      });
    },
    getToken: () => accessToken,
  };
}
