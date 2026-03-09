# fb-sdk

A typed Node.js SDK for the Facebook Graph API (v25.0). Select only the fields you need, get full autocomplete while writing the selector, strict compile-time validation that rejects unknown fields, and a return type narrowed to exactly what you selected — all without runtime overhead.

## Installation

```bash
npm install fb-sdk
```

**Requirements:** Node.js 18+, TypeScript 5.9+

**Dependencies:** `axios`, `form-data`

## Quick Start

```typescript
import { fbGraph } from "fb-sdk";

const fb = fbGraph("your-access-token");

// Get a post — only the fields you select exist on the result
const post = await fb.post("postId").get({
  id: true,
  message: true,
  comments: {
    options: { filter: "toplevel" },
    fields: { id: true, message: true },
  },
});

post.id; // string
post.message; // string | undefined
post.comments.data[0].message; // string
post.comments.paging; // Paging
// post.fullPicture             — compile error, not selected
```

## Field Selection

Every `get` and `list` method accepts a **field selector** — an object whose shape mirrors the resource type. You pick fields by setting them to `true`. The SDK converts this object into the Graph API `fields` query parameter and infers a return type containing only the selected fields.

### Scalar fields

```typescript
{ id: true, message: true }
// → fields=id,message
```

### Nested objects

For non-collection nested objects, nest the selector directly:

```typescript
{ picture: { data: { url: true, height: true } } }
// → fields=picture{data{url,height}}
```

You can also pass `true` to select all fields of a nested object:

```typescript
{
  picture: true;
}
// → fields=picture
```

### Edges (collections)

Edges — like `comments` on a post — are paginated collections. They require the `{ fields }` wrapper:

```typescript
{
  comments: {
    fields: { id: true, message: true }
  }
}
// → fields=comments{id,message}
```

Passing `true` selects all fields on the edge's items:

```typescript
{
  comments: true;
}
// → fields=comments
```

### Edge options

Some edges accept extra parameters (limit, pagination cursors, filters). These go in `options`:

```typescript
{
  comments: {
    options: { filter: "toplevel", limit: 10 },
    fields: { id: true, message: true }
  }
}
// → fields=comments.filter(toplevel).limit(10){id,message}
```

Available options vary per edge. The `comments` edge supports `filter` and `summary` on top of the base `limit`, `after`, and `before`. The SDK infers the correct options type for each edge — you get autocomplete for what's available.

### Return type narrowing

The return type contains **only** what you selected. If you select `{ id: true, message: true }` on a `FacebookPost`, the result type is `{ id: string; message: string | undefined }` — not the full `FacebookPost`. This applies recursively to nested objects and edges.

When an edge has option-dependent response fields (e.g., `comments` includes a `summary` object), those fields appear in the return type only when `options` is provided in the selector.

## Available Resources

### `fb.post(postId)`

Operations on a specific post by ID.

#### `fb.post(postId).get(fields)`

Fetch a single post.

```typescript
const post = await fb.post("postId").get({
  id: true,
  statusType: true,
  createdTime: true,
  shares: true,
  reactions: true,
});
```

#### `fb.post(postId).expire(time, type)`

Set an expiration on a post.

```typescript
await fb.post("postId").expire(Date.now() + 86400000, "expire_only");
```

#### `fb.post(postId).comments.list(fields)`

Fetch comments on a post. Also provides a `.create(data)` method to add a comment.

```typescript
const comments = await fb.post("postId").comments.list({
  id: true,
  message: true,
  from: { name: true },
});
// comments.data    — Comment[]
// comments.paging  — Paging

// Create a comment
const newComment = await fb.post("postId").comments.create({
  message: "Hello world!"
});
```

---

### `fb.me`

Operations on the authenticated user.

#### `fb.me.get(fields)`

Fetch the current user's profile.

```typescript
const me = await fb.me.get({ id: true, name: true });
```

#### `fb.me.accounts(fields)`

List Facebook Pages the user manages.

```typescript
const pages = await fb.me.accounts({
  id: true,
  name: true,
  accessToken: true,
});
// pages.data    — FacebookPage[]
// pages.paging  — Paging
```

---

### `fb.page(pageId)`

Operations scoped to a specific Page. Returns sub-resources for posts, videos, reels, images, and aggregated comments.

```typescript
const page = fb.page("pageId");
```

#### `page.posts.list(query)` 

List posts on a Page. Note: to fetch a specific post, use `fb.post(postId).get()`.

```typescript
const feed = await page.posts.list({
  fields: { id: true, message: true, createdTime: true },
});
```

#### `page.comments.list(query, config)`

Fetch an aggregated stream of comments across recent page posts.

```typescript
const allComments = await page.comments.list({
  fields: { id: true, message: true, createdTime: true }
});
```

#### `page.videos.list(query)` / `page.videos.publish(data)`

List videos or publish a new video.

```typescript
const videos = await page.videos.list({
  fields: { id: true, title: true, status: true },
});

const { postId } = await page.videos.publish({
  fileUrl: "https://example.com/video.mp4",
  title: "My Video",
  description: "A description",
  thumbnailUrl: "https://example.com/thumb.jpg",
});
```

Publishing handles the upload, waits for processing via polling, and returns the resulting post ID. Throws `FacebookUploadError` on failure.

#### `page.reels.list(query)` / `page.reels.publish(data)`

List or publish reels. Publishing uses Facebook's resumable upload protocol (start session → upload file → finish session) and polls until the reel is processed.

```typescript
const { postId } = await page.reels.publish({
  fileUrl: "https://example.com/reel.mp4",
  title: "My Reel",
  thumbnailUrl: "https://example.com/thumb.jpg",
});
```

#### `page.images.list(query)` / `page.images.publish(data)`

List or publish images.

```typescript
const { postId } = await page.images.publish({
  url: "https://example.com/image.jpg",
  caption: "My image",
});
```

---

### `fb.comment(commentId)`

Operations to manage a single comment node.

```typescript
const myComment = fb.comment("commentId");

// Update message
await myComment.update({ message: "new message" });

// Like / unlike
await myComment.like();
await myComment.unlike();

// Delete
await myComment.delete();

// Get nested replies
const subComments = await myComment.replies.list({ id: true, message: true });
```

## Adding New Endpoints

To add a new resource or edge, follow this pattern:

### 1. Define the raw type

Create or update a file in `src/types/`. Define the raw interface with snake_case keys matching the Facebook API response:

```typescript
// src/types/facebookstory.ts
import { KeysToCamel } from "../lib/transformCase.js";

interface FacebookStoryRaw {
  id: string;
  created_time: string;
  media_url: string;
}
export type FacebookStory = KeysToCamel<FacebookStoryRaw>;
```

### 2. Define edge options (if needed)

If the edge supports custom parameters beyond the base `limit`/`after`/`before`, extend `EdgeOptions` in `src/types/shared.ts`:

```typescript
export interface StoryEdgeOptions extends EdgeOptions {
  since?: number;
}
```

### 3. Use `CollectionOf` for edges with option-dependent fields

If the edge's response includes extra fields only when certain options are passed, use `CollectionOf` with an intersection:

```typescript
interface ParentRaw {
  stories: CollectionOf<FacebookStoryRaw, StoryEdgeOptions> & {
    extra_field: string; // only present when options are provided
  };
}
```

### 4. Create the resource

In `src/resources/`, create a factory function using `GetNode` and `ListEdge` types:

```typescript
import { GetNode, ListEdge } from "../types/shared.js";
import { FacebookStory } from "../types/facebookstory.js";

export type ListStories = ListEdge<FacebookStory>;
export type GetStory = GetNode<FacebookStory>;

export const createStoryResource = (http: HttpClient, pageId: string) => {
  const list: ListStories = async (query) =>
    http.get(`/${pageId}/stories`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  const get: GetStory = async (fields) =>
    http.get(`/${pageId}`, {
      params: { fields: toGraphFields(fields) },
    });

  return { list, get };
};
```

### 5. Wire into the SDK

Add the resource to the appropriate factory in `src/client.ts`:

```typescript
export function fbGraph(accessToken: string) {
  const http = createHttpClient(accessToken);
  return {
    post: (postId: string) => createPostResource(http, postId),
    page: (pageId: string) => ({
      ...createPageResource(http, pageId),
      stories: createStoryResource(http, pageId),
    }),
    me: createUserResource(http),
  };
}
```

## Type System Overview

The SDK's type system follows a three-stage pipeline:

### 1. Selector generation (`FbFieldSelector<T>`)

Given a resource type `T`, `FbFieldSelector<T>` generates the shape of a valid field selector object. Scalar fields become `true | undefined`. Nested objects become recursive selectors or `true`. Collection edges become `{ options?: O; fields: FbFieldSelector<Inner> } | true`, where `O` is the edge-specific options type extracted from the `CollectionOf` phantom type. Recursion depth is bounded by a `Decrement` counter (default depth: 1 level of nesting).

### 2. Strict validation (`DeepStrict<Valid, Inferred>`)

TypeScript's structural type system doesn't reject excess properties when generics are involved. `DeepStrict` solves this by mapping every key in the inferred selector — if the key exists in the valid selector shape, it passes through; otherwise it becomes `never`, causing a compile error. This gives you red squiggles on typos and invalid fields.

### 3. Return type narrowing (`FbPickDeep<T, F>`)

`FbPickDeep<T, F>` walks the resource type `T` in parallel with your selector `F` and keeps only the fields you selected. For collections, it wraps the picked inner type in `{ data: Picked[]; paging: Paging }`. If the selector included `options`, option-dependent fields (defined via `& { ... }` on `CollectionOf`) are also included via `CleanCollection`.

The result is end-to-end type safety: autocomplete guides you to valid fields, the compiler rejects invalid ones, and the return type contains exactly what you asked for.
