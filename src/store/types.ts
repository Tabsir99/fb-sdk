export interface CommentStore {
  /** Record that a post received comment activity. */
  recordActivity(pageId: string, postId: string, time: number): Promise<void>;

  /** Get post IDs that had comment activity since the given timestamp. */
  getActivePosts(pageId: string, since: number): Promise<string[]>;

  /** Remove entries older than the given timestamp. */
  cleanup(olderThan: number): Promise<void>;
}
