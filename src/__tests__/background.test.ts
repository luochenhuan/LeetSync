type CookieListener = (info: {
  removed: boolean;
  cause: string;
  cookie: { name: string; value: string };
}) => void;

const loadBackground = (stored: string | null = 'session-abc') => {
  const setMock = jest.fn((_items: any, cb?: any) => cb && cb());
  let cookieListener: CookieListener = () => {};

  (global as any).chrome = {
    runtime: { onMessage: { addListener: jest.fn() }, lastError: undefined },
    action: { setIcon: jest.fn() },
    tabs: { query: jest.fn(), sendMessage: jest.fn() },
    webRequest: { onCompleted: { addListener: jest.fn() } },
    cookies: {
      get: jest.fn(),
      onChanged: {
        addListener: jest.fn((fn: CookieListener) => {
          cookieListener = fn;
        }),
      },
    },
    storage: {
      sync: {
        get: jest.fn((_keys: any, cb: any) => cb({ leetcode_session: stored })),
        set: setMock,
        onChanged: { addListener: jest.fn() },
      },
    },
  };

  jest.isolateModules(() => {
    require('../background');
  });

  return { setMock, fireCookieChange: (info: any) => cookieListener(info) };
};

const churn = (fire: (info: any) => void, value: string, times: number) => {
  // Chrome fires a removal then an insertion for every cookie update, and
  // LeetCode refreshes this cookie on many requests.
  for (let i = 0; i < times; i++) {
    fire({ removed: true, cause: 'overwrite', cookie: { name: 'LEETCODE_SESSION', value } });
    fire({ removed: false, cause: 'explicit', cookie: { name: 'LEETCODE_SESSION', value } });
  }
};

describe('background: LEETCODE_SESSION syncing', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('stays under the storage.sync write quota when the cookie churns', () => {
    const { setMock, fireCookieChange } = loadBackground('session-abc');

    churn(fireCookieChange, 'session-abc', 100);
    jest.runOnlyPendingTimers();

    // chrome.storage.sync allows 120 writes per minute.
    expect(setMock.mock.calls.length).toBeLessThan(120);
  });

  it('does not rewrite a session value that is already stored', () => {
    const { setMock, fireCookieChange } = loadBackground('session-abc');

    churn(fireCookieChange, 'session-abc', 5);
    jest.runOnlyPendingTimers();

    expect(setMock).not.toHaveBeenCalled();
  });

  it('stores the session when the cookie value actually changes', () => {
    const { setMock, fireCookieChange } = loadBackground('old-session');

    churn(fireCookieChange, 'new-session', 5);
    jest.runOnlyPendingTimers();

    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock.mock.calls[0][0]).toEqual({ leetcode_session: 'new-session' });
  });

  it('ignores other cookies', () => {
    const { setMock, fireCookieChange } = loadBackground(null);

    fireCookieChange({
      removed: false,
      cause: 'explicit',
      cookie: { name: 'csrftoken', value: 'whatever' },
    });
    jest.runOnlyPendingTimers();

    expect(setMock).not.toHaveBeenCalled();
  });
});
