type CookieListener = (info: {
  removed: boolean;
  cause: string;
  cookie: { name: string; value: string };
}) => void;

export {};

const loadBackground = (stored: string | null = 'session-abc') => {
  const setMock = jest.fn((_items: any, cb?: any) => cb && cb());
  let cookieListener: CookieListener = () => {};
  let runtimeListener: (request: any, sender: any, sendResponse: any) => void = () => {};
  let webRequestListener: (details: any) => void = () => {};
  const sendMessage = jest.fn();
  const action = {
    setIcon: jest.fn(),
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    setTitle: jest.fn(),
  };

  (global as any).chrome = {
    runtime: {
      onMessage: {
        addListener: jest.fn((fn: typeof runtimeListener) => {
          runtimeListener = fn;
        }),
      },
      lastError: undefined,
    },
    action,
    tabs: {
      query: jest.fn((_query: any, callback: any) => callback([{ id: 99 }])),
      sendMessage,
    },
    webRequest: {
      onCompleted: {
        addListener: jest.fn((fn: typeof webRequestListener) => {
          webRequestListener = fn;
        }),
      },
    },
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

  return {
    action,
    sendMessage,
    setMock,
    fireCookieChange: (info: any) => cookieListener(info),
    fireRuntimeMessage: (request: any) => runtimeListener(request, {}, jest.fn()),
    fireWebRequest: (details: any) => webRequestListener(details),
  };
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

describe('background: submission status', () => {
  it('shows a visible error badge when a GitHub sync fails', () => {
    const { action, fireRuntimeMessage } = loadBackground();

    fireRuntimeMessage({ type: 'set-sync-error' });

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!' });
    expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#C53030' });
    expect(action.setTitle).toHaveBeenCalledWith({
      title: 'LeetSync sync failed. Open the extension for details.',
    });
  });

  it('clears the visible error badge after GitHub authorization recovers', () => {
    const { action, fireRuntimeMessage } = loadBackground();
    fireRuntimeMessage({ type: 'set-sync-error' });

    fireRuntimeMessage({ type: 'clear-sync-error' });

    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    expect(action.setTitle).toHaveBeenLastCalledWith({ title: 'LeetSync' });
  });
});

describe('background: accepted submission routing', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('delivers the submission event to the originating LeetCode tab', () => {
    const { fireWebRequest, sendMessage } = loadBackground();
    fireWebRequest({
      method: 'POST',
      tabId: 42,
      url: 'https://leetcode.com/problems/meeting-rooms-ii/submit/',
    });

    jest.advanceTimersByTime(5000);

    expect(sendMessage).toHaveBeenCalledWith(
      42,
      { type: 'get-submission', data: { questionSlug: 'meeting-rooms-ii' } },
      expect.any(Function),
    );
  });
});
