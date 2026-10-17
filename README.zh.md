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

把 iPhone 上 [Aside](https://github.com/ArcBlock/aside) 里已经收好的内容，交给你电脑上正在用的 Agent。查找、记录、打标签、放进集合，写回去的仍是手机上当前这份资料库。

Aside 用来随手把链接、图片、文件和想法收成一条条可以打开的内容，再归进标签和集合。收的时候手机最顺手。要翻很多条、把一段讨论记下来、按主题归到一起，键盘和电脑上的 Agent 更合适。这个仓库里的 skill 就是这座桥。

## 连上之后可以做什么

在 Claude Code、Cursor、Codex、Gemini CLI 或 Grok 里说「连接我的 Aside」。Agent 找到同一 Wi-Fi 上打开了连接页的 iPhone，等你在手机上点允许，然后使用**当前登录的资料库**。

**把一段话记进手机。** 「把刚才讨论的记下来」会新建一条 Quick Note。正文可以是文字。这台手机若支持富内容，还可以带图片、链接、地点、音频、文件，以及一条短视频。写完会再读一次，手机上看到的和这次写入是同一条。

**把以前收的找出来。** 「找我存过的京都旅行」「读一下那篇笔记」。Agent 可以搜索、翻页、读正文，也可以取回图片和附件本身。

**就地整理。** 「建一个『待读』集合，把这几条放进去」「给这篇加上『旅行』」。标签、集合和成员关系写回同一份库。改已有笔记时带着刚读到的版本，避免盖掉你在手机上刚做的修改。

**在电脑上搜索和整理同一份库。** 配对之后，资料库挂在 `/aside`。查找用 `arc afs search`，走的是手机上那份资料库索引：关键字、中文、标签、集合、类型、链接和日期。一页最多 500 条。JSON 里 `meta.hasMore` 为真时，同一条搜索加上 `--cursor` 读下一页。阅读、笔记、标签和集合也走 `arc afs`。电脑上还没有 [arc](https://arc.afsd.io) 时，先安装它。

几台电脑、几个 Agent 可以同时连着。手机上能看到是哪一个工具、哪一台设备、正在做什么。点某一条可以单独断开。已经保存的改动会留下。

永久删除要在手机上再确认一次。Agent 只会发起「确认删除这几项」。你点确认才会删。取消、超时或断开，内容都还在。

## 怎么用

### 1. 安装

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

复制整个 `skills/aside-agent`。`SKILL.md` 和 `references/` 要在一起。

| Agent | 位置 |
| --- | --- |
| Claude Code | `~/.claude/skills/aside-agent` |
| Codex | `~/.codex/skills/aside-agent` |
| Cursor | `~/.cursor/skills/aside-agent` 或项目里的 `.cursor/skills/aside-agent` |
| Grok | `~/.grok/skills/aside-agent` |

电脑侧在 macOS 上使用。发现手机用系统自带的 Bonjour。读写资料库用 [arc](https://arc.afsd.io)。

</details>

### 2. 在 iPhone 上打开连接

打开 Aside，在首页点「连接 Agent」（链接图标）。页面变成「等待连接」，并写着：在电脑上说「连接我的 Aside」。

第一次打开时，系统可能询问本地网络权限，需要允许。

打开之后可以离开这一页。切到别的 App、锁屏或离开较久，已经允许的授权还会留着。监听会先停，把 Aside 唤醒到前台后会自己重新打开，不用重新配对。点「结束连接」或断开某一条，才会取消那一份授权。切换资料库或账号不会取消授权。

手机和电脑连同一个 Wi-Fi。

### 3. 在电脑上说一句

> 连接我的 Aside

只有一台手机时，Agent 直接连。有多台时，对照手机页面末尾的四位标记来选。页面不显示 IP 和端口。

Agent 会把工具名、电脑名和六位配对码发到对话里。在手机上核对同一组码，点允许。码大约 60 秒内有效。允许之前，它读不到正文、附件、标签和集合。

连上后，手机显示「已连接」，以及当前有几个 Agent 会话。

### 4. 接着说你要做的事

- 「找我这周存的关于发布的内容，读给我」
- 「把下面这段记成一条笔记，标题写『周一讨论』」
- 「建一个集合叫『待整理』，把刚读到的那几条放进去」
- 「给这篇笔记加上标签『旅行』」
- 「这篇笔记只改第二段，其他块留着」

这次允许没有时钟过期。你在手机上断开这一条之前，同一份授权还能用。新的电脑或新的 Agent 仍要再点一次允许。

### 5. 结束

在手机上点「结束连接」。已经写入的笔记、标签和集合留在资料库里。锁屏不会取消这次授权。

## 内容会怎么被碰到

允许发生在手机上。Skill 里的说明不能代替那一次点击。

开始读资料库之前，Agent 会告诉你：你使用的 AI 工具可能会将读取的内容发送到它的云端服务。

这一版走局域网明文 TCP。配对码和会话凭证在失效之前，同一个 Wi-Fi 上的观察者有可能看见。只在你信任的网络上打开连接页。

Agent 使用的是当前登录资料库里的条目、集合和标签。账号目录、开发接口和其他系统目录不在这次连接里。

Quick Note 在手机公布了相应能力时，可以包含文字、图片、链接、地点、音频、文件和一条视频。图片最多 9 张，视频最多 1 条、时长不超过 15 秒。手机只接受纯文字时，Agent 只写文字。

## 现在的 skill

| Skill | 你用它来 |
| --- | --- |
| [aside-agent](./skills/aside-agent/SKILL.md) | 连接同一 Wi-Fi 上的 Aside iPhone，读写当前资料库：记 Quick Note，搜索和阅读，维护标签、集合和成员关系。 |

## 维护这个仓库

iOS 应用、内容终端和工程协议在 [ArcBlock/aside](https://github.com/ArcBlock/aside)。这里只维护电脑上的 Agent 怎么连、怎么读写。手机行为先改 Aside，再改这里的 skill。

这个仓库不再带电脑端客户端。库操作是 `arc afs`。

`skills/aside-agent/references/protocol.md` 是给 Agent 读的协议副本。工程原文是 Aside 仓库里的 `design/aside-agent-mode/PROTOCOL.md`。两边可以不一致。某台手机接受什么，以它连接后返回的 `capabilities` 为准。

Skill 的目录约定见 [Agent Skills 规范](https://agentskills.io/specification)。Agent 启动时读名称和描述，任务对上了再读全文。

## 参与贡献

欢迎提交 [Issue](https://github.com/ArcBlock/aside-skills/issues) 或 Pull Request。

## 相关项目

- [Aside](https://github.com/ArcBlock/aside) — iPhone 上的个人内容应用，首页有「连接 Agent」
- [Agent Skills 规范](https://agentskills.io/specification)

## 作者

[ArcBlock](https://www.arcblock.io)

GitHub: [@ArcBlock](https://github.com/ArcBlock)

## 许可证

[Apache License 2.0](./LICENSE.md)
