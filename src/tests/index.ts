import { AxiosError } from "axios";
import { fbGraph } from "../client.js";
import dotenv from "dotenv";

dotenv.config();

const token = process.env["ACCESS_TOKEN"]!;
const fb = fbGraph(token);

const main = async () => {
  try {
    const comments = await fb.me.get({ id: true });
    console.log(comments);
  } catch (error) {
    if (!(error instanceof Error)) return;
    console.log(error.stack);
    if (error instanceof AxiosError) console.log(error.response?.data);
    else console.log(error);
  }
};

main();
