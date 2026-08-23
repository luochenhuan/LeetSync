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

/* Solution files are committed as `<number>-<slug><ext>`; notes files reuse the name with `.md`. */
const SOLUTION_FILE_PATTERN = /^(\d+)-(.+)\.([A-Za-z0-9+#]+)$/;

/* Words LeetCode leaves lowercase in a title unless they open it. */
const MINOR_TITLE_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'or',
  'the',
  'to',
  'with',
]);
const ROMAN_NUMERAL_PATTERN = /^[ivx]+$/;

export function problemUrl(slug: string) {
  return `https://leetcode.com/problems/${slug}/`;
}

/**
 * Recovers the problem number and slug from a committed solution file name, or null when the
 * file is not a solution. Notes files share the directory and are excluded by their extension.
 */
export function parseSolutionFileName(fileName: string): { number: string; slug: string } | null {
  const match = fileName.match(SOLUTION_FILE_PATTERN);
  if (!match) return null;

  const [, number, slug, extension] = match;
  if (extension.toLowerCase() === 'md') return null;
  return { number, slug };
}

/* Best-effort display title for a backfilled problem whose metadata could not be fetched. */
export function titleFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word, index) => {
      if (ROMAN_NUMERAL_PATTERN.test(word)) return word.toUpperCase();
      if (index > 0 && MINOR_TITLE_WORDS.has(word)) return word;
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(' ');
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
 * Returns `existing` with `newEntries` merged into the LeetSync-managed table, keyed by slug so
 * re-submitting a problem refreshes its row instead of appending a duplicate. Content outside
 * the markers is left untouched; a README without markers keeps its prose and gains the block.
 */
export function upsertReadmeEntries(existing: string | null, newEntries: SolvedEntry[]): string {
  const merged: SolvedEntry[] = [];
  const indexBySlug = new Map<string, number>();
  //a repeated slug replaces the row already collected rather than adding a second one
  const put = (entry: SolvedEntry) => {
    const index = indexBySlug.get(entry.slug);
    if (index === undefined) {
      indexBySlug.set(entry.slug, merged.length);
      merged.push(entry);
      return;
    }
    merged[index] = entry;
  };

  parseEntries(existing).forEach(put);
  newEntries.forEach(put);
  const block = renderBlock(merged);

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

export function upsertReadmeEntry(existing: string | null, entry: SolvedEntry): string {
  return upsertReadmeEntries(existing, [entry]);
}
