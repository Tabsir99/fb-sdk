# Architecture

Internal reference for contributors and AI agents adding new endpoints or modifying the SDK.

## Project Structure

```
src/
├── client.ts              # SDK entry point — fbGraph() factory, wires all resources
├── httpClient.ts          # Axios wrapper — adds access_token, transforms case
├── utils.ts               # toGraphFields() — converts field selector to query string
├── lib/
│   └── transformCase.ts   # Case conversion: runtime functions + type-level transforms
├── types/
│   ├── shared.ts          # Core type system: FbFieldSelector, FbPickDeep, CollectionOf, etc.
│   ├── facebookpost.ts    # Post and Comment types (raw + camelCase)
│   ├── facebookmedia.ts   # Video, Reel, Image types + publish params/responses
│   ├── facebookpage.ts    # Page type (raw + camelCase)
│   └── facebookuser.ts   # User type (raw + camelCase)
├── resources/
│   ├── PostResource.ts    # Post get, expire, comments. Media get.
│   ├── PageResource.ts    # Page-scoped: posts, videos, reels, images (CRUD + publish), comments
│   ├── CommentResource.ts # Single comment operations, comment replies
│   └── UserResource.ts    # /me endpoint: user profile, managed pages
└── internal/
    ├── error.ts           # FacebookUploadError class
    └── poller.ts          # Generic poll() + video/reel status pollers
```

## Request Flow

Trace of `fb.post("postId").get({ id: true, comments: { fields: { id: true } } })`:

### 1. Method call — `PostResource.get()`

```typescript
// src/resources/PostResource.ts
const get: GetPost = async (fields) =>
  http.get(`/${postId}`, {
    params: { fields: toGraphFields(fields) },
  });
```

The type `GetPost` is defined as:

```typescript
export type GetPost = GetNode<FacebookPost>;
```

When the consumer calls `get({ id: true, comments: { fields: { id: true } } })` on the instantiated `PostResource`, TypeScript:

1. Infers `F` from the literal object
2. Validates `F` against `FbFieldSelector<FacebookPost>` via `DeepStrict` (not used here in `PostResource.ts` — it uses the simpler `FbFieldSelector` constraint directly)
3. Computes the return type as `FbPickDeep<FacebookPost, F>`

### 2. Field serialization — `toGraphFields()`

```typescript
// src/utils.ts
toGraphFields({ id: true, comments: { fields: { id: true } } });
// → "id,comments{id}"
```

The function walks the object:

- `id: true` → `"id"` (camelCase key is converted to snake_case via `toSnakeCase`)
- `comments: { fields: { id: true } }` → detects `value.fields`, serializes edge options if present, then recurses: `"comments{id}"`

If `options` were provided:

```typescript
{ comments: { options: { filter: "toplevel" }, fields: { id: true } } }
// → "comments.filter(toplevel){id}"
```

`serializeEdgeOptions()` formats each option as `.key(value)`.

### 3. HTTP request — `HttpClient.get()`

```typescript
// src/httpClient.ts
get: async (path, options) => {
  const res = await fbApi.get(path, {
    params: { access_token: accessToken, ...options?.params },
  });
  const data = toCamel(res.data);
  return options?.safe ? { data, status: res.status } : data;
};
```

Sends `GET https://graph.facebook.com/v25.0/{postId}?access_token=...&fields=id,comments{id}`.

The raw response from Facebook (snake_case) is passed through `toCamel()`, which recursively converts all keys to camelCase. The transformed object is returned directly (when `safe` is not set).

### 4. Response type — `FbPickDeep`

The return type is computed at compile time:

```
FbPickDeep<FacebookPost, { id: true, comments: { fields: { id: true } } }>
```

This resolves to:

```typescript
{
  id: string;
  comments: {
    data: {
      id: string;
    }
    [];
    paging: Paging;
  }
}
```

`FbPickDeep` keeps only keys present in `F`. For collections (`CollectionOf`), it wraps the inner picked type in `{ data: Picked[]; paging: Paging }` via `CleanCollection`.

## Type System Internals

### `CollectionOf<T, O, P>` and the `_edgeOptions` phantom type

```typescript
// src/types/shared.ts
export type CollectionOf<T, O extends EdgeOptions = EdgeOptions, P = Paging> = {
  data: T[];
  paging: P;
  /** @internal type-level only — does not exist at runtime */
  _edgeOptions?: O;
};
```

`CollectionOf` represents a paginated edge response. The `_edgeOptions` property is a **phantom type** — it exists only at the type level to carry the edge's options type `O`. It never appears in runtime data.

This is how `FbFieldSelector` knows what options a particular edge accepts: it extracts `O` from `CollectionOf<U, infer O>` and uses it as the type for the `options` property in the selector.

The `_` prefix on `_edgeOptions` is intentional: `KeysToCamel` skips keys starting with `_` (via `K extends \`\_${string}\` ? K : SnakeToCamel<...>`), so the phantom property name is preserved through camelCase transformation.

### `EdgeOptions` and per-edge extensions

```typescript
export interface EdgeOptions {
  limit?: number;
  after?: string;
  before?: string;
}

export interface CommentEdgeOptions extends EdgeOptions {
  filter?: "toplevel" | "stream";
  summary?: boolean;
}
```

Base pagination options shared by all edges. Specific edges extend this to add custom parameters. The extension is then threaded through `CollectionOf`:

```typescript
comments: CollectionOf<CommentRaw, CommentEdgeOptions>;
```

This makes `FbFieldSelector` generate `{ options?: CommentEdgeOptions; fields: ... }` for the `comments` field.

### `FbFieldSelector<T, D>` — generating the valid selector shape

```typescript
export type FbFieldSelector<T, D extends number = 1> = {
  [K in keyof T]?: D extends 0
    ? true
    : NonNullable<T[K]> extends CollectionOf<infer U, infer O>
      ? { options?: O; fields: FbFieldSelector<U, Decrement[D]> } | true
      : NonNullable<T[K]> extends object
        ? FbFieldSelector<NonNullable<T[K]>, Decrement[D]> | true
        : true;
};
```

For each key `K` in `T`:

- **Scalars** (`string`, `number`, etc.): The only valid value is `true`.
- **Objects** (non-collection): Either `true` (select all) or a nested `FbFieldSelector`.
- **Collections** (`CollectionOf<U, O>`): Either `true` or `{ options?: O; fields: FbFieldSelector<U> }`.

**`Decrement`** limits recursion depth:

```typescript
type Decrement = [never, 0, 1, 2, 3, 4, 5];
```

A tuple lookup: `Decrement[1]` is `0`, `Decrement[2]` is `1`, etc. Default depth is `1`, meaning one level of nesting. At depth `0`, all keys can only be `true`. The `ListEdge` and `GetNode` types accept a depth parameter `D` that flows through.

### `DeepStrict<Valid, Inferred>` and `StripTrue`

TypeScript does not enforce excess property checking when an object is passed through a generic parameter. This means a consumer could pass `{ id: true, invalid: true }` and TypeScript wouldn't error — the `invalid` key would silently be ignored.

`DeepStrict` solves this by walking the inferred type and mapping each key:

```typescript
type StripTrue<T> = Exclude<T, true | undefined>;

export type DeepStrict<Valid, Inferred> = {
  [K in keyof Inferred]: K extends keyof StripTrue<Valid>
    ? StripTrue<Valid>[K] extends boolean | undefined
      ? StripTrue<Valid>[K]
      : Inferred[K] extends object
        ? DeepStrict<StripTrue<Valid>[K], Inferred[K]>
        : StripTrue<Valid>[K]
    : never; // ← key not in Valid → type becomes never → compile error
};
```

`StripTrue` is needed because `FbFieldSelector` entries for edges are `{ fields: ... } | true`. When checking if a key exists in `Valid`, we need the object portion, not the `true` or `undefined` branches.

Usage in `GetNode`:

```typescript
export type GetNode<T, D extends number = 1> = <F extends FbFieldSelector<T, D>>(
  fields: F extends DeepStrict<FbFieldSelector<T, D>, F> ? F : DeepStrict<FbFieldSelector<T, D>, F>,
) => Promise<FbPickDeep<T, F>>;
```

The conditional `F extends DeepStrict<...> ? F : DeepStrict<...>` means:

- If `F` already passes strict validation, use `F` as-is (preserving inference)
- If not, force the parameter type to `DeepStrict<...>`, which will show errors on invalid keys

### `FbPickDeep<T, F>` and `CleanCollection`

`FbPickDeep` walks `T` and `F` in parallel, keeping only keys that exist in `F`:

```typescript
export type FbPickDeep<T, F> = {
  [K in keyof T as K extends keyof F ? K : never]: NonNullable<T[K]> extends CollectionOf<infer U>
    ? Exclude<F[K & keyof F], undefined> extends { fields: infer NF }
      ? CleanCollection<T[K], FbPickDeep<U, NF>, F[K & keyof F]>
      : CleanCollection<T[K], U, F[K & keyof F]>
    : Exclude<F[K & keyof F], undefined> extends true
      ? T[K]
      : NonNullable<T[K]> extends object
        ? FbPickDeep<NonNullable<T[K]>, Exclude<F[K & keyof F], undefined | true>>
        : T[K];
};
```

Per key:

1. **Filter**: `K extends keyof F ? K : never` — only keep keys that appear in the selector.
2. **Collections**: If `T[K]` is a `CollectionOf`, check whether the selector uses the `{ fields }` form or plain `true`:
   - `{ fields: NF }` → recursively pick the inner type `U` with `NF`, wrap in `CleanCollection`
   - `true` → return the full inner type `U`, still wrapped in `CleanCollection`
3. **Scalars / `true`**: If the selector value is `true`, return `T[K]` directly.
4. **Nested objects**: Recurse with `FbPickDeep`.

**`CleanCollection`** handles the collection wrapper and option-dependent fields:

```typescript
type CleanCollection<T, Data, F> = { data: Data[]; paging: Paging } & (Exclude<
  F,
  undefined
> extends { options: infer _O }
  ? Omit<NonNullable<T>, "data" | "paging" | "_edgeOptions">
  : {});
```

- Always produces `{ data: Data[]; paging: Paging }`.
- If the selector `F` includes `options`, it also merges in any extra properties from `T` (the original `CollectionOf & { ... }` type), excluding the runtime structure (`data`, `paging`) and the phantom (`_edgeOptions`).

This is how option-dependent fields like `summary: { total_count: number }` on comments appear in the return type only when `options` is provided.

### `GetNode<T, D>` and `ListEdge<T, O, D>`

```typescript
export type GetNode<T, D extends number = 1> = <F extends FbFieldSelector<T, D>>(
  fields: F extends DeepStrict<FbFieldSelector<T, D>, F> ? F : DeepStrict<FbFieldSelector<T, D>, F>,
) => Promise<FbPickDeep<T, F>>;

export type ListEdge<T, O extends EdgeOptions = EdgeOptions, D extends number = 1> = <
  F extends FbFieldSelector<T, D>,
>(query: {
  options?: O;
  fields: F extends DeepStrict<FbFieldSelector<T, D>, F> ? F : DeepStrict<FbFieldSelector<T, D>, F>;
}) => Promise<Collection<T, F>>;
```

These are the two generic function types used across all resources:

- `GetNode`: fetches a single node by its bound ID. Returns `FbPickDeep<T, F>`.
- `ListEdge`: fetches a paginated edge. Takes an `options` parameter typed as `O` (the edge's specific options). Returns `Collection<T, F>` which is `{ data: FbPickDeep<T, F>[]; paging: Paging }`.

Both use `F extends FbFieldSelector<T, D>` to enable autocomplete (TypeScript infers `F` from the argument and suggests valid keys), while the `DeepStrict` conditional in the parameter position ensures excess properties are rejected.

### `KeysToCamel<T>` — snake_case to camelCase transform

```typescript
// src/lib/transformCase.ts
type SnakeToCamel<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<SnakeToCamel<T>>}`
  : S;

export type KeysToCamel<T> = T extends (infer U)[]
  ? KeysToCamel<U>[]
  : T extends object
    ? { [K in keyof T as K extends `_${string}` ? K : SnakeToCamel<string & K>]: KeysToCamel<T[K]> }
    : T;
```

Recursively transforms all object keys from `snake_case` to `camelCase`.

**`_` prefix skip rule**: Keys starting with `_` are preserved as-is. This is specifically for phantom type properties like `_edgeOptions` — converting them to camelCase would break the type system's ability to detect and handle them.

The runtime counterpart `toCamel()` does the same transformation at runtime on API responses via regex: `k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())`. Note: the runtime function does **not** skip `_` prefixed keys, but this doesn't matter because `_edgeOptions` never exists in runtime data.

## Resource Pattern

The exact steps to create a new resource:

### Step 1: Define raw interface

In `src/types/`, create a file with the raw interface. Keys must be **snake_case**, matching the Facebook API response exactly:

```typescript
// src/types/facebooksomething.ts
import { KeysToCamel } from "../lib/transformCase.js";
import type { CollectionOf, EdgeOptions } from "./shared.js";

interface SomethingRaw {
  id: string;
  some_field: string;
  nested_edge: CollectionOf<NestedItemRaw>;
}
export type Something = KeysToCamel<SomethingRaw>;
```

### Step 2: Create camelCase type via `KeysToCamel`

Always export both the raw interface (if needed by other types) and a `KeysToCamel` version. The camelCase type is what consumers interact with and what `FbFieldSelector` generates selectors for.

### Step 3: Define edge options (if custom params exist)

If the edge accepts parameters beyond base `EdgeOptions`:

```typescript
// In src/types/shared.ts or alongside the type definition
export interface SomethingEdgeOptions extends EdgeOptions {
  custom_param?: string;
}
```

Then use it in `CollectionOf`:

```typescript
nested_edge: CollectionOf<NestedItemRaw, SomethingEdgeOptions>;
```

### Step 4: Use `CollectionOf` with `& { ... }` for option-dependent fields

If the edge's response includes extra fields that only appear when specific options are set:

```typescript
comments: CollectionOf<CommentRaw, CommentEdgeOptions> & {
  summary: { total_count: number };
};
```

The `& { ... }` fields are included in the return type **only** when the consumer passes `options` in their selector (handled by `CleanCollection`).

**Never** use `& { ... }` for fields that always exist. Those belong inside the raw type fed to `CollectionOf<T>` as part of `T`.

### Step 5: Create resource factory

In `src/resources/`, create a factory function:

```typescript
import type { HttpClient } from "../httpClient.js";
import type { GetNode, ListEdge } from "../types/shared.js";
import type { Something } from "../types/facebooksomething.js";
import { toGraphFields } from "../internal/utils.js";

export type GetSomething = GetNode<Something>;
export type ListSomethings = ListEdge<Something>;

export const createSomethingResource = (http: HttpClient, itemId: string) => {
  const get: GetSomething = async (fields) =>
    http.get(`/${itemId}`, { params: { fields: toGraphFields(fields) } });

  const list: ListSomethings = async (query) =>
    http.get(`/${itemId}/somethings`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  return { get, list };
};
```

### Step 6: Wire into `client.ts`

Add to the appropriate namespace in `fbGraph()`:

```typescript
import { createSomethingResource } from "./resources/SomethingResource.js";

export function fbGraph(accessToken: string) {
  const http = createHttpClient(accessToken);
  return {
    // ... existing resources
    something: (itemId: string) => createSomethingResource(http, itemId),
  };
}
```

## Conventions and Constraints

1. **Raw types are snake_case, exported types are camelCase.** Raw interfaces match Facebook's API response. The `KeysToCamel` wrapper produces the consumer-facing type.

2. **Phantom types use `_` prefix.** Properties like `_edgeOptions` start with `_` so `KeysToCamel` preserves them. This is load-bearing — without the prefix, the phantom key would be renamed and `FbFieldSelector`'s `infer O` would fail.

3. **`CollectionOf` is for edges, not standalone responses.** Only use `CollectionOf` for properties that represent paginated edge data (e.g., `comments`, `videos`). Top-level list endpoints return `Collection<T, F>` (or a response type from `ListEdge`), but they don't use `CollectionOf` in their type definitions.

4. **`Decrement` max depth.** Default is `1` (one level of nesting). The `Decrement` tuple supports up to depth 5. Increase the depth parameter on `GetNode<T, D>` or `ListEdge<T, O, D>` only if the resource has edges nested deeper than one level. Unnecessary increases slow down type checking.

5. **`& { ... }` on `CollectionOf` is only for option-dependent fields.** Properties that always exist in the edge response should be part of the inner type `T` in `CollectionOf<T>`. The intersection is specifically for fields that appear only when `options` are provided in the selector (enforced by `CleanCollection`'s conditional logic).

6. **`HttpClient.safe` mode.** When `safe: true` is passed, the HTTP client returns `{ data, status }` instead of just `data`, and custom `validateStatus` behavior can be configured. This is used for publish operations that need to handle non-200 status codes (e.g., 504 timeouts during video upload).

7. **All imports use `.js` extension.** The project uses Node.js ESM (`"type": "module"` in `package.json`, `"module": "NodeNext"` in `tsconfig.json`). Every relative import must include the `.js` extension.
