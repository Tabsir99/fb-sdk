import { KeysToCamel } from "../lib/transformCase.js";

interface FacebookUserRaw {
  id: string;
  name: string;
  picture: {
    data: {
      height: number;
      is_silhouette: boolean;
      url: string;
      width: number;
    };
  };
}

export type FacebookUser = KeysToCamel<FacebookUserRaw>;
