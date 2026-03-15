import { expectTypeOf } from "expect-type";
import type { DeepStrict, FbFieldSelector, Fields } from "../../src/types/shared.js";
import type { FacebookPost } from "../../src/types/facebookpost.js";

// 1. A valid key that exists in FbFieldSelector<FacebookPost> passes through
type ValidSelector = { id: true };
type Result = DeepStrict<FbFieldSelector<FacebookPost>, ValidSelector>;
// The "id" key must exist and not be never
expectTypeOf<Result["id"]>().not.toBeNever();

// 2. An extra key not in FbFieldSelector<FacebookPost> becomes never
type WithExtra = { id: true; thisKeyDoesNotExist: true };
type Checked = DeepStrict<FbFieldSelector<FacebookPost>, WithExtra>;
expectTypeOf<Checked["thisKeyDoesNotExist"]>().toBeNever();

// 3. assigning an object with an extra key to Fields<FacebookPost, F>
declare function testFn<F extends FbFieldSelector<FacebookPost>>(
  fields: Fields<FacebookPost, F>,
): void;

// "nonExistent" is not a valid field on FacebookPost
// @ts-expect-error
testFn({ nonExistent: true });
