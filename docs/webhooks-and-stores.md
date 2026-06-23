# Webhooks and stores

The webhook handler and the comment-aggregation resource are two halves of one design: **Facebook tells you when a post receives a comment; the SDK remembers that and uses it to skip dead posts when you read.**

This doc covers:
- The `Store` interface and its two implementations.
- The webhook handler — what it verifies, what it records.
- How `sdk.page(id).comments.list(...)` uses the store to avoid scanning all posts.

Files: [`src/store/`](../src/store/), [`src/webhook/handler.ts`](../src/webhook/handler.ts), [`src/resources/comment/PageCommentResource.ts`](../src/resources/comment/PageCommentResource.ts).

---

## The `Store` interface

```ts
export interface Store {
  recordActivity(pageId: string, postId: string, time: number): Promise<void>;
  getActivePosts(pageId: string, since: number): Promise<string[]>;
  cleanup(olderThan: number): Promise<void>;
}
```

The contract is intentionally small. It is not a generic cache or KV — it answers exactly one question: *"For page X, which posts had comment activity since timestamp Y?"*

### `createMemoryStore()`

In-process `Map<pageId, Map<postId, lastTime>>`. Suitable for single-server apps and tests. Loses everything on restart.

The `recordActivity` implementation only writes when the new timestamp is newer than the stored one — important when webhook events arrive out of order.

### `createRedisStore(client)`

Backed by Redis sorted sets, one key per page (`fb:comments:{pageId}`). Members are post IDs, scores are timestamps. The operations map to native Redis commands:

| Method            | Redis command                                                      |
| ----------------- | ------------------------------------------------------------------ |
| `recordActivity`  | `ZADD fb:comments:{pageId} GT <time> <postId>`                     |
| `getActivePosts`  | `ZRANGEBYSCORE fb:comments:{pageId} <since> +inf`                  |
| `cleanup`         | `KEYS fb:comments:*` + `ZREMRANGEBYSCORE … -inf <olderThan>`       |

The `GT` flag gives the Redis store the same out-of-order semantics as the memory store — a delivery with an older timestamp can never move a post's last-activity time backwards. **It requires Redis ≥ 6.2.**

The store doesn't import any specific Redis client. Instead, it accepts a `RedisLike` object:

```ts
export interface RedisLike {
  zadd(key: string, ...args: (string | number)[]): Promise<number>;
  zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}
```

`zadd` is variadic so flags like `GT` can be passed through — `ioredis` matches this shape directly; a thin adapter covers `node-redis` v4. Mocks for tests are trivial.

> **A note on `cleanup`'s `KEYS`** — `KEYS` is fine on small fleets but blocks Redis on large keyspaces. If you have thousands of active pages, replace it with `SCAN` in your own adapter, or drive cleanup with a separate index of active page IDs.

---

## The webhook handler

```ts
const webhook = createWebhookHandler({
  store,
  verifyToken: process.env.FB_VERIFY_TOKEN!,
  appSecret: process.env.FB_APP_SECRET!,
  // optional — background failures (store writes) land here instead of
  // becoming unhandled rejections after the 200 was already sent
  onError: (err) => console.error("webhook processing failed", err),
});

app.get("/webhook", webhook.handleVerify);
app.post("/webhook", webhook.handleEvent);
```

### `handleVerify` (GET)

Implements Facebook's subscribe-token handshake. Returns `200 <challenge>` when `hub.mode === "subscribe"` and `hub.verify_token` matches; otherwise `403`.

### `handleEvent` (POST)

1. **Verifies signature.** Reads `X-Hub-Signature-256` and recomputes `sha256 = HMAC-SHA256(rawBody, appSecret)`, comparing with `crypto.timingSafeEqual`. If signature is missing or mismatched, returns `403` and stops.
2. **Responds 200 immediately.** Facebook expects sub-second responses or it retries — heavy work runs *after* `res.send`.
3. **Walks `payload.entry[].changes[]`.** Entries without a `changes` array (other subscription types, e.g. messaging) are skipped. For every change of `field === "feed"` where `value.item === "comment"`, `value.verb === "add"`, and `value.post_id` is present, calls `store.recordActivity(pageId, post_id, value.created_time)`.
4. **Settles all store writes** before resolving. Failures never escape the handler — each rejected write is reported through `onError` (if configured) and otherwise swallowed, because the HTTP response is already gone.

The framework is unopinionated about which web library you use. The handler takes a minimal `{ status, send }`-shaped response and `{ query, headers, body, rawBody }`-shaped request — any of express, fastify, hono, etc., fit.

> **`rawBody` matters.** Signature verification has to run against the *exact bytes* of the request. If your framework JSON-parsed the body but didn't keep the raw bytes, signatures will not match. With express, use `verify` in `express.json` to stash `req.rawBody`:
>
> ```ts
> app.use(express.json({ verify: (req, _res, buf) => ((req as any).rawBody = buf) }));
> ```

### What it does NOT do

- It does not handle `reaction`, `share`, or `post` add/edit events. They're modeled in [`src/types/webhook.ts`](../src/types/webhook.ts) but the handler ignores them today.
- It does not retry store writes on failure.
- It does not deduplicate. If FB sends the same event twice, `recordActivity` is called twice — that's fine for sorted sets and for the in-memory map (both idempotent on identical inputs), but assume at-least-once semantics.

---

## Page-level comment aggregation

`sdk.page(pageId).comments.list({...})` is the one resource that does *multi-step* work, and it's the consumer of the store.

```ts
const comments = await sdk.page(pageId).comments.list({
  fields: {
    id: true,
    message: true,
    from: { id: true, name: true },
    post: { id: true, message: true, picture: true },
  },
  options: { since: Date.now() - 24 * 60 * 60 * 1000 },
});
```

The resource has three modes, depending on what you pass in:

| Inputs                                    | Mode                                                               |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `options.after` (cursor from prior call)  | Continue paging with that cursor.                                  |
| `config.store` + `options.since`          | **Store-accelerated** — only fetch comments from active posts.     |
| neither of the above                      | **On-demand** — list the most recent posts and fan out (`postsLimit` in `createFbSdk` config; default 50, max 100). |

In all three modes, it then calls [`fetchComments`](../src/internal/fetchers.ts), which uses `sdk.batch([...])` to fetch comments from each post in parallel (1 HTTP request per 50 posts).

### Store-accelerated path

When you pass `{ store }` to `createFbSdk()` and the webhook handler is recording activity, the resource only ever asks the Graph API about posts that *actually have* recent comments.

For a page with 10,000 posts where 12 received comments in the last hour, that's:

| Mode             | HTTP calls                                              |
| ---------------- | ------------------------------------------------------- |
| On-demand        | 1 (list latest 50 posts) + 1 (batch comments)           |
| Store-accelerated | 1 (batch comments for the 12 active posts)              |

But more importantly, the **on-demand mode misses comments on older posts entirely** — it only scans the most recent 50. The store-accelerated mode catches activity on any post, regardless of age, as long as the webhook fires.

### The cursor

Each post has its own Graph paging cursor. Aggregating across N posts means N cursors. To present a *single* opaque pagination token to the caller, the resource encodes them all into one base64url string:

```ts
interface AggregationCursor {
  cursors: Record<string, string>; // postId → next-cursor for that post
}
```

The encoder is `Buffer.from(JSON.stringify(cursor)).toString("base64url")`. Stable, no signing — the cursor is whatever post IDs you've paged through, and they're not secret. If a post drops out before the next page (e.g. it was deleted), its cursor is silently ignored on the next fetch.

### The `post` field

You can include a `post` selector inside the comment field selector:

```ts
options: { …, fields: { post: { id: true, message: true, picture: true } } }
```

This isn't a real Graph field — the SDK splits it out of the selector, asks the Graph API for those fields on the *post* node, and attaches the result onto each comment's `post` property in the response. This is how the type stays clean (`PageComment extends CommentWithPost`) without changing the on-the-wire request.

### Not batchable

The return type of `comments.list` is `Promise<Collection<...>>`, not `BatchableRequest<...>`. This is the surface-level signal that this resource is doing multi-step work and **cannot** be embedded in `sdk.batch([...])`. The internal batching it does for the per-post fan-out is invisible to the caller.

---

## Putting it together

A minimal production setup:

```ts
import Redis from "ioredis";
import {
  createFbSdk,
  createRedisStore,
  createWebhookHandler,
} from "@tabsircg/fb-sdk";

const redis = new Redis(process.env.REDIS_URL!);
const store = createRedisStore(redis);

// SDK instance, parameterized once with the store
const sdk = createFbSdk({ store });

// Webhook handler — wire into your HTTP server
const webhook = createWebhookHandler({
  store,
  verifyToken: process.env.FB_VERIFY_TOKEN!,
  appSecret: process.env.FB_APP_SECRET!,
});

// In a worker / cron — periodically scan for new comments
async function pollNewComments(pageAccessToken: string, pageId: string, lastSeen: number) {
  const fb = sdk(pageAccessToken);
  let cursor: string | undefined;
  const all = [];

  do {
    const page = await fb.page(pageId).comments.list({
      fields: {
        id: true,
        message: true,
        from: { id: true, name: true },
        post: { id: true, message: true },
      },
      options: { since: lastSeen, after: cursor },
    });
    all.push(...page.data);
    cursor = page.paging.cursors.after || undefined;
  } while (cursor);

  return all;
}

// And a periodic cleanup (e.g. drop activity older than 30 days)
setInterval(() => {
  void store.cleanup(Date.now() - 30 * 24 * 60 * 60 * 1000);
}, 60 * 60 * 1000);
```

The webhook writes to the store; the poller reads from it. Neither knows about the other.
