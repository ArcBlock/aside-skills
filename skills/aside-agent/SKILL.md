---
name: aside-agent
description: 用户说 “Install the aside-agent skill from https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation, connect to my Aside, and wait for my instructions.” 或 “connect to my Aside” 时，在同一轮安装这个 skill、完成 https://aside.sh 的 MCP 授权，并装好每 10 分钟扫描 /user/agent/threads 的定时任务，然后等待。init 也走这一轮。回复只走 scripts/aside-cloud.mjs 的 list 和 write。
license: Apache-2.0
compatibility: Node.js 20 or newer. The account owner approves in a browser. macOS opens that page; other systems print the URL.
metadata:
  author: ArcBlock
  version: "0.5.0-beta.1"
---

# Aside 云端交代

这一版授权 https://aside.sh 的账号，然后每 10 分钟扫描一次云端交代目录。不配对局域网里的手机。

目录、成果正文和未完成的判断在 [references/protocol.md](references/protocol.md)。HTTP 只走本 skill 目录里的 `scripts/aside-cloud.mjs`。不要自己 POST `/mcp`，不要调用 `list_open_requests`、`put_artifact` 或 `apply_effect`。

访问密钥在 `~/.aside-agent/mcp-token`，权限 `0600`。脚本自己读这个文件。不要打印密钥，不要把它放进环境变量、命令行或对话。

## 连接

下面这句在同一轮里做完安装、授权和定时任务，然后等待。不要再请用户发第二句，也不要再请用户说 init。

> Install the aside-agent skill from https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation, connect to my Aside, and wait for my instructions.

「connect to my Aside」和 init 也是这一轮。

本文件旁边已经有 `scripts/aside-cloud.mjs` 时，直接用这个目录。还没有时，先运行一次：

```bash
npx skills add https://github.com/ArcBlock/aside-skills/tree/beta/agent-conversation
```

用它装好的 `skills/aside-agent` 绝对路径继续。名称可用 `--name`，缺省是 `Aside agent`。

脚本和协议都用绝对路径。下面写成 `SCRIPT` 和 `PROTOCOL`。

1. 运行 `node SCRIPT auth`。已经授权时它打印 `AUTH_OK`。
2. 打印 `APPROVE` 时，把 `user_code` 和 `url` 给用户，并说明要用这个 Aside 账号的 owner 批准。批准窗口大约 5 分钟。macOS 上脚本会打开这个页面。然后立刻运行 `node SCRIPT auth --wait`。等待期间不要做别的事。
3. `auth --wait` 打印 `AUTH_OK` 就继续。打印 `AUTH`、`UNCHECKED` 或 `FAIL` 就停，告诉用户这次没有授权完成，不要装定时任务。
4. stderr 出现 `INSTALL_SKIPPED` 时，告诉用户本机安装记录已写下，云端那份没有写上。`AUTH_OK` 仍然继续。

## 定时任务

每一轮只回复最旧的一条未完成交代。间隔 10 分钟。已经有任务在扫 https://aside.sh 的 `/user/agent/threads` 时，不要再开一个。

把下面这段作为定时任务的全部提示。`SCRIPT` 和 `PROTOCOL` 换成绝对路径。

```text
只跑一轮，然后停。不要恢复上一轮扫描，也不要新建定时任务。

先读 PROTOCOL。成果正文按那里的 noteDocument。脚本是 SCRIPT。密钥文件由脚本自己读，不要打印，不要放进环境变量或参数。

运行：node SCRIPT list

- QUEUE_EMPTY：最终消息只有 OK
- AUTH：最终消息只有 AUTH
- UNCHECKED：最终消息只有 UNCHECKED。不要当成空队列，不要写。
- FAIL：最终消息只有 FAIL
- OPEN：只回复打印出的那一条。用交代的语言完成。source 是 item 或 collection 时，先按协议读那一条资料。read 打印 UNCHECKED 时，最终消息只有 UNCHECKED。打开过的页面才能写成链接块。然后按协议写 body 文件，并运行 node SCRIPT write --request <requestId> --title <标题> --summary <摘要> --body-file <文件>
  - HEADER_PRESENT：用交代的语言报告交代原文、artifact id，以及头文件已写入。
  - ALREADY：报告已经回复过，并给出 artifact id。不要再写一条。
  - FAIL：最终消息只有 FAIL
  - AUTH：最终消息只有 AUTH

不要修改资料库收藏，不要调用 apply_effect。
```

在 Grok 里先看已有的定时任务。没有这一轮扫描时，用 `scheduler_create`：`interval` 为 `10m`，`durable` 为 true，`fire_immediately` 为 true。这一轮自己不要再回复交代。Grok 的定时任务在会话开着时运行；`durable` 只保证下次打开会话补跑一次。任务大约 7 天后过期，过期后用户再发一次上面那句连接的话。

其他宿主用它自己的每 10 分钟重复一次的任务，提示词用上面那段。任务会马上跑时，这一轮自己不要再回复。没有这种能力时，告诉用户，并当场跑一轮。

授权和定时任务都就绪后，告诉用户：授权已经完成，每 10 分钟会扫描一次未完成的交代。然后等待，不要再问下一步。
