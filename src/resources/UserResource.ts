import { toGraphFields } from "../internal/utils.js";
import { FacebookUser } from "../types/facebookuser.js";
import { FacebookPage } from "../types/facebookpage.js";
import { FbFieldSelector, FbPickDeep, ListEdge, BatchableRequest } from "../types/shared.js";
import { CreateResourceParams } from "../client.js";

export type GetUser = <F extends FbFieldSelector<FacebookUser>>(
  fields: F,
) => BatchableRequest<FbPickDeep<FacebookUser, F>>;

export type ListAccounts = ListEdge<FacebookPage>;

export const createUserResource = ({ http, id }: CreateResourceParams) => {
  const get: GetUser = (fields) =>
    http.get(`/${id}`, {
      params: { fields: toGraphFields(fields) },
    });

  const accounts: ListAccounts = (query) =>
    http.get(`/${id}/accounts`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  return {
    get,
    accounts,
  };
};
