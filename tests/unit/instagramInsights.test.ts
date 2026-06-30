import { describe, it, expect, vi } from "vitest";
import {
  createInstagramAccountInsightResource,
  createInstagramMediaInsightResource,
} from "../../src/resources/instagram/InstagramInsightResource.js";
import { createBatchableRequest } from "../../src/internal/batchable.js";
import type { HttpClient } from "../../src/httpClient.js";

function createMockHttp(responseData: unknown) {
  const calls: { path: string; params?: Record<string, unknown> | undefined }[] = [];
  const http: HttpClient = {
    get: vi.fn((path: string, options?: { params?: Record<string, unknown> }) => {
      calls.push({ path, params: options?.params });
      return createBatchableRequest("GET", path, async () => responseData);
    }) as unknown as HttpClient["get"],
    post: vi.fn() as unknown as HttpClient["post"],
    delete: vi.fn() as unknown as HttpClient["delete"],
    getToken: () => "token",
  };
  return { http, calls };
}

describe("instagram media insights", () => {
  it("reads total_value as the aggregate and snake-cases the metric list", async () => {
    const { http, calls } = createMockHttp({
      data: [
        { name: "reach", period: "lifetime", values: [{ value: 1200 }] },
        { name: "total_interactions", period: "lifetime", totalValue: { value: 45 } },
      ],
    });
    const insights = createInstagramMediaInsightResource({ http, id: "media-1" });

    const result = await insights.list({ fields: { reach: true, totalInteractions: true } });

    expect(result.reach.value).toBe(1200);
    expect(result.totalInteractions.value).toBe(45);
    expect(calls[0]!).toMatchObject({
      path: "/media-1/insights",
      params: { metric: "reach,total_interactions" },
    });
  });

  it("maps total_value.breakdowns into per-dimension results", async () => {
    const { http, calls } = createMockHttp({
      data: [
        {
          name: "reach",
          totalValue: {
            value: 100,
            breakdowns: [
              {
                dimensionKeys: ["media_product_type"],
                results: [
                  { dimensionValues: ["FEED"], value: 60 },
                  { dimensionValues: ["REELS"], value: 40 },
                ],
              },
            ],
          },
        },
      ],
    });
    const insights = createInstagramMediaInsightResource({ http, id: "m" });

    const result = await insights.list({
      fields: { reach: true },
      options: { breakdown: "media_product_type" },
    });

    expect(result.reach.value).toBe(100);
    expect(result.reach.breakdowns![0]!.results[1]!).toEqual({
      dimensionValues: ["REELS"],
      value: 40,
    });
    expect(calls[0]!.params).toMatchObject({ breakdown: "media_product_type" });
  });
});

describe("instagram account insights", () => {
  it("builds a timeSeries (and summed value) and snake-cases metricType", async () => {
    const { http, calls } = createMockHttp({
      data: [
        {
          name: "reach",
          period: "day",
          values: [
            { value: 10, endTime: "2026-01-01T00:00:00Z" },
            { value: 20, endTime: "2026-01-02T00:00:00Z" },
          ],
        },
      ],
    });
    const insights = createInstagramAccountInsightResource({ http, id: "ig-1" });

    const result = await insights.list({
      fields: { reach: true },
      options: { period: "day", metricType: "time_series" },
    });

    expect(result.reach.value).toBe(30);
    expect(result.reach.timeSeries).toHaveLength(2);
    expect(result.reach.timeSeries?.[1]).toEqual({
      value: 20,
      endTime: new Date("2026-01-02T00:00:00Z").getTime(),
    });
    expect(calls[0]!.params).toMatchObject({
      metric: "reach",
      period: "day",
      metric_type: "time_series",
    });
  });
});
