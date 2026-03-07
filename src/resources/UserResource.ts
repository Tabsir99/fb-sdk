import { HttpClient } from "../httpClient.js";
import { toGraphFields } from "../utils.js";
import { FacebookUser } from "../types/facebookuser.js";
import { FacebookPage } from "../types/facebookpage.js";
import { Collection, FbFieldSelector, FbPickDeep } from "../types/shared.js";

export type GetUser = <F extends FbFieldSelector<FacebookUser>>(
  fields: F,
) => Promise<FbPickDeep<FacebookUser, F>>;

export type ListAccounts = <F extends FbFieldSelector<FacebookPage>>(
  fields: F,
) => Promise<Collection<FacebookPage, F>>;

export const createUserResource = (http: HttpClient) => {
  const get: GetUser = async (fields) =>
    http.get(`/me`, {
      params: {
        fields: toGraphFields(fields),
      },
    });

  const accounts: ListAccounts = async (fields) =>
    http.get(`/me/accounts`, {
      params: {
        fields: toGraphFields(fields),
      },
    });

  return {
    get,
    accounts,
  };
};
