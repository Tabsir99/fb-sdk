import { expectTypeOf } from "expect-type";
import type { FbPickDeep } from "../../src/types/shared.js";
import type { FacebookPost } from "../../src/types/facebookpost.js";

// 1. Selecting { id: true } gives a type with only "id" present
type Result = FbPickDeep<FacebookPost, { id: true }>;
expectTypeOf<Result>().toHaveProperty("id");

// 2. Selecting { id: true } does NOT give "message" in the result
type NoMessage = FbPickDeep<FacebookPost, { id: true }>;
// "message" was not selected so it must not be in the result type
// @ts-expect-error
type Check = NoMessage["message"];

// 3. Selecting { id: true, message: true } gives both fields
type BothFields = FbPickDeep<FacebookPost, { id: true; message: true }>;
expectTypeOf<BothFields>().toHaveProperty("id");
expectTypeOf<BothFields>().toHaveProperty("message");

// 4. Selecting a CollectionOf field with nested fields gives Collection shape
type WithComments = FbPickDeep<
  FacebookPost,
  {
    comments: { fields: { id: true; message: true } };
  }
>;
// The "comments" property must have a data array
expectTypeOf<WithComments["comments"]["data"]>().toBeArray();
// Checking the shape of items inside the array
expectTypeOf<WithComments["comments"]["data"][0]>().toHaveProperty("id");
expectTypeOf<WithComments["comments"]["data"][0]>().toHaveProperty("message");

// 5. Selecting a CollectionOf field as "true" gives the raw collection shape
type CommentsTrue = FbPickDeep<FacebookPost, { comments: true }>;
expectTypeOf<CommentsTrue>().toHaveProperty("comments");
