# Architecture lifecycle reports

A weekly, report-only Routine audits dependency/runtime/security-stack
drift and diagram staleness across this repo and its sibling
**ControlWeaver-Pro** (the flagship this repo forked from). The persona and
full mandate live in ControlWeaver-Pro's
`.openclaw/agents/engineering/cw-architecture-lifecycle-tracker.md` — this
repo has no `.openclaw/` framework of its own, so there's no local copy.

Findings land in ControlWeaver-Pro's `docs/architecture-lifecycle-log/<YYYY-MM-DD>.md`.

## When opening or reviewing any PR — on this repo or ControlWeaver-Pro

Before finishing the review (or, if you opened the PR, before considering it
done), read the most recent file in ControlWeaver-Pro's
`docs/architecture-lifecycle-log/` (`add_repo` it first if it's not already
attached this session; sort by filename date, take the newest) and check its
findings and "Proposed follow-ups" against the PR's diff:

- If the PR touches a dependency, CI version pin, Dockerfile, or file the
  report flagged, say so in the review or as a PR comment — cite the report
  file and date, and let the PR's author/reviewer decide whether to fold the
  fix in now or track it separately. This is **context, not a new blocking
  gate**: don't fail or hold up a PR over a pre-existing architecture-lifecycle
  finding it didn't introduce.
- If the PR happens to already fix something the report flagged, say that
  explicitly ("closes an open architecture-lifecycle finding from
  <date>") rather than leaving it unremarked.
- If ControlWeaver-Pro's `docs/architecture-lifecycle-log/` is empty,
  missing, or unreachable (no run has happened yet, or the repo isn't
  attached), say so once and move on — a missing report is never a blocker.
