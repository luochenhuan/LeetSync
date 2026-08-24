const mockGetSubmission = jest.fn();
const mockSubmit = jest.fn();

jest.mock('../handlers', () => ({
  LeetCodeHandler: jest.fn(() => ({ getSubmission: mockGetSubmission })),
  GithubHandler: jest.fn(() => ({ submit: mockSubmit })),
}));

export {};

describe('LeetCode content script sync status', () => {
  it('reports a visible sync error instead of the success icon when GitHub rejects a push', async () => {
    let listener: (request: any, sender: any, sendResponse: any) => Promise<void> = async () => {};
    const sendMessage = jest.fn();
    (global as any).chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn((nextListener: typeof listener) => {
            listener = nextListener;
          }),
        },
        sendMessage,
      },
      storage: {
        sync: {
          get: jest.fn((_keys: any, callback: any) => callback({})),
        },
      },
    };
    mockGetSubmission.mockResolvedValue({
      timestamp: Math.floor(Date.now() / 1000),
      statusCode: 10,
    });
    mockSubmit.mockResolvedValue(false);

    jest.isolateModules(() => {
      require('../scripts/leetcode');
    });
    await listener({ type: 'get-submission', data: { questionSlug: 'two-sum' } }, {}, jest.fn());

    expect(sendMessage).toHaveBeenCalledWith({ type: 'set-sync-error' });
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'set-fire-icon' });
  });
});
