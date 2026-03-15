import { expectTypeOf } from "expect-type";
import type { FbFieldSelector, CollectionOf } from "../../src/types/shared.js";
import type { FacebookPost } from "../../src/types/facebookpost.js";

// 1. A valid primitive field selector is assignable to FbFieldSelector<FacebookPost>
const valid: FbFieldSelector<FacebookPost> = { id: true, message: true };

// 2. A CollectionOf field can use the { fields: {...} } shape
const withCollection: FbFieldSelector<FacebookPost> = {
  comments: { fields: { id: true, message: true } },
};

// 3. A CollectionOf field can also be set to just "true" (scalar selection)
const collectionAsTrue: FbFieldSelector<FacebookPost> = { comments: true };

// 4. A nested non-collection object field can use sub-selector
const nestedObjSubSelector: FbFieldSelector<FacebookPost> = {
  reactions: { summary: true },
};

// 5. A completely unknown field is rejected
// A field that does not exist on FacebookPost must not be accepted by FbFieldSelector<FacebookPost>
// @ts-expect-error
const invalid: FbFieldSelector<FacebookPost> = { nonExistentField: true };

// 6. false is not a valid value (only true or object)
// false is not assignable in FbFieldSelector (leaf values must be true, not boolean)
// @ts-expect-error
const withFalse: FbFieldSelector<FacebookPost> = { id: false };
