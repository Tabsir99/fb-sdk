import { type KeysToCamel } from "../lib/transformCase.js";
import type { PictureData } from "./shared.js";

/** Raw Graph shape of a Facebook Page node. */
export interface PageRaw {
  id: string;
  name: string;
  /** Page access token — use to act as this Page. */
  access_token: string;
  picture: { data: PictureData };
}
/** A Facebook Page the user manages (camelCase view). */
export type FacebookPage = KeysToCamel<PageRaw>;
