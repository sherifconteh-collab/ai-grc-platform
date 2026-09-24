# Doc review on PRs

There is no GitHub Action for this (a `claude-doc-review.yml` workflow was
tried and removed — it needed a manual GitHub App install +
`ANTHROPIC_API_KEY` secret before it could run at all, and this session
already has everything it needs without that). Instead, doc review happens
live, done directly by whichever Claude Code session is subscribed to /
watching a PR (via `subscribe_pr_activity`), no reminder required.

## When to do a review

This repo has no automated feature-change-detection bot posting a queued
comment like the sibling ControlWeaver-Pro repo does, so the cue here is:
whenever you notice a meaningfully-sized diff on a PR you're watching that
touches something `README.md`, `docs/*.md`, or `RELEASE_NOTES.md`
describes (auth flows, a new UI page, changed API behavior, changed
permission requirements, etc.) — treat that as the cue to do a real review
right then, not to wait for a reminder.

## How to do the review

1. Read the actual code diff for what changed.
2. Check it against whichever top-level docs (`README.md`,
   `PROJECT_STATUS.md`, `docs/*.md`) describe the changed behavior.
3. Fix genuine discrepancies directly (stale numbers, wrong steps, missing
   mention of new required fields, etc.) — don't just report them.
4. Note anything that looks wrong but is out of scope for the current PR
   (e.g. a pre-existing issue unrelated to this diff) rather than silently
   fixing or silently ignoring it.
5. Confirm what's already accurate too — a review that only ever reports
   problems isn't trustworthy; say so explicitly when the docs already
   correctly describe behavior the code now (or finally) matches.

## Where results go

Both of these, every time:
- Commit a review log to `docs/doc-review-log/PR-<number>.md` (create the
  file fresh each time review happens again for the same PR with new
  commits — overwrite, don't append-only, so it reflects current PR
  state).
- Post a PR comment summarizing the findings, linking the log file.

See `docs/doc-review-log/PR-209.md` for a worked example.
