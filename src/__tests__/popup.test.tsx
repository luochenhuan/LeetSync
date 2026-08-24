import { act, render, screen } from '@testing-library/react';
import PopupPage from '../pages/popup';

jest.mock('@chakra-ui/react', () => {
  const React = require('react');
  const component = (tag: string) => ({ children }: any) => React.createElement(tag, {}, children);
  return {
    Alert: component('div'),
    AlertDescription: component('div'),
    AlertIcon: component('span'),
    CircularProgress: component('div'),
    Container: component('div'),
    Heading: component('h1'),
    VStack: component('div'),
  };
});

jest.mock('../modules/CompleteAuthentication', () => ({
  AuthorizeWithGithub: () => <div>Reconnect GitHub step</div>,
  AuthorizeWithLeetCode: () => <div>Authorize LeetCode step</div>,
  SelectRepositoryStep: () => <div>Select repository step</div>,
  StartOnboarding: () => <div>Start onboarding</div>,
}));

jest.mock('../modules/Dashboard', () => () => <div>Dashboard</div>);
jest.mock('../modules/OnboardingLayout', () => ({
  OnboardingLayout: ({ children }: any) => <div>{children}</div>,
}));

describe('popup authorization recovery', () => {
  it('opens the GitHub reconnect step immediately after authorization expires', async () => {
    (global as any).chrome = {
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({
            github_leetsync_repo: 'leetcode-solutions',
            leetcode_session: 'leetcode-session',
          }),
        },
        local: {
          get: jest.fn().mockResolvedValue({
            github_sync_error: {
              kind: 'authentication',
              message:
                'GitHub authorization expired or was revoked. Reconnect GitHub to continue syncing.',
            },
          }),
        },
      },
    };

    render(<PopupPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Reconnect GitHub step')).toBeTruthy();
    expect(screen.queryByText('Start onboarding')).toBeNull();
  });

  it('shows GitHub API failure details on an otherwise connected dashboard', async () => {
    (global as any).chrome = {
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({
            github_leetsync_token: 'token',
            github_username: 'octocat',
            github_leetsync_repo: 'leetcode-solutions',
            leetcode_session: 'leetcode-session',
          }),
        },
        local: {
          get: jest.fn().mockResolvedValue({
            github_sync_error: {
              kind: 'api',
              message: 'GitHub rejected the sync (422): Validation Failed',
            },
          }),
        },
      },
    };

    render(<PopupPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('GitHub rejected the sync (422): Validation Failed')).toBeTruthy();
  });
});
