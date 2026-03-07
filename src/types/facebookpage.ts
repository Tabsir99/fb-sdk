import { KeysToCamel } from "../lib/transformCase.js";
import type { PictureData } from "./shared.js";

export interface PageRaw {
  id: string;
  name: string;
  access_token: string;
  picture: { data: PictureData };
}
export type FacebookPage = KeysToCamel<PageRaw>;
