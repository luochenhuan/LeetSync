export type GithubSyncErrorKind = 'authentication' | 'api' | 'network';

export type GithubSyncErrorState = {
  kind: GithubSyncErrorKind;
  message: string;
  occurredAt: number;
};

export const GITHUB_CREDENTIAL_KEYS = ['github_leetsync_token', 'github_username'];
export const GITHUB_SYNC_ERROR_KEY = 'github_sync_error';
export const GITHUB_RECONNECT_MESSAGE =
  'GitHub authorization expired or was revoked. Reconnect GitHub to continue syncing.';
export const CLEAR_SYNC_ERROR_MESSAGE = 'clear-sync-error';
export const SET_SYNC_ERROR_MESSAGE = 'set-sync-error';
export const SET_SYNC_SUCCESS_MESSAGE = 'set-fire-icon';
