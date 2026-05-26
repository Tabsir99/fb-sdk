# Type system

The SDK leans heavily on TypeScript's recursive conditional and mapped types. The goal: **the awaited value's type is exactly the shape you selected — nothing more, nothing less, and you cannot select a field that doesn't exist.**

Everything in this doc lives in [`src/types/shared.ts`](../src/types/shared.ts) and [`src/lib/transformCase.ts`](../src/lib/transformCase.ts). The compile-time behaviour is pinned in [`tests/types/`](../tests/types/).

---

## The big picture

Every "get" / "list" call accepts a *selector* and returns a `BatchableRequest<T>` where `T` is computed from the selector.

```
                ┌──────────────────────┐
                │ Domain type          │  e.g. FacebookPost (camelCase view)
                │   FacebookPost       │
                └─────────┬────────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │ FbFieldSelector<T>    │  the shape the *caller* writes
              └─────────┬────────────┘
                          │  caller passes F: { id: true, message: true }
                          ▼
                ┌──────────────────────┐
                │ Fields<T, F, D>       │  Fields = DeepStrict-checked F
                └─────────┬────────────┘
                          │
                          ▼
                ┌──────────────────────┐
                │ FbPickDeep<T, F>      │  the result type the *caller* awaits
                └──────────────────────┘
```

Four type-level helpers do all the work:

| Type                | What it is                                          | Built from        |
| ------------------- | --------------------------------------------------- | ----------------- |
| `FbFieldSelector<T>`| What the caller is *allowed* to ask for.            | mapped over `T`   |
| `DeepStrict<V, I>`  | Forces extra keys in `I` (vs `V`) to `never`.       | mapped over `I`   |
| `Fields<T, F, D>`   | `F` as-is, but type-checked against the selector.   | conditional       |
| `FbPickDeep<T, F>`  | The result shape, picked recursively from `T`.      | mapped over `T`   |

---

## `KeysToCamel` / `KeysToSnake`

Before anything else, every domain type has a `*Raw` version with snake_case keys (the wire shape) and a camelCase view derived from it:

```ts
export interface FacebookPostRaw {
  id: string;
  created_time: string;
  full_picture: string;
  comments: CollectionOf<CommentRaw, CommentEdgeOptions>;
  /* … */
}
export type FacebookPost = KeysToCamel<FacebookPostRaw>;
```

`KeysToCamel<T>` walks objects and arrays recursively and rewrites each key via `SnakeToCamel`, a string template literal type:

```ts
type SnakeToCamel<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<SnakeToCamel<T>>}`
  : S;
```

Two notable behaviours:

1. **Underscore prefix is preserved.** `_edgeOptions` stays `_edgeOptions`. This is used as a phantom type-level marker on `CollectionOf` to carry the edge-option type without affecting runtime data.
2. **Runtime `toCamel` consumes a leading `_`**, capitalizing the next char (`_internal` → `Internal`). The type and runtime diverge here intentionally — runtime keys never start with `_` in practice for FB responses, but the type-level marker has to be invisible to runtime.

---

## `FbFieldSelector<T>` — the input shape

This is what the caller writes. For each property of `T`, the selector lets you say:

- `true` — "give me this field", or
- nested object — "give me a sub-shape from this field".

Collections (paginated edges) get a special form: `{ fields, options? }`.

```ts
export type FbFieldSelector<T, D extends number = 10> = {
  [K in keyof T]?: D extends 0
    ? true
    : NonNullable<T[K]> extends CollectionOf<infer U, infer O>
      ? { options?: O; fields: FbFieldSelector<U, Decrement[D]> } | true
      : NonNullable<T[K]> extends object
        ? FbFieldSelector<NonNullable<T[K]>, Decrement[D]> | true
        : true;
};
```

A few things going on:

- The mapped type is **partial** (every key is optional via `?:`). You only include the fields you actually want.
- `D extends 0 ? true : ...` is the depth guard. Without it, recursive types like `CommentRaw.comments: CollectionOf<CommentRaw>` would infinitely expand.
- `Decrement` is a tuple-based counter: `type Decrement = [never, 0, 1, 2, …, 10]`. Indexing `Decrement[D]` gives `D - 1`. This costs nothing at runtime and gives the compiler a finite recursion budget.

### Collections — `CollectionOf<T, O>`

`CollectionOf<T, O extends EdgeOptions>` represents Facebook's paginated edges:

```ts
export type CollectionOf<T, O extends EdgeOptions = EdgeOptions, P = Paging> = {
  data: T[];
  paging: P;
  /** @internal type-level only — does not exist at runtime */
  _edgeOptions?: O;
};
```

`_edgeOptions` is a **type-level only** marker. It's never present at runtime, but `FbFieldSelector` reads `O` out of it via `extends CollectionOf<infer U, infer O>` so that the selector's `options` field is typed to the right edge-options interface (e.g. `CommentEdgeOptions` allows `filter` and `summary`, while plain `EdgeOptions` doesn't).

---

## `DeepStrict<Valid, Inferred>` — reject extra keys

`FbFieldSelector<T>` allows the caller's selector to be assigned to it, but TypeScript's structural typing means *extra* keys would still be allowed for object literals after they're assigned to a wider type. `DeepStrict` closes that hole:

```ts
export type DeepStrict<Valid, Inferred> = {
  [K in keyof Inferred]: K extends keyof StripTrue<Valid>
    ? StripTrue<Valid>[K] extends boolean | undefined
      ? StripTrue<Valid>[K]
      : Inferred[K] extends object
        ? DeepStrict<StripTrue<Valid>[K], Inferred[K]>
        : StripTrue<Valid>[K]
    : never;
};
```

For each key in the caller's `Inferred` selector:
- If the key exists on the valid selector, keep its type (recursively for nested objects).
- If it doesn't, map it to `never`.

When that `DeepStrict<...>` result is then required by the signature, any `never` produces a type error pinned to the offending property.

`Fields<T, F, D>` is the small bow on top:

```ts
export type Fields<T, F, D extends number = 10> =
  F extends DeepStrict<FbFieldSelector<T, D>, F>
    ? F
    : DeepStrict<FbFieldSelector<T, D>, F>;
```

Used in the resource signatures, this gives concrete error messages at the *call site* (rather than at the generic parameter):

```ts
export type GetNode<T, D extends number = 10> = <F extends FbFieldSelector<T, D>>(
  fields: Fields<T, F, D>,
) => BatchableRequest<FbPickDeep<T, F>>;
```

---

## `FbPickDeep<T, F>` — the output shape

```ts
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

The shape mirrors `FbFieldSelector`'s structure, but produces a value type instead of a selector type:

| Selector value           | Result                                                    |
| ------------------------ | --------------------------------------------------------- |
| `true` for a scalar      | The scalar type from `T[K]`                               |
| `true` for a collection  | The raw `CollectionOf` shape (matches FB's response 1:1)  |
| `{ fields }` collection  | `{ data: FbPickDeep<U, NF>[], paging }` + any extras      |
| nested object selector   | `FbPickDeep<T[K], …>` — recursive on the nested type      |

### `CleanCollection`

Collections have `data` and `paging` always, but may have *extras* like `summary` when an edge option enables them. `CleanCollection` glues those on:

```ts
type CleanCollection<T, Data, F> = { data: Data[]; paging: Paging } &
  (Exclude<F, undefined> extends { options: infer O }
    ? Required<Pick<CollectionExtras<T>, Extract<keyof CollectionExtras<T>, TrueKeysOf<O>>>>
    : {});
```

For each key in the selector's `options` that is `true`, that extra is required on the result. Today this is mainly `summary` on comments, but the mechanism generalizes to any edge option that produces an extra response field.

---

## `BatchableRequest<T>` and `.transform`

Every Graph call returns `BatchableRequest<T>`:

```ts
export interface BatchableRequest<T> {
  readonly method: string;
  readonly relative_url: string;
  transform<U>(fn: (raw: T) => U): BatchableRequest<U>;
  then<R1 = T, R2 = never>(...): Promise<R1 | R2>;
  catch<R = never>(...): Promise<T | R>;
}
```

The implementation is in [`src/internal/batchable.ts`](../src/internal/batchable.ts). The runtime object additionally carries a private `_transform` function when `.transform()` has been called — that's how the batch resource applies the mapping after the raw response comes back. It's deliberately *not* on the public `BatchableRequest<T>` interface; `BatchSubRequest` exposes it for internal use.

---

## Insights — typed metric maps

`facebookinsights.ts` shows the pattern at its sharpest. The list of metrics is declared as a single object type:

```ts
export interface PageInsightMetricsMap {
  page_follows: number;
  page_fans_city: Record<string, number>;
  content_monetization_earnings: { currency: "USD"; microAmount: number };
  /* …~50 metrics… */
}
```

From that one declaration, the SDK derives:

- A camelCased view (`PageInsightMetrics`) used as the selector type.
- An `InsightResponse<T, F>` type that, for each selected metric, picks the right *result shape* based on the value type:
  - `number` → `NumericInsightResult` (`{ timeSeries, total }`)
  - `Record<string, number>` → `RecordInsightResult<V>` (`{ timeSeries, snapshot }`)
  - `{ microAmount: number }` → `NumericInsightResult` (microAmount → number)
- The runtime in `InsightResource.ts` does the actual conversion via `.transform()`.

A caller writing `sdk.page(id).insights.list({ fields: { pageFollows: true, pageFansCity: true } })` gets back exactly:

```ts
{
  pageFollows: { timeSeries: { value: number; endTime: number }[]; total: number };
  pageFansCity: { timeSeries: { value: Record<string, number>; endTime: number }[]; snapshot: Record<string, number> };
}
```

— and nothing else. Adding `pageFans: true` adds one more typed key. Misspelling `pageFollwos` fails at compile time. See [`tests/types/insightTypes.test-d.ts`](../tests/types/insightTypes.test-d.ts).

---

## Why this design

A few things fall out of the recursive-selector approach:

- **No code generation.** The metric maps and raw types are hand-written, but the camelCase views, selector types, and result types are all derived. Adding a new field is a one-line edit to the `*Raw` interface.
- **No runtime overhead.** All of the picking, casing, and edge-option propagation is type-only. The runtime just emits `fields=...&limit=...` strings.
- **One source of truth.** When FB renames a field, you change `FacebookPostRaw`. Selectors, results, and casing follow automatically.

The cost is a fairly heavy type surface, and recursion depths capped at 10. So far that's been enough for every shape in the Graph API; bumping `Decrement` higher is cheap if you need more.
