# fb-sdk

A type-safe TypeScript SDK for the Facebook Graph API (v25.0), focused on page content management — publishing and listing videos, reels, images, and posts.

## Installation

```bash
npm install fb-sdk
```

**Dependencies:** `axios`, `form-data`

## Quick Start

```typescript
import { fbGraph } from "fb-sdk/dist/client.js";

const fb = fbGraph("YOUR_ACCESS_TOKEN");

// Get the authenticated user
const me = await fb.me.get({ id: true, name: true });

// List pages the user manages
const pages = await fb.me.accounts({ id: true, name: true, accessToken: true });

// Work with a specific page
const page = fb.pages("PAGE_ID");

// List recent videos
const videos = await page.videos.list({ id: true, title: true, createdTime: true });

// Publish an image
const { postId } = await page.images.publish({
  url: "https://example.com/photo.jpg",
  caption: "Hello from fb-sdk!",
});
```

## Authentication

The SDK requires a Facebook **access token** passed to `fbGraph()`. It is used as a query parameter (`access_token`) on all Graph API requests.

- **User tokens** — for `/me` endpoints (user profile, listing managed pages).
- **Page tokens** — for page-scoped operations (publishing content, listing feed). Retrieve page tokens via `fb.me.accounts(...)`.

The SDK does not handle token refresh or OAuth flows — you must supply a valid token.

## API Reference

### `fbGraph(accessToken: string)`

Entry point. Returns an object with three resource namespaces:

| Property        | Type           | Description                                         |
| --------------- | -------------- | --------------------------------------------------- |
| `me`            | `UserResource` | Authenticated user operations                       |
| `posts`         | `PostResource` | Post operations (get, expire, comments)             |
| `pages(pageId)` | `PageResource` | Page-scoped resources (videos, reels, images, feed) |

---

### `fb.me` — User Resource

#### `me.get(fields)`

Fetches the authenticated user's profile.

```typescript
const user = await fb.me.get({ id: true, name: true, picture: true });
```

#### `me.accounts(fields)`

Lists Facebook Pages managed by the authenticated user.

```typescript
const pages = await fb.me.accounts({
  id: true,
  name: true,
  accessToken: true,
  picture: { data: { url: true, width: true } },
});
```

Returns `Collection<FacebookPage, F>` with `data` and `paging`.

---

### `fb.posts` — Post Resource

#### `posts.get(postId, fields)`

Fetches a single post by ID.

```typescript
const post = await fb.posts.get("POST_ID", {
  id: true,
  message: true,
  createdTime: true,
  shares: true,
});
```

#### `posts.expire(postId, time, type)`

Sets an expiration on a post. `time` is a Unix timestamp in **milliseconds** (converted to seconds internally). `type` is either `"expire_only"` or `"expire_and_delete"`.

```typescript
await fb.posts.expire("POST_ID", Date.now() + 86400000, "expire_and_delete");
```

#### `posts.comments.get(postId, fields)`

Fetches comments on a post.

```typescript
const comments = await fb.posts.comments.get("POST_ID", {
  id: true,
  message: true,
  createdTime: true,
  from: { name: true },
});
```

Returns `Collection<Comment, F>`.

---

### `fb.pages(pageId)` — Page Resource

Returns an object with four sub-resources:

#### `page.videos.list(fields, limit?)`

Lists videos on the page. Default limit: `5`.

```typescript
const videos = await page.videos.list(
  {
    id: true,
    title: true,
    description: true,
    views: true,
    status: true,
  },
  10,
);
```

#### `page.videos.publish(data)`

Publishes a video. Handles file upload, optional thumbnail, and polls for completion on `504` timeout. Throws `FacebookUploadError` on failure.

```typescript
const { postId } = await page.videos.publish({
  fileUrl: "https://example.com/video.mp4",
  title: "My Video",
  description: "Video description",
  thumbnailUrl: "https://example.com/thumb.jpg", // optional
});
```

#### `page.reels.list(fields, limit?)`

Lists reels on the page. Default limit: `5`.

#### `page.reels.get(mediaId, fields)`

Fetches a single reel by ID.

#### `page.reels.publish(data)`

Publishes a reel using Facebook's three-phase upload protocol (START → upload file → FINISH). Polls for completion. Throws `FacebookUploadError` on failure.

```typescript
const { postId } = await page.reels.publish({
  fileUrl: "https://example.com/reel.mp4",
  title: "My Reel",
  thumbnailUrl: "https://example.com/thumb.jpg", // optional
});
```

#### `page.images.list(fields, limit?)`

Lists photos on the page. Default limit: `5`.

#### `page.images.get(mediaId, fields)`

Fetches a single image by ID.

#### `page.images.publish(data)`

Publishes an image.

```typescript
const { postId } = await page.images.publish({
  url: "https://example.com/photo.jpg",
  caption: "My photo",
});
```

#### `page.feed.list(fields, options?)`

Lists the page's feed posts. Supports time-range filtering and ordering.

```typescript
const feed = await page.feed.list(
  {
    id: true,
    message: true,
    createdTime: true,
    statusType: true,
  },
  {
    limit: 25, // default: 25
    order: ORDER.NEWEST, // default: NEWEST
    since: 1700000000, // optional Unix timestamp
    until: 1710000000, // optional Unix timestamp
  },
);
```

---

## Type-Safe Field Selection

All `get` and `list` methods use a **field selector** pattern. You pass an object describing the fields you want, and the return type is narrowed to only those fields — no extra properties, full autocomplete.

```typescript
// Only 'id' and 'name' are present in the result type
const user = await fb.me.get({ id: true, name: true });
//    ^? { id: string; name: string }
```

For nested objects, pass a nested selector:

```typescript
const user = await fb.me.get({
  id: true,
  picture: { data: { url: true } },
});
//    ^? { id: string; picture: { data: { url: string } } }
```

This is powered by the `FbFieldSelector<T>` and `FbPickDeep<T, F>` utility types in `src/types/shared.ts`, with configurable recursion depth.

---

## Pagination

List endpoints return a `Collection<T, F>` with:

```typescript
{
  data: T[];
  paging: {
    cursors: { before: string; after: string };
    next?: string;   // URL for next page, if available
  };
}
```

There is **no built-in auto-pagination or cursor-following helper** currently. You receive the `paging` object and handle cursor-based pagination manually.

---

## Error Handling

### `FacebookUploadError`

A custom error class (`src/internal/error.ts`) thrown when media uploads fail. Extends `Error` and includes:

- `message` — stringified Facebook error object
- `status` — the `FacebookMedia["status"]` object with phase-level error details

Thrown by video, reel, and image publish methods.

### HTTP-Level Errors

The SDK does not wrap general HTTP/Axios errors. Non-upload failures propagate as standard Axios errors. The `safe` mode on the HTTP client suppresses Axios throwing on specific status codes (used internally for upload flows).

---

## Key Types

| Type                 | File                     | Description                                                     |
| -------------------- | ------------------------ | --------------------------------------------------------------- |
| `FacebookUser`       | `types/facebookuser.ts`  | User profile fields                                             |
| `FacebookPage`       | `types/facebookpage.ts`  | Page fields (id, name, access_token, picture)                   |
| `FacebookPost`       | `types/facebookpost.ts`  | Post fields (message, shares, reactions, comments, attachments) |
| `Comment`            | `types/facebookpost.ts`  | Comment with nested replies                                     |
| `FacebookVideo`      | `types/facebookmedia.ts` | Video fields + status                                           |
| `FacebookReel`       | `types/facebookmedia.ts` | Reel fields + status                                            |
| `FacebookImage`      | `types/facebookmedia.ts` | Image fields + status                                           |
| `PublishVideoParams` | `types/facebookmedia.ts` | Video upload parameters                                         |
| `PublishReelParams`  | `types/facebookmedia.ts` | Reel upload parameters                                          |
| `PublishImageParams` | `types/facebookmedia.ts` | Image upload parameters                                         |
| `Collection<T, F>`   | `types/shared.ts`        | Paginated list response                                         |
| `FbFieldSelector<T>` | `types/shared.ts`        | Type-safe field selector                                        |
| `FbPickDeep<T, F>`   | `types/shared.ts`        | Deep pick based on selector                                     |
| `FacebookApiError`   | `types/shared.ts`        | Error shape from Facebook API                                   |
| `ORDER`              | `types/shared.ts`        | Enum: `OLDEST`, `NEWEST`                                        |

All types are defined in **camelCase** using the `KeysToCamel` transform applied to raw snake_case interfaces that mirror the Graph API schema.

---

## Development

### Scripts

```bash
npm run build    # Compile TypeScript → dist/
```

### Tech Stack

- **TypeScript** (strict mode, `ES2022` target, `NodeNext` modules)
- **axios** — HTTP client
- **form-data** — multipart uploads

### Project Structure

```
src/
├── client.ts              # Entry point — fbGraph() factory
├── httpClient.ts          # Axios wrapper with case transforms
├── utils.ts               # Field selector → Graph API fields string
├── internal/
│   ├── error.ts           # FacebookUploadError class
│   └── poller.ts          # Generic polling + video/reel status pollers
├── lib/
│   └── transformCase.ts   # camelCase ↔ snake_case transforms (runtime + types)
├── resources/
│   ├── PageResource.ts    # Page sub-resources (videos, reels, images, feed)
│   ├── PostResource.ts    # Post operations + comments
│   └── UserResource.ts    # /me endpoints
└── types/
    ├── shared.ts          # Collection, Paging, FbFieldSelector, FbPickDeep
    ├── facebookmedia.ts   # Video, Reel, Image types + publish params
    ├── facebookpage.ts    # Page + Feed types
    ├── facebookpost.ts    # Post, Comment, PostExpiration types
    └── facebookuser.ts    # User type
```

### No Tests

There are **no tests** in the codebase currently. Test files are excluded in `tsconfig.json` (`**/*.spec.ts`), suggesting the convention would be co-located `.spec.ts` files when added.
