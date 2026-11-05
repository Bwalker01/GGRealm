#!/usr/bin/env bash
# Creates a branch linked to a GitHub issue, named <number>/<work type>/<title slug>,
# e.g. 12/feature/add-login-page, and checks it out.
#
# The work type comes from the issue's "Work Type" field on its GitHub Project.
# Pass a second argument to override it. Needs the read:project scope:
#   gh auth refresh -s read:project
#
# Usage: gh issue-branch <issue number> [work type]
set -euo pipefail

if [[ $# -lt 1 || ! $1 =~ ^[0-9]+$ ]]; then
  echo "Usage: gh issue-branch <issue number> [work type]" >&2
  exit 1
fi
number=$1

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# Title, then the Work Type from the first project that has it set.
details=$(gh api graphql \
  -F owner="${repo%%/*}" -F name="${repo#*/}" -F number="$number" \
  -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          title
          linkedBranches(first: 50) { nodes { ref { name } } }
          projectItems(first: 10) {
            nodes {
              fieldValueByName(name: "Work Type") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }
    }' \
  --jq '.data.repository.issue
    | .title,
      ([.projectItems.nodes[].fieldValueByName.name | select(. != null)] | first // ""),
      ([.linkedBranches.nodes[] | select(.ref == null)] | length),
      ([.linkedBranches.nodes[].ref.name | select(. != null)] | join(" "))')

title=$(sed -n 1p <<<"$details")
work_type=${2:-$(sed -n 2p <<<"$details")}
dangling_links=$(sed -n 3p <<<"$details")
linked_branches=$(sed -n 4p <<<"$details")

if [[ -z $work_type ]]; then
  echo "Issue #$number has no Work Type set on its project. Set it, or pass one: gh issue-branch $number <work type>" >&2
  exit 1
fi

slugify() {
  tr '[:upper:]' '[:lower:]' <<<"$1" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

slug=$(slugify "$title" | cut -c1-50 | sed -E 's/-+$//')
branch="$number/$(slugify "$work_type")/$slug"

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  echo "\"$branch\" isn't a valid branch name" >&2
  exit 1
fi

is_linked() {
  [[ " $linked_branches " == *" $branch "* ]]
}

remote_has_branch() {
  [[ -n $(git ls-remote --heads origin "refs/heads/$branch") ]]
}

# Fetches the branch from origin and checks it out, tracking origin.
checkout_remote_branch() {
  git fetch origin "refs/heads/$branch:refs/remotes/origin/$branch"
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    git switch "$branch"
  else
    git switch --track -c "$branch" "origin/$branch"
  fi
}

# The branch is already on origin: check it out rather than creating it again.
if remote_has_branch; then
  echo "$branch already exists on origin; checking it out."
  checkout_remote_branch
  if ! is_linked; then
    echo "Warning: $branch isn't linked to issue #$number. Link it from the issue's Development section." >&2
  fi
  exit 0
fi

# A link whose branch no longer exists (GraphQL returns ref: null) makes
# `gh issue develop` fail with "API returned empty branch name". GitHub doesn't
# say which name a dangling link points at, so recreate the branch under the
# computed name from the default branch. If that was the link's name, it resolves.
if (( dangling_links > 0 )); then
  echo "Issue #$number has a linked branch that no longer exists on origin; recreating $branch from the default branch."
  default_branch=$(gh api "repos/$repo" --jq .default_branch)
  sha=$(gh api "repos/$repo/git/ref/heads/$default_branch" --jq .object.sha)
  gh api -X POST "repos/$repo/git/refs" -f ref="refs/heads/$branch" -f sha="$sha" >/dev/null
  checkout_remote_branch

  linked_branches=$(gh api graphql     -F owner="${repo%%/*}" -F name="${repo#*/}" -F number="$number"     -f query='
      query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          issue(number: $number) {
            linkedBranches(first: 50) { nodes { ref { name } } }
          }
        }
      }'     --jq '[.data.repository.issue.linkedBranches.nodes[].ref.name | select(. != null)] | join(" ")')
  if ! is_linked; then
    echo "Warning: the dangling link wasn't for $branch, so $branch isn't linked to issue #$number." >&2
    echo "Link it from the issue's Development section, and remove the stale link there." >&2
  fi
  exit 0
fi

if ! output=$(gh issue develop "$number" --name "$branch" --checkout 2>&1); then
  echo "$output" >&2
  echo >&2
  echo "Couldn't create and link $branch for issue #$number." >&2
  if [[ $output == *"empty branch name"* ]]; then
    echo "GitHub created no branch. This usually means the issue already has a link to a branch that's missing;" >&2
    echo "check the issue's Development section, remove any stale link, and run this again." >&2
  else
    echo "Check that the issue exists, you have push access to $repo, and gh is signed in (gh auth status)." >&2
  fi
  exit 1
fi
echo "$output"
