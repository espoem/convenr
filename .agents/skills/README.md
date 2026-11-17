# Project skills

Skills in this folder are loaded by coding agents that work on convenr. They are installed with the `skills` CLI, which records each one in `skills-lock.json` at the repository root. `.claude/skills` holds links to the same folders for Claude Code. Which skill wins when two disagree is set in [`AGENTS.md`](../../AGENTS.md#agent-skills).

| Skill | Source | License |
|---|---|---|
| `impeccable` | <https://impeccable.style/>, repository `pbakaus/impeccable` | Apache-2.0 |
| `antislop`, `antislop-ui`, `antislop-human`, `antislop-layoutmobile`, `antislop-copywriting`, `antislop-code` | repository `miqdadbadjuber/anti-slop` | MIT |
| `install-anti-slop` | repository `dmmulroy/anti-slop` | MIT |

Both anti-slop repositories have the same name but no skill name in common. The first gives agents rules for interfaces, copy and code comments. The second installs Oxlint rules, which are vendored in `tools/oxlint/anti-slop/`.

```sh
# install
nubx skills add pbakaus/impeccable -s impeccable -a claude-code -a codex -y
nubx skills add miqdadbadjuber/anti-slop -s antislop -s antislop-ui -s antislop-human -s antislop-layoutmobile -s antislop-copywriting -s antislop-code -a claude-code -a codex -y
nubx skills add dmmulroy/anti-slop -s install-anti-slop -a claude-code -a codex -y

# update every project skill
nubx skills update -p -y
```

Do not edit an installed skill by hand. An update overwrites it.
