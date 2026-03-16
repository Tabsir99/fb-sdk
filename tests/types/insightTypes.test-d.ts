import { expectTypeOf } from "expect-type";
import type {
  InsightQuery,
  InsightResponse,
  NumericInsightResult,
  RecordInsightResult,
  PageInsightMetrics,
} from "../../src/types/facebookinsights.js";
import type { FbFieldSelector } from "../../src/types/shared.js";

// 1. InsightQuery with PageInsightMetrics accepts { fields: { pageFollows: true } }
//    (camelCased because PageInsightMetrics = KeysToCamel<PageInsightMetricsMap>)
declare function testInsightQuery<F extends FbFieldSelector<PageInsightMetrics>>(
  query: InsightQuery<PageInsightMetrics, F>,
): void;
testInsightQuery({ fields: { pageFollows: true } });

// 2. InsightQuery rejects unknown metric names
// @ts-expect-error
testInsightQuery({ fields: { unknownMetricName: true } });

// 3. InsightResponse for a numeric metric produces NumericInsightResult
type NumericResponse = InsightResponse<PageInsightMetrics, { pageFollows: true }>;
expectTypeOf<NumericResponse["pageFollows"]>().toEqualTypeOf<NumericInsightResult>();

// 4. InsightResponse for a record metric produces RecordInsightResult
type RecordResponse = InsightResponse<PageInsightMetrics, { pageFansCity: true }>;
expectTypeOf<RecordResponse["pageFansCity"]>().toEqualTypeOf<
  RecordInsightResult<Record<string, number>>
>();

// 5. InsightResponse only contains selected keys — unselected metrics are not present
type PartialResponse = InsightResponse<PageInsightMetrics, { pageFollows: true }>;
// @ts-expect-error
type ShouldError = PartialResponse["pageFans"];
