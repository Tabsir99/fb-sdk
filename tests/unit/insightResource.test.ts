import { describe, it, expect, vi } from "vitest";
import { createPageInsightResource } from "../../src/resources/InsightResource.js";
import type { HttpClient } from "../../src/httpClient.js";
import { createBatchableRequest } from "../../src/internal/batchable.js";

function createMockHttp(responseData: unknown): HttpClient {
  return {
    get: vi.fn((_path: string, _options?) =>
      createBatchableRequest("GET", "test/insights", async () => responseData),
    ) as unknown as HttpClient["get"],
    post: vi.fn() as unknown as HttpClient["post"],
    delete: vi.fn() as unknown as HttpClient["delete"],
    getToken: () => "token",
  };
}

describe("InsightResource", () => {
  describe("numeric metrics", () => {
    it("produces { timeSeries, total } for numeric values", async () => {
      const http = createMockHttp({
        data: [
          {
            name: "page_follows",
            values: [
              { value: 10, endTime: "2024-01-01T00:00:00Z" },
              { value: 20, endTime: "2024-01-02T00:00:00Z" },
            ],
          },
        ],
      });
      const resource = createPageInsightResource({ http, id: "page1" });
      const result = await resource.list({ fields: { pageFollows: true } });

      expect(result.pageFollows.total).toBe(30);
      expect(result.pageFollows.timeSeries).toHaveLength(2);
      expect(result.pageFollows.timeSeries[0]!.value).toBe(10);
      expect(result.pageFollows.timeSeries[1]!.value).toBe(20);
    });
  });

  describe("record metrics", () => {
    it("produces { timeSeries, snapshot } for record values", async () => {
      const cityData = { "New York": 100, London: 50 };
      const http = createMockHttp({
        data: [
          {
            name: "page_fans_city",
            values: [
              { value: { "New York": 80, London: 40 }, endTime: "2024-01-01T00:00:00Z" },
              { value: cityData, endTime: "2024-01-02T00:00:00Z" },
            ],
          },
        ],
      });
      const resource = createPageInsightResource({ http, id: "page1" });
      const result = await resource.list({ fields: { pageFansCity: true } });

      expect(result.pageFansCity.snapshot).toEqual(cityData);
      expect(result.pageFansCity.timeSeries).toHaveLength(2);
    });
  });

  describe("monetization metrics", () => {
    it("converts microAmount to number", async () => {
      const http = createMockHttp({
        data: [
          {
            name: "content_monetization_earnings",
            values: [
              { value: { currency: "USD", microAmount: 1500000 }, endTime: "2024-01-01T00:00:00Z" },
            ],
          },
        ],
      });
      const resource = createPageInsightResource({ http, id: "page1" });
      const result = await resource.list({ fields: { contentMonetizationEarnings: true } });

      expect(result.contentMonetizationEarnings.timeSeries[0]!.value).toBe(1500000);
      expect(result.contentMonetizationEarnings.total).toBe(1500000);
    });
  });

  describe("endTime handling", () => {
    it("converts ISO string to epoch milliseconds", async () => {
      const isoDate = "2024-06-15T12:00:00Z";
      const http = createMockHttp({
        data: [
          {
            name: "page_follows",
            values: [{ value: 5, endTime: isoDate }],
          },
        ],
      });
      const resource = createPageInsightResource({ http, id: "page1" });
      const result = await resource.list({ fields: { pageFollows: true } });

      expect(result.pageFollows.timeSeries[0]!.endTime).toBe(new Date(isoDate).getTime());
    });

    it("defaults to Date.now() when endTime is absent", async () => {
      const mockNow = 1700000000000;
      vi.spyOn(Date, "now").mockReturnValue(mockNow);

      const http = createMockHttp({
        data: [
          {
            name: "page_follows",
            values: [{ value: 5 }],
          },
        ],
      });
      const resource = createPageInsightResource({ http, id: "page1" });
      const result = await resource.list({ fields: { pageFollows: true } });

      expect(result.pageFollows.timeSeries[0]!.endTime).toBe(mockNow);
      vi.restoreAllMocks();
    });
  });

  describe("metric name handling", () => {
    it("camelCases the API's snake_case name field", async () => {
      const http = createMockHttp({
        data: [
          {
            name: "page_post_engagements",
            values: [{ value: 100, endTime: "2024-01-01T00:00:00Z" }],
          },
        ],
      });
      const resource = createPageInsightResource({ http, id: "page1" });
      const result = await resource.list({ fields: { pagePostEngagements: true } });

      expect(result.pagePostEngagements).toBeDefined();
      expect(result.pagePostEngagements.total).toBe(100);
    });
  });

  describe("selected metrics", () => {
    it("only selected metrics appear in the result", async () => {
      const http = createMockHttp({
        data: [
          {
            name: "page_follows",
            values: [{ value: 10, endTime: "2024-01-01T00:00:00Z" }],
          },
        ],
      });
      const resource = createPageInsightResource({ http, id: "page1" });
      const result = await resource.list({ fields: { pageFollows: true } });

      expect(Object.keys(result)).toEqual(["pageFollows"]);
    });
  });
});
