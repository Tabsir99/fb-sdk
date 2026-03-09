import type { KeysToCamel } from "../lib/transformCase.js";
import type { BaseEdgeOptions, FbFieldSelector, FbPickDeep, Fields } from "./shared.js";

// ─── Raw API shapes (internal) ───

export interface InsightValueRaw<V = unknown> {
  value: V;
  end_time: string;
}

export interface InsightEntryRaw<M = string, V = unknown> {
  name: M;
  values: InsightValueRaw<V>[];
  // period: string;
  // title: string;
  // description: string;
  // id: string;
}

export interface InsightMetricsRaw {
  page_media_view: InsightEntryRaw<"page_media_view", number>;
  page_total_media_view_unique: InsightEntryRaw<"page_total_media_view_unique", number>;
  page_views_total: InsightEntryRaw<"page_views_total", number>;
  page_views_logged_in_unique: InsightEntryRaw<"page_views_logged_in_unique", number>;
  page_post_engagements: InsightEntryRaw<"page_post_engagements", number>;
  page_total_actions: InsightEntryRaw<"page_total_actions", number>;
  page_daily_follows_unique: InsightEntryRaw<"page_daily_follows_unique", number>;
  page_daily_unfollows_unique: InsightEntryRaw<"page_daily_unfollows_unique", number>;
  page_follows: InsightEntryRaw<"page_follows", number>;
  page_fans_city: InsightEntryRaw<"page_fans_city", Record<string, number>>;
  page_fans_country: InsightEntryRaw<"page_fans_country", Record<string, number>>;
  page_fans_gender_age: InsightEntryRaw<"page_fans_gender_age", Record<string, number>>;
}

export type InsightMetrics = KeysToCamel<InsightMetricsRaw>;

// ─── Options ───

export interface InsightEdgeOptions extends BaseEdgeOptions {
  period?: "day" | "week" | "days_28" | "month" | "lifetime" | "total_over_range";
  date_preset?:
    | "today"
    | "yesterday"
    | "this_month"
    | "last_month"
    | "this_year"
    | "last_year"
    | "last_3d"
    | "last_7d"
    | "last_14d"
    | "last_28d"
    | "last_30d"
    | "last_90d";
}

export type InsightOptions = KeysToCamel<InsightEdgeOptions>;

export type InsightQuery<F extends FbFieldSelector<InsightMetrics>> = {
  fields: Fields<InsightMetrics, F, 0>;
  options?: InsightOptions;
};

export type InsightPaging = { next: string; previous: string };
export type InsightRawResponse = {
  data: InsightMetrics[keyof InsightMetrics][];
  paging?: InsightPaging;
};

// ─── Friendly SDK response shapes ───

export interface InsightValue<V> {
  value: V;
  endTime: number;
}

export interface NumericInsightResult {
  series: InsightValue<number>[];
  total: number;
}

export interface RecordInsightResult<V extends Record<string, number>> {
  series: InsightValue<V>[];
  snapshot: V;
}

export type InsightResult<V> = V extends number
  ? NumericInsightResult
  : V extends Record<string, number>
    ? RecordInsightResult<V>
    : never;

// Extracts the value type V out of an InsightEntryRaw
type InsightEntry<M = string, V = unknown> = KeysToCamel<InsightEntryRaw<M, V>>;
type ExtractInsightValue<E> = E extends InsightEntry<any, infer V> ? V : never;

export type InsightResponse<F extends FbFieldSelector<InsightMetrics>> = {
  [K in keyof FbPickDeep<InsightMetrics, F>]: InsightResult<
    ExtractInsightValue<FbPickDeep<InsightMetrics, F>[K]>
  >;
};
