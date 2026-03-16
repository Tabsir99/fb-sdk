import {
  CreateResourceParams,
  InsightQuery,
  InsightResponse,
  PageInsightMetrics,
  PostInsightMetrics,
} from "../client.js";
import { HttpClient } from "../httpClient.js";

import { toGraphFields } from "../internal/utils.js";
import { toCamel, toSnakeObj } from "../lib/transformCase.js";
import { BatchableRequest, FbFieldSelector } from "../types/shared.js";
import { InsightRawResponseCamelCase } from "../types/facebookinsights.js";

const createInsightResource = <TMetrics>(http: HttpClient, id: string) => {
  const list = <F extends FbFieldSelector<TMetrics>>(
    query: InsightQuery<TMetrics, F>,
  ): BatchableRequest<InsightResponse<TMetrics, F>> => {
    type Result = InsightResponse<TMetrics, F>;

    return http
      .get<InsightRawResponseCamelCase>(`/${id}/insights`, {
        params: {
          metric: toGraphFields(query.fields),
          fields: toGraphFields({ name: true, values: true }),
          ...toSnakeObj(query.options || {}),
        },
      })
      .transform((res) => {
        const result = {} as Result;

        for (const entry of res.data) {
          const name = toCamel(entry.name) as keyof Result;
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
            } as Result[typeof name];
          } else {
            result[name] = {
              series,
              snapshot: series[series.length - 1]?.value,
            } as Result[typeof name];
          }
        }

        return result;
      });
  };

  return { list };
};

export const createPageInsightResource = ({ http, id }: CreateResourceParams) =>
  createInsightResource<PageInsightMetrics>(http, id);

export const createPostInsightResource = ({ http, id }: CreateResourceParams) =>
  createInsightResource<PostInsightMetrics>(http, id);
