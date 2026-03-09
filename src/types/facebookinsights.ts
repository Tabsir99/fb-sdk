import type { KeysToCamel } from "../lib/transformCase.js";
import type { BaseEdgeOptions, FbFieldSelector, FbPickDeep, Fields } from "./shared.js";

// ─── Page Insights ───────────────────────────────────────────────────────────

export interface PageInsightMetricsMap {
  // Views & Reach
  page_media_view: number;
  page_total_media_view_unique: number;

  // Engagement
  page_post_engagements: number;
  page_total_actions: number;

  // Followers
  page_daily_follows: number;
  page_daily_follows_unique: number;
  page_daily_unfollows_unique: number;
  page_follows: number;
  page_lifetime_engaged_followers_unique: number;

  // Fans
  page_fans: number;
  page_fan_adds: number;
  page_fan_adds_unique: number;
  page_fan_removes: number;
  page_fan_removes_unique: number;

  // Demographics
  page_fans_locale: Record<string, number>;
  page_fans_city: Record<string, number>;
  page_fans_country: Record<string, number>;
  page_fans_gender_age: Record<string, number>;

  // Reactions
  page_actions_post_reactions_like_total: number;
  page_actions_post_reactions_love_total: number;
  page_actions_post_reactions_wow_total: number;
  page_actions_post_reactions_haha_total: number;
  page_actions_post_reactions_sorry_total: number;
  page_actions_post_reactions_anger_total: number;
  page_actions_post_reactions_total: Record<string, number>;

  // Video
  page_video_views: number;
  page_video_views_unique: number;
  page_video_repeat_views: number;
  page_video_complete_views_30s: number;
  page_video_complete_views_30s_unique: number;
  page_video_complete_views_30s_repeat_views: number;
  page_video_view_time: number;
  page_video_views_by_paid_non_paid: Record<string, number>;
  page_video_views_by_uploaded_hosted: Record<string, number>;

  // Monetization
  content_monetization_earnings: { currency: "USD"; microAmount: number };
}

export interface PostInsightMetricsMap {
  // Views & Reach
  post_media_view: number;
  post_total_media_view_unique: number;

  // Impressions
  post_impressions: number;
  post_impressions_unique: number;
  post_impressions_fan: number;
  post_impressions_fan_unique: number;

  // Engagement
  post_clicks: number;
  post_clicks_by_type: Record<string, number>;
  post_activity_by_action_type: Record<string, number>;
  post_activity_by_action_type_unique: Record<string, number>;

  // Reactions
  post_reactions_like_total: number;
  post_reactions_love_total: number;
  post_reactions_wow_total: number;
  post_reactions_haha_total: number;
  post_reactions_sorry_total: number;
  post_reactions_anger_total: number;
  post_reactions_by_type_total: Record<string, number>;

  // Video
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

  // Monetization
  content_monetization_earnings: { currency: "USD"; microAmount: number };
}

type PostInsightMetricsRaw = {
  [K in keyof PostInsightMetricsMap]: InsightEntryRaw<K, PostInsightMetricsMap[K]>;
};

export type PostInsightMetrics = KeysToCamel<PostInsightMetricsRaw>;

// ─── Raw API shapes (internal) ───

/**
 *   Extra possible fields
 * ```ts
 *   interface MyInsightEntry<M, V> extends InsightEntryRaw<M, V> {
 *     period: string;
 *     title: string;
 *     description: string;
 *     id: string;
 *   }
 * ```
 */
export interface InsightEntryRaw<M = string, V = unknown> {
  name: M;
  values: {
    value: V;
    end_time?: string;
  }[];
}

export type InsightRawResponse = {
  data: InsightEntryRaw[];
  paging?: InsightPaging;
};
export type InsightRawResponseCamelCase = KeysToCamel<InsightRawResponse>;

// ─── Options ───

export interface InsightEdgeOptions extends BaseEdgeOptions {
  period?: "day" | "week" | "days_28" | "lifetime" | "total_over_range";
  date_preset?:
    | "yesterday"
    | "last_month"
    | "last_year"
    | "last_7d"
    | "last_14d"
    | "last_28d"
    | "last_90d";
}

export type InsightOptions = KeysToCamel<InsightEdgeOptions>;
export type InsightPaging = { next: string; previous: string };

// ─── Query & Raw Response ───

export type InsightQuery<TMetrics, F extends FbFieldSelector<TMetrics>> = {
  fields: Fields<TMetrics, F, 0>;
  options?: InsightOptions;
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

// ─── Helpers ───

type InsightEntry<M = string, V = unknown> = KeysToCamel<InsightEntryRaw<M, V>>;
type ExtractInsightValue<E> = E extends InsightEntry<any, infer V> ? V : never;

export type InsightResponse<TMetrics, F extends FbFieldSelector<TMetrics>> = {
  [K in keyof FbPickDeep<TMetrics, F>]: InsightResult<
    ExtractInsightValue<FbPickDeep<TMetrics, F>[K]>
  >;
};
