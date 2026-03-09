import { AxiosError } from "axios";
import { createFbSdk } from "../client.js";
import dotenv from "dotenv";

dotenv.config();

const fb = createFbSdk();
const token = process.env["ACCESS_TOKEN"]!;

const imageTest = async () => {
  try {
    const result = await fb(token)
      .page("me")
      .insights.list({
        fields: { pageMediaView: true },
        options: { period: "day", datePreset: "yesterday" },
      });

    console.log(result);
  } catch (error) {
    if (error instanceof AxiosError) console.log(error.response?.data);
  }
};

imageTest();
