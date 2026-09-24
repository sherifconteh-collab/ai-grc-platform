# User guides

Task-oriented documentation for people using ControlWeave, as distinct from
the rest of `docs/`, which is mostly architecture and deployment reference.

This directory was created late. The register, remediation and evidence
features described here shipped before there was anywhere to document them —
`RELEASE_NOTES.md` recorded that they existed and `README.md` listed their
tables, but neither tells you how to use them. These guides close that.

## What is here

| Guide | Covers |
|---|---|
| [`RISK_REGISTER.md`](RISK_REGISTER.md) | Identifying, scoring, treating and reviewing risks, and the six things a risk can be linked to |
| [`POAM.md`](POAM.md) | Plan of Action & Milestones: what raises one, the approval workflow, and export |
| [`EVIDENCE.md`](EVIDENCE.md) | Uploading, classifying, versioning and verifying evidence, and linking it to controls and risks |

## What is deliberately not here

The sibling ControlWeaver-Pro repository carries 45 guides. Most describe
features this repository does not have, and copying them across would
produce documentation for screens that do not exist — which is the specific
failure mode the risk-register work spent most of its time undoing. Guides
are added here when the feature exists in *this* repository.

## Conventions

- Navigation paths name what is actually in the sidebar. If a path here does
  not match the running app, the guide is wrong — file it as a bug rather
  than working around it.
- Anything reachable only through the API is labelled **API-only**, not
  described as though it has a screen.
- Table and column names are the real ones, so a reader can follow a claim
  into the schema.
