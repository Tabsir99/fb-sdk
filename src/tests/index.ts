import { Axios, AxiosError } from "axios";
import { fbGraph } from "../client.js";
import dotenv from "dotenv";

dotenv.config();

const token = process.env["ACCESS_TOKEN"]!;
const pageId = process.env["PAGE_ID"]!;
const fb = fbGraph(token);

const main = async () => {
  try {
    console.log("1. Fetching recent posts...");
    const posts = await fb.page(pageId).posts.list({ fields: { id: true }, options: { limit: 1 } });
    const postId = posts.data[0]?.id;
    if (!postId) throw new Error("No recent post found to test on.");
    console.log(`Using post: ${postId}`);

    console.log("2. Creating comment...");
    const createRes = await fb.post(postId).comments.create({ message: "Test comment from SDK" });
    const commentId = createRes.id;
    console.log(`Created comment: ${commentId}`);

    console.log("3. Reading comment...");
    const readRes = await fb
      .comment(commentId)
      .get({ id: true, message: true, canLike: true, canRemove: true });
    console.log("Read comment:", readRes);

    console.log("4. Liking comment...");
    const likeRes = await fb.comment(commentId).like();
    console.log("Like response:", likeRes);

    console.log("5. Unliking comment...");
    const unlikeRes = await fb.comment(commentId).unlike();
    console.log("Unlike response:", unlikeRes);

    console.log("6. Updating comment...");
    const updateRes = await fb
      .comment(commentId)
      .update({ message: "Updated test comment from SDK" });
    console.log("Update response:", updateRes);

    console.log("7. Deleting comment...");
    const deleteRes = await fb.comment(commentId).delete();
    console.log("Delete response:", deleteRes);

    console.log("Verification complete.");
  } catch (error) {
    if (!(error instanceof Error)) return;
    console.log("=== ERROR ===");
    console.log(error.stack);
    if (error instanceof AxiosError) console.log(error.response?.data);
    else console.log(error);
  }
};

const imageTest = async () => {
  try {
    const page = fbGraph(token).page("me");
  } catch (error) {
    if (error instanceof AxiosError) console.log(error.response?.data);
  }
};

imageTest();
