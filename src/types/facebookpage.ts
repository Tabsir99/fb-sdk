import { KeysToCamel } from "../lib/transformCase.js";
import { FacebookPostRaw } from "./facebookpost.js";
import type { CollectionOf, PictureData } from "./shared.js";

export interface PageRaw {
  id: string;
  name: string;
  access_token: string;
  picture: { data: PictureData };
}
export type FacebookPage = KeysToCamel<PageRaw>;

export type FeedRaw = CollectionOf<FacebookPostRaw>;
export type Feed = KeysToCamel<FeedRaw>;
