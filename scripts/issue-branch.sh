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
  --jq '.data.repository.issue | .title, ([.projectItems.nodes[].fieldValueByName.name | select(. != null)] | first // "")')

title=$(sed -n 1p <<<"$details")
work_type=${2:-$(sed -n 2p <<<"$details")}

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

gh issue develop "$number" --name "$branch" --checkout
