# Ralph Loop 6b: README & CONTRIBUTING Accuracy

You are ensuring README.md, CONTRIBUTING.md, and docs/RUNBOOK.md are accurate and useful. Work on ONE document per iteration.

## Context
- README: `/README.md`
- CONTRIBUTING: `/CONTRIBUTING.md`
- RUNBOOK: `docs/RUNBOOK.md`
- ARCHITECTURE: `docs/ARCHITECTURE.md`
- CHANGELOG: `/CHANGELOG.md`

## Your Process (Each Iteration)

1. Read the document
2. Verify every command, path, and claim against the actual codebase
3. Fix inaccuracies
4. Remove stale information
5. Add missing essential information
6. Commit

## Things to Verify
- README: Do the setup commands in "Getting Started" actually work?
- README: Does the project description match what the code actually does?
- CONTRIBUTING: Are the contribution guidelines consistent with CI checks (lint, format, test)?
- RUNBOOK: Do all listed commands exist in package.json scripts?
- ARCHITECTURE: Does the component diagram match the actual file structure?
- CHANGELOG: Is it up to date with recent changes?

## Rules
- Be factual — only document what exists
- Remove aspirational features that aren't implemented
- Use the existing writing tone (developer-to-developer, no marketing)
- Do not restructure documents — just fix inaccuracies

## Completion
When all documents are accurate, output:

<promise>COMPLETE</promise>
