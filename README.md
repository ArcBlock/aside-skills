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
  English | <a href="./README.zh.md">Chinese</a>
</p>

Let the agent you already use on your computer answer requests you hand it from [Aside](https://aside.sh). After one approval, it checks the account every 10 minutes and replies to the oldest open request.

## What happens after init

In Claude Code, Cursor, Codex, Gemini CLI, or Grok, install this beta and say “init”. The agent opens an approval page on https://aside.sh. Sign in as the owner of that account and approve the request. The agent stores the access key on this computer and starts a repeating scan.

Each pass looks at `/user/agent/threads`. A request that already has a reply stays as it is. The oldest open request gets one reply. The reply is written back to the same account. The scan does not change saved library items.

The computer needs Node.js 20 or newer. On macOS the approval page opens by itself. On other systems the agent prints the page address.

## How to use it

### 1. Install this beta

```bash
npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation
```

> Powered by [skills](https://github.com/vercel-labs/skills). It works with Claude Code, Cursor, Codex, Gemini CLI, and [other agents](https://github.com/vercel-labs/skills#supported-agents).

Or tell your agent:

> Please install the skill from https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation

<details>
<summary><b>Claude Code plugin marketplace</b></summary>

Add this repository, then install the `aside` plugin from the beta branch. The default marketplace command tracks `main`, which is still the older phone skill.

</details>

<details>
<summary><b>Copy the skill directory</b></summary>

Copy the whole `skills/aside-agent` directory. Keep `SKILL.md`, `references/`, and `scripts/` together.

| Agent | Destination |
| --- | --- |
| Claude Code | `~/.claude/skills/aside-agent` |
| Codex | `~/.codex/skills/aside-agent` |
| Cursor | `~/.cursor/skills/aside-agent` or `.cursor/skills/aside-agent` in a project |
| Grok | `~/.grok/skills/aside-agent` |

</details>

### 2. Say init

> init

The agent shows a short code and an address on https://aside.sh. Approve it as the owner. The code is good for about five minutes. After approval, the access key stays in `~/.aside-agent/mcp-token` on this computer. The agent does not print that key.

### 3. Leave the scan running

The agent starts one repeating task. Every 10 minutes it answers the oldest open request, in the language of that request. Say init again only when that task has expired or was removed. A second task is not required.

In Grok, the repeating task runs while that session is open. A durable task also runs once the next time the session opens. It expires after about seven days.

### 4. Hand the agent something from Aside

Submit a request in Aside. The next pass reads it. When the request points at a saved item or collection, the agent reads that file before answering. Pages it did not open are not cited.

## How your content is touched

Approval happens in the browser, as the account owner. Text in the skill does not replace that approval.

The access key can read and write that account through the Aside MCP. It stays in a file mode `0600` under `~/.aside-agent/`. The AI tool you use may send what it read to its own cloud service.

This beta does not pair with a phone on the local network.

## Skills

| Skill | Version | Use it to |
| --- | --- | --- |
| [aside-agent](./skills/aside-agent/SKILL.md) | 0.5.0-beta.1 | Say init to approve https://aside.sh, then answer the oldest open request every 10 minutes. |

## Maintaining this repository

The Aside app and the account live in [ArcBlock/aside](https://github.com/ArcBlock/aside). This repository is how a computer agent authorizes and answers. The file layout an agent must follow is `skills/aside-agent/references/protocol.md`. The only HTTP client is `skills/aside-agent/scripts/aside-cloud.mjs`.

The skill directory follows the [Agent Skills specification](https://agentskills.io/specification). An agent reads the name and description at startup, then loads the full instructions when the task matches.

### Internal beta

This branch is `beta/agent-conversation` at `0.5.0-beta.1`. It is not merged to `main`, and it is not the default install. The badge above reads `main`. `npx skills add ArcBlock/aside-skills` still installs `0.3.6`.

To install this beta:

```bash
npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation
```

Do not use this branch as the public install.

## Contributing

Open an [issue](https://github.com/ArcBlock/aside-skills/issues) or a pull request.

## Related

- [Aside](https://aside.sh) — the account this skill authorizes
- [Agent Skills specification](https://agentskills.io/specification)

## Author

[ArcBlock](https://www.arcblock.io)

GitHub: [@ArcBlock](https://github.com/ArcBlock)

## License

[Apache License 2.0](./LICENSE.md)
