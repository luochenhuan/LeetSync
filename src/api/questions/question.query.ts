export const GET_QUESTION_SUMMARY = `
query questionSummary($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    titleSlug
    difficulty
  }
}
`;
