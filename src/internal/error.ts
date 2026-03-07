import { FacebookMedia } from "../types/facebookmedia.js";

export class FacebookUploadError extends Error {
  constructor(
    message: string,
    public readonly status?: FacebookMedia["status"],
  ) {
    super(message);
    this.name = "FacebookUploadError";
  }
}
