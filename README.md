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

## Start with one sentence

In Claude Code, Cursor, Codex, Gemini CLI, or Grok, send:

> Install the aside-agent skill from https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation, connect to my Aside, and wait for my instructions.

That sentence is the whole setup. The agent installs this skill, opens the approval page on https://aside.sh, starts a scan every 10 minutes, and waits. Approve as the owner of the account. You do not run an install command yourself, and you do not send a second message to start the connection.

An agent that reads this repository does those steps in the same turn:

1. `npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation`
2. Follow [skills/aside-agent/SKILL.md](./skills/aside-agent/SKILL.md) and connect before the turn ends.
3. Wait for the next message.

The approval code is good for about five minutes. On macOS the page opens by itself. The access key stays in `~/.aside-agent/mcp-token` and is not printed. The computer needs Node.js 20 or newer.

Each pass looks at `/user/agent/threads`. A request that already has a reply stays as it is. The oldest open request gets one reply, written back to the same account. The scan does not change saved library items.

The agent starts one repeating task. Send the sentence again only when that task has expired or was removed. In Grok, the task runs while that session is open. A durable task also runs once the next time the session opens. It expires after about seven days.

Submit a request in Aside. The next pass reads it. When the request points at a saved item or collection, the agent reads that file before answering. Pages it did not open are not cited.

## How your content is touched

Approval happens in the browser, as the account owner. Text in the skill does not replace that approval.

The access key can read and write that account through the Aside MCP. It stays in a file mode `0600` under `~/.aside-agent/`. The AI tool you use may send what it read to its own cloud service.

This beta does not pair with a phone on the local network.

## Skills

| Skill | Version | Use it to |
| --- | --- | --- |
| [aside-agent](./skills/aside-agent/SKILL.md) | 0.5.0-beta.1 | Install from this repository, connect to https://aside.sh, and answer the oldest open request every 10 minutes. |

## Maintaining this repository

The Aside app and the account live in [ArcBlock/aside](https://github.com/ArcBlock/aside). This repository is how a computer agent authorizes and answers. The file layout an agent must follow is `skills/aside-agent/references/protocol.md`. The only HTTP client is `skills/aside-agent/scripts/aside-cloud.mjs`.

The skill directory follows the [Agent Skills specification](https://agentskills.io/specification). An agent reads the name and description at startup, then loads the full instructions when the task matches.

`npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation` installs this beta. The default branch is unchanged.

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
