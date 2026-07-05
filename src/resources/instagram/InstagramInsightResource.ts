import { type CreateResourceParams } from "../../client.js";
import { type HttpClient } from "../../httpClient.js";
import { toGraphFields } from "../../internal/utils.js";
import { toCamelCase, toSnakeObj } from "../../lib/transformCase.js";
import { type BatchableRequest, type FbFieldSelector } from "../../types/shared.js";
import {
  type InstagramAccountInsightMetrics,
  type InstagramAccountInsightOptions,
  type InstagramInsightOptions,
  type InstagramInsightQuery,
  type InstagramInsightRawEntry,
  type InstagramInsightRawResponse,
  type InstagramInsightResponse,
  type InstagramInsightResult,
  type InstagramMediaInsightMetrics,
} from "../../types/instagraminsights.js";

// total_value → aggregate value (+ breakdowns); values → time series.
function buildInsightResult(entry: InstagramInsightRawEntry): InstagramInsightResult {
  const series = entry.values ?? [];
  const result: InstagramInsightResult = {
    value: entry.totalValue?.value ?? series.reduce((sum, v) => sum + v.value, 0),
  };

  if (entry.totalValue?.breakdowns) {
    result.breakdowns = entry.totalValue.breakdowns.map((b) => ({
      dimensionKeys: b.dimensionKeys,
      results: b.results.map((r) => ({ dimensionValues: r.dimensionValues, value: r.value })),
    }));
  }

  if (series.length > 0) {
    result.timeSeries = series.map((v) => ({
      value: v.value,
      endTime: v.endTime ? new Date(v.endTime).getTime() : Date.now(),
    }));
  }

  return result;
}

const createInstagramInsightResource = <TMetrics, TOptions = InstagramInsightOptions>(
  http: HttpClient,
  id: string,
) => {
  /** Query the requested metrics; each resolves to a value with optional breakdowns and time series. */
  const list = <F extends FbFieldSelector<TMetrics>>(
    query: InstagramInsightQuery<TMetrics, F, TOptions>,
  ): BatchableRequest<InstagramInsightResponse<TMetrics, F>> => {
    type Result = InstagramInsightResponse<TMetrics, F>;

    return http
      .get<InstagramInsightRawResponse>(`/${id}/insights`, {
        params: {
          metric: toGraphFields(query.fields),
          ...toSnakeObj(query.options ?? {}),
        },
      })
      .transform((res) => {
        const result = {} as Result;
        for (const entry of res.data) {
          const name = toCamelCase(entry.name) as keyof Result;
          result[name] = buildInsightResult(entry) as Result[typeof name];
        }
        return result;
      });
  };

  return { list };
};

/** Media-level insights — `GET /{ig-media-id}/insights`. */
export const createInstagramMediaInsightResource = ({ http, id }: CreateResourceParams) =>
  createInstagramInsightResource<InstagramMediaInsightMetrics, InstagramInsightOptions>(http, id);

/** Account-level insights — `GET /{ig-user-id}/insights`. */
export const createInstagramAccountInsightResource = ({ http, id }: CreateResourceParams) =>
  createInstagramInsightResource<InstagramAccountInsightMetrics, InstagramAccountInsightOptions>(
    http,
    id,
  );
