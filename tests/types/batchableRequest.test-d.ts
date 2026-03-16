import { expectTypeOf } from "expect-type";
import type { BatchableRequest, BatchSubRequest } from "../../src/types/shared.js";

// 1. Awaiting a BatchableRequest<{ id: string }> yields { id: string }
declare const req: BatchableRequest<{ id: string }>;
const awaited = await req;
expectTypeOf(awaited).toEqualTypeOf<{ id: string }>();

// 2. .then(fn) infers the return type of fn
const thenResult = await req.then((v) => v.id.length);
expectTypeOf(thenResult).toEqualTypeOf<number>();

// 3. .transform(fn) returns BatchableRequest<U> where U is return type of fn
const transformed = req.transform((v) => v.id.length);
expectTypeOf(transformed).toEqualTypeOf<BatchableRequest<number>>();

// 4. Chained .transform(fn1).transform(fn2) — the final type is the return type of fn2
const chained = req.transform((v) => v.id).transform((s) => s.length > 0);
expectTypeOf(chained).toEqualTypeOf<BatchableRequest<boolean>>();

// 5. .transform() result is still thenable — await req.transform(fn) yields U
const awaitedTransformed = await req.transform((v) => ({ len: v.id.length }));
expectTypeOf(awaitedTransformed).toEqualTypeOf<{ len: number }>();

// 6. method and relative_url are readonly string
expectTypeOf(req.method).toEqualTypeOf<string>();
expectTypeOf(req.relative_url).toEqualTypeOf<string>();

// 7. BatchableRequest<T> does NOT have _transform (type error to access it)
// @ts-expect-error
req._transform;

// 8. BatchSubRequest DOES have optional _transform
declare const subReq: BatchSubRequest;
expectTypeOf(subReq._transform).toEqualTypeOf<((raw: any) => any) | undefined>();
