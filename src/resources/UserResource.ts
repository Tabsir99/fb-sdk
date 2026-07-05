import { toGraphFields } from "../internal/utils.js";
import { type FacebookUser } from "../types/facebookuser.js";
import { type FacebookPage } from "../types/facebookpage.js";
import { type FbFieldSelector, type FbPickDeep, type ListEdge, type BatchableRequest } from "../types/shared.js";
import { type CreateResourceParams } from "../client.js";

/** Fetch signature for this user node. */
export type GetUser = <F extends FbFieldSelector<FacebookUser>>(
  fields: F,
) => BatchableRequest<FbPickDeep<FacebookUser, F>>;

/** Query signature for listing the Pages a user administers. */
export type ListAccounts = ListEdge<FacebookPage>;

/** Creates the User resource: read the user and list the Pages they administer. */
export const createUserResource = ({ http, id }: CreateResourceParams) => {
  /** Fetches this user by field selection. */
  const get: GetUser = (fields) =>
    http.get(`/${id}`, {
      params: { fields: toGraphFields(fields) },
    });

  /** Lists the Pages this user administers. */
  const accounts: ListAccounts = (query) =>
    http.get(`/${id}/accounts`, {
      params: { fields: toGraphFields(query.fields), ...query.options },
    });

  return {
    get,
    accounts,
  };
};
