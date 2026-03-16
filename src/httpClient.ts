import axios, { AxiosRequestConfig } from "axios";
import { toCamel, toSnakeObj } from "./lib/transformCase.js";
import FormData from "form-data";
import { createBatchableRequest, buildRelativeUrl } from "./internal/batchable.js";
import { BatchableRequest } from "./client.js";

export const api = axios.create({ family: 4 });

const fbApi = axios.create({
  baseURL: "https://graph.facebook.com/v25.0",
  family: 4,
  headers: { "Accept-Encoding": "gzip, deflate, br" },
  transformResponse: (data) => toCamel(JSON.parse(data)),
});

type Data = FormData | Record<string, unknown> | null;

// Extends BatchableRequest with a typed transform chain
interface TransformableRequest<T> extends BatchableRequest<T> {
  transform<U>(fn: (raw: T) => U): BatchableRequest<U>;
}

export interface HttpClient {
  get<T>(path: string, options?: AxiosRequestConfig): TransformableRequest<T>;
  post<T>(path: string, data: Data, options?: AxiosRequestConfig): TransformableRequest<T>;
  delete<T>(path: string, options?: AxiosRequestConfig): TransformableRequest<T>;
  getToken(): string;
}

function withTransform<T>(req: BatchableRequest<T>): TransformableRequest<T> {
  (req as TransformableRequest<T>).transform = <U>(fn: (raw: T) => U): BatchableRequest<U> => {
    const prev = req._transform;
    return {
      method: req.method,
      relative_url: req.relative_url,
      _transform: (raw: any) => fn(prev ? prev(raw) : raw),
      then(onFulfilled, onRejected) {
        return req.then(fn).then(onFulfilled, onRejected);
      },
      catch(onRejected) {
        return req.then(fn).then(undefined, onRejected);
      },
    };
  };
  return req as TransformableRequest<T>;
}

export function createHttpClient(accessToken: string): HttpClient {
  return {
    get: (path, options) => {
      const params = options?.params ?? {};
      return withTransform(
        createBatchableRequest("GET", buildRelativeUrl(path, params), async () =>
          fbApi.get(path, {
            params: { access_token: accessToken, ...params },
            ...options,
          }),
        ),
      );
    },
    post: (path, data, options) => {
      return withTransform(
        createBatchableRequest("POST", buildRelativeUrl(path, {}), async () => {
          const isForm = data instanceof FormData;
          return fbApi.post(path, isForm ? data : toSnakeObj(data), {
            headers: isForm ? data.getHeaders() : {},
            params: { access_token: accessToken },
            ...options,
          });
        }),
      );
    },
    delete: (path, options) => {
      const params = options?.params ?? {};
      return withTransform(
        createBatchableRequest("DELETE", buildRelativeUrl(path, params), async () =>
          fbApi.delete(path, {
            params: { access_token: accessToken, ...params },
            ...options,
          }),
        ),
      );
    },
    getToken: () => accessToken,
  };
}
