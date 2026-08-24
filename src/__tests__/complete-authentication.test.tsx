import { render, screen } from '@testing-library/react';
import { AuthorizeWithGithub } from '../modules/CompleteAuthentication';

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
    Input: component('input'),
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

describe('GitHub authorization step', () => {
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
});
