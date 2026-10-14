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
  <a href="./README.md">English</a> | 中文
</p>

[Aside](https://github.com/ArcBlock/aside) 的 Agent Skills。这个仓库负责维护和安装。iOS 应用、内容终端和工程协议仍在 Aside 应用仓库里。

## 什么是 Agent Skill？

[Agent Skill](https://agentskills.io/specification) 是一个带 `SKILL.md` 的目录。Agent 启动时只读名称和描述，任务对上了再读全文。脚本和参考文档留在磁盘上，用到才打开。

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

`SKILL.md` 里的 `name` 与目录名一致。`description` 写清这个 skill 做什么、什么时候用。

## Skills

| Skill | 说明 |
| --- | --- |
| [aside-agent](./skills/aside-agent/SKILL.md) | 让电脑上的 Agent 连接同一局域网里的 Aside 手机，把当前资料库挂到 `/aside`，然后整理内容。用户要写笔记时，创建的是 Quick Note。 |

## 安装

```bash
npx skills add ArcBlock/aside-skills
```

> 基于 [skills](https://github.com/vercel-labs/skills)，支持 Claude Code、Cursor、Codex、Gemini CLI 以及 [其他 Agent](https://github.com/vercel-labs/skills#supported-agents)。

也可以直接告诉 Agent：

> 请从 github.com/ArcBlock/aside-skills 安装 Skills

<details>
<summary><b>通过 Claude Code 插件市场安装</b></summary>

```text
/plugin marketplace add ArcBlock/aside-skills
/plugin install aside@aside-skills
```

</details>

<details>
<summary><b>手动复制</b></summary>

复制 `skills/aside-agent`，`SKILL.md`、`scripts/` 和 `references/` 要一起走。

| Agent | 位置 |
| --- | --- |
| Claude Code | `~/.claude/skills/aside-agent` |
| Codex | `~/.codex/skills/aside-agent` |
| Cursor | `~/.cursor/skills/aside-agent` 或 `.cursor/skills/aside-agent` |
| Grok | `~/.grok/skills/aside-agent` |

</details>

## 使用 aside-agent

在手机上打开 Aside 的内容终端，然后让 Agent 连接，或者写一条笔记。

Agent 浏览 Bonjour `_aside-agent._tcp`。只有一台手机时直接连接。有多台时，对照手机上的四位标记来选。手机和电脑在同一个局域网。这一版是明文 TCP。在手机上允许这台电脑，才是授权。

配对之后，当前资料库挂在 `/aside`。电脑上没有 `arc` 时，客户端会给出安装命令，装好后再挂。浏览和读取用 `arc afs`。笔记、集合和标签走这个 skill 的客户端。

Quick Note 可以写文字。连接上的手机如果列出了 `note.blocks`，还可以放入图片、链接、地点、音频、文件，以及一条视频。手机没有公布 `note` 时，只能写纯文字。具体步骤在 skill 里。

Agent 开始读资料库之前，会先说明：读到的内容可能会发到它自己的模型服务。

## 开发

客户端不需要 npm install。在本仓库用 Node.js 22 运行：

```bash
node --test skills/aside-agent/scripts/client.test.mjs
```

这一份测试检查客户端和 skill 文本，不编译 iOS 应用。对着真实前台监听的套件留在 [ArcBlock/aside](https://github.com/ArcBlock/aside) 的 `design/aside-agent-mode/skill/`。

`skills/aside-agent/references/protocol.md` 是给 Agent 读的协议副本。工程原文是 Aside 应用仓库里的 `design/aside-agent-mode/PROTOCOL.md`。两边可以不一致。某台手机接受什么，以它连接后返回的 `capabilities` 为准。

## 参与贡献

欢迎提交 [Issue](https://github.com/ArcBlock/aside-skills/issues) 或 Pull Request。手机行为先改 [ArcBlock/aside](https://github.com/ArcBlock/aside)，再改这里的 skill。

## 相关项目

- [Aside](https://github.com/ArcBlock/aside) — iOS 应用和内容终端
- [Agent Skills 规范](https://agentskills.io/specification)

## 作者

[ArcBlock](https://www.arcblock.io)

GitHub: [@ArcBlock](https://github.com/ArcBlock)

## 许可证

[Apache License 2.0](./LICENSE.md)
