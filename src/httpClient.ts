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
      return createBatchableRequest("GET", buildRelativeUrl(path, params), async () =>
        fbApi.get(path, {
          params: { access_token: accessToken, ...params },
          ...options,
        }),
      );
    },
    post: (path, data, options) => {
      return createBatchableRequest("POST", buildRelativeUrl(path, {}), async () => {
        const isForm = data instanceof FormData;
        return fbApi.post(path, isForm ? data : toSnakeObj(data), {
          headers: isForm ? data.getHeaders() : {},
          params: { access_token: accessToken },
          ...options,
        });
      });
    },
    delete: (path, options) => {
      const params = options?.params ?? {};
      return createBatchableRequest("DELETE", buildRelativeUrl(path, params), async () =>
        fbApi.delete(path, {
          params: { access_token: accessToken, ...params },
          ...options,
        }),
      );
    },
    getToken: () => accessToken,
  };
}
