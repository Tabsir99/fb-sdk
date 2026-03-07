# CLAUDE.md

## Project Summary

fb-sdk is a TypeScript SDK wrapping the Facebook Graph API v25.0. It provides type-safe, camelCase access to Facebook Page content management — publishing and listing videos, reels, images, and posts. The key feature is a field selector system where you pass `{ id: true, title: true }` and the return type is narrowed to only those fields. It uses axios for HTTP, automatic camelCase ↔ snake_case transforms at the transport boundary, and a polling system for async media uploads.

## Tech Stack

- **Language:** TypeScript (strict mode, `ES2022` target, `NodeNext` module resolution)
- **Runtime:** Node.js (ESM — `"type": "module"` in package.json)
- **HTTP:** axios `^1.13.6`
- **Multipart:** form-data `^4.0.5`
- **No test framework installed** (yet)
- **No linter installed** (yet)
- **Formatter:** Prettier (`printWidth: 100`)

## File Structure

```
src/
├── client.ts              # Entry point: fbGraph(token) factory
├── httpClient.ts          # Axios wrapper — auto case transforms, safe mode
├── utils.ts               # toGraphFields(): field selector → "field1,field2{nested}" string
├── internal/
│   ├── error.ts           # FacebookUploadError extends Error
│   └── poller.ts          # Generic poll() + pollVideoStatus, pollReelStatus
├── lib/
│   └── transformCase.ts   # toCamel, toSnakeObj, toSnakeFormData + type-level transforms
├── resources/
│   ├── PageResource.ts    # videos, reels, images, feed sub-resources
│   ├── PostResource.ts    # get, expire, comments sub-resource
│   └── UserResource.ts    # get (/me), accounts (/me/accounts)
└── types/
    ├── shared.ts          # FbFieldSelector, FbPickDeep, Collection, Paging, ORDER
    ├── facebookmedia.ts   # Video/Reel/Image types + publish params/responses
    ├── facebookpage.ts    # Page, Feed types
    ├── facebookpost.ts    # Post, Comment, PostExpiration
    └── facebookuser.ts    # User type
```

## Coding Conventions

- **Indentation:** 2 spaces
- **Quotes:** Double quotes
- **Semicolons:** Yes
- **Print width:** 100 (Prettier)
- **Imports:** Named imports, `.js` extensions required (NodeNext resolution)
- **Export style:** Named exports only — no default exports anywhere
- **Naming:**
  - Files: PascalCase for resources (`PageResource.ts`), camelCase for utilities (`transformCase.ts`), lowercase for types (`facebookmedia.ts`)
  - Interfaces: PascalCase. Raw (snake_case) interfaces suffixed with `Raw` (`FacebookPostRaw`)
  - Exported types: PascalCase, no suffix (`FacebookPost = KeysToCamel<FacebookPostRaw>`)
  - Factory functions: `create*` prefix (`createHttpClient`, `createPageResource`)
  - Resource methods: verb-based (`get`, `list`, `publish`, `expire`)
  - Method type aliases: PascalCase verb (`ListVideos`, `PublishReel`, `GetPost`)
- **Pattern:** Functional factories, not classes. `create*` functions close over `HttpClient` and return plain objects.
- **No classes** except `FacebookUploadError` (extends `Error`)

## How to Add a New API Resource

### Step 1: Define types in `src/types/`

Create a new file (e.g., `facebookstory.ts`) or extend an existing one:

```typescript
import { KeysToCamel } from "../lib/transformCase.js";

// Raw interface with snake_case keys matching the Graph API response
interface FacebookStoryRaw {
  id: string;
  media_type: "photo" | "video";
  created_time: string;
}

// Exported camelCase version
export type FacebookStory = KeysToCamel<FacebookStoryRaw>;
```

**Rules:**

- Raw interfaces are snake_case, NOT exported (unless needed by other types)
- Exported type uses `KeysToCamel<Raw>` transform
- Match field names exactly to the Graph API documentation

### Step 2: Create resource in `src/resources/`

Create `StoryResource.ts`:

```typescript
import { HttpClient } from "../httpClient.js";
import { toGraphFields } from "../utils.js";
import { FbFieldSelector, FbPickDeep, Collection } from "../types/shared.js";
import { FacebookStory } from "../types/facebookstory.js";

// Export method type aliases
export type ListStories = <F extends FbFieldSelector<FacebookStory>>(
  fields: F,
  limit?: number,
) => Promise<Collection<FacebookStory, F>>;

export type GetStory = <F extends FbFieldSelector<FacebookStory>>(
  storyId: string,
  fields: F,
) => Promise<FbPickDeep<FacebookStory, F>>;

// Factory function
export function createStoryResource(http: HttpClient, pageId: string) {
  const list: ListStories = async (fields, limit = 5) =>
    http.get(`/${pageId}/stories`, {
      params: { fields: toGraphFields(fields), limit },
    });

  const get: GetStory = async (storyId, fields) =>
    http.get(`/${storyId}`, {
      params: { fields: toGraphFields(fields) },
    });

  return { list, get };
}
```

**Rules:**

- Factory function receives `HttpClient` (and `pageId` if page-scoped)
- Use `toGraphFields(fields)` for the `fields` param
- For write operations, use `toSnakeFormData(data)` for FormData or `toSnakeObj(data)` for JSON bodies
- For uploads that may timeout, use `poll()` from `internal/poller.ts`
- Explicit type alias for every public method

### Step 3: Register in `src/client.ts`

Import and add to the `fbGraph()` return object:

```typescript
import { createStoryResource } from "./resources/StoryResource.js";

// If page-scoped, add inside the pages factory:
pages: (pageId: string) => ({
  ...createPageResource(http, pageId),
  stories: createStoryResource(http, pageId),
}),

// If user-scoped, add at root level alongside 'me' and 'posts'
```

### Step 4: For publish endpoints with uploads

Follow this pattern from `PageResource.ts`:

1. Use `toSnakeFormData()` to build FormData
2. POST with `{ safe: true }` if you need to handle timeouts
3. Check for Facebook error codes in response
4. On `504`, fall through to polling
5. Throw `FacebookUploadError` on failure

## How to Add New Types

1. Add raw snake_case interface in the appropriate `src/types/` file
2. Export a `KeysToCamel<>` wrapped version
3. If the type is a collection, use `CollectionOf<T>` from `shared.ts`
4. Publish params: define raw interface, export `KeysToCamel<Raw>` version
5. Publish responses: define as union type for success/error cases

## How to Add Tests

No test framework is currently installed. Based on `tsconfig.json`:

- **File convention:** `*.spec.ts` (excluded from compilation)
- **Location:** Co-located with source files (e.g., `client.spec.ts` next to `client.ts`)
- **Suggested framework:** vitest or jest with ts-jest
- **Mocking:** The `HttpClient` interface makes mocking straightforward — pass a mock object implementing `{ get, post, getToken }`

## Commands

```bash
npm run build    # tsc — compiles src/ → dist/
```

No test, lint, or format commands are configured.

## Gotchas and Non-Obvious Decisions

1. **Two axios instances exist** — `fbApi` (internal to `httpClient.ts`, has Graph API base URL) and `api` (exported, bare). The exported `api` is used for thumbnail downloads and reel file uploads to Facebook's separate upload URLs. Don't accidentally use one for the other.

2. **`safe` mode overloading** — The `HttpClient.get` and `post` methods are overloaded based on the `safe` property in options. `safe: true` returns `{ data, status }` and suppresses Axios errors on 504. `safe: false` or omitted returns `data` directly. TypeScript narrows the return type based on this.

3. **`toSnakeFormData` skips null/undefined/empty string** — Values that are `null`, `undefined`, or `""` are silently dropped from the FormData. This is intentional to avoid sending empty fields to the API.

4. **Reel upload is three-phase** — START (get upload URL) → upload file (to separate URL with OAuth header) → FINISH (with metadata + thumbnail). This is Facebook's chunked upload protocol for reels, not a custom choice.

5. **Video publish can return 504** — This is expected behavior. Facebook returns 504 when video processing takes too long. The SDK handles it by falling back to polling via `pollVideoStatus`.

6. **`toGraphFields` converts keys to snake_case** — When you pass `{ createdTime: true }`, it becomes `created_time` in the API request. This is not obvious from the function signature.

7. **No index.ts / barrel exports** — There is no barrel export file. Consumers import directly from `client.js` (or the dist equivalent). This means adding new types for external use requires consumers to import from specific paths.

8. **`declaration: false` in tsconfig** — `.d.ts` files are NOT generated. Consumers importing from `dist/` get JavaScript only. This limits use as an npm package without changes.

9. **`PostExpiration.time` is in seconds** — The `expire()` method receives milliseconds and divides by 1000 with `Math.ceil()`. The raw API expects seconds.

10. **`InsightRaw`, `RevenueRaw`, `InsightPaging`** — These types exist in `shared.ts` but are not used by any resource. They appear to be future placeholders for an insights/analytics resource.

11. **The `family: 4` option on axios** — Forces IPv4. This is likely to avoid IPv6 connectivity issues in certain hosting environments.

12. **Import extensions** — All imports use `.js` extensions (`"./httpClient.js"`), which is required by NodeNext module resolution even though the source files are `.ts`.
