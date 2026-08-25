import { getQuestionSummary as getQuestionSummaryApi } from '../api/questions/getQuestion';
import GithubHandler from '../handlers/GithubHandler';
import type { QuestionDifficulty } from '../types/Question';
import type { Submission } from '../types/Submission';
import { SolvedEntry, upsertReadmeEntry } from '../utils/readme.helper';

jest.mock('../constants', () => ({
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  GITHUB_REDIRECT_URI: '',
}));
jest.mock('../api/questions/getQuestion', () => ({ getQuestionSummary: jest.fn() }));

const getQuestionSummary = getQuestionSummaryApi as jest.Mock;

const acceptedSubmission = {
  code: 'class Solution:\n    pass',
  timestamp: 1_724_515_200,
  statusCode: 10,
  lang: { name: 'python3', verboseName: 'Python3' },
  question: {
    questionId: '253',
    questionFrontendId: '253',
    title: 'Meeting Rooms II',
    titleSlug: 'meeting-rooms-ii',
    difficulty: 'Medium',
  },
} as Submission;

const installStorage = () => {
  const syncState: Record<string, any> = {
    github_leetsync_token: 'expired-token',
    github_username: 'octocat',
    github_leetsync_repo: 'leetcode-solutions',
    leetcode_session: 'leetcode-session',
  };
  const localState: Record<string, any> = {};
  const runtimeMessages: any[] = [];

  const createArea = (state: Record<string, any>) => ({
    get: jest.fn((keys: string | string[], callback?: (result: Record<string, any>) => void) => {
      const requested = Array.isArray(keys) ? keys : [keys];
      const result = Object.fromEntries(requested.map((key) => [key, state[key]]));
      if (callback) {
        callback(result);
        return;
      }
      return Promise.resolve(result);
    }),
    set: jest.fn((values: Record<string, any>, callback?: () => void) => {
      Object.assign(state, values);
      callback?.();
      return Promise.resolve();
    }),
    remove: jest.fn((keys: string | string[], callback?: () => void) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
      callback?.();
      return Promise.resolve();
    }),
    clear: jest.fn((callback?: () => void) => {
      for (const key of Object.keys(state)) delete state[key];
      callback?.();
      return Promise.resolve();
    }),
  });

  (global as any).chrome = {
    runtime: {
      sendMessage: jest.fn((message: any) => runtimeMessages.push(message)),
    },
    storage: {
      sync: createArea(syncState),
      local: createArea(localState),
    },
  };

  return { syncState, localState, runtimeMessages };
};

const githubResponse = (status: number, body: Record<string, any>) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
});

describe('GithubHandler utility methods', () => {
  beforeEach(() => {
    (global as any).chrome = {
      storage: {
        sync: {
          get: jest.fn((keys: any, cb: any) => cb({})),
          clear: jest.fn(),
        },
      },
    };
  });

  it('returns correct file extension for a language', () => {
    const handler = new GithubHandler();
    expect(handler.getProblemExtension('Python')).toBe('.py');
    expect(handler.getProblemExtension('JavaScript')).toBe('.js');
  });

  it('returns correct difficulty color', () => {
    const handler = new GithubHandler();
    expect(handler.getDifficultyColor('Easy' as QuestionDifficulty)).toBe('brightgreen');
    expect(handler.getDifficultyColor('Medium' as QuestionDifficulty)).toBe('orange');
    expect(handler.getDifficultyColor('Hard' as QuestionDifficulty)).toBe('red');
  });

  it('creates a difficulty badge using the difficulty color', () => {
    const handler = new GithubHandler();
    const badge = handler.createDifficultyBadge('Medium' as QuestionDifficulty);
    expect(badge).toContain('img');
    expect(badge).toContain('Difficulty-Medium-orange');
  });

  it('loads token from storage', async () => {
    const handler = new GithubHandler();
    (global as any).chrome.storage.sync.get = jest.fn((keys: any, cb: any) =>
      cb({ github_leetsync_token: 'abc' }),
    );
    const token = await handler.loadTokenFromStorage();
    expect(token).toBe('abc');
  });

  it('creates a python file header matching the repo template', () => {
    const handler = new GithubHandler();
    (handler as any).username = 'octocat';
    // 2021-05-05 12:00:00 local time
    const timestamp = new Date(2021, 4, 5, 12).getTime() / 1000;
    const header = handler.createFileHeader('lru-cache', '.py', timestamp);
    expect(header).toBe(
      [
        '"""',
        'Source : https://leetcode.com/problems/lru-cache',
        'Author : octocat',
        'Date   : 2021/05/05',
        '"""',
      ].join('\n'),
    );
  });

  it('wraps python code with template imports and test footer', () => {
    const handler = new GithubHandler();
    (handler as any).username = 'octocat';
    const timestamp = new Date(2021, 4, 5, 12).getTime() / 1000;
    const content = handler.applyTemplate(
      'class Solution:\n    pass',
      'lru-cache',
      '.py',
      timestamp,
    );
    expect(content).toContain('Source : https://leetcode.com/problems/lru-cache');
    expect(content).toContain('import unittest, sys, math, heapq');
    expect(content).toContain('from collections import defaultdict');
    expect(content).toContain('class Solution:\n    pass');
    expect(content).toContain("# if __name__ == '__main__':");
  });

  it('uses block comments for non-python languages and no python footer', () => {
    const handler = new GithubHandler();
    (handler as any).username = 'octocat';
    const timestamp = new Date(2021, 4, 5, 12).getTime() / 1000;
    const content = handler.applyTemplate('class Solution {}', 'two-sum', '.java', timestamp);
    expect(content).toContain('/*\nSource : https://leetcode.com/problems/two-sum');
    expect(content).toContain('class Solution {}');
    expect(content).not.toContain('unittest');
  });

  it('returns empty string without erasing unrelated settings when token is missing', async () => {
    const clear = jest.fn();
    (global as any).chrome.storage.sync.get = jest.fn((keys: any, cb: any) => cb({}));
    (global as any).chrome.storage.sync.clear = clear;
    const handler = new GithubHandler();
    const token = await handler.loadTokenFromStorage();
    expect(token).toBe('');
    expect(clear).not.toHaveBeenCalled();
  });

  it('names the solution commit after the problem number and title', () => {
    const handler = new GithubHandler();
    expect(handler.buildSolutionCommitMessage('437', 'Path Sum III')).toBe(
      '437. Path Sum III - LeetSync',
    );
  });
});

describe('GithubHandler readme syncing', () => {
  const entry: SolvedEntry = {
    number: '437',
    title: 'Path Sum III',
    slug: 'path-sum-iii',
    solutionPath: 'leetcode/437-path-sum-iii.py',
    difficulty: 'Medium',
  };

  beforeEach(() => {
    (global as any).chrome = {
      storage: { sync: { get: jest.fn((keys: any, cb: any) => cb({})), clear: jest.fn() } },
    };
    getQuestionSummary.mockReset();
  });

  //builds a handler whose github calls are stubbed, returning the spy on the write
  const stubHandler = (
    readme: { sha: string; content: string } | null,
    directory: string[] = [],
  ) => {
    const handler = new GithubHandler();
    const putFile = jest.fn();
    (handler as any).getFile = jest.fn().mockResolvedValue(readme);
    (handler as any).listDirectory = jest.fn().mockResolvedValue(directory);
    (handler as any).putFile = putFile;
    return { handler, putFile };
  };

  it('commits a scaffolded readme when the repo has none', async () => {
    const { handler, putFile } = stubHandler(null);

    await handler.syncReadme('leetcode', entry);

    expect(putFile).toHaveBeenCalledWith(
      'README.md',
      expect.stringContaining('[Path Sum III](https://leetcode.com/problems/path-sum-iii/)'),
      'Add 437. Path Sum III to solved list - LeetSync',
      null,
    );
  });

  it('reuses the existing sha so the readme is updated rather than recreated', async () => {
    const { handler, putFile } = stubHandler({ sha: 'sha-123', content: '# Solutions\n' });

    await handler.syncReadme('leetcode', entry);

    expect(putFile).toHaveBeenCalledWith(
      'README.md',
      expect.stringContaining('# Solutions'),
      expect.any(String),
      'sha-123',
    );
  });

  it('skips the commit when the problem is already listed and nothing is missing', async () => {
    const { handler, putFile } = stubHandler({
      sha: 'sha-123',
      content: upsertReadmeEntry(null, entry),
    });

    await handler.syncReadme('leetcode', entry);

    expect(putFile).not.toHaveBeenCalled();
  });

  it('backfills solutions that were committed before the index existed', async () => {
    getQuestionSummary.mockResolvedValue({
      questionFrontendId: '1',
      title: 'Two Sum',
      titleSlug: 'two-sum',
      difficulty: 'Easy',
    });
    const { handler, putFile } = stubHandler({ sha: 'sha-123', content: '# Solutions\n' }, [
      '1-two-sum.py',
    ]);

    await handler.syncReadme('leetcode', entry);

    const [, content, message] = putFile.mock.calls[0];
    expect(content).toContain('[Two Sum](https://leetcode.com/problems/two-sum/)');
    expect(content).toContain('[Solution](leetcode/1-two-sum.py)');
    expect(content).toContain('**2 problems solved**');
    expect(message).toBe('Add 437. Path Sum III and backfill 1 solved problem - LeetSync');
  });

  it('backfills with no new submission when called on its own', async () => {
    getQuestionSummary.mockResolvedValue({
      questionFrontendId: '1',
      title: 'Two Sum',
      titleSlug: 'two-sum',
      difficulty: 'Easy',
    });
    const { handler, putFile } = stubHandler(null, ['1-two-sum.py']);

    await handler.syncReadme('leetcode', null);

    expect(putFile.mock.calls[0][2]).toBe('Backfill 1 solved problem - LeetSync');
  });

  it('ignores notes files and counts a problem solved twice only once', async () => {
    getQuestionSummary.mockResolvedValue(null);
    const { handler, putFile } = stubHandler(null, [
      '1-two-sum.py',
      '1-two-sum.java',
      '1-two-sum-notes.md',
      'README.md',
    ]);

    await handler.syncReadme('leetcode', null);

    expect(putFile.mock.calls[0][1]).toContain('**1 problem solved**');
  });

  it('falls back to a slug-derived title when the lookup fails', async () => {
    getQuestionSummary.mockResolvedValue(null);
    const { handler, putFile } = stubHandler(null, ['42-trapping-rain-water.py']);

    await handler.syncReadme('leetcode', null);

    const content = putFile.mock.calls[0][1];
    expect(content).toContain('[Trapping Rain Water](https://leetcode.com/problems/');
    expect(content).toContain('| Unknown |');
  });

  it('does not re-list a problem the readme already has', async () => {
    const { handler, putFile } = stubHandler(
      { sha: 'sha-123', content: upsertReadmeEntry(null, entry) },
      ['437-path-sum-iii.py'],
    );

    await handler.syncReadme('leetcode', null);

    expect(getQuestionSummary).not.toHaveBeenCalled();
    expect(putFile).not.toHaveBeenCalled();
  });
});

describe('GithubHandler submission syncing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports an expired GitHub authorization instead of a successful sync', async () => {
    const { syncState, localState } = installStorage();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ message: 'Bad credentials' }),
    }) as jest.Mock;

    const result = await new GithubHandler().submit(acceptedSubmission);

    expect(result).toBe(false);
    expect(syncState.github_leetsync_token).toBeUndefined();
    expect(syncState.github_username).toBeUndefined();
    expect(syncState.github_leetsync_repo).toBe('leetcode-solutions');
    expect(syncState.leetcode_session).toBe('leetcode-session');
    expect(localState.github_sync_error).toMatchObject({
      kind: 'authentication',
      message: expect.stringContaining('Reconnect GitHub'),
    });
  });

  it('uses credentials linked after the LeetCode content script was initialized', async () => {
    const { syncState } = installStorage();
    delete syncState.github_leetsync_token;
    delete syncState.github_username;
    delete syncState.github_leetsync_repo;
    const handler = new GithubHandler();

    Object.assign(syncState, {
      github_leetsync_token: 'new-token',
      github_username: 'octocat',
      github_leetsync_repo: 'leetcode-solutions',
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(githubResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(githubResponse(201, { content: { sha: 'solution-sha' } }))
      .mockResolvedValueOnce(githubResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(githubResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(githubResponse(201, { content: { sha: 'readme-sha' } })) as jest.Mock;

    const result = await handler.submit(acceptedSubmission);

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('preserves LeetCode and repository settings when GitHub authorization is invalid', async () => {
    const { syncState, localState } = installStorage();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ message: 'Bad credentials' }),
    }) as jest.Mock;

    const result = await new GithubHandler().fetchGithubUser('expired-token');

    expect(result).toBeNull();
    expect(syncState.github_leetsync_token).toBeUndefined();
    expect(syncState.github_username).toBeUndefined();
    expect(syncState.github_leetsync_repo).toBe('leetcode-solutions');
    expect(syncState.leetcode_session).toBe('leetcode-session');
    expect(localState.github_sync_error).toMatchObject({ kind: 'authentication' });
  });

  it('clears the stored and visible error after GitHub authorization succeeds', async () => {
    const { syncState, localState, runtimeMessages } = installStorage();
    localState.github_sync_error = {
      kind: 'authentication',
      message: 'Reconnect GitHub',
    };
    global.fetch = jest.fn().mockResolvedValue(
      githubResponse(200, {
        id: 1,
        login: 'reauthorized-user',
        url: 'https://api.github.com/users/reauthorized-user',
      }),
    ) as jest.Mock;

    const result = await new GithubHandler().fetchGithubUser('new-token');

    expect(result?.login).toBe('reauthorized-user');
    expect(syncState.github_leetsync_token).toBe('new-token');
    expect(syncState.github_username).toBe('reauthorized-user');
    expect(localState.github_sync_error).toBeUndefined();
    expect(runtimeMessages).toContainEqual({ type: 'clear-sync-error' });
  });

  it('preserves unrelated settings when the OAuth token exchange is rejected', async () => {
    const { syncState, localState } = installStorage();
    delete syncState.github_leetsync_token;
    global.fetch = jest
      .fn()
      .mockResolvedValue(githubResponse(400, { message: 'Bad credentials' })) as jest.Mock;

    const result = await new GithubHandler().fetchAccessToken('invalid-code');

    expect(result).toBeUndefined();
    expect(syncState.github_leetsync_repo).toBe('leetcode-solutions');
    expect(syncState.leetcode_session).toBe('leetcode-session');
    expect(localState.github_sync_error).toMatchObject({ kind: 'authentication' });
  });

  it('stops authorization when the OAuth token exchange is rejected', async () => {
    const { syncState } = installStorage();
    delete syncState.github_leetsync_token;
    const fetchMock = jest
      .fn()
      .mockResolvedValue(githubResponse(400, { message: 'Bad credentials' }));
    global.fetch = fetchMock as jest.Mock;

    const result = await new GithubHandler().authorize('invalid-code');

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a missing repository from authorization and API failures', async () => {
    installStorage();
    global.fetch = jest
      .fn()
      .mockResolvedValue(githubResponse(404, { message: 'Not Found' })) as jest.Mock;

    const result = await new GithubHandler().checkRepository('octocat/missing-repository');

    expect(result).toEqual({ status: 'not-found', message: 'Repository not found' });
  });

  it('describes a repository check server error instead of calling it not found', async () => {
    installStorage();
    global.fetch = jest
      .fn()
      .mockResolvedValue(githubResponse(500, { message: 'Server Error' })) as jest.Mock;

    const result = await new GithubHandler().checkRepository('octocat/leetcode-solutions');

    expect(result).toEqual({
      status: 'error',
      message: 'GitHub could not verify this repository (500): Server Error',
    });
  });

  it('accepts a repository only after GitHub confirms it', async () => {
    installStorage();
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        githubResponse(200, { full_name: 'octocat/leetcode-solutions' }),
      ) as jest.Mock;

    const result = await new GithubHandler().checkRepository('octocat/leetcode-solutions');

    expect(result).toEqual({ status: 'found' });
  });

  it('reports a rejected file write without recording the problem as synced', async () => {
    const { syncState, localState } = installStorage();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(githubResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(githubResponse(422, { message: 'Validation Failed' })) as jest.Mock;

    const result = await new GithubHandler().submit(acceptedSubmission);

    expect(result).toBe(false);
    expect(syncState.lastSolved).toBeUndefined();
    expect(syncState.problemsSolved).toBeUndefined();
    expect(syncState.github_leetsync_token).toBe('expired-token');
    expect(localState.github_sync_error).toMatchObject({
      kind: 'api',
      message: expect.stringContaining('Validation Failed'),
    });
  });

  it('records a successful sync only after GitHub accepts the solution and README writes', async () => {
    const { syncState, localState } = installStorage();
    localState.github_sync_error = { kind: 'api', message: 'Previous failure' };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(githubResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(githubResponse(201, { content: { sha: 'solution-sha' } }))
      .mockResolvedValueOnce(githubResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(githubResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(githubResponse(201, { content: { sha: 'readme-sha' } })) as jest.Mock;

    const result = await new GithubHandler().submit(acceptedSubmission);

    expect(result).toBe(true);
    expect(syncState.lastSolved.slug).toBe('meeting-rooms-ii');
    expect(syncState.problemsSolved['meeting-rooms-ii'].question).toEqual({
      difficulty: 'Medium',
      questionId: '253',
    });
    expect(localState.github_sync_error).toBeUndefined();
  });
});
