import { getClient } from '../../lib/client';
import { GET_QUESTION_SUMMARY } from './question.query';

export type QuestionSummary = {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: string;
};

/**
 * Looks up the number, title and difficulty for a problem slug.
 *
 * Backfilling the README index only recovers the number and slug from a committed
 * file name, so the display title and difficulty have to come from LeetCode. This
 * query is public, so it works even when the session cookie is missing.
 */
export const getQuestionSummary = async (titleSlug: string): Promise<QuestionSummary | null> => {
  try {
    const client = getClient();
    const result = await client.request<{ question: QuestionSummary | null }>(
      GET_QUESTION_SUMMARY,
      { titleSlug },
    );
    return result?.question ?? null;
  } catch (e) {
    console.error(`LeetSync: failed to fetch question summary for "${titleSlug}"`, e);
    return null;
  }
};
