# Project skills

Skills in this folder are loaded by coding agents that work on convenr. They are installed with the `skills` CLI, which records each one in `skills-lock.json` at the repository root. `.claude/skills` holds links to the same folders for Claude Code.

| Skill | Source | License |
|---|---|---|
| `impeccable` | <https://impeccable.style/>, repository `pbakaus/impeccable` | Apache-2.0 |

```sh
nubx skills add pbakaus/impeccable -s impeccable -a claude-code -a codex -y   # install
nubx skills update impeccable -p -y                                           # update
```

Do not edit an installed skill by hand. An update overwrites it.
