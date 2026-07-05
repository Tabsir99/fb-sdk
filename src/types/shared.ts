type Decrement = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Cursor/time paging options common to all edges. */
export interface BaseEdgeOptions {
  /** Cursor from `paging.cursors.after` — fetch the next page. */
  after?: string;
  /** Cursor from `paging.cursors.before` — fetch the previous page. */
  before?: string;
  /** Lower time bound, Unix seconds. */
  since?: number;
  /** Upper time bound, Unix seconds. */
  until?: number;
}

/** {@link BaseEdgeOptions} plus page size and sort order. */
export interface EdgeOptions extends BaseEdgeOptions {
  limit?: number;
  order?: ORDER;
}

/** Recursive `?fields=` selector for a node: pick fields, or `true` for a whole subtree. */
export type FbFieldSelector<T, D extends number = 10> = {
  [K in keyof T]?: D extends 0
    ? true
    : NonNullable<T[K]> extends CollectionOf<infer U, infer O>
      ? { options?: O; fields: FbFieldSelector<U, Decrement[D]> } | true
      : NonNullable<T[K]> extends object
        ? FbFieldSelector<NonNullable<T[K]>, Decrement[D]> | true
        : true;
};

type TrueKeysOf<O> = { [K in keyof O]: O[K] extends true ? K : never }[keyof O];
type CollectionExtras<T> = Omit<NonNullable<T>, "data" | "paging" | "_edgeOptions">;

type CleanCollection<T, Data, F> = { data: Data[]; paging: Paging } & (Exclude<
  F,
  undefined
> extends { options: infer O }
  ? Required<Pick<CollectionExtras<T>, Extract<keyof CollectionExtras<T>, TrueKeysOf<O>>>>
  : unknown);

/** Resolves the response object shape for a node `T` given a selector `F`. */
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

/** A `{ data, paging }` edge result narrowed to the selected fields. */
export type Collection<T, F, P = Paging> = {
  data: FbPickDeep<T, F>[];
  paging: P;
};

/** A raw `{ data, paging }` edge of `T`, tagged (type-only) with its allowed edge options `O`. */
export type CollectionOf<T, O extends EdgeOptions = EdgeOptions, P = Paging> = {
  data: T[];
  paging: P;

  /** @internal type-level only — does not exist at runtime */
  _edgeOptions?: O;
};

type StripTrue<T> = Exclude<T, true | undefined>;

/** Excess-property check: rejects selector keys in `Inferred` absent from `Valid`. */
export type DeepStrict<Valid, Inferred> = {
  [K in keyof Inferred]: K extends keyof StripTrue<Valid>
    ? StripTrue<Valid>[K] extends boolean | undefined
      ? StripTrue<Valid>[K]
      : Inferred[K] extends object
        ? DeepStrict<StripTrue<Valid>[K], Inferred[K]>
        : StripTrue<Valid>[K]
    : never;
};

/** Validates selector `F` against node `T`; surfaces invalid keys as type errors. */
export type Fields<T, F, D extends number = 10> =
  F extends DeepStrict<FbFieldSelector<T, D>, F> ? F : DeepStrict<FbFieldSelector<T, D>, F>;

/** A callable that lists `T` with field selection, returning a batchable request. */
export type ListEdge<T, O extends EdgeOptions = EdgeOptions, D extends number = 10> = <
  F extends FbFieldSelector<T, D>,
>(query: {
  fields: Fields<T, F, D>;
  options?: O;
}) => BatchableRequest<Collection<T, F>>;

/** A callable that fetches a single `T` node with field selection. */
export type GetNode<T, D extends number = 10> = <F extends FbFieldSelector<T, D>>(
  fields: Fields<T, F, D>,
) => BatchableRequest<FbPickDeep<T, F>>;

/** Sort order for an edge. */
export enum ORDER {
  OLDEST = "chronological",
  NEWEST = "reverse_chronological",
}

/** Minimal Graph API error (`code` plus optional `message`). */
export interface FacebookApiError {
  code: number;
  message?: string;
}

/** Cursor-based paging info for an edge response. */
export interface Paging {
  cursors: {
    before: string;
    after: string;
  };
  next?: string;
}

/** Profile-picture metadata from a `picture{data}` field. */
export interface PictureData {
  height: number;
  /** `true` when this is the default silhouette (no custom avatar set). */
  is_silhouette: boolean;
  url: string;
  width: number;
}

/** A thenable Graph request that can also run inside a batch; `transform` maps its result. */
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

/** One sub-request in a Graph API batch call. */
export interface BatchSubRequest {
  method: string;
  relative_url: string;
  /** urlencoded payload for POST sub-requests; absent for GET/DELETE and FormData uploads. */
  body?: string;
  _transform?: (raw: any) => any;
}

/** One sub-response from a Graph API batch call. */
export interface BatchSubResponse {
  /** HTTP status code of this sub-response. */
  code: number;
  /** JSON-encoded response body (parse to get the payload). */
  body: string;
}
