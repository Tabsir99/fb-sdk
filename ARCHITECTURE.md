# Architecture

Internal design documentation for fb-sdk.

## Directory Structure

```
fb-sdk/
├── src/
│   ├── client.ts              # Public entry point — exports fbGraph()
│   ├── httpClient.ts          # Axios-based HTTP client with case transforms
│   ├── utils.ts               # toGraphFields() — converts field selector objects to Graph API field strings
│   ├── internal/              # Internal implementation details, not user-facing
│   │   ├── error.ts           # FacebookUploadError custom error class
│   │   └── poller.ts          # Generic poll() utility + video/reel specific pollers
│   ├── lib/                   # Pure utility functions
│   │   └── transformCase.ts   # Runtime + type-level camelCase ↔ snake_case transforms
│   ├── resources/             # Resource modules — one per Facebook entity type
│   │   ├── PageResource.ts    # Page-scoped: videos, reels, images, feed
│   │   ├── PostResource.ts    # Post get/expire + comments sub-resource
│   │   └── UserResource.ts    # /me profile + accounts
│   └── types/                 # TypeScript type definitions mirroring Graph API schema
│       ├── shared.ts          # Collection, Paging, FbFieldSelector, FbPickDeep, ORDER, insight types
│       ├── facebookmedia.ts   # Video, Reel, Image entities + publish params/responses
│       ├── facebookpage.ts    # Page + Feed types
│       ├── facebookpost.ts    # Post, Comment, PostExpiration
│       └── facebookuser.ts    # User type
├── dist/                      # Compiled output (tsc)
├── package.json
├── tsconfig.json
└── .prettierrc
```

---

## Request Lifecycle

A typical API call flows through these layers:

```
User code                              Facebook Graph API
   │                                          ▲
   ▼                                          │
fbGraph(token)                                │
   │                                          │
   ├─► createHttpClient(token)                │
   │      └─ returns { get, post, getToken }  │
   │                                          │
   ├─► Resource factory (e.g. createPageResource)
   │      │                                   │
   │      ▼                                   │
   │   Resource method called                 │
   │      │                                   │
   │      ├─ toGraphFields(selector)          │
   │      │   camelCase obj → "field1,field2{nested}" string
   │      │                                   │
   │      ├─ (for POST) toSnakeFormData(data) │
   │      │   camelCase obj → snake_case FormData
   │      │                                   │
   │      ▼                                   │
   │   http.get() or http.post()              │
   │      │                                   │
   │      ├─ Outgoing: access_token injected as query param
   │      │            POST body keys → snake_case
   │      │                                   │
   │      ├─ axios sends request ─────────────┘
   │      │                                   │
   │      ├─ Incoming: response body keys → camelCase (toCamel)
   │      │                                   │
   │      └─ safe mode: returns { data, status }
   │         normal mode: returns data directly
   │                                          │
   └─► (for uploads) poller checks status     │
          poll() retries until complete ───────┘
```

### Key Observations

1. **Field names are camelCase everywhere in user-facing code.** The SDK translates to/from snake_case at the HTTP boundary.
2. **Field selection is translated** from `{ createdTime: true, title: true }` to `"created_time,title"` via `toGraphFields()`.
3. The `access_token` is injected as a query parameter on GET requests. POST bodies do not include it.
4. The `safe` option on HTTP methods changes the return shape to include status code — used internally for upload flows that need to detect `504` timeouts.

---

## Core Modules

### `client.ts` — Entry Point

Factory function `fbGraph(accessToken)` that:

1. Creates an `HttpClient` instance
2. Returns a facade with resource namespaces: `me`, `posts`, `pages(pageId)`

The `pages` function is curried — it takes a `pageId` and returns page-scoped sub-resources.

### `httpClient.ts` — HTTP Client

**Two axios instances exist:**

| Instance           | Purpose                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `fbApi` (internal) | Pre-configured with `baseURL: https://graph.facebook.com/v25.0` and `family: 4` (force IPv4). Used for all Graph API calls.        |
| `api` (exported)   | Bare axios instance with `family: 4`. Used for non-Graph requests (thumbnail download, reel file upload to Facebook's upload URL). |

**`createHttpClient(accessToken)`** returns an `HttpClient` with:

- **`get<T>(path, options?)`** — GET with auto `access_token` injection and response camelCase transform.
- **`post<T>(path, data, options?)`** — POST with:
  - FormData bodies sent as-is (with proper headers)
  - Object bodies transformed to snake_case via `toSnakeObj`
  - Response camelCase transform
- **`getToken()`** — Returns the raw access token (used by reel upload to set the `Authorization` header).

**Overloaded signatures:**

- Default mode returns `T` directly.
- `{ safe: true }` mode returns `{ data: T, status: number }` and uses a custom `validateStatus` for POST (allows `200` and `504`).

### `utils.ts` — Field Serialization

`toGraphFields(fields)` recursively converts a field selector object to Facebook's fields query parameter format:

```
{ id: true, status: { videoStatus: true } }
→ "id,status{video_status}"
```

Keys are converted to snake_case. Nested objects produce `{...}` sub-field syntax.

---

## Case Transformation System (`lib/transformCase.ts`)

This module provides both **runtime functions** and **type-level transforms** for camelCase ↔ snake_case conversion.

### Runtime Functions

| Function                | Direction     | Input                  | Output                          |
| ----------------------- | ------------- | ---------------------- | ------------------------------- |
| `toCamel(obj)`          | snake → camel | Object/Array/primitive | Deep key transform              |
| `toSnakeCase(str)`      | camel → snake | String                 | `"myField"` → `"my_field"`      |
| `toSnakeObj(obj)`       | camel → snake | Object/Array/string    | Deep key transform              |
| `toSnakeFormData(data)` | camel → snake | Flat object            | `FormData` with snake_case keys |

### Type-Level Transforms

| Type              | Purpose                               |
| ----------------- | ------------------------------------- |
| `SnakeToCamel<S>` | `"foo_bar"` → `"fooBar"`              |
| `KeysToCamel<T>`  | Deep transform all keys to camelCase  |
| `CamelToSnake<S>` | `"fooBar"` → `"foo_bar"`              |
| `KeysToSnake<T>`  | Deep transform all keys to snake_case |

### `toSnakeFormData` Specifics

- Skips `null`, `undefined`, and empty string values.
- Serializes nested objects as JSON strings (unless they are `Buffer` or stream-like).
- Produces a `form-data` `FormData` instance (Node.js, not browser).

---

## Type-Safe Field Selection System (`types/shared.ts`)

The SDK's standout feature: you select fields with an object literal, and the return type only includes those fields.

### `FbFieldSelector<T, D>`

Generates the set of valid field selectors for type `T` with recursion depth `D` (default: 1, max: 5).

- Leaf fields → `true`
- Object/Collection fields → nested selector or `true`
- Depth limiting prevents infinite recursion on self-referencing types

### `FbPickDeep<T, F>`

Given a type `T` and a field selector `F`, produces the narrowed return type containing only selected fields. Handles:

- Leaf selection (`true` → direct type)
- Nested object selection → recurse
- Collection selection → `{ data: picked[]; paging: Paging }`

### `Collection<T, F, P>`

Standard paginated response shape: `{ data: FbPickDeep<T, F>[]; paging: P }`.

### `CollectionOf<T, P>`

Non-selector version used in raw type definitions (e.g., comments within a post type).

---

## Pagination

### Current Implementation

Pagination metadata is included in responses as the `Paging` interface:

```typescript
interface Paging {
  cursors: { before: string; after: string };
  next?: string;
}
```

The `feed.list()` method supports time-based filtering (`since`, `until` Unix timestamps) and ordering (`ORDER.NEWEST` / `ORDER.OLDEST`).

### What Does Not Exist

- No cursor-following / auto-pagination utility
- No `fetchAll()` or iterator pattern
- Consumers must manually use `paging.next` or cursor values

---

## Polling System (`internal/poller.ts`)

### Generic `poll<TArgs, TResult>(fn, config)`

A higher-order function that wraps any async function into a polling loop:

- `fn` returns `TResult | undefined` — `undefined` means "not ready yet"
- Config: `maxAttempts` (default: 30), `intervalMs` (default: 10000)
- Throws after timeout

### Specialized Pollers

| Poller            | Used By            | Interval | Max Wait |
| ----------------- | ------------------ | -------- | -------- |
| `pollVideoStatus` | `videos.publish()` | 20s      | 10 min   |
| `pollReelStatus`  | `reels.publish()`  | 10s      | 5 min    |

Both check upload phase statuses and throw `FacebookUploadError` with detailed status if any phase reports `"error"`.

---

## Error Handling

### Error Types

| Error                 | Source              | Details                                                        |
| --------------------- | ------------------- | -------------------------------------------------------------- |
| `FacebookUploadError` | Media uploads       | Custom class with `status` (phase-level error info)            |
| Axios errors          | HTTP failures       | Not wrapped — propagate as-is                                  |
| `Error`               | Polling timeout     | Generic "Polling timed out" message                            |
| `Error`               | Reel upload session | "Failed to upload post due to upload session creation failure" |

### Error Flow in Uploads

1. **Video publish:** POST with `safe: true` → check for error code 389 → throw `FacebookUploadError`. On 504, fall back to polling.
2. **Reel publish:** Three-phase upload. After FINISH, check response for error → throw `FacebookUploadError`. Then poll for `postId`.
3. **Polling:** Each poll iteration checks phase statuses. First error found → throw `FacebookUploadError` with the status object.

---

## Auth Token Management

- Token is closured inside `createHttpClient` — passed once via `fbGraph(token)`.
- Injected as `access_token` query param on all `get()` calls.
- Available via `getToken()` for manual use (reel upload `Authorization` header).
- No refresh, rotation, or expiry handling — consumer's responsibility.

---

## Naming Conventions

| Element                  | Convention                                        | Example                                  |
| ------------------------ | ------------------------------------------------- | ---------------------------------------- |
| Files                    | PascalCase for resources, camelCase for utilities | `PageResource.ts`, `transformCase.ts`    |
| Type files               | Lowercase, entity-prefixed                        | `facebookmedia.ts`, `facebookpost.ts`    |
| Raw interfaces           | Suffixed with `Raw`                               | `FacebookPostRaw`, `MediaRaw`            |
| Camel types              | Named export, no suffix                           | `FacebookPost`, `FacebookVideo`          |
| Factory functions        | `create*` prefix                                  | `createHttpClient`, `createPageResource` |
| Resource methods         | Verb naming: `get`, `list`, `publish`, `expire`   | —                                        |
| Type aliases for methods | PascalCase verb types                             | `ListVideos`, `PublishReel`, `GetPost`   |
| Enums                    | PascalCase name, SCREAMING_SNAKE values           | `ORDER.NEWEST`                           |

---

## Patterns for Adding a New Resource

### 1. Define Types

Create or extend a file in `src/types/`:

```typescript
// src/types/facebookstory.ts
import { KeysToCamel } from "../lib/transformCase.js";

interface FacebookStoryRaw {
  id: string;
  media_type: "photo" | "video";
  created_time: string;
}
export type FacebookStory = KeysToCamel<FacebookStoryRaw>;
```

### 2. Create Resource Factory

Create `src/resources/StoryResource.ts`:

```typescript
import { HttpClient } from "../httpClient.js";
import { toGraphFields } from "../utils.js";
import { FbFieldSelector, Collection } from "../types/shared.js";
import { FacebookStory } from "../types/facebookstory.js";

export type ListStories = <F extends FbFieldSelector<FacebookStory>>(
  fields: F,
  limit?: number,
) => Promise<Collection<FacebookStory, F>>;

export function createStoryResource(http: HttpClient, pageId: string) {
  const list: ListStories = async (fields, limit = 5) =>
    http.get(`/${pageId}/stories`, {
      params: { fields: toGraphFields(fields), limit },
    });

  return { list };
}
```

### 3. Register in Client

Add to `src/client.ts`:

```typescript
import { createStoryResource } from "./resources/StoryResource.js";

// Inside fbGraph():
pages: (pageId: string) => ({
  ...createPageResource(http, pageId),
  stories: createStoryResource(http, pageId),
}),
```

### 4. Conventions to Follow

- Define raw interfaces with snake_case keys matching the Graph API
- Export camelCase types via `KeysToCamel<Raw>`
- Export method type aliases (e.g., `ListStories`)
- Use `toGraphFields()` for field serialization
- Use `toSnakeFormData()` for POST bodies with files
- For uploads that may timeout, implement polling with the `poll()` utility
- All file imports must use `.js` extension (NodeNext module resolution)
