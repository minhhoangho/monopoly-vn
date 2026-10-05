# Git rules

- Everything in English: commit messages, branch names, PR titles and descriptions.
- No co-author: never add `Co-Authored-By` trailers or "Generated with Claude Code" lines to commits or PRs.
- Commit messages are short: one subject line, Conventional Commits style, imperative, ≤ 50 chars, no trailing period.
  - `feat: add rent calculation for airports`
  - `fix: block building on mortgaged group`
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Add a body only when the "why" is not obvious; keep it to 1–3 lines.
- One logical change per commit.
- Branch names: `feat/<short-topic>`, `fix/<short-topic>`.
- Commit or push only when the user asks.
