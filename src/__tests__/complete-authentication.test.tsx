import { fireEvent, render, screen } from '@testing-library/react';
import {
  AuthorizeWithGithub,
  SelectRepositoryStep,
} from '../modules/CompleteAuthentication';
import { GITHUB_RECONNECT_MESSAGE } from '../utils/github-sync-state';

const mockNavigate = jest.fn();

jest.mock('@chakra-ui/react', () => {
  const React = require('react');
  const component = (tag: string) => ({ children, onClick, disabled, href }: any) =>
    React.createElement(tag, { onClick, disabled, href }, children);
  return {
    Button: component('button'),
    FormControl: component('div'),
    FormErrorMessage: component('div'),
    FormHelperText: component('div'),
    Heading: component('h2'),
    HStack: component('div'),
    Image: component('img'),
    Input: ({ onChange, placeholder, value }: any) =>
      React.createElement('input', { onChange, placeholder, value }),
    InputGroup: component('div'),
    Text: component('span'),
    VStack: component('div'),
  };
});

jest.mock('../constants', () => ({
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: '',
  GITHUB_REDIRECT_URI: 'https://github.com/',
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('GitHub authorization step', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('explains that GitHub must be reconnected after authorization expires', async () => {
    (global as any).chrome = {
      storage: {
        sync: {
          get: jest.fn((_keys: any, callback: any) => callback({})),
        },
        local: {
          get: jest.fn((_keys: any, callback: any) =>
            callback({
              github_sync_error: {
                kind: 'authentication',
                message:
                  'GitHub authorization expired or was revoked. Reconnect GitHub to continue syncing.',
              },
            }),
          ),
        },
      },
      tabs: {
        create: jest.fn(),
        getCurrent: jest.fn(),
        remove: jest.fn(),
      },
    };

    render(<AuthorizeWithGithub nextStep={jest.fn()} />);

    expect(
      await screen.findByText(
        'GitHub authorization expired or was revoked. Reconnect GitHub to continue syncing.',
      ),
    ).toBeTruthy();
  });

  it('asks the user to reconnect instead of claiming a private repository was not found', async () => {
    const syncState: Record<string, any> = {
      github_leetsync_token: 'expired-token',
      github_username: 'luochenhuan',
    };
    const localState: Record<string, any> = {};
    const createArea = (state: Record<string, any>) => ({
      get: jest.fn((keys: string | string[], callback?: (result: Record<string, any>) => void) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        const result = Object.fromEntries(requested.map((key) => [key, state[key]]));
        callback?.(result);
        return callback ? undefined : Promise.resolve(result);
      }),
      set: jest.fn((values: Record<string, any>, callback?: () => void) => {
        Object.assign(state, values);
        callback?.();
        return Promise.resolve();
      }),
      remove: jest.fn((keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
        return Promise.resolve();
      }),
    });
    (global as any).chrome = {
      runtime: { sendMessage: jest.fn() },
      storage: {
        sync: createArea(syncState),
        local: createArea(localState),
      },
      tabs: {
        create: jest.fn(),
        getCurrent: jest.fn(),
        remove: jest.fn(),
      },
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ message: 'Bad credentials' }),
    }) as jest.Mock;

    const onAuthorizationRequired = jest.fn();
    render(<SelectRepositoryStep onAuthorizationRequired={onAuthorizationRequired} />);
    fireEvent.change(screen.getByPlaceholderText('Repository URL'), {
      target: { value: 'https://github.com/luochenhuan/leetcode' },
    });
    fireEvent.click(screen.getByText('Link Repository'));

    expect(await screen.findByText(GITHUB_RECONNECT_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Repository not found')).toBeNull();
    expect(onAuthorizationRequired).toHaveBeenCalled();
  });
});
