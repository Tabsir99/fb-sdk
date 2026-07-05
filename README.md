# @tabsircg/fb-sdk

A small, strongly-typed Facebook Graph API SDK for Node.js.

It started as the Facebook layer for a scheduling tool (Scheduly) and was extracted as a standalone package. The goal is a thin, predictable wrapper around the Graph API — not a kitchen-sink client. **It currently covers a focused subset of the Graph API.** More surface area will land over time; see [Coverage](#coverage).

> Status: early. The published version is `1.2.x`. The public shape (resource factories, `BatchableRequest`, field selectors) is stable enough to use, but minor versions may still tighten types.

---

## Highlights

- **Declarative field selection, fully typed.** The shape you await is exactly the shape you asked for — no `any`, no over-fetching, no manual type narrowing.
- **One primitive: `BatchableRequest<T>`.** Every Graph call returns a thenable that doubles as a batch sub-request. The same value can be `await`-ed directly or passed into `sdk.batch([...])`.
- **Automatic camelCase ↔ snake_case** at both runtime and type level. You write `createdTime`, the API sees `created_time`, you await `createdTime` again.
- **Native batch API** with automatic chunking past Facebook's 50-request limit.
- **First-class webhooks.** Facebook + Instagram webhooks normalized into one typed `onEvent` stream, plus an in-memory and a Redis store for store-accelerated comment fan-out.
- **Async upload helpers** for videos, reels, and images — including the 3-phase reel upload session, status polling, and 504 recovery.
- **Typed error hook.** An optional `onError` reports a strictly-typed `FacebookError` — a discriminated union you narrow on `.category`, with a `raw` escape hatch — for every failed request and batch sub-response. Observational: it never changes what's thrown or returned.

---

## Install

```bash
npm install @tabsircg/fb-sdk
# or
pnpm add @tabsircg/fb-sdk
```

Node 18+ recommended (the package is ESM and ships native ESM output).

The SDK pins **Graph API v25.0**.

---

## Quick start

```ts
import { createFbSdk } from "@tabsircg/fb-sdk";

const sdk = createFbSdk()(process.env.FB_ACCESS_TOKEN!);

// Fetch the current user (the token's owner)
const me = await sdk.me.get({ id: true, name: true, picture: true });
//    ^? { id: string; name: string; picture: { data: PictureData } }

// List the pages the user manages
const pages = await sdk.me.accounts({
  fields: { id: true, name: true, accessToken: true },
});

// Fetch a single post with nested comments and reactions
const post = await sdk.post("123_456").get({
  id: true,
  message: true,
  reactions: { summary: true },
  comments: {
    fields: { id: true, message: true, from: { id: true, name: true } },
    options: { limit: 25 },
  },
});

// Update a comment
await sdk.comment("789").update({ message: "edited" });
```

Every call above is a `BatchableRequest<T>`. Each can be `await`-ed directly, *or* you can drop them into a batch:

```ts
const [postRes, commentsRes] = await sdk.batch([
  sdk.post("123_456").get({ id: true, message: true }),
  sdk.page("me").comments.list({ fields: { id: true, message: true } }),
]);

if (postRes.status === 200) {
  console.log(postRes.data.message);
}
```

---

## Coverage

What ships today:

| Area      | Resource                                    | Operations                                                          |
| --------- | ------------------------------------------- | ------------------------------------------------------------------- |
| User      | `sdk.me`                                    | `get`, `accounts` (list managed pages)                              |
| Page      | `sdk.page(id).posts`                        | `list`                                                              |
| Page      | `sdk.page(id).videos` / `.reels`            | `list`, `publish` (with thumbnail + status polling)                 |
| Page      | `sdk.page(id).images`                       | `publish`                                                           |
| Page      | `sdk.page(id).comments`                     | `list` — aggregated across recent posts, store-accelerated          |
| Page/Post | `.insights`                                 | `list` — typed metrics → `{ timeSeries, total \| snapshot }`        |
| Post      | `sdk.post(id)`                              | `get`, `expire`, `comments`, `insights`                             |
| Comment   | `sdk.comment(id)`                           | `get`, `update`, `delete`, `like`, `unlike`, `reply`, `replies`     |
| Batch     | `sdk.batch`                                 | Up to 50 per request, auto-chunked                                  |
| Webhook   | `createWebhookHandler`                      | `handleVerify`, `handleEvent` — signature-verified, typed `onEvent` dispatch (FB + IG) |
| Stores    | `createMemoryStore`, `createRedisStore`     | In-process and Redis sorted-set backed                              |

Instagram is a **separate SDK** — `createInstagramSdk()(igToken)` — talking to `graph.instagram.com` (Instagram API with Instagram Login), fully decoupled from the Facebook token:

| Area      | Resource                                    | Operations                                                          |
| --------- | ------------------------------------------- | ------------------------------------------------------------------- |
| Account   | `ig.account(id)`                            | `get`, `media` (publish/list), `insights`, `mentions`, `stories`, `tags` |
| Media     | `ig.media(id)`                              | `get`, `insights`, `comments`, `setCommentEnabled`                  |
| Comment   | `ig.comment(id)`                            | `get`, `reply`, `replies`, `hide`, `delete`                         |

Not covered yet: ads, business management, leadgen retrieval, messenger, marketing API, app events. PRs welcome — see [Contributing](#contributing).

---

## Core concepts

### 1. Field selectors

Instead of building a Graph `fields=...` string by hand, you describe the shape you want as a plain object:

```ts
const post = await sdk.post("123").get({
  id: true,
  message: true,
  comments: {
    fields: { id: true, message: true },
    options: { limit: 10, order: ORDER.NEWEST },
  },
});
```

- Leaves are `true`.
- Plain object children (`{ summary: true }`) descend into nested fields.
- **Collection** fields use `{ fields, options? }`. `options` becomes Graph's `.limit(N).order(...)` syntax.
- Unknown keys are rejected at compile time. Selecting `id` does not give you `message` in the result type.

The selector is converted to a Graph string by [`toGraphFields`](src/internal/utils.ts):

```
{ id: true, comments: { fields: { id: true }, options: { limit: 5 } } }
→  "id,comments.limit(5){id}"
```

See [docs/type-system.md](docs/type-system.md) for the recursive types behind this (`FbFieldSelector`, `FbPickDeep`, `DeepStrict`, `Fields`).

### 2. `BatchableRequest<T>` — one value, two uses

Every method on a resource returns a `BatchableRequest<T>`. It carries:

- `method` and `relative_url` — what the FB batch API needs to embed it in a batch.
- `then` / `catch` — so `await req` Just Works.
- `transform(fn)` — map the response in a way that survives batching.

```ts
const idOnly = sdk.post("123").get({ id: true }).transform((p) => p.id);
//    ^? BatchableRequest<string>

const id = await idOnly;                  // works
const [{ data: id2 }] = await sdk.batch([idOnly]);  // also works
```

`transform` is the trick that makes `sdk.batch([...])` return typed, post-processed data — the same transform runs in both code paths. See [docs/batching.md](docs/batching.md).

### 3. camelCase everywhere

The SDK does case conversion in both directions, at both the runtime and the type level:

- Outgoing params and bodies: `toSnakeObj` / `toSnakeFormData` / `toSnakeCase` convert your camelCase keys before they hit the wire.
- Incoming responses: `toCamel` rewrites all keys recursively. The axios instance applies it as a global response transform.
- At the type level: `KeysToCamel<T>` and `KeysToSnake<T>` recursively transform key strings using template literal types, so `FacebookPostRaw` (snake) and `FacebookPost` (camel) stay in sync from a single source of truth.

```ts
// You write:
sdk.page("me").posts.list({ fields: { id: true, createdTime: true } });
// Wire sees: fields=id,created_time
// You await: { data: { id: string; createdTime: string }[]; paging: ... }
```

Keys starting with `_` are preserved by `KeysToCamel` (used for internal type-level markers like `_edgeOptions`).

### 4. Batching

```ts
const results = await sdk.batch([
  sdk.post("a").get({ id: true }),
  sdk.post("b").get({ id: true, message: true }),
  sdk.comment("c").like(),
]);

// results is a tuple matching input order:
// [
//   { status: 200; data: { id: string } },
//   { status: 200; data: { id: string; message: string } },
//   { status: 200; data: LikeCommentResponse },
// ]
```

- Up to 50 requests per HTTP call. Larger arrays are chunked transparently.
- POSTs created from a JSON payload carry their body into the batch. FormData uploads can't be batched.
- Each result is `{ status, data }`. Non-200 responses leave `data` as the raw body string; sub-requests Facebook timed out come back as `{ status: 0, data: null }`.
- `includeHeaders` is opt-in.

### 5. Page-level comment fan-out

The `sdk.page(id).comments.list(...)` resource is the one place the SDK does something more than a 1:1 Graph call — it aggregates comments across multiple posts. There are two modes:

- **Store-backed** (recommended): pass a `Store` in `createFbSdk({ store })` and run the webhook handler. The store remembers which posts had recent comment activity; `list({ options: { since } })` only fetches comments from those posts.
- **On-demand**: no store. The SDK pulls the latest posts on the page (`createFbSdk({ postsLimit })`, default 50, max 100) and fans out comments across them.

Pagination uses a base64url-encoded cursor that bundles per-post cursors so the caller sees a single opaque `after` token. See [docs/webhooks-and-stores.md](docs/webhooks-and-stores.md).

---

## Webhooks

```ts
import express from "express";
import {
  createFbSdk,
  createMemoryStore,
  createWebhookHandler,
} from "@tabsircg/fb-sdk";

const store = createMemoryStore();
const sdk = createFbSdk({ store });

const webhook = createWebhookHandler({
  verifyToken: process.env.FB_VERIFY_TOKEN!,
  appSecret: process.env.FB_APP_SECRET!,
  store, // optional — auto-records FB Page comment activity for store-accelerated reads
  onEvent: async (event) => {
    switch (event.type) {
      case "comment.added":
        // event.platform: "facebook" | "instagram" — narrow for the differing fields
        if (event.platform === "instagram") {
          await notify(event.mediaId, event.commentId, event.text);
        } else {
          await notify(event.postId, event.commentId, event.text);
        }
        break;
      case "mention.created":
        await flagMention(event);
        break;
      // comment.edited | comment.removed | comment.hidden | comment.unhidden
      // post.published | reaction.added | reaction.removed
      // review.created | review.updated | unknown
    }
  },
});

const app = express();
app.use(express.json({ verify: (req, _res, buf) => ((req as any).rawBody = buf) }));

app.get("/webhook", webhook.handleVerify);
app.post("/webhook", webhook.handleEvent);
```

The handler:

- Verifies the `X-Hub-Signature-256` HMAC against `appSecret` (timing-safe), responds `200` immediately (Meta retries otherwise), then processes in the background.
- Parses **Facebook and Instagram** payloads — including both Instagram login shapes (flat `field`/`value` and nested `changes[]`) and the `from`/`sender_*` author variants — into one normalized, camelCase `WebhookEvent` union. Switch on `event.type`, narrow on `event.platform`.
- Delivers anything not modeled (DMs/messaging, `live_comments`, `story_insights`) as an `unknown` event with the original payload on `event.raw` — captured, never dropped.
- If a `store` is supplied, Facebook Page comment-adds are recorded automatically (`recordActivity`) so store-accelerated reads keep working — independent of `onEvent`.
- Routes background failures (store outages, a throwing `onEvent`) to the optional `onError` callback instead of crashing after the response is sent.

**Event types:** `comment.added` · `comment.edited` · `comment.removed` · `comment.hidden` · `comment.unhidden` · `post.published` · `reaction.added` · `reaction.removed` · `mention.created` · `review.created` · `review.updated` · `unknown`.

Then your reader uses the same store:

```ts
// Only hits posts that had comments after `since`
const comments = await sdk.page(pageId).comments.list({
  fields: {
    id: true,
    message: true,
    post: { id: true, message: true, picture: true },
  },
  options: { since: Date.now() - 24 * 60 * 60 * 1000 },
});
```

For multi-process deployments use the Redis store:

```ts
import Redis from "ioredis";
import { createRedisStore } from "@tabsircg/fb-sdk";

const redis = new Redis(process.env.REDIS_URL!);
const store = createRedisStore(redis);
```

`createRedisStore` accepts anything matching the `RedisLike` interface — `ioredis`, `node-redis` v4 with a thin adapter, or your own mock. It uses `ZADD GT` (Redis ≥ 6.2) so out-of-order webhook deliveries can't move activity timestamps backwards.

---

## Error handling

Pass an `onError` hook to `createFbSdk`. It runs after a response is received but **before** it is returned or thrown, whenever an error is detected — on direct requests *and* on individual batch sub-responses. It is purely observational: registering it never changes what the SDK throws or returns.

```ts
import { createFbSdk } from "@tabsircg/fb-sdk";

const sdk = createFbSdk({
  // `ctx` identifies the failing call: { method, relativeUrl, accessToken, source }
  onError: (err, ctx) => {
    switch (err.category) {
      case "auth": // token expired/revoked — ctx.accessToken is the page/channel key
        markChannelRevoked(ctx.accessToken);
        break;
      case "rate_limit": // back off; usage headers say roughly for how long
        logger.warn("throttled", err.usage?.appUsage);
        break;
      case "network": // timeout / DNS / transport — usually retryable
        metrics.increment("fb.network_error");
        break;
      default:
        logger.warn({ trace: err.traceId, call: `${ctx.method} ${ctx.relativeUrl}` }, err.message);
    }
  },
})(token);
```

The hook receives two arguments: the typed error, and a `context` (`{ method, relativeUrl, accessToken, source }`) identifying *which* call failed. `accessToken` is the call's own token — for a multi-page app it's the unique key to the page/channel, so an `auth` error tells you exactly which channel to mark revoked. The second argument is optional to consume; `(err) => …` keeps working.

Error types and classes live at the **`@tabsircg/fb-sdk/errors`** subpath — kept off the main entry to keep it uncluttered. Inside the hook, `err` and `ctx` are inferred, so you often don't need to import anything.

The hook receives a strictly-typed `FacebookError` — a discriminated union you narrow on `.category`:

| category        | when                                                            | retryable             |
| --------------- | --------------------------------------------------------------- | --------------------- |
| `auth`          | token expired/revoked/invalid (190, 102)                        | no — re-authenticate  |
| `permission`    | missing permission or Page role (10, 3, 200–299, 190+492)       | no                    |
| `rate_limit`    | throttled (4, 17, 32, 341, 613, 80000–80014); carries `usage`   | yes — back off        |
| `invalid_param` | bad request / params / object (100, 506, 1609005, …)            | no                    |
| `policy_block`  | integrity/abuse block (368)                                     | after a wait          |
| `transient`     | temporary server error (1, 2, `is_transient`, or 5xx)           | yes — immediate       |
| `unknown`       | a Graph envelope the SDK did not classify                       | inspect `code` / `raw`|
| `network`       | no Graph envelope: timeout, DNS, non-JSON body, batch timeout   | usually               |

Every error carries `category`, `httpStatus`, `isTransient`, and `raw` (the unprocessed, camelized envelope — the escape hatch). Graph-envelope errors (everything except `network`) also carry `code`, `type`, `message`, and optional `subcode`, `traceId`, `userTitle`, `userMessage`.

Because Facebook's code space is open-ended and version-volatile, `code` and `subcode` stay plain `number` — never closed literal unions. Named constants are exported for the documented values:

```ts
import { FacebookErrorCode, FacebookAuthSubcode } from "@tabsircg/fb-sdk/errors";

if (err.code === FacebookErrorCode.ACCESS_TOKEN && err.subcode === FacebookAuthSubcode.EXPIRED) {
  // token expired
}
```

The error classes are exported from `@tabsircg/fb-sdk/errors` for `instanceof` checks — `FacebookErrorBase` (any SDK error), `FacebookGraphError` (any error carrying a Graph envelope), and the concrete per-category classes (`FacebookAuthError`, `FacebookRateLimitError`, …).

> The SDK still throws the original `AxiosError` for direct requests, and `sdk.batch([...])` still returns the same `{ status, data }` results — `onError` only *observes* them. A hook that throws or rejects is swallowed so it can never mask the underlying error.

---

## Project layout

```
src/
├── client.ts              Public entry — createFbSdk + re-exports
├── errors.ts              Public error surface ("@tabsircg/fb-sdk/errors")
├── httpClient.ts          Axios wrapper, request → BatchableRequest
├── internal/
│   ├── batchable.ts       createBatchableRequest, buildRelativeUrl
│   ├── fetchers.ts        Page-level comment aggregator
│   ├── poller.ts          poll() + pollVideoStatus / pollReelStatus
│   ├── error.ts           FacebookUploadError + typed FacebookError model & hook
│   └── utils.ts           toGraphFields (selector → Graph string)
├── lib/
│   └── transformCase.ts   toCamel / toSnake + KeysToCamel / KeysToSnake types
├── resources/
│   ├── PageResource.ts    videos, reels, images, posts (page sub-resources)
│   ├── PostResource.ts    Single post, plus media node
│   ├── UserResource.ts    /me, /me/accounts
│   ├── InsightResource.ts Page + post insights with typed metric maps
│   ├── createBatchResource.ts   batch([...]) with 50-chunking
│   └── comment/
│       ├── CommentResource.ts        Single-comment CRUD + reply
│       └── PageCommentResource.ts    Cross-post aggregation
├── store/
│   ├── types.ts           Store interface
│   ├── memory.ts          createMemoryStore
│   └── redis.ts           createRedisStore + RedisLike interface
├── webhook/
│   ├── handler.ts         createWebhookHandler
│   └── normalize.ts       raw payload → WebhookEvent[]
└── types/
    ├── shared.ts          FbFieldSelector, FbPickDeep, DeepStrict, BatchableRequest
    ├── facebookpost.ts    FacebookPost / Comment / write-op params
    ├── facebookpage.ts    FacebookPage
    ├── facebookuser.ts    FacebookUser
    ├── facebookmedia.ts   FacebookMedia + publish params
    ├── facebookinsights.ts Page/Post metric maps, InsightResult shapes
    └── webhook.ts         Raw envelope + normalized WebhookEvent union

tests/
├── unit/                  vitest runtime tests
└── types/                 expect-type compile-time tests (typecheck only)
```

---

## Development

```bash
pnpm install
pnpm lint               # eslint (type-aware rules)
pnpm test               # vitest — unit tests + compile-time type tests
pnpm check              # lint + test
pnpm build              # check, then tsc → dist/
```

- Unit tests: `tests/unit/*.test.ts` (vitest). `httpClientContract.test.ts` exercises the **real** axios pipeline via adapter injection — keep it green when touching `httpClient.ts` or `batchable.ts`.
- Type tests: `tests/types/*.test-d.ts` — typecheck only, using `expect-type`. They include `@ts-expect-error` markers to assert that invalid usages fail to compile. They run as part of `pnpm test`.
- Linting runs before anything ships: `build` (and therefore `prepublishOnly`) is `lint → test → tsc`.
- `tsconfig.json` is on the strict end: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax` all on.

---

## Contributing

Bug reports, type-system gotchas, and PRs for missing Graph resources are all welcome. A few rough guidelines:

- Mirror the existing resource shape: a `createXResource({ http, id, config? })` factory returning typed methods that each produce a `BatchableRequest<T>`.
- Type the raw API shape as a `*Raw` interface (snake_case) and export the camelCase view as `KeysToCamel<*Raw>`. This is how every type stays in sync without duplication.
- Add a unit test under `tests/unit/` for runtime behaviour and a `.test-d.ts` under `tests/types/` for the type surface — especially `@ts-expect-error` cases for what *shouldn't* compile.
- Don't add retry / rate-limit logic without discussion; the current direction is to leave retries to the caller. The typed errors expose what a retry layer would need — `category` (`rate_limit`/`transient`/`policy_block` are retryable), `isTransient`, and `FacebookRateLimitError.usage`.

---

## License

ISC.
