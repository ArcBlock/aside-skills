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

## init 之后会发生什么

在 Claude Code、Cursor、Codex、Gemini CLI 或 Grok 里安装这一版，然后说「init」。Agent 会打开 https://aside.sh 上的批准页。用这个账号的 owner 登录并批准。Agent 把访问密钥留在这台电脑上，并开始定时扫描。

每一轮查看 `/user/agent/threads`。已经有回复的交代保持原样。最旧的一条未完成交代得到一份回复，写回同一个账号。扫描不会改资料库里的收藏。

电脑需要 Node.js 20 或更新版本。macOS 上批准页会自己打开。其他系统由 Agent 给出页面地址。

## 怎么用

### 1. 安装这一版

```bash
npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation
```

> 基于 [skills](https://github.com/vercel-labs/skills)，支持 Claude Code、Cursor、Codex、Gemini CLI 以及 [其他 Agent](https://github.com/vercel-labs/skills#supported-agents)。

也可以直接告诉 Agent：

> 请从 https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation 安装这个 skill

<details>
<summary><b>通过 Claude Code 插件市场安装</b></summary>

添加这个仓库，再从 beta 分支安装 `aside` 插件。默认的市场命令跟踪 `main`，那一版仍是原来的手机 skill。

</details>

<details>
<summary><b>手动复制</b></summary>

复制整个 `skills/aside-agent`。`SKILL.md`、`references/` 和 `scripts/` 要在一起。

| Agent | 位置 |
| --- | --- |
| Claude Code | `~/.claude/skills/aside-agent` |
| Codex | `~/.codex/skills/aside-agent` |
| Cursor | `~/.cursor/skills/aside-agent` 或项目里的 `.cursor/skills/aside-agent` |
| Grok | `~/.grok/skills/aside-agent` |

</details>

### 2. 说 init

> init

Agent 会给出一个短码和 https://aside.sh 上的地址。用 owner 身份批准。短码大约 5 分钟内有效。批准之后，访问密钥留在这台电脑的 `~/.aside-agent/mcp-token`。Agent 不会打印这把密钥。

### 3. 让扫描继续跑

Agent 只装一个定时任务。每 10 分钟回复最旧的一条未完成交代，语言跟那条交代一致。任务过期或被删掉之后，再说一次 init。不需要第二个任务。

在 Grok 里，定时任务在那个会话开着时运行。标成 durable 的任务会在下次打开会话时补跑一次。大约 7 天后过期。

### 4. 在 Aside 里把事情交出去

在 Aside 提交一条交代。下一轮会读到它。交代指向收藏的条目或集合时，Agent 先读那一份再回答。没有打开过的页面不会被引用。

## 内容会怎么被碰到

批准发生在浏览器里，身份是账号 owner。Skill 里的说明不能代替那一次批准。

这把访问密钥可以通过 Aside 的 MCP 读写该账号。它放在 `~/.aside-agent/` 下权限为 `0600` 的文件里。你使用的 AI 工具可能会把读到的内容发到它自己的云端服务。

这一版不和局域网里的手机配对。

## 现在的 skill

| Skill | 版本 | 你用它来 |
| --- | --- | --- |
| [aside-agent](./skills/aside-agent/SKILL.md) | 0.5.0-beta.1 | 说 init，批准 https://aside.sh，然后每 10 分钟回复最旧的一条未完成交代。 |

## 维护这个仓库

Aside 应用和账号在 [ArcBlock/aside](https://github.com/ArcBlock/aside)。这里维护电脑上的 Agent 怎么授权、怎么回复。Agent 要遵守的目录格式在 `skills/aside-agent/references/protocol.md`。唯一的 HTTP 客户端是 `skills/aside-agent/scripts/aside-cloud.mjs`。

Skill 的目录约定见 [Agent Skills 规范](https://agentskills.io/specification)。Agent 启动时读名称和描述，任务对上了再读全文。

### 内部 beta

这个分支是 `beta/agent-conversation`，版本 `0.5.0-beta.1`。它不会合并进 `main`，也不是默认安装。上面的徽章读的是 `main`。`npx skills add ArcBlock/aside-skills` 安装的仍是 `0.3.6`。

安装这一版：

```bash
npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation
```

不要把这个分支当成对外安装。

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
