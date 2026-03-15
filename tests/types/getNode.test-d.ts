import { expectTypeOf } from "expect-type";
import type { GetNode, FbPickDeep, BatchableRequest } from "../../src/types/shared.js";
import type { FacebookPost } from "../../src/types/facebookpost.js";

// 1. GetNode<FacebookPost> called with { id: true } returns BatchableRequest<{ id: string }>
type GetFbPost = GetNode<FacebookPost>;
declare const getFn: GetFbPost;

const result1 = await getFn({ id: true });
expectTypeOf(result1).toEqualTypeOf<{ id: string }>();

// 2. The return type changes based on which fields are selected
const result2 = await getFn({ id: true, message: true });
expectTypeOf(result2).not.toEqualTypeOf<typeof result1>();

// 3. invalid field selector is rejected by GetNode
declare const getFn2: GetNode<FacebookPost>;
// "unknownField" does not exist on FacebookPost
// @ts-expect-error
getFn2({ unknownField: true });
