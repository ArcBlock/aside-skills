---
name: aside-agent
description: 在电脑上连接同一局域网里的 Aside 手机，完成配对，把当前资料库挂到 /aside，再用 arc afs 搜索、阅读和写入。用户说「连接我的 Aside」，或要在手机上写一条笔记时使用。写笔记就是创建 Quick Note。要把链接、文本、图片、照片、文件、联系人、日程或地点存成各自的资料库条目时，只有这次 capabilities 的 actions 含有 createItem 才调用它，不要改用 Quick Note 去凑。用户要发布某个集合时，只有 actions 含有 publishCollection 且 publish.ready 为真，才先问可见性、评论、作者和版式，再调用它。ready 不是真就说明需要登录 Arc Space，不要用账号名字判断，也不要自己编没有动作可提交的问法。先浏览 Bonjour `_aside-agent._tcp`。只有一台时直接连接，多台时请用户选择。条目搜索用 arc afs search，不要另写 HTTP 客户端。不要扫描网段，不要导出 /user、/dev 或 /kv。用户要把一个问题交给手机上新开的 Agent 对话、让他点一下就发出去时，只有这次 capabilities 的 actions 含有 writeSuggestions 才写一批建议。没有这个动作就停，不要用 createNote 去凑，也不要自己往对话记录里写消息。手机的 actions 里有 listWaitingMessages 时，接手等待中的任务。先读资料库。资料库不够把事情做完时，用自己的理解并联网检索。用到的链接用 createItem 存成 link，放进相关集合，并在相关条目上留下笔记。不要停在「收藏里没有」。
license: Apache-2.0
compatibility: macOS, dns-sd, curl, and the arc CLI. The phone and computer share a LAN. Transport is cleartext TCP. No TLS.
metadata:
  author: ArcBlock
  version: "0.4.0-beta.3"
---

# Aside 电脑 Skill

这个 skill 让电脑上的 Agent 按 [references/protocol.md](references/protocol.md) 使用手机前台终端。协议以那份文档为准。不要另做一套登录或内容协议。

资料库操作只走 `arc afs`。没有 `scripts/client.mjs`，也不要再写一个自己 POST `/rpc` 的客户端。配对、领取和探针不是 AFS 方法，它们仍走 `/agent/v1`。挂上之后，`arc` 的 HTTP provider 会把 `list`、`read`、`stat`、`search`、`explain`、`exec` 转发到手机的 `POST /rpc`。

Skill 不是安全边界。手机上的允许才是授权。电脑不能自己允许，也不能自己确认永久删除。

## 支持范围

电脑侧使用 macOS 自带的 `dns-sd` 和 `curl`，以及 [arc](https://arc.afsd.io)。没有 `arc` 时先安装：`curl -fsSL https://arc.afsd.io/install.sh | bash`。

没有交互式 Codex、Claude 或 Muse 会话。Muse 不是已支持的集成。不要把没跑过的工具写成支持。`--tool` 填当前这个 Agent 的真实工具名。

## 工作目录

所有 `arc afs` 命令都在 `~/.aside-agent` 里跑，并带 `--standalone`。`arc afs mount` 只写当前目录的 `.afs-config/config.toml`，不进正在跑的 daemon。在 skill 目录里挂载也一样：命令可以返回已经挂上，正在跑的 daemon 上仍然没有 `/aside`。不带 `--standalone` 的 `arc afs ls` 会打到 daemon，看不到这次挂载。

```bash
mkdir -p ~/.aside-agent
cd ~/.aside-agent
```

凭证文件是 `~/.aside-agent/credential`，权限 `0600`。这台电脑的固定标识是 `~/.aside-agent/device-id`。没有这个文件时建一次，内容是 `mac-` 加一段随机十六进制，之后每次配对都复用。自己再编一个新标识，手机会把这台电脑收成另一条连接。不要把凭证、配对码或 device-id 写进聊天、日志、命令回显或这个 skill。

## 首次连接

1. 请用户在手机上打开 Aside 的内容终端页。打开后可以离开这一页。切到别的应用、锁屏，或离开较久，授权都会保留，直到用户自己断开这一条。监听在锁屏或离开较久时会先停，回到前台如果还有授权会自己重新打开，不需要再进这一页，也不需要新的配对码。点「结束连接」或「结束全部连接」，以及确认断开某一条，会立刻取消那一份授权。切换资料库或账号不会取消授权。资料库还没换成现在这个账号时，内容读写会以 `library-changing` 失败，凭证还在，用同一份再试，不要重新配对。挂上之后，读写落在现在打开的库。第一次打开时，系统可能询问本地网络权限，需要允许。
2. 手机和电脑在同一个局域网。这一版是明文 TCP，没有 TLS。发现用 Bonjour `_aside-agent._tcp`。同网不等于信任。配对码和凭证在撤销前，同一局域网上的观察者可以看见。
3. 先浏览。只有一台时，直接用它的主机名和端口，不要停下来问选哪一台。两台或更多时，请用户对照手机上的四位标记来选，不要自己挑第一台，也不要把整段服务名念成标题。不要探测整个网段，不要依次试地址。

```bash
dns-sd -B _aside-agent._tcp local.
dns-sd -L "服务名" _aside-agent._tcp local.
```

`base` 用解析结果里的主机名和端口，形如 `http://HOST:PORT`。端口在重新打开监听后会变，四位标记保持不变。不要复用上一场的端口，用标记认出同一台。用户已经选定一台之后，下一次浏览用主机名对上那一台，沿用原来的凭证。不要把这个地址改成 IPv4 或其他主机。列表是空的，请告诉用户把 Aside 唤醒到前台。授权还在，不需要重新允许。点过结束连接，或已经断开了这一条，才需要重新打开终端页。页面不提供地址。不要扫描网段，也不要向用户要 `host:port`。

4. 先发现，再判断版本。第一次可能连不上，用同一个 `base` 再试一次。不要换地址。

```bash
curl -sS "$BASE/agent/v1/discovery"
```

`protocol` 必须是 `aside-agent`，`version` 必须是 `1`，并且 `requiresPairing` 和 `requiresPhoneAllow` 都为真。否则停止。告诉用户版本不一致，不要改去别的路径或再发明一个协议。

5. 已有凭证时，先对这一次浏览到的 base 做 `probe`。成功就用这份凭证继续，跳到第 7 步，不要再配对。没有凭证，或 probe 得到 `unauthorized`、`revoked`、`denied` 时才配对。

```bash
curl -sS -X POST "$BASE/agent/v1/probe" \
  -H "Authorization: Bearer ${ASIDE_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{}'
```

`ASIDE_TOKEN` 从凭证文件读入，不要 `echo`。`account.name` 是手机当前打开的账号，用这个名字。电脑不能另选账号。这个名字不决定能不能发布集合。

6. 配对。把返回的工具名、设备名和配对码立刻给用户，并马上领取。手机上的配对码大约 60 秒后过期。不要在这个窗口里读源码或做别的事。配对码不是凭证。不要在电脑上调用允许。网上的 `/agent/v1/allow` 会拒绝。

```bash
curl -sS -X POST "$BASE/agent/v1/pair" \
  -H 'content-type: application/json' \
  -d '{"toolName":"当前工具名","deviceName":"这台电脑","deviceId":"DEVICE_ID"}'
```

允许之前领取会得到 `not-allowed`，这不代表码错了。大约每秒重试一次，最多约 50 秒。窗口用完得到 `pairing-expired` 时，重新配对，把新码给用户，不要沿用旧码。

```bash
curl -sS -X POST "$BASE/agent/v1/claim" \
  -H 'content-type: application/json' \
  -d '{"sessionId":"SESSION_ID","pairingCode":"PAIRING_CODE"}'
```

把响应里的 `credential` 写入 `~/.aside-agent/credential` 并 `chmod 600`。不要打印凭证。`claim` 成功体没有 `expiresAt`。凭证没有时钟过期。用户断开这一条、拒绝，或结束全部连接，才会作废。

领取第一次连不上时，用同一个 `base` 再请求一次。领到了就继续。还是连不上就停，请用户把 Aside 唤醒到前台。不要重新配对。

7. 挂到 `/aside`。这是连接成功的条件。在 `~/.aside-agent` 里先卸再挂，避免旧端口和旧凭证留在配置里。URI 只含主机和端口。`allowPrivateNetwork` 必须用 `--set`。只写在查询参数里会被丢掉，局域网地址随后会触发 SSRF。凭证不进 URI。

```bash
cd ~/.aside-agent
arc afs mount remove /aside
arc afs mount add /aside "$BASE" \
  --set allowPrivateNetwork=true \
  --set "token=${ASIDE_TOKEN}" \
  --sensitive-args token
```

然后在同一目录确认挂上了：

```bash
cd ~/.aside-agent && arc afs ls /aside --standalone --json
```

这一步成功，连接就成功了。`/aside` 就是手机上当前登录的资料库，下面是 `items`、`collections`、`tags`。挂载失败时不要改试别的地址，不要扫描网段，也不要另写一个 HTTP 客户端。私网被拒绝时，检查 `--set allowPrivateNetwork=true` 是否真的传给了这次 `mount add`。

8. 写笔记、资料库条目、发布集合，或给手机上新的 Agent 对话留一批可点的问题之前，先看能力。动作必须出现在返回的 `actions` 里。嵌入块的种类必须出现在 `note.blocks` 里。没有 `note` 时只写纯文字。没有 `createItem` 时不要调用它，也不要把链接、地点、文件或联系人改写成 Quick Note。没有 `publishCollection`，或 `publish.ready` 不是真，就不要发布，也不要先问发布配置。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside \
  --args '{"action":"capabilities"}' \
  --standalone --json
```

不要调用 `/.actions/query`。它固定拒绝，文案是 `query is not served on this library`。

## 交给手机上新的 Agent 对话

用户要让手机上新开的 Agent 对话出现几个可点的问题，点一下就把这句话发出去。这不是建笔记，也不是往对话里追加消息。只走同一次 `exec /aside/.actions/aside`。

`actions` 里必须同时有 `readSuggestions`、`writeSuggestions`、`readSuggestionConsumes`。少了 `writeSuggestions` 就停，告诉用户这台手机不是那份内部包。不要改用 `createNote` 或 `createItem` 去凑一条任务，也不要 `arc afs write` `agent/suggestions.json`。正式版手机会把这三个动作拒成 `invalid agent request`。

字段和拒绝原文在 [references/protocol.md](references/protocol.md) 的「建议批次」。下面是要做的事。

1. 读当前批次。`status` 为 `none` 表示还没写过，`empty` 表示写过一份空的，`snapshot` 表示有建议。`none` 和 `empty` 都不是已经交给手机的问题。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside \
  --args '{"action":"readSuggestions"}' \
  --standalone --json
```

2. 读已经点过的记录。替换批次不会擦掉它。不要写 `agent/suggestion-consumes.json`。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside \
  --args '{"action":"readSuggestionConsumes"}' \
  --standalone --json
```

3. 写一份新批次。每次新的变更用新的 `operationId`。同一次重试沿用同一个 id，正文必须完全一样。换了正文是冲突。`status` 为 `none` 时不要带 `expectedRevision`，带了非空值会得到 `revision conflict`。`empty` 和 `snapshot` 都算已有批次：`expectedRevision` 放在 `snapshot` 旁边，值是上次读到的 `snapshot.revision`，`generatedAt` 不能早于已有的那一份。每次成功写入用一个新的 `revision`。

一批最多写 3 条，顺序就是手机上的顺序。再多也会存下来，新对话只显示前 3 条仍然有效的。`schemaVersion` 是 `1`。`generatorId` 用当前工具名。`generatedAt` 和 `expiresAt` 是带时区的 ISO8601，例如 `2026-10-28T12:00:00Z`。`expiresAt` 必须晚于 `generatedAt`，并且晚于用户会打开手机的时刻。写入时不拿「现在」去拒绝，打开页面时已经到期的行会被藏起来。

每条要有不重复的 `id`、从 `1` 起的 `version`、和去掉空白后不重复的 `text`。`text` 就是点下去会发出去的那句话，1 到 80 个字符，不能有 `<` 或 `>`。`locale` 跟手机里的 Aside 语言一致：简体 `zh`（`zh-Hans` 也可以），繁体必须是 `zh-Hant`，日文 `ja`，英文 `en`。语言对不上的行会存下来，然后被藏起，手机改显示三句自带的问题。`refs` 可以是空数组。要引用时，`type` 只能是 `item` 或 `collection`，`id` 用刚才从 `/aside/items` 或 `/aside/collections` 读到的 id。`libraryId` 不写，或写 `aside-library`。不要编 id，也不要用标题去当 id。

同一条 `id` 配同一个 `version` 被点过之后，会一直藏着。要再出现，就把 `version` 加大后再写一份。不要自己去改消耗记录。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "writeSuggestions",
  "operationId": "OP_ID",
  "snapshot": {
    "schemaVersion": 1,
    "revision": "REV",
    "generatedAt": "2026-10-28T12:00:00Z",
    "generatorId": "当前工具名",
    "suggestions": [
      {
        "id": "review-recent",
        "version": 1,
        "text": "帮我看看这周新存的链接",
        "locale": "zh",
        "refs": [{"type": "item", "id": "ITEM_ID"}],
        "expiresAt": "2026-11-04T12:00:00Z"
      }
    ]
  }
}'
```

下一次改这份批次时，在 `snapshot` 同级加上 `"expectedRevision": "上次读到的 revision"`。

4. 再读一次。`status` 为 `snapshot` 才算写上了。然后告诉用户：建议句只出现在还没有对话的新 Agent 对话里。首页连接按钮旁边有 Agent 历史，它只打开历史列表，不显示这些句子。从那一页点加号，或从集合的更多菜单里点「与 Agent 沟通」，或从条目的更多菜单进去。他应该看到刚才这几句，而不是三句自带的问题。点一句，这句话就成为这条新对话里等待处理的用户消息。历史列表里最新的一行在最上面。这次 exec 不会替他点，也不会把消息写进对话。对话页一旦已经有了对话，建议按钮会全部消失。再开一条新的，才会看到还没点过的那些。

资料库里一条条目都没有时，手机不显示这些按钮。写完之后他仍看到三句自带的问题，而读回来是 `snapshot`：对一下语言、是否到期、引用是否还在库里、以及这个 `id` 和 `version` 是否已经点过。用新的 `operationId`，把刚读到的 `snapshot.revision` 放进 `expectedRevision`，再写一份。不要把那三句自带的问题抄进批次里凑数。

建议这三个动作不接手已经发出去的任务。接手走下一节。没有 `listWaitingMessages` 时不要自己编。

## 接手等待中的任务

用户在手机上把一件事交给 Agent 之后，目标是把这件事做完。资料库是上下文，不是答案的边界。消息没有 origin，或收藏里只有标题、分享文案、成品照片，都不是停下来的理由。

`actions` 里要有 `listWaitingMessages` 和 `acceptWriteback`。少了就停，告诉用户这台手机还不能接手。不要往对话记录文件里写消息，也不要调用 `POST /agent/v1/claim`。字段和拒绝原文在 [references/protocol.md](references/protocol.md) 的「等待中的任务」。

1. 列出等待中的消息。这一步不领取。一次 `acceptWriteback` 会接走同一条对话里全部等待中的消息，所以按 `conversationId` 归并，一条对话一次回答。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside \
  --args '{"action":"listWaitingMessages"}' \
  --standalone --json
```

2. 先按用户的原话搜索、打开相关集合、读正文和附件。收藏里已经有的步骤、用料、地址和判断，直接用。

3. 收藏不够把事情做完时，立刻用自己的理解，并联网打开真实页面。事实性的做法、地点、产品、人物，以打开过的页面为准。说清楚哪一段来自收藏，哪一段来自检索或你的理解。不要把检索到的内容写成收藏原文里就有，也不要编一个没打开过的链接。页面打不开时，用你的理解把事情做完，并说明这一页没有打开。

4. 用到的每条 http 或 https 链接先搜 `link:`。库里没有就 `createItem`，`type` 为 `link`，`title` 用页面标题，`notes` 写它和这件事的关系。不写 `contentType`，交给手机按 URL 识别。`collectionId` 用相关集合的 id：消息 origin 是集合时用它；origin 是条目时读这条的 `collectionIds`；没有 origin 时用这次阅读里对上的集合。已经在库里、但不在这个集合里的链接，留到下一步的 `addMembership`，不要再建一条。没有相关集合时仍然保存链接，不要为了归档去新建集合，也不要改集合说明。

5. 对这一条对话调用一次 `acceptWriteback`。`reply` 用用户的语言把事情做完：步骤、分量和判断写在对话里。`writes` 不能空，空的会得到 `writes required`，消息继续等待。用 `appendNote` 把结论写进相关的已有条目，`author` 用 `Agent`，并点出刚存进集合的参考链接。没有旧条目时，写到刚创建的那条链接上。`operationId` 每次新生成。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "acceptWriteback",
  "operationId": "OP_ID",
  "conversationId": "CONVERSATION_ID",
  "reply": "可以照着做的步骤。收藏里只有成品和文案，做法来自刚打开的页面。",
  "writes": [
    {
      "kind": "appendNote",
      "itemID": "ITEM_ID",
      "text": "结论，以及放进这个集合的参考链接。",
      "author": "Agent"
    }
  ]
}'
```

成功是 `ok` 为真、`status` 为 `accepted`、`published` 为真。`nothingWaiting` 表示这条对话已经没有待接收的消息，停。`published` 为假且 `staged` 为真表示写回计划留下了、资料库这次没写上，告诉用户，不要换正文再发。`writeFailed` 停下来说明失败项。不要自己打开一条新对话。

## 搜索

条目搜索用 AFS 树的 `search`。这就是 #2369 接上的那份资料库索引，和手机搜索页是同一个。关键字、中文、标签、集合、类型、链接、日期都在这一条查询字符串里。不要先 `ls` 再在本地做子串，也不要自己 POST `/rpc`。

```bash
cd ~/.aside-agent && arc afs search /aside/items "论文 tag:papers after:2026-01-01" --standalone --json
```

下一页用上一页 JSON 里的 `meta.cursor`。路径和查询保持不变。

```bash
cd ~/.aside-agent && arc afs search /aside/items "论文 tag:papers after:2026-01-01" \
  --cursor "CURSOR" --standalone --json
```

`/aside` 和 `/aside/items` 都会打到这份索引。别的路径不是这份索引。集合和标签用 `arc afs ls`，不要用前缀语言去搜它们。

前缀大小写不敏感。没有前缀的词彼此 AND。空查询或纯空白是空页，不会返回最近条目。要看目录用 `ls`。只有前缀、没有关键字（例如 `tag:papers`、`type:link`）会查索引。默认排除已归档。`arc afs search` 要带 `--json`。不传 `--limit` 时这一页最多 500 条。`--limit` 是正整数；这台手机只用 1 到 500，再大也会被收成 500。`meta.hasMore` 为 true 时才带 `--cursor`，值就是这一页的 `meta.cursor`。没有 `meta`，或 `hasMore` 不是 true，就停，不要自己编 cursor。`arc afs search --help` 里没有 `--cursor` 时，先升级 arc，不要改去自己 POST `/rpc`。响应正好 500 条且没有 `meta` 时，这台手机还没有搜索翻页，不要把这一页当成全部。集合和标签不走这个 cursor。条目搜索只有 `arc afs search`。

| 写法 | 含义 |
| --- | --- |
| `论文 检索` | 关键字 AND。中文不需要自己分词 |
| `tag:papers` | 按当前标签名过滤。多个 `tag:` AND |
| `collection:阅读` | 按当前集合名过滤。多个 `collection:` AND |
| `type:video` | 类型。同一边的多个 `type:` 取并集。条目类型和内容类型都写了时，两条都要满足。不认识的词是空页 |
| `link:example.com` 或 `site:example.com` | 打在 URL / host 上 |
| `after:2026-01-01` `before:2026-02-01` | 按 `createdAt`。`after` 含当天，`before` 不含当天 |
| `status:archived` | 把已归档也包括进来 |

`type:` 里，条目类型是 `link`、`links`、`note`、`notes`、`place`、`places`、`event`、`events`、`calendar`、`images`。内容类型里，首页 tab 是 `articles`（article、recipe）、`videos`、`websites`、`products`、`repos`、`social`、`media`、`text`、`contacts`、`files`。单数 `article`、`recipe`、`video`、`product`、`app`、`repo`、`social`、`photo`、`photos`、`image`、`screenshot`、`music`、`podcast`、`movie`、`book`、`file`、`contact`、`calendarevent` 各指那一个 `content.type`。没有 `content.type` 的条目不会被内容类型选中。

命中是 AFS 条目，带 `id` 和 `path`。没有正文，不保证有标题，也没有 `content.type`。路径在 `/aside/items/` 下。要标题、正文和 `content.type` 就读这个 JSON。`ls` 同样不带 `content.type`。排序是索引顺序：精确 URL，精确标题，标题前缀，然后 bm25，然后 `createdAt` 降序。

## 阅读和写入

每条库命令都从 `~/.aside-agent` 启动，并带 `--standalone --json`。`~/.aside-agent` 不是项目目录的上级，在别的目录跑 `--standalone` 读不到这次挂载。不要 `arc afs write`，也不要 `arc afs delete`。这两条会被拒绝，不会改库。改库只用 `arc afs exec /aside/.actions/aside`。`--args` 是一个 JSON 对象。

读：

```bash
cd ~/.aside-agent && arc afs ls /aside/items --standalone --json
cd ~/.aside-agent && arc afs read /aside/items/ITEM.json --standalone --json
cd ~/.aside-agent && arc afs stat /aside/items/ITEM.json --standalone --json
```

整页 JSON 不要用 Node 的 `spawnSync` 或 `execFileSync` 接进内存。就算 `maxBuffer` 放到 64MB，stdout 也会在 8192 字节处截断。先把输出写到文件，再解析那个文件。

`resourceVersion` 是该 JSON 文件字节的 SHA-256，用 `stat` 的 sha256，或上一次 exec 返回的 `resourceVersion`。它不是文件里的 `updatedAt`。

附件字节用 exec，不要猜一条本地路径：

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside \
  --args '{"action":"readAttachment","id":"ITEM_ID","attachment":"ATTACHMENT_ID"}' \
  --standalone --json
```

写操作每次新的变更用新的 `operationId`。同一次重试必须沿用同一个 id，并且正文完全一样。换了正文会被当成冲突，不会写成第二个对象。写完再读同一条，`resourceVersion` 和 `noteBlocks` 与写入返回一致，才算写成功。

纯文字 Quick Note：

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "createNote",
  "operationId": "OP_ID",
  "title": "标题",
  "text": "正文"
}'
```

有嵌入时以 `blocks` 为准，可以不再传 `text`。链接只给 http 或 https 的 `url`。地点用 `latitude` 和 `longitude`，`kind` 写 `location` 或 `place`。库里已经有的图片、音频、文件、视频不要读出来再传字节。块上写 `sourceItemId` 和 `resourceId`，不写 `contentBase64`。手机把那一条自己的附件复制进新笔记自己的 assets 目录，并分配新的 `resourceId`。笔记不保留 `sourceItemId`。删掉来源条目不会删掉新笔记里的这份文件。`filename` 可以不写。还没进库的新字节才放在 `contentBase64`，并且要有不带路径的 `filename`。可以带 `mimeType`。音频和视频可以带 `duration`。图片最多 9 张，每张不超过 20MB。音频和文件每条不超过 20MB。图片、音频、文件合计不超过 60MB。视频最多 1 条，不超过 200MB，时长不超过 15 秒。不接收天气。`--args` 走命令行，大约 1MB 就放不下。放不下时把同一份 JSON 从 stdin 送进去，不要改去自写 HTTP。手机一次请求最多 32MB。再大就告诉用户这条附件太大。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "createNote",
  "operationId": "OP_ID",
  "title": "标题",
  "blocks": [
    {"kind": "text", "text": "正文"},
    {"kind": "link", "url": "https://example.com/notes", "title": "页面"}
  ]
}'
```

返回的 `noteKind` 是 `quickNote`。`noteBlocks` 不含字节。要字节就用 `readAttachment`，`attachment` 用块上的 `resourceId`。

资料库条目不是 Quick Note。用户要把几家店的链接、一段文字、一张或一组照片、一个文件、一个联系人、一场日程或一个地点各自存成一条时，用 `createItem`。先看这次 `capabilities` 的 `actions`。没有 `createItem` 就停下来说明这台手机还不能建这种条目，不要改用 `createNote`。`type` 只能是 `link`、`text`、`image`、`photos`、`file`、`contact`、`calendarEvent`、`place`。`type` 为 `note` 会被拒绝，笔记仍走 `createNote`。

`link` 要有 http 或 https 的 `url` 和 `title`。详情页上的那句说明写在 `notes`。要让 `type:article` 这类搜索找到它，把已有的内容类型写在 `contentType`，手机会存进 `content.type`。不写时按 URL 识别。`contentType` 必须是手机已有的 ContentType 原值，例如 `article`、`video`、`repo`。`calendarEvent` 保持这个驼峰。不认识的值会被拒绝，并且不创建条目。`place` 要有标题（`title` 或 `name`）以及 `latitude`、`longitude`，`address` 可选。`text` 要有 `text`。`contact` 要有 `title`。已有 vCard 放在 `text`；否则用 `phones`、`emails`、`addresses` 这些字符串数组，再加上可选的 `organization`，手机会拼成已保存的 `Name`、`Tel:`、`Email:`、`Org:`、`Addr:` 行。`calendarEvent` 要有 `title`、`startsAt`、`endsAt`，时间是 ISO8601，结束不早于开始。`timeZone` 缺省为手机当前时区，必须是已知时区标识。`isAllDay` 缺省为假。`location` 可选。`image` 正好一张图，`photos` 一到九张，`file` 正好一个文件。新字节放在 `contentBase64`，并带上不带路径的 `filename`。多张图放在 `attachments` 数组里，每项同样是字节或来源。库里已经有的图片或文件不要读出来再传字节，在对应项上写 `sourceItemId` 和 `resourceId`。手机把来源附件目录里的普通文件复制进新条目自己的 `assets/<slug>/attachments/`，分配新的 `resourceId`，不保存 `sourceItemId`。删掉来源不会删掉这份新文件。大小限制与上面的笔记附件相同。`--args` 放不下时，把同一份 JSON 从 stdin 送进去。可选 `collectionId`，它是已经存在的集合 id，不是集合名字。没有这个集合时先 `createCollection`，再用返回的 id。成员写在这条自己的 `collectionIds` 上。

写完再读同一条。`type` 与请求一致，不出现 `noteKind`。`notes` 就是详情里的 Note。`resourceVersion` 是条目 JSON 字节的 SHA-256。带了 `contentType` 的链接，用对应的 `type:` 搜索能找到它。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "createItem",
  "operationId": "OP_ID",
  "type": "link",
  "url": "https://example.com/shop",
  "title": "Corner shop",
  "notes": "Open on Sundays",
  "contentType": "article",
  "collectionId": "COLLECTION_ID"
}'
```

发布一个已经存在的集合用 `publishCollection`。先看这次 `capabilities`。`actions` 里没有它，就停下来说明这台手机还不能发布。不要自己写 HTTP，也不要先问一套没有动作可提交的配置。`publish.ready` 不是真时同样不要调用，也不要问配置。`publish.reason` 为 `arc-space` 表示没有登录凭证。告诉用户「只有登录并获得 Arc Space 之后才能进行此操作」，请他在手机上登录 Arc Space。登录之后换一个新的 `operationId` 再发。沿用被拒绝的那次 id 只会重放这次拒绝。`account.name` 是「本机」或一段 DID 都不作为依据。响应里没有凭证，不要去读或打印它。

`publish.ready` 为真，并且知道要发布哪一个集合之后，先问这四项。他已经说出选择，或明确说用默认、直接发布时，不要再问。一次问完：

- 可见性：公开（默认）或未列出。请求值是 `public` 或 `unlisted`。
- 评论：关（默认）、开，或锁定。请求值是 `off`、`open` 或 `locked`。锁定只在这条已经发布且评论已是锁定时留下。不要把没锁定的改成锁定，也不要把已锁定的改成开或关。
- 作者：关（不显示，默认）或开（显示）。请求值是 `off` 或 `on`。
- 版式：瀑布流（默认）、列表或时间线。请求值是 `masonry`、`list` 或 `timeline`。不要传别的值。

他说用默认或直接发布时，这四项都不要放进请求。没有发布记录时，手机用公开、评论关、不显示作者、瀑布流。已经发布过的集合保持原来的四项。他点名的项才放进请求。

`collectionId` 是集合的 id，不是名字。先在 `/aside/collections` 里对上他要的那一个。对上多个时先问是哪一个。每次发布用新的 `operationId`。成功时把 `url` 给他，它以 `https://` 开头。同时用响应里的 `visibility`、`comments`、`author`、`view` 说明这次实际发出的配置。不要自己编 slug，也不要 `arc afs write`。发布不是往本地树上写文件。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "publishCollection",
  "operationId": "OP_ID",
  "collectionId": "COLLECTION_ID",
  "visibility": "public",
  "comments": "off",
  "author": "off",
  "view": "masonry"
}'
```

得到 HTTP 403 且 `reason` 为 `arc-space` 时，用上面那句登录说明。不认识的配置值会被拒绝，集合不会发布。评论改成锁定，或把已锁定改成开或关，也会被拒绝。这时说明这条评论不能这样改，请改选关或开，或在请求里不要带 `comments` 以保持原样。

改一条已有笔记要带刚读到的 `resourceVersion`。要保留嵌入，`blocks` 必须是完整列表。已经在这篇笔记上的图片、音频、文件、视频可以只写 `resourceId`。要从别的条目复制进来，写 `sourceItemId` 和 `resourceId`，不要只写别的条目的 `resourceId`。只传 `text` 会把这篇收成一段文字。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "updateNote",
  "operationId": "OP_ID",
  "id": "ITEM_ID",
  "resourceVersion": "RESOURCE_VERSION",
  "blocks": [{"kind": "text", "text": "正文"}]
}'
```

标签、集合、成员也是同一次 exec。`member` 是布尔值。更新、成员变更和给条目打标签都要带刚读到的 `resourceVersion`。返回冲突时，重新读取当前版本，用新的 operation id 再写。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "ensureTag",
  "operationId": "OP_ID",
  "name": "标签"
}'
```

`updateTag`、`createCollection`、`updateCollection`、`setMembership`、`setItemTag` 的字段在协议的内容动作表里。`setItemTag` 用 `itemId`。用户自己的标签用 `name`：`member` 为真时，没有同名用户标签会先建好再挂上；为假时只从这条 item 拿下，标签本身还在。系统标签用 `slug`，不要用 `ensureTag` 去建一个同名标签。那个新 id 不会进概览分组。

`createCollection` 和 `updateCollection` 的说明写在 `description`。手机会存成 `descriptionText`。`descriptionText` 和 `desc` 也接受。不传说明时，更新保留原来的说明。空白会清掉。改名仍然保留 slug。写完读回同一条，`description` 和请求一致才算写上。读回来是空的，说明这台手机的集合更新还只存名字，不要当成已经写上。

普通集合不传 `kind`。模板传 `kind`：展会 `tradeShow`，旅行 `travel`（`trip` 同样接受），研究 `research`。写完读回的 `kind` 必须是这一个。读回来仍是 `collection`，说明这台手机还不会建模板，不要继续打标签，也不要当成已经分组。展会和旅行可以带 `startsAt`、`endsAt`（`yyyy-MM-dd`）以及 `locationName`、`latitude`、`longitude`。研究和普通集合不要带日期或地点。展会没有概览分组，条目只进成员列表。产品研究 `productResearch` 也没有概览分组。

已有条目用 `setMembership` 放进集合，`collectionId` 用集合 id。新建条目也可以在 `createItem` 里带这个 id。然后按 [references/protocol.md](references/protocol.md) 的「模板集合」表打 `slug`。旅行概览是吃喝 `travel-food`、攻略 `travel-guide`、预订 `travel-stay` 或 `travel-ticket`、随记 `travel-note`。照片看条目类型 `image` 或 `photos`，不必再打 `travel-photo`。地图上的去过必须是带经纬度的 `place`，再打 `travel-visited`（手机会同时挂上 `travel-place`）。研究概览是论文 `research-paper`、博客或网站 `research-blog` / `research-website`、社交 `research-social`、视频 `research-video`、笔记 `research-note`。研究来源只留一个，后写的换掉前一个。`research-app-store` 和 `travel-route` 没有概览行。对不上这些行的条目可以只做成员，它们留在未分组，不要为了填满去打别的系统标签。

批量只放非删除的写操作。建议的三个动作，以及 `listWaitingMessages`、`acceptWriteback`，不要放进 `batch`。有失败项时成功的留下。不要把整批再执行一遍。先读回，只对失败的步骤用新的 operation id 重试。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "batch",
  "operationId": "OP_ID",
  "operations": []
}'
```

永久删除只登记手机确认，不会删掉内容：

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside --standalone --json --args '{
  "action": "delete",
  "operationId": "OP_ID",
  "objectIds": ["ITEM_ID"],
  "count": 1
}'
```

返回里 `pending` 为真且 `confirm` 为 `phone` 时，告诉用户：手机上要确认这些对象和数量，大约 60 秒内有效。取消、超时或会话被撤销，都不会删除。不要 exec `confirm` 或 `confirmDelete`。那不会删除任何东西。

用户断开这一条、拒绝，或点了结束连接之后，如果曾经挂上，再卸下。锁屏或离开较久不要因此卸掉并重新配对。

```bash
cd ~/.aside-agent && arc afs mount remove /aside
```

两个不同的 Agent 是两次配对、两个会话、两份凭证。不要共用一个凭证文件。同一台电脑、同一个工具再配对时，手机会收起上一场。不要因为用户离开了终端页就再配一次。

你使用的 AI 工具可能会把读到的内容发到它自己的云端服务。开始读之前把这句话告诉用户。

## 恢复

- 锁屏或离开较久：监听先停，授权还在。没有超时的 HTTP 请求会一直挂住。连不上就停，不要空转。请告诉用户把 Aside 唤醒到前台，然后重新浏览。已有凭证就对这次的 base 先 `probe`。成功就用新端口重新 `mount add`，不要重新配对。
- 用户点了结束连接，或在手机上断开了这一条：这一份作废。请用户重新打开终端页。重新浏览。只有一台就直接用，多台再请用户选。然后重新配对并再次允许。
- 用户只是离开了终端页，或短暂切到别的应用：连接还在。一次库命令失败，而 `probe` 仍然成功时，用同一个 base 再试那一次。不要重新配对。连不上再浏览。浏览仍然能找到这台手机时，用原来的凭证。
- 切换资料库或账号：授权还在，不要重新配对。资料库还在换时会以 `library-changing` 失败。用同一份凭证再试。对齐之后，读写落在现在打开的库。
- 同一局域网：手机重启监听后，端口会变，四位标记保持不变。已经选定的那一台用主机名和标记认，沿用原来的凭证再 `probe`。用户还没选定、网上又有多台时，才对照手机上的标记来选。
- 用户在手机上拒绝：得到 `denied`。停下来问用户是否要重新配对。不要继续领取。
- 配对超时或码已使用：得到 `pairing-expired` 或 `pairing-used`。重新配对，让用户对照新的码。
- 凭证被撤销：`revoked`。这一份不能再用。需要的话另配一次。
- 缺少或错误的凭证：`unauthorized`。不要打印那份凭证。重新走配对。
- 连不上或浏览为空：请告诉用户把 Aside 唤醒到前台。不要重新配对，不要扫描网段。
- 版本不一致：停止。不要降级，也不要自己拼内容路径。
- 写到一半断线：先读回。对象已经在就不要再创建。没有写上，就用同一个 operation id 和同一份正文重试。
- 删除确认超时或用户取消：内容还在。不要在电脑上补一次确认。

## 不要做

- 不要探测子网。只浏览 `_aside-agent._tcp`。
- 不要写 HTTP 客户端去调用 `/rpc` 或 `/agent/v1/content`。库操作用 `arc afs`。
- 不要把凭证放进挂载 URI，也不要省略 `--set allowPrivateNetwork=true`。
- 不要在 `~/.aside-agent` 以外的目录挂 `/aside`，也不要省略库命令上的 `--standalone`。
- 不要在配对窗口里读源码。先把配对码给用户，并马上领取。
- 不要在 skill、日志或示例里放凭证、配对码或演示码。
- 不要请求 `/user`、`/dev`、`/kv`、`/afs`。读库只用挂载点 `/aside`。
- 不要 `arc afs write`、`arc afs delete`，也不要 exec `/.actions/query`、`confirm`、`confirmDelete`。
- 没有 `writeSuggestions` 时，不要用 `createNote`、`createItem` 或直接写 `agent/suggestions.json` 去冒充一次交代。
- 不要写 `agent/suggestion-consumes.json`，也不要直接改对话记录文件。接手等待中的任务只走 `listWaitingMessages` 和 `acceptWriteback`。没有这两个动作就停。
- 不要把 Muse 或其他没跑过的工具写成已经支持。

## 协议

手机接受的动作和错误在 [references/protocol.md](references/protocol.md)。`type:` 的词在上面的搜索表。某台手机接受什么，以这次 `capabilities` 为准。
