# Architecture

How the SDK is put together, the conventions every file follows, and the invariants that
must hold when you change things. Read this first; the deep dives are
[type-system.md](type-system.md), [batching.md](batching.md), and
[webhooks-and-stores.md](webhooks-and-stores.md).

> The 2026-06 audit regressions (envelope not unwrapped, `access_token` clobbered,
> value-mangling, batch bodies dropped) are fixed and pinned by
> `tests/unit/httpClientContract.test.ts` — see that file before touching `httpClient.ts`.

---

## Bird's-eye view

Two stacks share one package. The Graph stack makes API calls; the webhook stack records
activity so the Graph stack can read less. They meet only at the `Store` interface.

```
        GRAPH STACK                                WEBHOOK STACK

  client.ts  (composition root, public exports)
      │
      ▼
  resources/*           ◄── internal/fetchers.ts          webhook/handler.ts
  (one factory per       (page-comment aggregation,             │
   Graph node/edge)       sits ABOVE resources)                 │ writes
      │                                                         ▼
      ▼                                                    store/types.ts (Store)
  httpClient.ts  ──────────────────────────► reads ◄──    ├── store/memory.ts
  (axios wrapper → BatchableRequest)   (PageCommentResource)    └── store/redis.ts
      │
      ▼
  internal/batchable.ts   lib/transformCase.ts   internal/utils.ts
  (the one primitive)     (casing, both levels)  (selector → fields string)
      │
      ▼
  types/*  (pure type declarations, no runtime code except ORDER)
```

Dependency rules:

- `types/` depends on nothing but `lib/transformCase.ts` (for `KeysToCamel`).
- `lib/` and `internal/batchable.ts` / `internal/utils.ts` are leaf utilities.
- `resources/` depend on `httpClient`, `internal/`, `types/` — never on each other's
  *runtime* exports except through explicit factories (`createPostResource`,
  `createBatchResource`).
- `internal/fetchers.ts` is the one exception that imports *from* `resources/` — it is the
  page-comment aggregation engine, "internal" only in the sense of "not exported".
- `store/` and `webhook/` import nothing from the Graph stack.

---

## The one primitive: `BatchableRequest<T>`

Every Graph operation returns a `BatchableRequest<T>`
([`src/internal/batchable.ts`](../src/internal/batchable.ts)). It is simultaneously:

1. **A batch sub-request description** — `method` + `relative_url` (+ `body` for POSTs
   with a JSON payload, urlencoded), exactly what Facebook's batch endpoint wants.
   `JSON.stringify` of the object serializes only these (functions are dropped), which is
   how `sdk.batch` builds its payload.
2. **A lazy, single-flight thenable** — `then`/`catch` delegate to an `executor` closure
   that performs the real HTTP call. Nothing executes until something awaits, and the
   executor runs at most once no matter how many times the request is awaited.
3. **A transform carrier** — `.transform(fn)` returns a *new* request whose executor is
   `executor().then(fn)` and whose private `_transform` is the composed function. The
   batch processor applies `_transform` to the parsed sub-response, so post-processing
   yields identical results in both consumption modes.

### The two lifecycles

```
resource method, e.g. post.get({ id: true })
  │  toGraphFields(selector) → "id,…"   (keys snake_cased here)
  ▼
http.get("/123", { params: { fields } })
  │  createBatchableRequest("GET", buildRelativeUrl(path, params), executor)
  ▼
┌─ Direct mode ────────────────────────────┐  ┌─ Batch mode ─────────────────────────────┐
│ await req                                │  │ sdk.batch([reqA, reqB, …])               │
│  └ executor()   (at most once)           │  │  └ chunk into ≤50                        │
│     └ fbApi.get(path, {access_token,…})  │  │     └ POST "/" multipart:                │
│        └ transformResponse:              │  │        batch=[{method,relative_url,      │
│            toCamel(JSON.parse(body))     │  │               body?}, …]                 │
│  └ unwrap envelope → res.data            │  │  └ per sub-response:                     │
│  └ (transform fn, if chained)            │  │      JSON.parse(body) → toCamel          │
│  └ resolves T                            │  │      → req._transform?.(parsed)          │
└──────────────────────────────────────────┘  │  └ null sub-response → {status: 0}       │
                                              │  └ resolves [{status, data: T}, …]       │
                                              └──────────────────────────────────────────┘
```

The executor resolves the *body* (`res.data`), never the `AxiosResponse` envelope — that
unwrap is what keeps the two modes equivalent.

### Invariants

These are the load-bearing guarantees. Tests pin some of them; treat the rest as law:

- **Equivalence:** `await req` and `(await sdk.batch([req]))[0].data` produce the same
  value for the same wire response. (`tests/unit/batchable.test.ts` pins the `_transform`
  half of this.)
- **Laziness:** constructing requests never performs I/O. `sdk.batch` never calls
  executors — it serializes descriptions.
- **Immutability:** `.transform()` returns a new request; the original is untouched.
- **Order:** batch results match input order, across chunk boundaries. Sub-requests that
  Facebook timed out (returned as `null`) become `{ status: 0, data: null }`.
- **Single-flight:** awaiting the same request multiple times (or awaiting both a request
  and its `.transform()` child) performs exactly one HTTP call.

Two axios instances exist in [`src/httpClient.ts`](../src/httpClient.ts):

| Instance | Base URL | Used for |
| -------- | -------- | -------- |
| `fbApi`  | `https://graph.facebook.com/v25.0` (pinned) | every Graph call; applies the camelCase response transform |
| `api`    | none | side-fetches of user-supplied URLs (thumbnails, comment attachments) streamed into upload forms |

---

## The casing boundary

**Rule: user-facing and internal code is camelCase; the wire is snake_case.** All
conversion happens in exactly these places — never convert ad-hoc in resources:

| Direction | What | Converter | Where it runs |
| --------- | ---- | --------- | ------------- |
| out | field selector keys | `toGraphFields` → `toSnakeCase` | resource methods ([`internal/utils.ts`](../src/internal/utils.ts)) |
| out | query param keys | `buildRelativeUrl` → `toSnakeCase` | batch `relative_url` construction |
| out | JSON body keys | `toSnakeObj` | `http.post` (non-FormData data) |
| out | multipart form keys | `toSnakeFormData` | upload/publish flows |
| in  | response keys | `toCamel` | `fbApi`'s `transformResponse` (direct) and `processResponse` (batch) |

These convert **keys only** — string *values* (message text, cursors, URLs) pass through
untouched, pinned by tests in `transformCase.test.ts` and the contract suite. The one
deliberate value-level conversion is `InsightResource` calling `toCamelCase(entry.name)`
on a metric *name* to map it back to a camelCase result key. `toSnakeFormData`
additionally stringifies booleans, since `form-data` only accepts strings/Buffers/streams.

At the type level the same boundary is `KeysToCamel<T>` / `KeysToSnake<T>`
([`lib/transformCase.ts`](../src/lib/transformCase.ts)), which is what lets every domain
type be written once in wire shape (see next section).

---

## Type conventions

Full detail in [type-system.md](type-system.md); the conventions in brief:

- **`*Raw` is the source of truth.** Every domain type is declared in snake_case exactly
  as the wire sends it (`FacebookPostRaw`), and the public camelCase view is derived:
  `export type FacebookPost = KeysToCamel<FacebookPostRaw>`. Never hand-write the camel
  version.
- **Selector in, picked shape out.** Read operations are typed
  `GetNode<T>` / `ListEdge<T, O>` ([`types/shared.ts`](../src/types/shared.ts)): the caller
  passes an `FbFieldSelector<T>` literal, `Fields`/`DeepStrict` reject unknown keys *at
  the call site*, and the result is `FbPickDeep<T, F>` — exactly the selected shape.
- **Paginated edges are `CollectionOf<T, O>`.** Its `_edgeOptions?: O` property is a
  type-level phantom (underscore-prefixed keys survive `KeysToCamel`) that tells the
  selector which edge options (`limit`, `order`, `filter`, `summary`…) are legal there.
  It never exists at runtime.
- **Recursion is budgeted.** Recursive selector types take a depth parameter decremented
  through the `Decrement` tuple; default 10. Bump it if a deeper shape ever needs it.
- **Write ops are plain types.** `*Params` (camel view of a `*Raw`) in,
  `BatchableRequest<*Response>` out. Helper-only inputs that aren't real API fields are
  added on the camel side (e.g. `CreateCommentParams`'s `sourceUrl`) and stripped before
  the request is built.

---

## Resource conventions

Resources live in [`src/resources/`](../src/resources/). To add one, mirror this shape:

```ts
export type GetThing = GetNode<FacebookThing>;          // 1. export the op types
export type ListThings = ListEdge<FacebookThing>;

export function createThingResource({ http, id, config }: CreateResourceParams) {
  const get: GetThing = (fields) =>
    http.get(`/${id}`, { params: { fields: toGraphFields(fields) } });
  const list: ListThings = (query) =>
    http.get(`/${id}/things`, { params: { fields: toGraphFields(query.fields), ...query.options } });
  return { get, list };                                  // 2. factory returns plain object
}
```

The rules:

- **Factory, not class.** `createXResource({ http, id, config? })` (`CreateResourceParams`
  from `client.ts`) returning an object of named operations. Composition over inheritance
  everywhere; `createPageResource` is just six smaller factories glued together.
- **Export each operation's function type** (`GetPost`, `ListMedia`, …). Internal
  consumers (`poller.ts`, `fetchers.ts`) accept operations structurally by those types
  instead of importing whole resources — that's what keeps the poller generic.
- **Single-call ops return `BatchableRequest<T>`. Multi-step ops return `Promise<T>`.**
  This is a public, type-level signal: a `Promise` return means "cannot be embedded in
  `sdk.batch`" (page comment aggregation, the three publish flows). Keep it honest.
- **Uploads:** build the form with `toSnakeFormData`, side-fetch binary URLs with the bare
  `api` instance as streams, and poll with the `poll()` combinator
  ([`internal/poller.ts`](../src/internal/poller.ts)) — `poll(fn)` retries while `fn`
  resolves `undefined`, returns on a value, throws on error or timeout. Reels use the
  3-phase session (`START` → upload by `file_url` header → `FINISH`); videos recover from
  a 504 by polling the list for the `universalVideoId` they stamped before publishing.
- **Failure surface:** media pipelines throw `FacebookUploadError`
  ([`internal/error.ts`](../src/internal/error.ts)); everything else propagates raw axios
  errors. There is deliberately **no retry layer** — see the commented prototype in
  `error.ts` and the README's contributing note; retries are the caller's job for now.

### `client.ts` as hub — and an import convention to know

[`src/client.ts`](../src/client.ts) is the composition root: `createFbSdk(config)` returns
a token-curried factory wiring `createHttpClient(token)` into every resource, and it
re-exports the public type surface (`export type * from "./types/…"`).

Many files import shared *types* back from `"../client.js"`. This works only because
every such import is type-only and TypeScript erases it — there is no runtime cycle.
`verbatimModuleSyntax` (tsconfig) plus the `consistent-type-imports` lint rule enforce
the `import type` syntax that keeps this safe. Two consequences:

- Importing a **value** from `client.js` inside a resource would create a real circular
  import. Don't. Runtime values (e.g. the `ORDER` enum) must be imported from their
  defining module (`types/shared.js`).
- `export type *` re-exports types only. Anything users need *at runtime* gets an explicit
  value re-export in `client.ts` — currently `createFbSdk`, the stores, the webhook
  handler, `ORDER`, and `FacebookUploadError`.

---

## The webhook ↔ store stack

Detail in [webhooks-and-stores.md](webhooks-and-stores.md). Conventions:

- **`Store` answers one question** — "which posts on page X had comment activity since
  T?" — via `recordActivity` / `getActivePosts` / `cleanup`. It is not a cache; don't
  grow it into one.
- The handler ([`webhook/handler.ts`](../src/webhook/handler.ts)) is **framework-agnostic
  by structural typing**: it takes `{ query }` / `{ body, headers, rawBody }` requests and
  a `{ status().send() }` response — express, fastify, hono all fit without adapters.
- Order of operations is fixed: verify HMAC against the **raw bytes** (timing-safe
  comparison) → respond 200 *immediately* → process entries afterwards. Facebook retries
  slow endpoints; never do work before the 200. Background failures are routed to the
  optional `onError` callback — they must never reject out of the handler after the
  response is sent.
- Store implementations must tolerate at-least-once delivery and out-of-order events:
  a stored timestamp may only move forward (memory store guards explicitly; the Redis
  store uses `ZADD GT`, hence Redis ≥ 6.2).

---

## Testing conventions

Two test layers, and the boundary each mocks at, matter more than coverage numbers:

- **Runtime: `tests/unit/*.test.ts`** (vitest). Pure helpers are tested directly
  (`toGraphFields`, `transformCase`, `buildRelativeUrl`, stores). Resource logic is tested
  by handing the factory a fake `HttpClient` whose methods return
  `createBatchableRequest(..., async () => fixture)`.
- **Contract: `tests/unit/httpClientContract.test.ts`.** Fake executors resolve the
  **body**, so they can't catch bugs inside `httpClient.ts` itself (config merging,
  envelope unwrap, response transform). The contract suite closes that gap by injecting
  an axios `adapter` through request options and running the *real* `createHttpClient`
  pipeline end to end. The 1.2.x regressions are all pinned there — any change to
  `httpClient.ts` or `batchable.ts` must keep it green.
- **Types: `tests/types/*.test-d.ts`** (`expect-type`). Every selector/result feature gets
  positive assertions plus `@ts-expect-error` cases for what must *not* compile. These run
  through vitest's typecheck mode, enabled by default in `vitest.config.ts`
  (`typecheck.enabled: true`) — plain `vitest run` includes them.
- Convention for new features: one runtime test for the wire string/behaviour, one type
  test for the surface, including at least one negative (`@ts-expect-error`) case.

---

## Build & packaging

- **ESM-only**, `module: NodeNext`, target ES2022, Node 18+. `package.json` `exports`
  exposes only the root `"."` with `types` + `import` + `default` conditions;
  `files: ["dist"]`.
- **Gates:** `npm run lint` (eslint, type-aware rules), `npm run test` (vitest unit +
  typecheck), `npm run check` (both), `npm run build` (check + `tsc`). `prepublishOnly`
  runs build — nothing unlinted or untested can be published.
- The tsconfig is deliberately strict — `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`,
  `verbatimModuleSyntax` shape how code is written here (e.g. `postIds[i]!` assertions
  after explicit bounds, `?? {}` defaults, `import type` everywhere). Don't loosen flags
  to make a change compile.
- Graph API version is pinned (`v25.0`) in the `fbApi` base URL — bump deliberately, in
  one place. Both axios instances carry a 60s default timeout.
- `src/temp/` is a local playground (`npm run dev`), excluded from build and lint.

## File map

```
src/
├── client.ts                  composition root; createFbSdk; ALL public exports
├── httpClient.ts              axios instances; HttpClient → BatchableRequest
├── internal/
│   ├── batchable.ts           createBatchableRequest + buildRelativeUrl (the primitive)
│   ├── utils.ts               toGraphFields — selector object → Graph fields string
│   ├── fetchers.ts            fetchComments — page-comment fan-out engine (uses batch)
│   ├── poller.ts              poll() combinator + video/reel status pollers
│   └── error.ts               FacebookUploadError (+ commented-out retry prototype)
├── lib/transformCase.ts       toCamel/toSnake* runtime + KeysToCamel/KeysToSnake types
├── resources/
│   ├── PageResource.ts        page hub: posts/videos/reels/images lists + publish flows
│   ├── PostResource.ts        post node: get/expire (+ media node used by pollers)
│   ├── UserResource.ts        /me get + /me/accounts
│   ├── InsightResource.ts     page/post insights; metric map → {timeSeries, total|snapshot}
│   ├── createBatchResource.ts sdk.batch — 50-chunking, per-sub-response processing
│   └── comment/
│       ├── CommentResource.ts          single-comment CRUD + reply/replies + edge factory
│       └── PageCommentResource.ts      cross-post aggregation + composite cursor
├── store/                     Store contract + memory/redis implementations
├── webhook/handler.ts         verify handshake + signed feed-event recording
└── types/                     *Raw wire shapes + derived camel views + selector machinery
tests/
├── unit/                      vitest runtime tests (HttpClient-boundary mocks + the
│                              adapter-injection contract suite for the real pipeline)
└── types/                     expect-type compile-time tests (run via vitest typecheck)
```
