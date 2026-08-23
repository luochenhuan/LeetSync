export type SolvedEntry = {
  /** Frontend problem number as shown on LeetCode, e.g. `437`. */
  number: string;
  title: string;
  slug: string;
  /** Repo-relative path of the committed solution file. */
  solutionPath: string;
  difficulty: string;
};

export const README_START_MARKER = '<!-- LEETSYNC:START -->';
export const README_END_MARKER = '<!-- LEETSYNC:END -->';

const TABLE_HEADER = ['| # | Problem | Solution | Difficulty |', '| --- | --- | --- | --- |'];

const README_SCAFFOLD = [
  '# LeetCode Solutions',
  '',
  'Synced automatically by [LeetSync](https://github.com/3ba2ii/leet-sync).',
  '',
];

/* Matches a row this helper wrote, capturing number, title, slug, solution path and difficulty. */
const ROW_PATTERN =
  /^\|\s*([^|]*?)\s*\|\s*\[([^\]]*)\]\(https:\/\/leetcode\.com\/problems\/([^)/]+)\/?\)\s*\|\s*\[[^\]]*\]\(([^)]*)\)\s*\|\s*([^|]*?)\s*\|$/;

export function problemUrl(slug: string) {
  return `https://leetcode.com/problems/${slug}/`;
}

/* Percent-encodes each path segment so links survive spaces in a custom subdirectory. */
function encodePath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function renderRow(entry: SolvedEntry) {
  const link = `[${entry.title}](${problemUrl(entry.slug)})`;
  return `| ${entry.number} | ${link} | [Solution](${encodePath(entry.solutionPath)}) | ${
    entry.difficulty
  } |`;
}

/* Problem numbers are numeric in practice, but fall back to string order so an odd id still sorts. */
function compareEntries(a: SolvedEntry, b: SolvedEntry) {
  const left = Number(a.number);
  const right = Number(b.number);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return a.number.localeCompare(b.number);
  }
  return left - right;
}

export function parseEntries(markdown: string | null): SolvedEntry[] {
  if (!markdown) return [];
  const start = markdown.indexOf(README_START_MARKER);
  const end = markdown.indexOf(README_END_MARKER);
  if (start === -1 || end === -1 || end < start) return [];

  const block = markdown.slice(start + README_START_MARKER.length, end);
  return block.split('\n').reduce<SolvedEntry[]>((entries, line) => {
    const match = line.trim().match(ROW_PATTERN);
    if (match) {
      const [, number, title, slug, solutionPath, difficulty] = match;
      entries.push({ number, title, slug, solutionPath: decodeURI(solutionPath), difficulty });
    }
    return entries;
  }, []);
}

export function renderBlock(entries: SolvedEntry[]): string {
  const sorted = [...entries].sort(compareEntries);
  const summary = `**${sorted.length} problem${sorted.length === 1 ? '' : 's'} solved**`;
  return [
    README_START_MARKER,
    '',
    '## Solved Problems',
    '',
    summary,
    '',
    ...TABLE_HEADER,
    ...sorted.map(renderRow),
    '',
    README_END_MARKER,
  ].join('\n');
}

/**
 * Returns `existing` with `entry` added to the LeetSync-managed table, keyed by slug so
 * re-submitting a problem refreshes its row instead of appending a duplicate. Content outside
 * the markers is left untouched; a README without markers keeps its prose and gains the block.
 */
export function upsertReadmeEntry(existing: string | null, entry: SolvedEntry): string {
  const entries = parseEntries(existing).filter((current) => current.slug !== entry.slug);
  entries.push(entry);
  const block = renderBlock(entries);

  if (!existing || !existing.trim()) {
    return `${[...README_SCAFFOLD, block].join('\n')}\n`;
  }

  const start = existing.indexOf(README_START_MARKER);
  const end = existing.indexOf(README_END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    return `${existing.replace(/\s*$/, '')}\n\n${block}\n`;
  }

  const before = existing.slice(0, start);
  const after = existing.slice(end + README_END_MARKER.length);
  return `${before}${block}${after}`;
}
