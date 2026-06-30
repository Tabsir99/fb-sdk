import { type CreateResourceParams } from "../../client.js";
import { createInstagramMediaResource } from "./InstagramMediaResource.js";

/**
 * Instagram hub for a single IG professional account (the IG User id discovered
 * via a Page's `instagram_business_account` field). Phase 1 scope: publishing.
 */
export function createInstagramResource(params: CreateResourceParams) {
  return {
    media: createInstagramMediaResource(params),
  };
}
