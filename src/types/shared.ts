type Decrement = [never, 0, 1, 2, 3, 4, 5];

export type FbFieldSelector<T, D extends number = 1> = {
  [K in keyof T]?: D extends 0
    ? true
    : NonNullable<T[K]> extends CollectionOf<infer U>
      ? FbFieldSelector<U, Decrement[D]> | true
      : NonNullable<T[K]> extends object
        ? FbFieldSelector<NonNullable<T[K]>, Decrement[D]> | true
        : true;
};

export type FbPickDeep<T, F> = {
  [K in Extract<keyof F, keyof T>]: Exclude<F[K], undefined> extends true
    ? T[K]
    : NonNullable<T[K]> extends CollectionOf<infer U>
      ? { data: FbPickDeep<U, Exclude<F[K], undefined>>[]; paging: Paging }
      : NonNullable<T[K]> extends object
        ? FbPickDeep<NonNullable<T[K]>, Exclude<F[K], undefined | true>>
        : T[K];
};

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

export type Collection<T, F extends FbFieldSelector<T, 5>, P = Paging> = {
  data: FbPickDeep<T, F>[];
  paging: P;
};
export type CollectionOf<T, P = Paging> = {
  data: T[];
  paging: P;
};

export interface PictureData {
  height: number;
  is_silhouette: boolean;
  url: string;
  width: number;
}

export interface InsightPaging {
  previous: string;
  next: string;
}

interface InsightValue {
  value: number;
  end_time: string;
}
export interface InsightRaw {
  id: string;
  name: string;
  title: string;
  description: string;
  period: "day" | "week";
  values: InsightValue[];
}

export interface RevenueValue extends InsightValue {
  earning_source: "video" | "reel" | "image" | "story" | "text";
}
export interface RevenueRaw extends InsightRaw {
  values: RevenueValue[];
}
