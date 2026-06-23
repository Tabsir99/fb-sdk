# Batching

The whole SDK is built around one idea: **a Graph request and its batch sub-request representation should be the same value.** That value is `BatchableRequest<T>`.

This doc covers:
- The `BatchableRequest<T>` primitive — what it is and why it's thenable.
- `.transform()` — composing post-processing that survives batching.
- `sdk.batch([...])` — chunking, response shape, and ordering guarantees.

The runtime lives in [`src/internal/batchable.ts`](../src/internal/batchable.ts) and [`src/resources/createBatchResource.ts`](../src/resources/createBatchResource.ts).

---

## `BatchableRequest<T>`

```ts
export interface BatchableRequest<T> {
  readonly method: string;
  readonly relative_url: string;
  transform<U>(fn: (raw: T) => U): BatchableRequest<U>;
  then<R1 = T, R2 = never>(
    onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2>;
  catch<R = never>(onRejected?: ((reason: any) => R | PromiseLike<R>) | null): Promise<T | R>;
}
```

A `BatchableRequest<T>` carries:

1. `method` + `relative_url` — exactly what Facebook's batch endpoint expects in each sub-request entry. POSTs built from a JSON payload also carry a urlencoded `body` (FormData uploads cannot be batched).
2. `then` / `catch` — thenable, so `await req` runs the *single* HTTP request. Execution is **single-flight**: awaiting the same request again (or awaiting both it and a `.transform()` child) reuses the first call instead of firing another.
3. `transform(fn)` — lazily compose a mapping function over the eventual response.

### Constructor

```ts
export function createBatchableRequest<T>(
  method: string,
  relativeUrl: string,
  executor: () => Promise<T>,
  _transform?: (raw: any) => any,
  body?: string,
): BatchableRequest<T> { … }
```

The `executor` is the "do the HTTP call by itself" function. It's lazy — calling `createBatchableRequest` does **not** execute anything. The executor only runs when something calls `.then(...)` (which `await` does), and at most once — the in-flight promise is cached and shared with every later `await` and every `.transform()` child.

This laziness is what makes batching possible: building a list of `BatchableRequest`s to pass into `sdk.batch([...])` doesn't fire 50 HTTP calls.

### Two ways to consume

```ts
const req = sdk.post("123").get({ id: true, message: true });

// Mode 1 — execute on its own (one HTTP request, direct response):
const post = await req;
// post: { id: string; message: string }

// Mode 2 — pack into a batch (one HTTP request for many):
const [{ status, data }] = await sdk.batch([req]);
// data: { id: string; message: string }
```

The same value works in both modes. Resources never have to expose two different methods.

---

## `.transform(fn)`

`.transform()` lets you map the response into something more useful, *without* forcing you to await — so the mapping still applies when the request goes through `sdk.batch([...])`.

```ts
const titles = sdk.page("me").posts
  .list({ fields: { id: true, message: true } })
  .transform((c) => c.data.map((p) => p.message ?? ""));
// titles: BatchableRequest<string[]>

const [{ data }] = await sdk.batch([titles]);
// data: string[] — the .transform already ran
```

### How it works

`transform()` returns a *new* `BatchableRequest` whose executor is `executor().then(fn)`. It does not mutate the original — that's pinned by [`tests/unit/batchable.test.ts`](../tests/unit/batchable.test.ts).

Internally, the new request also stores a private `_transform` reference:

```ts
let inflight: Promise<T> | undefined;
const run = () => (inflight ??= executor());        // single-flight

const req: any = {
  method,
  relative_url: relativeUrl,
  then(onFulfilled, onRejected) { return run().then(onFulfilled, onRejected); },
  transform<U>(fn) {
    const prev = _transform;
    return createBatchableRequest<U>(
      method,
      relativeUrl,
      () => run().then(fn),                          // child shares the parent's call
      (raw: any) => fn(prev ? prev(raw) : raw),
      body,
    );
  },
};
if (_transform) req._transform = _transform;
if (body !== undefined) req.body = body;
```

Two things to notice:

1. `transform` composes left-to-right. `req.transform(a).transform(b)` produces a request whose executor returns `b(a(raw))` and whose `_transform` is `(raw) => b(a(raw))`.
2. The composed `_transform` is what the batch resource looks for after a batch comes back, so transforms inside a batch produce the same data as awaiting the request standalone. The test `_transform produces the same result as awaiting for the same input` pins this invariant.

`_transform` is intentionally **not** part of the public `BatchableRequest<T>` interface — only `BatchSubRequest` exposes it (`tests/types/batchableRequest.test-d.ts` checks `req._transform` is a type error).

### Why this matters in practice

Most resources use `.transform()` internally to do something meaningful with the raw response while still letting callers batch. The clearest example is `InsightResource.ts`:

```ts
return http.get<InsightRawResponseCamelCase>(`/${id}/insights`, …).transform((res) => {
  // walk res.data, derive { timeSeries, total | snapshot } per metric
  return result;
});
```

That call returns a `BatchableRequest<InsightResponse<TMetrics, F>>`. You can `await` it for a single fetch, or batch it alongside other insight calls, or batch *post* and *page* insights together — the transform runs once per request, exactly once, in either path.

---

## `sdk.batch([...])` — the runtime

```ts
const batch = createBatchResource(http);

const responses = await batch([
  sdk.post("a").get({ id: true }),
  sdk.post("b").get({ id: true, message: true }),
  sdk.comment("c").like(),
]);
```

The `createBatchResource` function returns a callable that:

1. **Chunks the input array into groups of 50** (Facebook's per-batch ceiling).
2. For each chunk, builds a multipart form with `batch=<JSON array>` and POSTs to `/` with the page access token. The JSON array contains each request's `{ method, relative_url, body? }` — the executors are never run. `body` is present for POSTs built from a JSON payload (urlencoded); **FormData uploads cannot be embedded in a batch** and serialize without a body.
3. **Processes responses** per sub-request:
   - On `code === 200`, parses the body, runs `toCamel` to convert keys, then runs the request's `_transform` (if any).
   - On non-200, returns `{ status: code, data: <raw body string> }` — no parsing.
   - On a `null` sub-response (Facebook timed that sub-request out), returns `{ status: 0, data: null }`.
4. **Concatenates results from all chunks** so the output array's order matches the input array exactly.

The return type is a tuple matching the input:

```ts
type BatchResponses<T extends readonly BatchSubRequest[]> = {
  -readonly [K in keyof T]: T[K] extends BatchableRequest<infer R>
    ? { status: number; data: R }
    : { status: number; data: any };
};
```

This is why the input is `readonly T extends readonly BatchSubRequest[]` — TypeScript needs to keep the literal tuple type so the per-position result types can be derived.

### Options

```ts
await batch([req1, req2], { includeHeaders: true });
```

`includeHeaders` defaults to `false`. When `true`, Facebook returns response headers per sub-request (useful for rate-limit headers and ETags).

### Error model

Per-sub-request errors do **not** throw. They appear as `{ status: 4xx, data: "<raw error body>" }`, and sub-requests Facebook timed out appear as `{ status: 0, data: null }`. This is intentional — you want one bad sub-request not to fail the whole batch. Only HTTP-level failures (network error, 5xx on the batch endpoint itself, malformed batch envelope) reject the promise.

---

## Practical patterns

### Compose your own batch-aware helpers

Because every method returns a `BatchableRequest`, any function that returns one is also batch-aware:

```ts
function postSummary(http: HttpClient, id: string) {
  return sdk.post(id).get({
    id: true,
    message: true,
    reactions: { summary: true },
  }).transform((p) => ({
    id: p.id,
    preview: p.message?.slice(0, 80) ?? "",
    reactionCount: p.reactions.summary.total_count,
  }));
}

// Use it standalone:
const summary = await postSummary(http, "123");

// Or batch many:
const summaries = await sdk.batch(ids.map((id) => postSummary(http, id)));
```

### Multi-step aggregation — when not to use batch

Some operations need the response of one call to decide the next — for example, the page-level comment aggregator first lists posts, then fans out into per-post comment calls. Those can't be one batch.

The internal helper [`fetchComments`](../src/internal/fetchers.ts) handles that: it uses `sdk.batch([...])` for the fan-out *inside* a higher-level call that returns a plain `Promise`. The exposed `GetPageComments` type returns `Promise<Collection<...>>`, not `BatchableRequest<...>` — that's the public signal that this resource can't be embedded in another batch.

If you add a resource that does multi-step work like this, **return `Promise<T>`, not `BatchableRequest<T>`.** That makes the boundary visible at the type level.
