import {
  CreateResourceParams,
  InsightMetrics,
  InsightQuery,
  InsightRawResponse,
  InsightResponse,
} from "../client.js";
import { toGraphFields } from "../internal/utils.js";
import { SnakeToCamel, toCamel, toSnakeObj } from "../lib/transformCase.js";
import { FbFieldSelector } from "../types/shared.js";

export const createInsightResource = ({ http, id }: CreateResourceParams) => {
  const list = async <F extends FbFieldSelector<InsightMetrics>>(
    query: InsightQuery<F>,
  ): Promise<InsightResponse<F>> => {
    const res = await http.get<InsightRawResponse>(`/${id}/insights`, {
      params: {
        metric: toGraphFields(query.fields),
        fields: toGraphFields({ name: true, values: true }),
        ...toSnakeObj(query.options || {}),
      },
    });

    const result: Record<string, any> = {};

    for (const entry of res.data) {
      const name = toCamel(entry.name) as SnakeToCamel<typeof entry.name>;
      const series = entry.values.map((v) => ({
        value: v.value,
        endTime: new Date(v.endTime).getTime(),
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

    return result as InsightResponse<F>;
  };

  return { list };
};
