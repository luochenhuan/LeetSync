import { GraphQLClient } from 'graphql-request';
let client: GraphQLClient;

export const LEETCODE_GRAPHQL_API_URL = 'https://leetcode.com/graphql';
export function getClient() {
  if (!client) {
    // A content script's fetch carries the extension's origin, so this counts
    // as cross-origin and the fetch default of `same-origin` credentials drops
    // LEETCODE_SESSION. Without that cookie questionSubmissionList answers with
    // `submissions: null` rather than an error, so the sync silently does
    // nothing on every submission.
    client = new GraphQLClient(LEETCODE_GRAPHQL_API_URL, { credentials: 'include' });
  }
  return client;
}
