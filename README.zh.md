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

把你在 [Aside](https://aside.sh) 交给 Agent 的事，交给电脑上正在用的 Agent。批准一次之后，它每 10 分钟查看这个账号，并回复最旧的一条未完成交代。

## 一句话开始

在 Claude Code、Cursor、Codex、Gemini CLI 或 Grok 里发：

> Install the aside-agent skill from https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation, connect to my Aside, and wait for my instructions.

这一句就是全部安装。Agent 会装上这个 skill，打开 https://aside.sh 的批准页，开始每 10 分钟一次的扫描，然后等待。用这个账号的 owner 批准。不需要自己执行安装命令，也不需要再发一句来启动连接。

读到这个仓库的 Agent，在同一轮里做完：

1. `npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation`
2. 按 [skills/aside-agent/SKILL.md](./skills/aside-agent/SKILL.md) 完成连接，再结束这一轮。
3. 等用户的下一句。

短码大约 5 分钟内有效。macOS 上批准页会自己打开。访问密钥留在 `~/.aside-agent/mcp-token`，不会被打印。电脑需要 Node.js 20 或更新版本。

每一轮查看 `/user/agent/threads`。已经有回复的交代保持原样。最旧的一条未完成交代得到一份回复，写回同一个账号。扫描不会改资料库里的收藏。

Agent 只装一个定时任务。任务过期或被删掉之后，再发一次上面那句。在 Grok 里，定时任务在那个会话开着时运行。标成 durable 的任务会在下次打开会话时补跑一次。大约 7 天后过期。

在 Aside 提交一条交代。下一轮会读到它。交代指向收藏的条目或集合时，Agent 先读那一份再回答。没有打开过的页面不会被引用。

## 内容会怎么被碰到

批准发生在浏览器里，身份是账号 owner。Skill 里的说明不能代替那一次批准。

这把访问密钥可以通过 Aside 的 MCP 读写该账号。它放在 `~/.aside-agent/` 下权限为 `0600` 的文件里。你使用的 AI 工具可能会把读到的内容发到它自己的云端服务。

这一版不和局域网里的手机配对。

## 现在的 skill

| Skill | 版本 | 你用它来 |
| --- | --- | --- |
| [aside-agent](./skills/aside-agent/SKILL.md) | 0.5.0-beta.1 | 从本仓库安装，连接 https://aside.sh，然后每 10 分钟回复最旧的一条未完成交代。 |

## 维护这个仓库

Aside 应用和账号在 [ArcBlock/aside](https://github.com/ArcBlock/aside)。这里维护电脑上的 Agent 怎么授权、怎么回复。Agent 要遵守的目录格式在 `skills/aside-agent/references/protocol.md`。唯一的 HTTP 客户端是 `skills/aside-agent/scripts/aside-cloud.mjs`。

Skill 的目录约定见 [Agent Skills 规范](https://agentskills.io/specification)。Agent 启动时读名称和描述，任务对上了再读全文。

`npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation` 安装这个 beta。默认分支保持原样。

## 参与贡献

欢迎提交 [Issue](https://github.com/ArcBlock/aside-skills/issues) 或 Pull Request。

## 相关项目

- [Aside](https://aside.sh) — 这个 skill 授权的账号
- [Agent Skills 规范](https://agentskills.io/specification)

## 作者

[ArcBlock](https://www.arcblock.io)

GitHub: [@ArcBlock](https://github.com/ArcBlock)

## 许可证

[Apache License 2.0](./LICENSE.md)
