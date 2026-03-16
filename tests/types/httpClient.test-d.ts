import { expectTypeOf } from "expect-type";
import type { HttpClient } from "../../src/httpClient.js";
import type { BatchableRequest } from "../../src/types/shared.js";

declare const http: HttpClient;

// 1. http.get<T>(path) returns BatchableRequest<T>
const getReq = http.get<{ id: string }>("/me");
expectTypeOf(getReq).toEqualTypeOf<BatchableRequest<{ id: string }>>();

// 2. http.get<T>(path).transform(r => r.id) returns BatchableRequest<string>
const getTransformed = http.get<{ id: string }>("/me").transform((r) => r.id);
expectTypeOf(getTransformed).toEqualTypeOf<BatchableRequest<string>>();

// 3. http.post<T>(...) returns BatchableRequest<T>
const postReq = http.post<{ success: boolean }>("/me/feed", { message: "hello" });
expectTypeOf(postReq).toEqualTypeOf<BatchableRequest<{ success: boolean }>>();

// 4. http.delete<T>(...) returns BatchableRequest<T>
const deleteReq = http.delete<{ success: boolean }>("/123_456");
expectTypeOf(deleteReq).toEqualTypeOf<BatchableRequest<{ success: boolean }>>();

// 5. getToken() returns string
expectTypeOf(http.getToken()).toEqualTypeOf<string>();
