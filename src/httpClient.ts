import axios, { AxiosRequestConfig } from "axios";
import { KeysToCamel, toCamel, toSnakeObj } from "./lib/transformCase.js";
import FormData from "form-data";
import { createBatchableRequest, buildRelativeUrl } from "./internal/batchable.js";
import { BatchableRequest } from "./client.js";

export const api = axios.create({ family: 4 });

const fbApi = axios.create({
  baseURL: "https://graph.facebook.com/v25.0",
  family: 4,
  headers: { "Accept-Encoding": "gzip, deflate, br" },
});

interface HttpResponse<T> {
  data: KeysToCamel<T>;
  status: number;
}

type Data = FormData | Record<string, unknown> | null;

// Extends BatchableRequest with a typed transform chain
interface TransformableRequest<T> extends BatchableRequest<T> {
  transform<U>(fn: (raw: T) => U): BatchableRequest<U>;
}

export interface HttpClient {
  get<T>(
    path: string,
    options: AxiosRequestConfig & { safe: true },
  ): TransformableRequest<HttpResponse<T>>;
  get<T>(path: string, options?: AxiosRequestConfig & { safe?: false }): TransformableRequest<T>;

  post<T>(
    path: string,
    data: Data,
    options: AxiosRequestConfig & { safe: true },
  ): TransformableRequest<HttpResponse<T>>;
  post<T>(
    path: string,
    data: Data,
    options?: AxiosRequestConfig & { safe?: false },
  ): TransformableRequest<T>;

  delete<T>(
    path: string,
    options: AxiosRequestConfig & { safe: true },
  ): TransformableRequest<HttpResponse<T>>;
  delete<T>(path: string, options?: AxiosRequestConfig & { safe?: false }): TransformableRequest<T>;

  getToken(): string;
}

// Wraps a BatchableRequest with a .transform() method
function withTransform<T>(req: BatchableRequest<T>): TransformableRequest<T> {
  (req as TransformableRequest<T>).transform = <U>(fn: (raw: T) => U): BatchableRequest<U> => {
    const mapped = req.then(fn) as Promise<U>;
    return Object.assign(mapped, {
      method: req.method,
      relative_url: req.relative_url,
    }) as BatchableRequest<U>;
  };
  return req as TransformableRequest<T>;
}

export function createHttpClient(accessToken: string): HttpClient {
  return {
    get: (path: string, options?: any) => {
      const params = options?.params ?? {};
      return withTransform(
        createBatchableRequest("GET", buildRelativeUrl(path, params), async () => {
          const res = await fbApi.get(path, {
            params: { access_token: accessToken, ...params },
          });
          const data = toCamel(res.data);
          return options?.safe ? { data, status: res.status } : data;
        }),
      );
    },
    post: (path: string, data: any, options?: any) => {
      return withTransform(
        createBatchableRequest("POST", buildRelativeUrl(path, {}), async () => {
          const isForm = data instanceof FormData;
          const res = await fbApi.post(path, isForm ? data : toSnakeObj(data), {
            headers: isForm ? data.getHeaders() : {},
            ...(options?.safe && { validateStatus: (s: number) => s === 200 || s === 504 }),
            params: { access_token: accessToken },
          });
          const body = toCamel(res.data);
          return options?.safe ? { data: body, status: res.status } : body;
        }),
      );
    },
    delete: (path: string, options?: any) => {
      const params = options?.params ?? {};
      return withTransform(
        createBatchableRequest("DELETE", buildRelativeUrl(path, params), async () => {
          const res = await fbApi.delete(path, {
            params: { access_token: accessToken, ...params },
          });
          const data = toCamel(res.data);
          return options?.safe ? { data, status: res.status } : data;
        }),
      );
    },
    getToken: () => accessToken,
  } as HttpClient;
}
