// Keeps PRs to the repo standard:
//   branch  <issue>/<work type>/<name>     e.g. 3/feature/hosted-auth-integration
//   title   <Work Type>: <issue title> (#<issue>)
//   body    links the issue, filled in as "CLOSES #<issue>" at the end
// When a PR is opened it fills in the title and issue link itself; after that it only checks,
// so manual edits that still fit the standard are kept.
//
// Run by .github/workflows/pr-standards.yml with GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_EVENT_PATH.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const BRANCH = /^(\d+)\/([a-z0-9-]+)\/[a-z0-9-]+$/;
const SKIPPED_BRANCHES = /^(dependabot|renovate)\//;

export async function checkPullRequest({ pr, action, repo, getIssue }) {
  const branch = pr.head.ref;
  if (SKIPPED_BRANCHES.test(branch)) {
    return { skipped: true, problems: [], updates: {} };
  }

  const match = BRANCH.exec(branch);
  if (!match) {
    return {
      problems: [`Branch "${branch}" should be named <issue>/<work type>/<name>, e.g. 3/feature/hosted-auth-integration. Create it with \`gh issue-branch <issue>\`.`],
      updates: {},
    };
  }
  const [, number, type] = match;
  const workType = type.charAt(0).toUpperCase() + type.slice(1);

  const issue = await getIssue(Number(number));
  if (!issue || issue.pull_request) {
    return { problems: [`Branch "${branch}" refers to #${number}, which isn't an issue in this repo.`], updates: {} };
  }

  const expectedTitle = `${workType}: ${issue.title} (#${number})`;
  const titleFits = (title) => new RegExp(`^${workType}: .+ \\(#${number}\\)$`).test(title);
  const linksIssue = (body) => new RegExp(`\\b(close[sd]?|fix(e[sd])?|resolve[sd]?) #${number}\\b`, 'i').test(body);

  let title = pr.title;
  let body = pr.body ?? '';
  const updates = {};

  // Only fill in on open: later edits are the author's, and pushes from forks can't be edited.
  const canFill = (action === 'opened' || action === 'reopened') && pr.head.repo?.full_name === repo;
  if (canFill) {
    if (!titleFits(title)) {
      updates.title = title = expectedTitle;
    }
    if (!linksIssue(body)) {
      // Fill the template's blank "CLOSES #" line, or add one at the end if the template wasn't used.
      const blankLink = /^closes #[ \t]*(\r?)$/im;
      updates.body = body = blankLink.test(body)
        ? body.replace(blankLink, `CLOSES #${number}$1`)
        : `${body.trimEnd()}\n\nCLOSES #${number}`.trimStart();
    }
  }

  const problems = [];
  if (!titleFits(title)) {
    problems.push(`Title should follow "<Work Type>: <title> (#${number})", e.g. "${expectedTitle}".`);
  }
  if (!linksIssue(body)) {
    problems.push(`Description should link the issue with "CLOSES #${number}" at the end.`);
  }
  return { problems, updates };
}

async function main() {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_EVENT_PATH: eventPath } = process.env;
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const pr = event.pull_request;

  const api = async (method, path, body) => {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
      body: body && JSON.stringify(body),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
    return response.json();
  };

  const result = await checkPullRequest({
    pr,
    action: event.action,
    repo,
    getIssue: (number) => api('GET', `/issues/${number}`),
  });

  if (result.skipped) {
    console.log(`Skipping ${pr.head.ref}`);
    return;
  }
  if (Object.keys(result.updates).length > 0) {
    await api('PATCH', `/pulls/${pr.number}`, result.updates);
    console.log(`Filled in ${Object.keys(result.updates).join(' and ')}.`);
  }
  for (const problem of result.problems) {
    console.log(`::error::${problem}`);
  }
  if (result.problems.length > 0) {
    process.exitCode = 1;
  } else {
    console.log('PR follows the standard.');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
