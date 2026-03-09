import { toGraphFields } from "../internal/utils.js";
import { FacebookUser } from "../types/facebookuser.js";
import { FacebookPage } from "../types/facebookpage.js";
import { FbFieldSelector, FbPickDeep, ListEdge } from "../types/shared.js";
import { CreateResourceParams } from "../client.js";

export type GetUser = <F extends FbFieldSelector<FacebookUser>>(
  fields: F,
) => Promise<FbPickDeep<FacebookUser, F>>;

export type ListAccounts = ListEdge<FacebookPage>;

export const createUserResource = ({ http, id }: CreateResourceParams) => {
  const get: GetUser = async (fields) =>
    http.get(`/${id}`, {
      params: {
        fields: toGraphFields(fields),
      },
    });

  const accounts: ListAccounts = async (fields) =>
    http.get(`/${id}/accounts`, {
      params: {
        fields: toGraphFields(fields),
      },
    });

  return {
    get,
    accounts,
  };
};
