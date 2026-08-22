import titles from './streak_levels_messages.json';

/**
 * Formats a date as a `YYYY-MM-DD` key in the viewer's own timezone.
 *
 * Every date-keyed map here, and every lookup into one, must go through this
 * function. `toISOString()` keys by the UTC day, which rolls over mid-evening
 * for anyone west of UTC, and `toLocaleDateString()` changes shape with the
 * browser locale (`1/15/2024` on en-US, `2024-01-15` on en-CA).
 */
export const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getTotalNumberOfStreaks = (streak: { [date: string]: number }) => {
  const streakDates = Object.keys(streak)
    .filter((date) => streak[date] > 0)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (streakDates.length === 0) return 0;

  let streaks = 1;
  for (let i = 1; i < streakDates.length; i++) {
    const prev = new Date(streakDates[i - 1]);
    const curr = new Date(streakDates[i]);
    const diff = Math.round((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) {
      streaks++;
    } else {
      break;
    }
  }
  return streaks;
};

export const formatProblemsPerDay = (
  problemsSolved: { timestamp: number }[],
): { [date: string]: number } => {
  const problemsPerDay: { [date: string]: number } = {};
  problemsSolved.forEach((problem) => {
    const dateStr = toDateKey(new Date(problem.timestamp));
    problemsPerDay[dateStr] = (problemsPerDay[dateStr] || 0) + 1;
  });
  return problemsPerDay;
};

export const hasSolvedAProblemToday = (lastSolved: number): boolean => {
  if (!lastSolved || isNaN(lastSolved)) return false;
  return toDateKey(new Date()) === toDateKey(new Date(lastSolved));
};

export function generateTitle(dailyProblemsSolved: number): [string, string] {
  if (dailyProblemsSolved == null || isNaN(dailyProblemsSolved)) dailyProblemsSolved = 0;
  if (dailyProblemsSolved < 0) dailyProblemsSolved = 0;
  const entry = titles.find((t) => t.level === dailyProblemsSolved) || titles[titles.length - 1];
  return [entry.title, entry.message];
}
