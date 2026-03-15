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
});

interface HttpResponse<T> {
  data: T;
  status: number;
}

type Options = AxiosRequestConfig & { safe?: false };
type RawOptions = AxiosRequestConfig & { safe: true };
type Data = FormData | Record<string, unknown> | null;

export interface HttpClient {
  get<T>(path: string, options: RawOptions): BatchableRequest<HttpResponse<T>>;
  get<T>(path: string, options?: Options): BatchableRequest<T>;

  post<T>(path: string, data: Data, options: RawOptions): BatchableRequest<HttpResponse<T>>;
  post<T>(path: string, data: Data, options?: Options): BatchableRequest<T>;

  delete<T>(path: string, options: RawOptions): BatchableRequest<HttpResponse<T>>;
  delete<T>(path: string, options?: Options): BatchableRequest<T>;

  getToken(): string;
}

export function createHttpClient(accessToken: string): HttpClient {
  return {
    get: (path, options) => {
      const params = options?.params ?? {};
      return createBatchableRequest("GET", buildRelativeUrl(path, params), async () => {
        const res = await fbApi.get(path, {
          params: { access_token: accessToken, ...params },
        });
        const data = toCamel(res.data);
        return options?.safe ? { data, status: res.status } : data;
      });
    },

    post: (path, data, options) => {
      return createBatchableRequest("POST", buildRelativeUrl(path, {}), async () => {
        const isForm = data instanceof FormData;
        const res = await fbApi.post(path, isForm ? data : toSnakeObj(data), {
          headers: isForm ? data.getHeaders() : {},
          ...(options?.safe && { validateStatus: (s: number) => s === 200 || s === 504 }),
          params: { access_token: accessToken },
        });
        const body = toCamel(res.data);

        return options?.safe ? { data: body, status: res.status } : body;
      });
    },

    delete: (path, options) => {
      const params = options?.params ?? {};
      return createBatchableRequest("DELETE", buildRelativeUrl(path, params), async () => {
        const res = await fbApi.delete(path, {
          params: { access_token: accessToken, ...params },
        });
        const data = toCamel(res.data);
        return options?.safe ? { data, status: res.status } : data;
      });
    },

    getToken: () => accessToken,
  };
}
