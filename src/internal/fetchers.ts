import FormData from "form-data";
import type { HttpClient } from "../httpClient.js";
import type { CommentRaw } from "../types/facebookpost.js";
import {
  type BatchSubRequest,
  type BatchSubResponse,
  type Paging,
  ORDER,
} from "../types/shared.js";
import { CommentEdgeOptions } from "../resources/comment/CommentResource.js";

type FetchComments = (
  http: HttpClient,
  params: {
    postIds: string[];
    fieldsStr: string;
    options: CommentEdgeOptions | undefined;
    cursors: Record<string, string>;
  },
) => Promise<{
  comments: (CommentRaw & { _postId: string })[];
  nextCursors: Record<string, string>;
  remaining: string[];
}>;

export const fetchComments: FetchComments = async (
  http,
  { postIds, fieldsStr, options, cursors },
) => {
  const allComments: (CommentRaw & { _postId: string })[] = [];
  const nextCursors: Record<string, string> = {};
  const remaining: string[] = [];

  // Build batch sub-requests (max 50 per batch)
  const chunks: string[][] = [];
  for (let i = 0; i < postIds.length; i += 50) {
    chunks.push(postIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const batch: BatchSubRequest[] = chunk.map((postId) => {
      const params = new URLSearchParams();
      params.set("fields", fieldsStr);
      params.set("order", options?.order || ORDER.NEWEST);
      params.set("limit", "5");

      if (options?.filter) params.set("filter", options.filter);
      if (options?.summary !== undefined) params.set("summary", String(options.summary));
      if (options?.since) params.set("since", String(options.since));
      if (options?.until) params.set("until", String(options.until));

      const cursor = cursors[postId];
      if (cursor) params.set("after", cursor);

      console.log(params.toString());
      return {
        method: "GET",
        relative_url: `${postId}/comments?${params.toString()}`,
      };
    });

    const form = new FormData();
    form.append("batch", JSON.stringify(batch));
    form.append("include_headers", "false");
    const responses = await http.post<BatchSubResponse[]>("/", form);

    const responseArray = Array.isArray(responses) ? responses : [];

    for (let i = 0; i < responseArray.length; i++) {
      const resp = responseArray[i];
      const postId = chunk[i]!;
      if (!resp || resp.code !== 200) continue;

      const parsed = JSON.parse(resp.body) as {
        data: CommentRaw[];
        paging?: Paging;
      };

      for (const comment of parsed.data) {
        allComments.push({ ...comment, _postId: postId });
      }

      if (parsed.paging?.next && parsed.paging.cursors?.after) {
        nextCursors[postId] = parsed.paging.cursors.after;
        remaining.push(postId);
      }
    }
  }

  return { comments: allComments, nextCursors, remaining };
};
