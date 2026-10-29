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

Hand the library already on your [Aside](https://github.com/ArcBlock/aside) iPhone to the agent you use on your computer. Search, take notes, tag, and file things into collections. What gets written stays in the library that is signed in on the phone.

Aside collects links, photos, files, and notes into items you can open, tag, and group. The phone is the easy place to capture. A keyboard and the agent on your computer are the easy place to look through a lot of items, write something down, or sort a pile by topic. The skill in this repository is that bridge.

## What you can do once connected

In Claude Code, Cursor, Codex, Gemini CLI, or Grok, say “connect my Aside.” The agent finds the iPhone on the same Wi-Fi that has the connect page open, waits until you allow it on the phone, and then uses the **library that is signed in right now**.

**Save something onto the phone.** “Write down what we just discussed” creates a Quick Note. The body can be text. When this phone accepts rich notes, the note can also hold images, links, places, audio, files, and one short video. After writing, the agent reads the note back and checks that the phone and this write agree.

**Save a link, place, or file as its own item.** When this phone lists `createItem`, the agent can save a link, text, photo, file, contact, event, or place as that kind of library item, with an optional note and an existing collection. A Quick Note stays a Quick Note. A phone that does not list `createItem` cannot do this yet.

**Find what you already saved.** “Find the Kyoto trip I saved” or “read that note.” The agent can search, page through results, read the body, and fetch images and attachments as the content itself.

**Organize in place.** “Make a Reading list and put these in it” or “tag this one Travel.” Tags, collections, and membership are written back to the same library. An edit to an existing note carries the version just read, so a newer edit you made on the phone is left as it is.

**Publish a collection.** “Publish this collection” asks visibility, comments, author, and layout, then publishes. This happens only when the phone lists `publishCollection` and `publish.ready` is true. Without an Arc Space login the agent says so and does not ask. The account name is not that check.

**Search and organize that same library from the computer.** After pairing, the library is mounted at `/aside`. Search uses `arc afs search` and the phone's library index: keywords, Chinese text, tags, collections, types, links, and dates. One page holds at most 500 hits. When the JSON has `meta.hasMore`, the same search with `--cursor` reads the next page. Reading, notes, tags, and collections also go through `arc afs`. If [arc](https://arc.afsd.io) is missing, install it first.

Several computers and several agents can be connected at once. The phone shows which tool, which computer, and what it is doing. You can disconnect one session. Changes already saved stay.

Permanent delete needs a second confirmation on the phone. The agent can only ask “confirm deleting these items.” They are removed after you confirm. Cancel, timeout, or disconnect leaves the content where it is.

## How to use it

### 1. Install

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

Copy the whole `skills/aside-agent` directory. Keep `SKILL.md` and `references/` together.

| Agent | Destination |
| --- | --- |
| Claude Code | `~/.claude/skills/aside-agent` |
| Codex | `~/.codex/skills/aside-agent` |
| Cursor | `~/.cursor/skills/aside-agent` or `.cursor/skills/aside-agent` in a project |
| Grok | `~/.grok/skills/aside-agent` |

The computer side runs on macOS. The phone is discovered with the system Bonjour browser. Reading and writing the library uses [arc](https://arc.afsd.io).

</details>

### 2. Open the connection on the iPhone

Open Aside and tap **Connect an Agent** on the home screen (the link icon). The page waits for a computer and tells you to connect from the agent on your computer.

The first time, the system may ask for local network permission. Allow it.

You can leave this page after opening it. Switching apps, locking the phone, or leaving it for a while keeps an allow that was already granted. The listener stops first. Bringing Aside back to the foreground opens it again, without a new pairing. Tapping End connection, or disconnecting one session, cancels that grant. Switching library or account does not.

The phone and the computer stay on the same Wi-Fi.

### 3. Say one sentence on the computer

> connect my Aside

With one phone, the agent connects directly. With several, match the four-character mark at the bottom of the phone page. The page does not show an IP address or port.

The agent sends the tool name, the computer name, and a six-digit pairing code into the chat. Check that same code on the phone and tap Allow. The code is good for about 60 seconds. Before you allow it, the agent cannot read bodies, attachments, tags, or collections.

After that, the phone shows that it is connected, and how many agent sessions are active.

### 4. Ask for the work

- “Find what I saved about publishing this week and read it to me.”
- “Save the paragraph below as a note titled Monday discussion.”
- “Create a collection called To sort and put the items you just read into it.”
- “Tag this note Travel.”
- “Change only the second paragraph of this note and leave the other blocks.”

This allow has no clock expiry. The same grant keeps working until you disconnect that session on the phone. A new computer or a new agent still needs its own allow.

### 5. Finish

Tap End connection on the phone. Notes, tags, and collections already written stay in the library. Locking the phone does not cancel the grant.

## How your content is touched

Allow happens on the phone. Text in the skill does not replace that tap.

Before the agent reads the library, it tells you that the AI tool may send what it read to its own cloud service.

This version uses cleartext TCP on the local network. Until a pairing code or session credential expires, someone on the same Wi-Fi can see it. Open the connect page on a network you trust.

The agent uses items, collections, and tags in the library that is signed in. The account directory, developer interfaces, and other system directories are outside this connection.

When the phone advertises the capability, a Quick Note can hold text, images, links, places, audio, files, and one video. Up to 9 images. One video, no longer than 15 seconds. When the phone accepts text only, the agent writes text only.

## Skills

| Skill | Version | Use it to |
| --- | --- | --- |
| [aside-agent](./skills/aside-agent/SKILL.md) | 0.4.0-beta.3 | Connect an Aside iPhone on the same Wi-Fi and use the current library: Quick Notes, library items when the phone lists createItem, search and read, tags, collections (including trade show, trip, and research templates), membership, and publishing a collection when publish.ready is true. On a phone that lists writeSuggestions, also leave tap-to-send questions for a new Agent conversation. On a phone that lists listWaitingMessages, answer a waiting task from the library, and when that is not enough, from the agent's own understanding and the web. Save the links that were used into the related collection. |

## Maintaining this repository

The iOS app, the connect page, and the engineering protocol live in [ArcBlock/aside](https://github.com/ArcBlock/aside). This repository is how a computer agent connects and reads or writes. Change phone behavior in Aside first, then in this skill.

This repository no longer ships a computer-side client. Library operations are `arc afs` commands.

`skills/aside-agent/references/protocol.md` is the copy an agent reads. The engineering source is `design/aside-agent-mode/PROTOCOL.md` in the Aside repository. The two copies can drift. A connected phone's `capabilities` response is what that phone accepts.

The skill directory follows the [Agent Skills specification](https://agentskills.io/specification). An agent reads the name and description at startup, then loads the full instructions when the task matches.

### Internal beta

This branch is `beta/agent-conversation` at `0.4.0-beta.3`. It is not merged to `main`, and it is not the default install. The badge above reads `main`. `npx skills add ArcBlock/aside-skills` still installs `0.3.6`.

To install this beta:

```bash
npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation
```

It adds `readSuggestions`, `writeSuggestions`, `readSuggestionConsumes`, `listWaitingMessages`, and `acceptWriteback`. A phone that does not list an action rejects it. Do not use this branch as the public install.

## Contributing

Open an [issue](https://github.com/ArcBlock/aside-skills/issues) or a pull request.

## Related

- [Aside](https://github.com/ArcBlock/aside) — the iPhone app, with Connect an Agent on the home screen
- [Agent Skills specification](https://agentskills.io/specification)

## Author

[ArcBlock](https://www.arcblock.io)

GitHub: [@ArcBlock](https://github.com/ArcBlock)

## License

[Apache License 2.0](./LICENSE.md)
