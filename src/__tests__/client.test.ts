import { getClient, LEETCODE_GRAPHQL_API_URL } from '../lib/client';
import { GraphQLClient } from 'graphql-request';

describe('getClient', () => {
  it('returns a GraphQLClient instance with the correct url', () => {
    const client = getClient();
    expect(client).toBeInstanceOf(GraphQLClient);
    expect((client as any).url).toBe(LEETCODE_GRAPHQL_API_URL);
  });

  it('sends credentials so the LeetCode session cookie rides along', () => {
    // Without this the content script's cross-origin fetch drops the cookie
    // and every submission query comes back empty.
    expect((getClient() as any).requestConfig?.credentials).toBe('include');
  });

  it('returns the same instance on subsequent calls', () => {
    const first = getClient();
    const second = getClient();
    expect(first).toBe(second);
  });
});
