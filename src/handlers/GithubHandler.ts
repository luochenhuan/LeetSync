import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI } from '../constants';
import { QuestionDifficulty } from '../types/Question';
import { Submission } from '../types/Submission';
import { SolvedEntry, upsertReadmeEntry } from '../utils/readme.helper';

const languagesToExtensions: Record<string, string> = {
  Python: '.py',
  Python3: '.py',
  'C++': '.cpp',
  C: '.c',
  Java: '.java',
  'C#': '.cs',
  JavaScript: '.js',
  Javascript: '.js',
  Ruby: '.rb',
  Swift: '.swift',
  Go: '.go',
  Kotlin: '.kt',
  Scala: '.scala',
  Rust: '.rs',
  PHP: '.php',
  TypeScript: '.ts',
  MySQL: '.sql',
  'MS SQL Server': '.sql',
  Oracle: '.sql',
  PostgreSQL: '.sql',
  'C++14': '.cpp',
  'C++17': '.cpp',
  'C++11': '.cpp',
  'C++98': '.cpp',
  'C++03': '.cpp',
  'C++20': '.cpp',
  'C++1z': '.cpp',
  'C++1y': '.cpp',
  'C++1x': '.cpp',
  'C++1a': '.cpp',
  CPP: '.cpp',
  Dart: '.dart',
  Elixir: '.ex',
};
const languagesToCommentStyles: Record<string, { start: string; middle: string; end: string }> = {
  '.py': { start: '"""', middle: '', end: '"""' },
  '.sql': { start: '--', middle: '--', end: '--' },
  '.rb': { start: '=begin', middle: '', end: '=end' },
  '.ex': { start: '#', middle: '#', end: '#' },
};
const defaultCommentStyle = { start: '/*', middle: '', end: '*/' };

const pythonTemplateImports = [
  'import unittest, sys, math, heapq',
  'from collections import defaultdict',
  'from typing import List, Optional',
].join('\n');

const pythonTemplateFooter = [
  '# sol = Solution()',
  '',
  '# class TestCase(unittest.TestCase):',
  '#     def setUp(self):',
  '#         self.solution = Solution()',
  '',
  '#     def tearDown(self):',
  '#         pass',
  '',
  '#     def test_solution(self):',
  '#         actual = self.solution.Func()',
  '#         expected = None',
  '#         self.assertEqual(actual, expected)',
  '',
  "# if __name__ == '__main__':",
  '#     unittest.main()',
].join('\n');

interface GithubUser {
  id: number;
  avatar_url?: string | null;
  url: string;
  login: string;
  /* other user data can be added here, but not needed for now */
}
export default class GithubHandler {
  base_url: string = 'https://api.github.com';
  private client_secret: string | null = GITHUB_CLIENT_SECRET ?? '';
  private client_id: string | null = GITHUB_CLIENT_ID ?? '';
  private redirect_uri: string | null = GITHUB_REDIRECT_URI ?? '';
  private accessToken: string;
  private username: string;
  private repo: string;
  private github_leetsync_subdirectory: string;

  constructor() {
    //inject QuestionHandler dependency
    //fetch github_access_token, github_username, github_leetsync_repo from storage
    //if any of them is not present, throw an error
    this.accessToken = '';
    this.username = '';
    this.repo = '';
    this.github_leetsync_subdirectory = '';

    chrome.storage.sync.get(
      [
        'github_leetsync_token',
        'github_username',
        'github_leetsync_repo',
        'github_leetsync_subdirectory',
      ],
      (result) => {
        if (
          !result.github_leetsync_token ||
          !result.github_username ||
          !result.github_leetsync_repo
        ) {
          console.log('❌ GithubHandler: Missing Github Credentials');
        }
        this.accessToken = result['github_leetsync_token'];
        this.username = result['github_username'];
        this.repo = result['github_leetsync_repo'];
        this.github_leetsync_subdirectory = result['github_leetsync_subdirectory'];
      },
    );
  }
  async loadTokenFromStorage(): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(['github_leetsync_token'], (result) => {
        const token = result['github_leetsync_token'];
        if (!token) {
          console.log('No access token found.');
          chrome.storage.sync.clear();
          resolve('');
        }
        resolve(token);
      });
    });
  }
  async authorize(code: string): Promise<string | null> {
    const access_token = await this.fetchAccessToken(code);
    const user = await this.fetchGithubUser(access_token);
    if (!access_token || !user) return null;
    this.accessToken = access_token;
    this.username = user.login;
    return access_token;
  }
  async fetchGithubUser(token: string): Promise<GithubUser | null> {
    //validate the token
    const response = await fetch(`${this.base_url}/user`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `token ${token}`,
      },
    }).then((response) => response.json());

    if (!response || response.message === 'Bad credentials') {
      console.error('No access token found.');
      chrome.storage.sync.clear();
      return null;
    }

    //set access token in chrome storage
    chrome.storage.sync.set({
      github_leetsync_token: token,
      github_username: response.login,
    });
    return response;
  }
  async fetchAccessToken(code: string) {
    const token = await this.loadTokenFromStorage();

    if (token) return token;

    const tokenUrl = 'https://github.com/login/oauth/access_token';
    const body = {
      code,
      client_id: this.client_id,
      redirect_uri: this.redirect_uri,
      client_secret: this.client_secret,
    };
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    }).then((response) => response.json());

    if (!response || response.message === 'Bad credentials') {
      console.log('No access token found.');
      chrome.storage.sync.clear();
      return;
    }

    chrome.storage.sync.set({ github_leetsync_token: response.access_token }, () => {
      console.log('Saved github access token.');
    });
    return response.access_token;
  }
  async checkIfRepoExists(repo_name: string): Promise<boolean> {
    const trimmedRepoName = repo_name.replace('.git', '').trim();
    if (!trimmedRepoName) return false;
    //check if repo exists in github user's account
    const result = await fetch(`${this.base_url}/repos/${trimmedRepoName}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `token ${await this.loadTokenFromStorage()}`,
      },
    })
      .then((x) => x.json())
      .catch((e) => console.error(e));
    if (result.message === 'Not Found' || result.message === 'Bad credentials') {
      return false;
    }
    return true;
  }
  public getProblemExtension(lang: string) {
    return languagesToExtensions[lang];
  }

  /* Submissions Methods */
  //joins the segments so a root-level file does not end up with a doubled slash
  private contentsUrl(fullPath: string) {
    const cleanedPath = fullPath.split('/').filter(Boolean).join('/');
    return `${this.base_url}/repos/${this.username}/${this.repo}/contents/${cleanedPath}`;
  }
  //returns the sha and decoded content of a file, or null when it does not exist yet
  async getFile(fullPath: string): Promise<{ sha: string; content: string } | null> {
    const existingFile = await fetch(this.contentsUrl(fullPath), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    })
      .then((x) => x.json())
      .catch((err) => {
        console.log(err);
        return null;
      });

    if (!existingFile || !existingFile.sha) {
      return null;
    }
    //github returns base64 split across lines, and this mirrors the encoding used when uploading
    const content = existingFile.content
      ? decodeURIComponent(escape(atob(existingFile.content.replace(/\n/g, ''))))
      : '';
    return { sha: existingFile.sha, content };
  }
  async fileExists(path: string, fileName: string): Promise<string | null> {
    const existingFile = await this.getFile(`${path}/${fileName}`);
    return existingFile?.sha ?? null;
  }
  private async putFile(
    fullPath: string,
    content: string,
    commitMessage: string,
    sha: string | null,
  ) {
    const data = {
      message: commitMessage,
      content: btoa(unescape(encodeURIComponent(content))),
      sha, //if the file already exists, we need to pass the sha of the file otherwise it will be null
    };

    await fetch(this.contentsUrl(fullPath), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
      .then((x) => x.json())
      .catch((err) => console.log(err));
  }
  async upload(path: string, fileName: string, content: string, commitMessage: string) {
    const fullPath = `${path}/${fileName}`;
    const existingFile = await this.getFile(fullPath);
    //create a new file with the content
    await this.putFile(fullPath, content, commitMessage, existingFile?.sha ?? null);
  }
  getDifficultyColor(difficulty: QuestionDifficulty) {
    switch (difficulty) {
      case 'Easy':
        return 'brightgreen';
      case 'Medium':
        return 'orange';
      case 'Hard':
        return 'red';
    }
  }
  createDifficultyBadge(difficulty: QuestionDifficulty) {
    return `<img src='https://img.shields.io/badge/Difficulty-${difficulty}-${this.getDifficultyColor(
      difficulty,
    )}' alt='Difficulty: ${difficulty}' />`;
  }
  async createNotesFile(
    path: string,
    fileName: string,
    notes: string,
    message: string,
    questionTitle: string,
  ) {
    //check if that file already exists
    //if it does, Update the file with the new content
    //if it doesn't, create a new file with the content
    const mdContent = `<h2>${questionTitle} Notes</h2><hr>${notes}`;

    await this.upload(path, fileName, mdContent, message);
  }
  formatDate(timestamp: number) {
    const date = new Date(timestamp * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  }
  createFileHeader(problemSlug: string, lang: string, timestamp: number) {
    const style = languagesToCommentStyles[lang] ?? defaultCommentStyle;
    const prefix = style.middle ? `${style.middle} ` : '';
    return [
      style.start,
      `${prefix}Source : https://leetcode.com/problems/${problemSlug}`,
      `${prefix}Author : ${this.username}`,
      `${prefix}Date   : ${this.formatDate(timestamp)}`,
      style.end,
    ].join('\n');
  }
  applyTemplate(code: string, problemSlug: string, lang: string, timestamp: number) {
    const header = this.createFileHeader(problemSlug, lang, timestamp);
    if (lang === '.py') {
      return `${header}\n${pythonTemplateImports}\n\n${code}\n\n${pythonTemplateFooter}\n`;
    }
    return `${header}\n\n${code}\n`;
  }
  buildSolutionCommitMessage(problemNumber: string, title: string) {
    return `${problemNumber}. ${title} - LeetSync`;
  }
  async createSolutionFile(
    path: string,
    fileName: string,
    content: string,
    problemNumber: string,
    title: string,
  ) {
    //check if that file already exists
    //if it does, Update the file with the new content
    //if it doesn't, create a new file with the content
    await this.upload(
      path,
      fileName,
      content,
      this.buildSolutionCommitMessage(problemNumber, title),
    );
  }
  /* Adds the problem to the solved table in the repo root README, leaving the rest of it alone. */
  async updateReadme(entry: SolvedEntry) {
    const existingFile = await this.getFile('README.md');
    const updatedContent = upsertReadmeEntry(existingFile?.content ?? null, entry);

    //re-syncing an unchanged problem would otherwise push an empty commit
    if (existingFile?.content === updatedContent) return;

    await this.putFile(
      'README.md',
      updatedContent,
      `Add ${entry.number}. ${entry.title} to solved list - LeetSync`,
      existingFile?.sha ?? null,
    );
  }

  async submit(
    submission: Submission, //todo: define the submission type
  ): Promise<boolean> {
    if (!this.accessToken || !this.username || !this.repo) return false;
    const { code, lang, statusCode, question, notes } = submission;

    if (statusCode !== 10) {
      //failed submission
      console.log('❌ Failed Attempt');
      return false;
    }
    const { title, titleSlug, difficulty, questionId } = question;

    //solutions live in a flat directory (defaults to `leetcode/`), named `<number>-<slug><ext>`
    const basePath = this.github_leetsync_subdirectory || 'leetcode';
    const problemNumber = question.questionFrontendId ?? question.questionId ?? 'unknown';

    const langExtension = this.getProblemExtension(lang.verboseName);

    if (!langExtension) {
      console.log('❌ Language not supported');
      return false;
    }

    const fileName = `${problemNumber}-${titleSlug}${langExtension}`;
    const fileContent = this.applyTemplate(code, titleSlug, langExtension, submission.timestamp);

    if (notes && notes?.length) {
      //notes share the flat directory, so name them per-problem to avoid collisions
      await this.createNotesFile(
        basePath,
        `${problemNumber}-${titleSlug}-notes.md`,
        notes,
        `Added notes file for ${title}`,
        title,
      );
    }

    await this.createSolutionFile(basePath, fileName, fileContent, `${problemNumber}`, title);

    await this.updateReadme({
      number: `${problemNumber}`,
      title,
      slug: titleSlug,
      solutionPath: `${basePath}/${fileName}`,
      difficulty,
    });

    const todayTimestamp = Date.now();

    chrome.storage.sync.set({
      lastSolved: { slug: titleSlug, timestamp: todayTimestamp },
    });

    //update the problems solved
    const { problemsSolved } = (await chrome.storage.sync.get('problemsSolved')) ?? {
      problemsSolved: [],
    }; //{slug: {...info}}

    chrome.storage.sync.set({
      problemsSolved: {
        ...problemsSolved,
        [titleSlug]: {
          question: {
            difficulty,
            questionId,
          },
          timestamp: todayTimestamp,
        },
      },
    });
    //create a new solution file with the code inside the folder
    return true;
  }
}
