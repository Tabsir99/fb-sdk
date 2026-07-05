import axios, { isAxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";
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
import type { FacebookErrorContext } from "./types/facebookerror.js";

const DEFAULT_TIMEOUT_MS = 60_000;

/** Bare axios instance (IPv4, default timeout); not bound to a Graph host. */
export const api = axios.create({ family: 4, timeout: DEFAULT_TIMEOUT_MS });

/**
 * Graph hosts the SDK talks to. Facebook is the default (Facebook Graph API);
 * Instagram is used by the standalone Instagram SDK (Instagram API with Instagram
 * Login). Same request/response shape — only the base URL and token differ.
 */
export const GRAPH_HOSTS = {
  facebook: "https://graph.facebook.com/v25.0",
  instagram: "https://graph.instagram.com/v25.0",
} as const;

/** Which Graph host to target — a key of {@link GRAPH_HOSTS}. */
export type GraphHost = keyof typeof GRAPH_HOSTS;

// One axios instance per base URL, created lazily and reused for connection keep-alive.
const graphApiCache = new Map<string, AxiosInstance>();

function getGraphApi(baseURL: string): AxiosInstance {
  const cached = graphApiCache.get(baseURL);
  if (cached) return cached;
  const instance = axios.create({
    baseURL,
    family: 4,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: { "Accept-Encoding": "gzip, deflate, br" },
    // Camelize JSON response keys; non-JSON bodies (proxy HTML, empty) pass through raw so real errors aren't masked as SyntaxError.
    transformResponse: (data: unknown) => {
      if (typeof data !== "string" || data.length === 0) return data;
      try {
        return toCamel(JSON.parse(data));
      } catch {
        return data;
      }
    },
  });
  graphApiCache.set(baseURL, instance);
  return instance;
}

type Data = FormData | Record<string, unknown> | null;

/** Token-scoped Graph HTTP client. Each verb returns a {@link BatchableRequest}: await it, or pass it to `sdk.batch`. */
export interface HttpClient {
  get<T>(path: string, options?: AxiosRequestConfig): BatchableRequest<T>;
  post<T>(path: string, data: Data, options?: AxiosRequestConfig): BatchableRequest<T>;
  delete<T>(path: string, options?: AxiosRequestConfig): BatchableRequest<T>;
  getToken(): string;
}

/** Options for {@link createHttpClient}. */
export interface CreateHttpClientOptions {
  /** Invoked with a strictly-typed error whenever a request fails or returns an error body. */
  onError?: FacebookErrorHook | undefined;
  /** Which Graph host to target. Defaults to `"facebook"`. */
  host?: GraphHost | undefined;
}

// A thrown failure: prefer the Graph envelope on the response, else treat it as transport-level.
function reportThrownError(
  error: unknown,
  onError: FacebookErrorHook,
  method: string,
  relativeUrl: string,
  accessToken: string,
): void {
  const context: FacebookErrorContext = { method, relativeUrl, accessToken, source: "request" };
  if (isAxiosError(error) && error.response) {
    const fbError = toFacebookError(error.response.data, error.response.status, error.response.headers);
    invokeErrorHook(onError, fbError ?? toNetworkError(error, error.response.status), context);
  } else {
    invokeErrorHook(onError, toNetworkError(error), context);
  }
}

// A 2xx body that nonetheless carries an `error` envelope (some endpoints do this).
function reportResponseError(
  data: unknown,
  status: number,
  onError: FacebookErrorHook,
  method: string,
  relativeUrl: string,
  accessToken: string,
): void {
  const fbError = toFacebookError(data, status);
  if (fbError) invokeErrorHook(onError, fbError, { method, relativeUrl, accessToken, source: "request" });
}

/** Create a token-scoped {@link HttpClient} for the given Graph host (default `facebook`). */
export function createHttpClient(
  accessToken: string,
  options?: CreateHttpClientOptions,
): HttpClient {
  const onError = options?.onError;
  const graphApi = getGraphApi(GRAPH_HOSTS[options?.host ?? "facebook"]);

  return {
    get: (path, reqOptions) => {
      const params = reqOptions?.params ?? {};
      const relativeUrl = buildRelativeUrl(path, params);
      return createBatchableRequest("GET", relativeUrl, async () => {
        try {
          // reqOptions is spread FIRST so the merged params (with access_token) always win.
          const res = await graphApi.get(path, {
            ...reqOptions,
            params: { access_token: accessToken, ...params },
          });
          if (onError) reportResponseError(res.data, res.status, onError, "GET", relativeUrl, accessToken);
          return res.data;
        } catch (error) {
          if (onError) reportThrownError(error, onError, "GET", relativeUrl, accessToken);
          throw error;
        }
      });
    },
    post: (path, data, reqOptions) => {
      const params = reqOptions?.params ?? {};
      const relativeUrl = buildRelativeUrl(path, params);
      const isForm = data instanceof FormData;
      // Captured at construction so the body travels into sdk.batch([...]); FormData (media uploads) can't be embedded in a batch.
      const body =
        !isForm && data ? toUrlEncodedBody(toSnakeObj(data) as Record<string, unknown>) : undefined;

      return createBatchableRequest(
        "POST",
        relativeUrl,
        async () => {
          try {
            const res = await graphApi.post(path, isForm ? data : toSnakeObj(data), {
              ...reqOptions,
              headers: { ...reqOptions?.headers, ...(isForm ? data.getHeaders() : {}) },
              params: { access_token: accessToken, ...params },
            });
            if (onError) reportResponseError(res.data, res.status, onError, "POST", relativeUrl, accessToken);
            return res.data;
          } catch (error) {
            if (onError) reportThrownError(error, onError, "POST", relativeUrl, accessToken);
            throw error;
          }
        },
        undefined,
        body,
      );
    },
    delete: (path, reqOptions) => {
      const params = reqOptions?.params ?? {};
      const relativeUrl = buildRelativeUrl(path, params);
      return createBatchableRequest("DELETE", relativeUrl, async () => {
        try {
          const res = await graphApi.delete(path, {
            ...reqOptions,
            params: { access_token: accessToken, ...params },
          });
          if (onError) reportResponseError(res.data, res.status, onError, "DELETE", relativeUrl, accessToken);
          return res.data;
        } catch (error) {
          if (onError) reportThrownError(error, onError, "DELETE", relativeUrl, accessToken);
          throw error;
        }
      });
    },
    getToken: () => accessToken,
  };
}
