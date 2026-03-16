import { expectTypeOf } from "expect-type";
import type { BatchableRequest, Collection, FbPickDeep } from "../../src/types/shared.js";
import type { FacebookPost, UpdateCommentResponse, DeleteCommentResponse, LikeCommentResponse } from "../../src/types/facebookpost.js";
import type { FacebookPage } from "../../src/types/facebookpage.js";
import type { FacebookMedia } from "../../src/types/facebookmedia.js";
import type { FacebookUser } from "../../src/types/facebookuser.js";
import type { GetPost, Expire } from "../../src/resources/PostResource.js";
import type { GetUser, ListAccounts } from "../../src/resources/UserResource.js";
import type { GetComment, UpdateComment, DeleteComment, LikeComment, UnlikeComment } from "../../src/resources/comment/CommentResource.js";
import type { ListPosts, ListMedia, PublishImage } from "../../src/resources/PageResource.js";
import type { Comment } from "../../src/types/facebookpost.js";

// ─── PostResource ─────────────────────────────────────────────────────────────

// 1. get({ id: true }) returns BatchableRequest<{ id: string }>
declare const getPost: GetPost;
const postById = getPost({ id: true });
expectTypeOf(postById).toEqualTypeOf<BatchableRequest<{ id: string }>>();

// 2. get({ id: true, message: true }) — awaited result has the correct picked shape
const awaitedPostWithMsg = await getPost({ id: true, message: true });
expectTypeOf(awaitedPostWithMsg).toEqualTypeOf<FbPickDeep<FacebookPost, { id: true; message: true }>>();

// 3. get rejects unknown fields
declare const getPost2: GetPost;
// @ts-expect-error
getPost2({ unknownField: true });

// 4. expire() returns BatchableRequest<void>
declare const expire: Expire;
const expireResult = expire(60000, "expire_only");
expectTypeOf(expireResult).toEqualTypeOf<BatchableRequest<void>>();

// 5. .transform() is available and correctly narrows the type
const transformedPost = getPost({ id: true }).transform((p) => p.id);
expectTypeOf(transformedPost).toEqualTypeOf<BatchableRequest<string>>();

// ─── UserResource ─────────────────────────────────────────────────────────────

// 6. get({ id: true, name: true }) returns correctly typed
declare const getUser: GetUser;
const userResult = getUser({ id: true, name: true });
expectTypeOf(userResult).toEqualTypeOf<
  BatchableRequest<FbPickDeep<FacebookUser, { id: true; name: true }>>
>();

// 7. accounts() returns BatchableRequest<Collection<FacebookPage, F>>
declare const accounts: ListAccounts;
const accountsResult = accounts({ fields: { id: true, name: true } });
expectTypeOf(accountsResult).toEqualTypeOf<
  BatchableRequest<Collection<FacebookPage, { id: true; name: true }>>
>();

// ─── CommentResource ──────────────────────────────────────────────────────────

// 8. get({ id: true, message: true }) returns correctly typed
declare const getComment: GetComment;
const commentResult = getComment({ id: true, message: true });
expectTypeOf(commentResult).toEqualTypeOf<
  BatchableRequest<FbPickDeep<Comment, { id: true; message: true }>>
>();

// 9. update() returns BatchableRequest<UpdateCommentResponse>
declare const updateComment: UpdateComment;
const updateResult = updateComment({ message: "edited" });
expectTypeOf(updateResult).toEqualTypeOf<BatchableRequest<UpdateCommentResponse>>();

// 10. delete() returns BatchableRequest<DeleteCommentResponse>
declare const deleteComment: DeleteComment;
const deleteResult = deleteComment();
expectTypeOf(deleteResult).toEqualTypeOf<BatchableRequest<DeleteCommentResponse>>();

// 11. like() and unlike() return BatchableRequest<LikeCommentResponse>
declare const likeComment: LikeComment;
declare const unlikeComment: UnlikeComment;
expectTypeOf(likeComment()).toEqualTypeOf<BatchableRequest<LikeCommentResponse>>();
expectTypeOf(unlikeComment()).toEqualTypeOf<BatchableRequest<LikeCommentResponse>>();

// ─── PageResource (sub-resources) ─────────────────────────────────────────────

// 12. posts.list returns BatchableRequest<Collection<FacebookPost, F>>
declare const listPosts: ListPosts;
const postsResult = listPosts({ fields: { id: true }, options: { limit: 5 } });
expectTypeOf(postsResult).toEqualTypeOf<
  BatchableRequest<Collection<FacebookPost, { id: true }>>
>();

// 13. videos.list and reels.list return BatchableRequest<Collection<FacebookMedia, F>>
declare const listMedia: ListMedia;
const mediaResult = listMedia({ fields: { id: true, title: true } });
expectTypeOf(mediaResult).toEqualTypeOf<
  BatchableRequest<Collection<FacebookMedia, { id: true; title: true }>>
>();

// 14. images.publish returns Promise<{ postId: string }>
declare const publishImage: PublishImage;
expectTypeOf(publishImage({ url: "https://example.com/img.jpg" })).toEqualTypeOf<
  Promise<{ postId: string }>
>();

// 15. .transform() on page sub-resource results correctly narrows type
const transformedPosts = listPosts({ fields: { id: true } }).transform((c) => c.data);
expectTypeOf(transformedPosts).toEqualTypeOf<
  BatchableRequest<FbPickDeep<FacebookPost, { id: true }>[]>
>();
