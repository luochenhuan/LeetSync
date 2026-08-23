import {
  README_END_MARKER,
  README_START_MARKER,
  SolvedEntry,
  parseEntries,
  parseSolutionFileName,
  titleFromSlug,
  upsertReadmeEntries,
  upsertReadmeEntry,
} from '../utils/readme.helper';

const pathSum: SolvedEntry = {
  number: '437',
  title: 'Path Sum III',
  slug: 'path-sum-iii',
  solutionPath: 'leetcode/437-path-sum-iii.py',
  difficulty: 'Medium',
};
const twoSum: SolvedEntry = {
  number: '1',
  title: 'Two Sum',
  slug: 'two-sum',
  solutionPath: 'leetcode/1-two-sum.py',
  difficulty: 'Easy',
};

describe('upsertReadmeEntry', () => {
  it('scaffolds a README when the repo has none', () => {
    const readme = upsertReadmeEntry(null, pathSum);
    expect(readme).toContain('# LeetCode Solutions');
    expect(readme).toContain(README_START_MARKER);
    expect(readme).toContain(README_END_MARKER);
    expect(readme).toContain(
      '| 437 | [Path Sum III](https://leetcode.com/problems/path-sum-iii/) | ' +
        '[Solution](leetcode/437-path-sum-iii.py) | Medium |',
    );
  });

  it('keeps existing prose and appends the block when markers are absent', () => {
    const readme = upsertReadmeEntry('# My Solutions\n\nHand written notes.\n', pathSum);
    expect(readme).toContain('# My Solutions');
    expect(readme).toContain('Hand written notes.');
    expect(readme).toContain(README_START_MARKER);
    expect(readme.indexOf('Hand written notes.')).toBeLessThan(readme.indexOf(README_START_MARKER));
  });

  it('replaces only the managed block and leaves surrounding content untouched', () => {
    const first = upsertReadmeEntry('Intro line.\n', twoSum);
    const withFooter = `${first}\nFooter line.\n`;
    const second = upsertReadmeEntry(withFooter, pathSum);

    expect(second).toContain('Intro line.');
    expect(second).toContain('Footer line.');
    expect(second.match(new RegExp(README_START_MARKER, 'g'))).toHaveLength(1);
    expect(parseEntries(second)).toHaveLength(2);
  });

  it('refreshes an existing problem instead of duplicating its row', () => {
    const first = upsertReadmeEntry(null, pathSum);
    const relangedSolution = { ...pathSum, solutionPath: 'leetcode/437-path-sum-iii.java' };
    const second = upsertReadmeEntry(first, relangedSolution);

    const entries = parseEntries(second);
    expect(entries).toHaveLength(1);
    expect(entries[0].solutionPath).toBe('leetcode/437-path-sum-iii.java');
  });

  it('sorts rows by problem number and reports the running count', () => {
    const readme = upsertReadmeEntry(upsertReadmeEntry(null, pathSum), twoSum);

    expect(parseEntries(readme).map((entry) => entry.number)).toEqual(['1', '437']);
    expect(readme).toContain('**2 problems solved**');
  });

  it('uses a singular summary for the first problem', () => {
    expect(upsertReadmeEntry(null, twoSum)).toContain('**1 problem solved**');
  });

  it('round-trips every field through the rendered table', () => {
    const entries = parseEntries(upsertReadmeEntry(null, pathSum));
    expect(entries).toEqual([pathSum]);
  });

  it('encodes path segments so links survive a subdirectory with spaces', () => {
    const spaced = { ...twoSum, solutionPath: 'my solutions/1-two-sum.py' };
    const readme = upsertReadmeEntry(null, spaced);

    expect(readme).toContain('[Solution](my%20solutions/1-two-sum.py)');
    expect(parseEntries(readme)[0].solutionPath).toBe('my solutions/1-two-sum.py');
  });
});

describe('parseSolutionFileName', () => {
  it('recovers the number and slug from a solution file', () => {
    expect(parseSolutionFileName('437-path-sum-iii.py')).toEqual({
      number: '437',
      slug: 'path-sum-iii',
    });
    expect(parseSolutionFileName('1-two-sum.java')).toEqual({ number: '1', slug: 'two-sum' });
  });

  it('rejects notes files and anything not named after a problem', () => {
    expect(parseSolutionFileName('437-path-sum-iii-notes.md')).toBeNull();
    expect(parseSolutionFileName('README.md')).toBeNull();
    expect(parseSolutionFileName('helpers.py')).toBeNull();
  });
});

describe('titleFromSlug', () => {
  it('title-cases a slug, keeping minor words lowercase and roman numerals upper', () => {
    expect(titleFromSlug('two-sum')).toBe('Two Sum');
    expect(titleFromSlug('path-sum-iii')).toBe('Path Sum III');
    expect(titleFromSlug('best-time-to-buy-and-sell-stock')).toBe(
      'Best Time to Buy and Sell Stock',
    );
  });
});

describe('upsertReadmeEntries', () => {
  it('merges several problems into one table in a single pass', () => {
    const readme = upsertReadmeEntries(null, [pathSum, twoSum]);

    expect(parseEntries(readme).map((entry) => entry.number)).toEqual(['1', '437']);
    expect(readme).toContain('**2 problems solved**');
  });
});

describe('parseEntries', () => {
  it('returns nothing for content without a managed block', () => {
    expect(parseEntries(null)).toEqual([]);
    expect(parseEntries('# Just a README\n')).toEqual([]);
  });

  it('ignores tables the user wrote outside the markers', () => {
    const readme = `| # | Problem |\n| --- | --- |\n| 9 | [Mine](https://example.com) |\n`;
    expect(parseEntries(readme)).toEqual([]);
  });
});
