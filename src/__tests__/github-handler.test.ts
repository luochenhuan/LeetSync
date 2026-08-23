import GithubHandler from '../handlers/GithubHandler';
import { SolvedEntry, upsertReadmeEntry } from '../utils/readme.helper';

jest.mock('../constants', () => ({
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  GITHUB_REDIRECT_URI: '',
}));

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
  });

  it('commits a scaffolded readme when the repo has none', async () => {
    const handler = new GithubHandler();
    const putFile = jest.fn();
    (handler as any).getFile = jest.fn().mockResolvedValue(null);
    (handler as any).putFile = putFile;

    await handler.updateReadme(entry);

    expect(putFile).toHaveBeenCalledWith(
      'README.md',
      expect.stringContaining('[Path Sum III](https://leetcode.com/problems/path-sum-iii/)'),
      'Add 437. Path Sum III to solved list - LeetSync',
      null,
    );
  });

  it('reuses the existing sha so the readme is updated rather than recreated', async () => {
    const handler = new GithubHandler();
    const putFile = jest.fn();
    (handler as any).getFile = jest
      .fn()
      .mockResolvedValue({ sha: 'sha-123', content: '# Solutions\n' });
    (handler as any).putFile = putFile;

    await handler.updateReadme(entry);

    expect(putFile).toHaveBeenCalledWith(
      'README.md',
      expect.stringContaining('# Solutions'),
      expect.any(String),
      'sha-123',
    );
  });

  it('skips the commit when the problem is already listed', async () => {
    const handler = new GithubHandler();
    const putFile = jest.fn();
    (handler as any).getFile = jest
      .fn()
      .mockResolvedValue({ sha: 'sha-123', content: upsertReadmeEntry(null, entry) });
    (handler as any).putFile = putFile;

    await handler.updateReadme(entry);

    expect(putFile).not.toHaveBeenCalled();
  });
});
