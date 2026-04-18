# Documentation

- README.md is the marketing entry point; keep it skim-able.
- RELEASE_NOTES.md is the source of truth for version state and breaking changes.
- CLAUDE.md is the agent operating manual. Detailed conventions live in `.claude/rules/`.
- Reusable agent playbooks live in `.claude/commands/`.
- Migration headers must explain *why* the migration exists and which release ships it.
- Code comments are reserved for non-obvious logic and security-critical decisions; do not narrate trivial operations.
