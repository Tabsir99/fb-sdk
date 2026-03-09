import {
  CreateResourceParams,
  InsightQuery,
  InsightRawResponse,
  InsightResponse,
  PageInsightMetrics,
  PostInsightMetrics,
} from "../client.js";
import { HttpClient } from "../httpClient.js";
import { toGraphFields } from "../internal/utils.js";
import { KeysToCamel, SnakeToCamel, toCamel, toSnakeObj } from "../lib/transformCase.js";
import { FbFieldSelector } from "../types/shared.js";

type _InsightResponse = KeysToCamel<InsightRawResponse>;

const _transformInsightResponse = (data: _InsightResponse["data"]) => {
  const result: Record<string, any> = {};

  for (const entry of data) {
    const name = toCamel(entry.name) as SnakeToCamel<typeof entry.name>;
    const series = entry.values.map((v) => ({
      value:
        v.value instanceof Object && "microAmount" in v.value
          ? Number(v.value.microAmount)
          : v.value,
      endTime: v.endTime ? new Date(v.endTime).getTime() : Date.now(),
    }));

    if (typeof series[0]?.value === "number") {
      result[name] = {
        series,
        total: series.reduce((sum, v) => sum + (v.value as number), 0),
      };
    } else {
      result[name] = {
        series,
        snapshot: series[series.length - 1]?.value ?? {},
      };
    }
  }

  return result;
};

const createInsightResource = <TMetrics>(http: HttpClient, id: string) => {
  const list = async <F extends FbFieldSelector<TMetrics>>(
    query: InsightQuery<TMetrics, F>,
  ): Promise<InsightResponse<TMetrics, F>> => {
    const res = await http.get<_InsightResponse>(`/${id}/insights`, {
      params: {
        metric: toGraphFields(query.fields),
        fields: toGraphFields({ name: true, values: true }),
        ...toSnakeObj(query.options || {}),
      },
    });

    return _transformInsightResponse(res.data) as InsightResponse<TMetrics, F>;
  };

  return { list };
};

export const createPageInsightResource = ({ http, id }: CreateResourceParams) =>
  createInsightResource<PageInsightMetrics>(http, id);

export const createPostInsightResource = ({ http, id }: CreateResourceParams) =>
  createInsightResource<PostInsightMetrics>(http, id);
