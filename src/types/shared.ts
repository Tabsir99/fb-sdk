type Decrement = [never, 0, 1, 2, 3, 4, 5];

export interface BaseEdgeOptions {
  after?: string;
  before?: string;
  since?: number;
  until?: number;
}

export interface EdgeOptions extends BaseEdgeOptions {
  limit?: number;
  order?: ORDER;
}

export type FbFieldSelector<T, D extends number = 1> = {
  [K in keyof T]?: D extends 0
    ? true
    : NonNullable<T[K]> extends CollectionOf<infer U, infer O>
      ? { options?: O; fields: FbFieldSelector<U, Decrement[D]> } | true
      : NonNullable<T[K]> extends object
        ? FbFieldSelector<NonNullable<T[K]>, Decrement[D]> | true
        : true;
};

type CleanCollection<T, Data, F> = { data: Data[]; paging: Paging } & (Exclude<
  F,
  undefined
> extends { options: infer _O }
  ? Omit<NonNullable<T>, "data" | "paging" | "_edgeOptions">
  : {});

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

export type Collection<T, F, P = Paging> = {
  data: FbPickDeep<T, F>[];
  paging: P;
};

export type CollectionOf<T, O extends EdgeOptions = EdgeOptions, P = Paging> = {
  data: T[];
  paging: P;

  /** @internal type-level only — does not exist at runtime */
  _edgeOptions?: O;
};

type StripTrue<T> = Exclude<T, true | undefined>;

export type DeepStrict<Valid, Inferred> = {
  [K in keyof Inferred]: K extends keyof StripTrue<Valid>
    ? StripTrue<Valid>[K] extends boolean | undefined
      ? StripTrue<Valid>[K]
      : Inferred[K] extends object
        ? DeepStrict<StripTrue<Valid>[K], Inferred[K]>
        : StripTrue<Valid>[K]
    : never;
};

export type Fields<T, F, D extends number = 1> =
  F extends DeepStrict<FbFieldSelector<T, D>, F> ? F : DeepStrict<FbFieldSelector<T, D>, F>;

export type ListEdge<T, O extends EdgeOptions = EdgeOptions, D extends number = 1> = <
  F extends FbFieldSelector<T, D>,
>(query: {
  fields: Fields<T, F, D>;
  options?: O;
}) => Promise<Collection<T, F>>;

export type GetNode<T, D extends number = 1> = <F extends FbFieldSelector<T, D>>(
  fields: Fields<T, F, D>,
) => Promise<FbPickDeep<T, F>>;

export enum ORDER {
  OLDEST = "chronological",
  NEWEST = "reverse_chronological",
}

export interface FacebookApiError {
  code: number;
  message?: string;
}

export interface Paging {
  cursors: {
    before: string;
    after: string;
  };
  next?: string;
}

export interface PictureData {
  height: number;
  is_silhouette: boolean;
  url: string;
  width: number;
}

export interface BatchSubRequest {
  method: string;
  relative_url: string;
}

export interface BatchSubResponse {
  code: number;
  body: string;
}
