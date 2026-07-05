import type { KeysToCamel } from "../lib/transformCase.js";
import type { FbFieldSelector, FbPickDeep, Fields } from "./shared.js";

// Map values are leaf markers only; every metric resolves to the same friendly result shape.

interface InstagramMediaInsightMetricsMap {
  reach: number;
  views: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  total_interactions: number;
  follows: number;
  profile_visits: number;
  profile_activity: number;
  navigation: number;
  replies: number;
  link_clicks: number;
  reposts: number;
  ig_reels_avg_watch_time: number;
  ig_reels_video_view_total_time: number;
  reels_skip_rate: number;
  crossposted_views: number;
  facebook_views: number;
  total_comments: number;
  total_likes: number;
  total_views: number;
  /** @deprecated Unsupported for media created after 2024-07-02 — use `views`. */
  impressions: number;
}

/** Selectable metric names for `GET /{ig-media-id}/insights`. */
export type InstagramMediaInsightMetrics = KeysToCamel<InstagramMediaInsightMetricsMap>;

interface InstagramAccountInsightMetricsMap {
  reach: number;
  views: number;
  accounts_engaged: number;
  total_interactions: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  replies: number;
  reposts: number;
  profile_links_taps: number;
  follows_and_unfollows: number;
  engaged_audience_demographics: number;
  follower_demographics: number;
  /** @deprecated Dropped from the v22+ table but still functional; ≤30 days, needs ≥100 followers. */
  follower_count: number;
  /** @deprecated Legacy lifetime metric, last 30 days only. */
  online_followers: number;
  /** @deprecated Removed in v22 (2025-04-21) — use `views`. */
  impressions: number;
}

/** Selectable metric names for `GET /{ig-user-id}/insights`. */
export type InstagramAccountInsightMetrics = KeysToCamel<InstagramAccountInsightMetricsMap>;

/** A single insight breakdown dimension. */
export type InstagramInsightBreakdownDimension =
  | "action_type"
  | "story_navigation_action_type"
  | "media_product_type"
  | "follow_type"
  | "follower_type"
  | "contact_button_type"
  | "age"
  | "city"
  | "country"
  | "gender";

/** Query options for a media or account insights request. */
export interface InstagramInsightOptions {
  /** Aggregation window for each data point. */
  period?: "day" | "week" | "days_28" | "month" | "lifetime" | "total_over_range";
  breakdown?: InstagramInsightBreakdownDimension;
  /** Lower time bound, Unix seconds. */
  since?: number;
  /** Upper time bound, Unix seconds. */
  until?: number;
}

/** Insight options specific to account-level metrics. */
export interface InstagramAccountInsightOptions extends InstagramInsightOptions {
  /** `total_value` returns an aggregate; `time_series` returns daily points. */
  metricType?: "total_value" | "time_series";
  /** Required for demographic metrics. Only `this_week`/`this_month` remain valid. */
  timeframe?: "this_week" | "this_month";
}

/** A typed Instagram insights request: selected metric names plus options. */
export type InstagramInsightQuery<
  TMetrics,
  F extends FbFieldSelector<TMetrics>,
  TOptions = InstagramInsightOptions,
> = {
  fields: Fields<TMetrics, F, 0>;
  options?: TOptions;
};

/** A raw insight entry (keys already camelized by the HTTP layer). */
export interface InstagramInsightRawEntry {
  name: string;
  period?: string;
  title?: string;
  description?: string;
  values?: { value: number; endTime?: string }[];
  /** Present for `metricType: "total_value"`: the aggregate and any breakdowns. */
  totalValue?: {
    value?: number;
    breakdowns?: {
      dimensionKeys: string[];
      results: { dimensionValues: string[]; value: number; endTime?: string }[];
    }[];
  };
  id?: string;
}

/** Raw `/insights` response envelope. */
export interface InstagramInsightRawResponse {
  data: InstagramInsightRawEntry[];
  paging?: { previous?: string; next?: string };
}

/** One cell of a breakdown: the dimension values and their metric value. */
export interface InstagramInsightBreakdownResult {
  dimensionValues: string[];
  value: number;
}

/** A metric broken down by one or more dimensions. */
export interface InstagramInsightBreakdown {
  dimensionKeys: string[];
  results: InstagramInsightBreakdownResult[];
}

/** One point in an account-metric time series. */
export interface InstagramInsightDataPoint {
  value: number;
  /** Unix timestamp (seconds) at the end of this point's period. */
  endTime: number;
}

/** Normalized result for a single Instagram metric. */
export interface InstagramInsightResult {
  /** Aggregate value (`total_value.value`, or the sum of the time series). */
  value: number;
  /** Per-dimension values, present when a `breakdown` was requested. */
  breakdowns?: InstagramInsightBreakdown[];
  /** Daily series, present for `metricType: "time_series"` (account insights). */
  timeSeries?: InstagramInsightDataPoint[];
}

/** Response shape: each selected metric mapped to its {@link InstagramInsightResult}. */
export type InstagramInsightResponse<TMetrics, F extends FbFieldSelector<TMetrics>> = {
  [K in keyof FbPickDeep<TMetrics, F>]: InstagramInsightResult;
};
