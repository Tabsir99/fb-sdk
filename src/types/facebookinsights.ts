import type { KeysToCamel } from "../lib/transformCase.js";
import type { BaseEdgeOptions, FbFieldSelector, FbPickDeep, Fields } from "./shared.js";

/** Selectable Page-level insight metrics and their value types. */
export interface PageInsightMetricsMap {
  page_media_view: number;
  page_total_media_view_unique: number;
  page_post_engagements: number;
  page_total_actions: number;
  page_daily_follows: number;
  page_daily_follows_unique: number;
  page_daily_unfollows_unique: number;
  page_follows: number;
  page_lifetime_engaged_followers_unique: number;
  page_fans: number;
  page_fan_adds: number;
  page_fan_adds_unique: number;
  page_fan_removes: number;
  page_fan_removes_unique: number;
  page_fans_locale: Record<string, number>;
  page_fans_city: Record<string, number>;
  page_fans_country: Record<string, number>;
  page_fans_gender_age: Record<string, number>;
  page_actions_post_reactions_like_total: number;
  page_actions_post_reactions_love_total: number;
  page_actions_post_reactions_wow_total: number;
  page_actions_post_reactions_haha_total: number;
  page_actions_post_reactions_sorry_total: number;
  page_actions_post_reactions_anger_total: number;
  page_actions_post_reactions_total: Record<string, number>;
  page_video_views: number;
  page_video_views_unique: number;
  page_video_repeat_views: number;
  page_video_complete_views_30s: number;
  page_video_complete_views_30s_unique: number;
  page_video_complete_views_30s_repeat_views: number;
  page_video_view_time: number;
  page_video_views_by_paid_non_paid: Record<string, number>;
  page_video_views_by_uploaded_hosted: Record<string, number>;
  /** Estimated earnings; `microAmount` is millionths of `currency` (divide by 1e6). */
  content_monetization_earnings: { currency: "USD"; microAmount: number };
}

type PageInsightMetricsRaw = {
  [K in keyof PageInsightMetricsMap]: InsightEntryRaw<K, PageInsightMetricsMap[K]>;
};

/** Page insight metrics (camelCase) selectable in an insight query. */
export type PageInsightMetrics = KeysToCamel<PageInsightMetricsRaw>;

/** Selectable post-level insight metrics and their value types. */
export interface PostInsightMetricsMap {
  post_media_view: number;
  post_total_media_view_unique: number;
  post_impressions: number;
  post_impressions_unique: number;
  post_impressions_fan: number;
  post_impressions_fan_unique: number;
  post_clicks: number;
  post_clicks_by_type: Record<string, number>;
  post_activity_by_action_type: Record<string, number>;
  post_activity_by_action_type_unique: Record<string, number>;
  post_reactions_like_total: number;
  post_reactions_love_total: number;
  post_reactions_wow_total: number;
  post_reactions_haha_total: number;
  post_reactions_sorry_total: number;
  post_reactions_anger_total: number;
  post_reactions_by_type_total: Record<string, number>;
  post_video_views: number;
  post_video_views_unique: number;
  post_video_views_15s: number;
  post_video_views_60s_excludes_shorter: number;
  post_video_views_sound_on: number;
  post_video_views_live: number;
  post_video_length: number;
  post_video_avg_time_watched: number;
  post_video_view_time: number;
  post_video_complete_views_30s_unique: number;
  post_video_retention_graph: Record<string, number>;
  post_video_social_actions_count_unique: number;
  post_video_views_by_distribution_type: Record<string, number>;
  post_video_views_by_live_status: Record<string, number>;
  post_video_view_time_by_distribution_type: Record<string, number>;
  post_video_view_time_by_age_bucket_and_gender: Record<string, number>;
  post_video_view_time_by_region_id: Record<string, number>;
  post_video_view_time_by_country_id: Record<string, number>;
  /** Estimated earnings; `microAmount` is millionths of `currency` (divide by 1e6). */
  content_monetization_earnings: { currency: "USD"; microAmount: number };
}

type PostInsightMetricsRaw = {
  [K in keyof PostInsightMetricsMap]: InsightEntryRaw<K, PostInsightMetricsMap[K]>;
};

/** Post insight metrics (camelCase) selectable in an insight query. */
export type PostInsightMetrics = KeysToCamel<PostInsightMetricsRaw>;

/** One raw metric entry from the `/insights` edge; may also carry `period`, `title`, `description`, `id`. */
export interface InsightEntryRaw<M = string, V = unknown> {
  name: M;
  values: {
    value: V;
    end_time?: string;
  }[];
}

/** Raw `/insights` response envelope. */
export type InsightRawResponse = {
  data: InsightEntryRaw[];
  paging?: InsightPaging;
};
/** {@link InsightRawResponse} with camelCased keys. */
export type InsightRawResponseCamelCase = KeysToCamel<InsightRawResponse>;

/** Options for an insights query: aggregation period and/or a preset date range. */
export interface InsightEdgeOptions extends BaseEdgeOptions {
  /** Aggregation window for each data point. */
  period?: "day" | "week" | "days_28" | "lifetime" | "total_over_range";
  /** Relative date range; alternative to `since`/`until`. */
  date_preset?:
    | "yesterday"
    | "last_month"
    | "last_year"
    | "last_7d"
    | "last_14d"
    | "last_28d"
    | "last_90d";
}

/** {@link InsightEdgeOptions} with camelCased keys. */
export type InsightOptions = KeysToCamel<InsightEdgeOptions>;
/** Next/previous page URLs for an insights response. */
export type InsightPaging = { next: string; previous: string };

/** A typed insights request: selected metric names plus query options. */
export type InsightQuery<TMetrics, F extends FbFieldSelector<TMetrics>> = {
  fields: Fields<TMetrics, F, 0>;
  options?: InsightOptions;
};

/** One data point in an insight time series. */
export interface InsightValue<V> {
  value: V;
  /** Unix timestamp (seconds) at the end of this data point's period. */
  endTime: number;
}

/** Result for a scalar metric: its time series plus the summed total. */
export interface NumericInsightResult {
  timeSeries: InsightValue<number>[];
  total: number;
}

/** Result for a breakdown metric: its time series plus the latest snapshot. */
export interface RecordInsightResult<V extends Record<string, number>> {
  timeSeries: InsightValue<V>[];
  /** Most recent breakdown values. */
  snapshot: V;
}

/** Maps a metric's value type to its friendly result shape. */
export type InsightResult<V> = V extends number
  ? NumericInsightResult
  : V extends { microAmount: number }
    ? NumericInsightResult
    : V extends Record<string, number>
      ? RecordInsightResult<V>
      : never;

type InsightEntry<M = string, V = unknown> = KeysToCamel<InsightEntryRaw<M, V>>;
type ExtractInsightValue<E> = E extends InsightEntry<any, infer V> ? V : never;

/** Response shape for an insights query: each selected metric to its {@link InsightResult}. */
export type InsightResponse<TMetrics, F extends FbFieldSelector<TMetrics>> = {
  [K in keyof FbPickDeep<TMetrics, F>]: InsightResult<
    ExtractInsightValue<FbPickDeep<TMetrics, F>[K]>
  >;
};
