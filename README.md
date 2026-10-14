# Aside Skills

<p align="center">
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FArcBlock%2Faside-skills%2Fmain%2F.claude-plugin%2Fmarketplace.json&query=%24.metadata.version&label=version&style=for-the-badge&color=blue" alt="Version">
  <img src="https://img.shields.io/badge/Agent_Skill-blueviolet?style=for-the-badge" alt="Agent Skill">
  <a href="https://github.com/ArcBlock/aside-skills/blob/main/LICENSE.md">
    <img src="https://img.shields.io/badge/license-Apache%202.0-green?style=for-the-badge" alt="License">
  </a>
  <a href="https://github.com/ArcBlock/aside-skills/stargazers">
    <img src="https://img.shields.io/github/stars/ArcBlock/aside-skills?style=for-the-badge" alt="GitHub Stars">
  </a>
</p>

<p align="center">
  English | <a href="./README.zh.md">中文</a>
</p>

Agent skills for [Aside](https://github.com/ArcBlock/aside). This repository is where those skills are maintained and installed. The iOS app, the content terminal, and the engineering protocol stay in the Aside app repository.

## What is an Agent Skill?

An [Agent Skill](https://agentskills.io/specification) is a directory with a `SKILL.md` file. An agent reads the name and description at startup, then loads the full instructions when the task matches. Scripts and reference documents stay on disk until the agent needs them.

```
aside-skills/
├── README.md
├── README.zh.md
├── LICENSE.md
├── .claude-plugin/
│   └── marketplace.json
└── skills/
    └── aside-agent/
        ├── SKILL.md
        ├── scripts/
        │   ├── client.mjs
        │   └── client.test.mjs
        └── references/
            └── protocol.md
```

`name` in `SKILL.md` matches the directory name. The description says what the skill does and when to use it.

## Skills

| Skill | Description |
| --- | --- |
| [aside-agent](./skills/aside-agent/SKILL.md) | Connect a computer agent to an Aside phone on the same LAN, mount the current library at `/aside`, and organize it. Asking to write a note creates a Quick Note. |

## Installation

```bash
npx skills add ArcBlock/aside-skills
```

> Powered by [skills](https://github.com/vercel-labs/skills). It works with Claude Code, Cursor, Codex, Gemini CLI, and [other agents](https://github.com/vercel-labs/skills#supported-agents).

Or tell your agent:

> Please install Skills from github.com/ArcBlock/aside-skills

<details>
<summary><b>Claude Code plugin marketplace</b></summary>

```text
/plugin marketplace add ArcBlock/aside-skills
/plugin install aside@aside-skills
```

</details>

<details>
<summary><b>Copy the skill directory</b></summary>

Copy `skills/aside-agent` and keep `SKILL.md`, `scripts/`, and `references/` together.

| Agent | Destination |
| --- | --- |
| Claude Code | `~/.claude/skills/aside-agent` |
| Codex | `~/.codex/skills/aside-agent` |
| Cursor | `~/.cursor/skills/aside-agent` or `.cursor/skills/aside-agent` |
| Grok | `~/.grok/skills/aside-agent` |

</details>

## Using aside-agent

On the phone, open Aside and the content terminal. Ask the agent to connect, or to write a note.

The agent browses Bonjour `_aside-agent._tcp`. One phone is used directly. When several phones appear, match the four-character mark shown on the phone. The phone and the computer stay on the same LAN. This version uses cleartext TCP. Allowing the computer on the phone is what authorizes it.

After pairing, the current library is mounted at `/aside`. If `arc` is missing, the client prints the install command and mounts after `arc` is available. Listing and reading use `arc afs`. Notes, collections, and tags go through the skill client.

A Quick Note can hold text. When the connected phone lists `note.blocks`, it can also hold images, links, places, audio, files, and one video. A phone that does not advertise `note` accepts text only. The procedure is in the skill.

Before the agent reads the library, it tells you that the model service may receive what it read.

## Development

The client has no npm dependencies. From this repository, with Node.js 22:

```bash
node --test skills/aside-agent/scripts/client.test.mjs
```

That suite checks the client and the skill text. It does not build the iOS app. The suite that talks to the real foreground listener stays in [ArcBlock/aside](https://github.com/ArcBlock/aside) at `design/aside-agent-mode/skill/`.

`skills/aside-agent/references/protocol.md` is the copy an agent reads. The engineering source is `design/aside-agent-mode/PROTOCOL.md` in the Aside app repository. The two copies can drift. A connected phone's `capabilities` response is what that phone accepts.

## Contributing

Open an [issue](https://github.com/ArcBlock/aside-skills/issues) or a pull request. Phone behavior changes belong in [ArcBlock/aside](https://github.com/ArcBlock/aside) first, then in this skill.

## Related

- [Aside](https://github.com/ArcBlock/aside) — the iOS app and the content terminal
- [Agent Skills specification](https://agentskills.io/specification)

## Author

[ArcBlock](https://www.arcblock.io)

GitHub: [@ArcBlock](https://github.com/ArcBlock)

## License

[Apache License 2.0](./LICENSE.md)
