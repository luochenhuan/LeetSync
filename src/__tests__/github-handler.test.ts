import { getQuestionSummary as getQuestionSummaryApi } from '../api/questions/getQuestion';
import GithubHandler from '../handlers/GithubHandler';
import { SolvedEntry, upsertReadmeEntry } from '../utils/readme.helper';

jest.mock('../constants', () => ({
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  GITHUB_REDIRECT_URI: '',
}));
jest.mock('../api/questions/getQuestion', () => ({ getQuestionSummary: jest.fn() }));

const getQuestionSummary = getQuestionSummaryApi as jest.Mock;

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
    expect(handler.getDifficultyColor('Easy')).toBe('brightgreen');
    expect(handler.getDifficultyColor('Medium')).toBe('orange');
    expect(handler.getDifficultyColor('Hard')).toBe('red');
  });

  it('creates a difficulty badge using the difficulty color', () => {
    const handler = new GithubHandler();
    const badge = handler.createDifficultyBadge('Medium');
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
    (handler as any).username = 'luochenhuan';
    // 2021-05-05 12:00:00 local time
    const timestamp = new Date(2021, 4, 5, 12).getTime() / 1000;
    const header = handler.createFileHeader('lru-cache', '.py', timestamp);
    expect(header).toBe(
      [
        '"""',
        'Source : https://leetcode.com/problems/lru-cache',
        'Author : luochenhuan',
        'Date   : 2021/05/05',
        '"""',
      ].join('\n'),
    );
  });

  it('wraps python code with template imports and test footer', () => {
    const handler = new GithubHandler();
    (handler as any).username = 'luochenhuan';
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
    (handler as any).username = 'luochenhuan';
    const timestamp = new Date(2021, 4, 5, 12).getTime() / 1000;
    const content = handler.applyTemplate('class Solution {}', 'two-sum', '.java', timestamp);
    expect(content).toContain('/*\nSource : https://leetcode.com/problems/two-sum');
    expect(content).toContain('class Solution {}');
    expect(content).not.toContain('unittest');
  });

  it('returns empty string and clears storage when token missing', async () => {
    const clear = jest.fn();
    (global as any).chrome.storage.sync.get = jest.fn((keys: any, cb: any) => cb({}));
    (global as any).chrome.storage.sync.clear = clear;
    const handler = new GithubHandler();
    const token = await handler.loadTokenFromStorage();
    expect(token).toBe('');
    expect(clear).toHaveBeenCalled();
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
