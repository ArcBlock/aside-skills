---
name: aside-agent
description: 在电脑上连接同一局域网里的 Aside 手机，完成配对，把当前资料库挂到 /aside，再用 arc afs 搜索、阅读和写入。用户说「连接我的 Aside」，或要在手机上写一条笔记时使用。写笔记就是创建 Quick Note。先浏览 Bonjour `_aside-agent._tcp`。只有一台时直接连接，多台时请用户选择。条目搜索用 arc afs search，不要另写 HTTP 客户端。不要扫描网段，不要导出 /user、/dev 或 /kv。
license: Apache-2.0
compatibility: macOS, dns-sd, curl, and the arc CLI. The phone and computer share a LAN. Transport is cleartext TCP. No TLS.
metadata:
  author: ArcBlock
  version: "0.3.1"
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

`base` 用解析结果里的主机名和端口，形如 `http://HOST:PORT`。端口和四位标记每次重新打开监听都会变，不要复用上一场的端口。用户已经选定一台之后，下一次浏览用主机名对上那一台，沿用原来的凭证。不要把这个地址改成 IPv4 或其他主机。列表是空的，请告诉用户把 Aside 唤醒到前台。授权还在，不需要重新允许。点过结束连接，或已经断开了这一条，才需要重新打开终端页。页面不提供地址。不要扫描网段，也不要向用户要 `host:port`。

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

`ASIDE_TOKEN` 从凭证文件读入，不要 `echo`。`account.name` 是手机当前打开的账号，用这个名字。电脑不能另选账号。

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

8. 写带嵌入的笔记之前先看能力。动作必须出现在返回的 `actions` 里，块种类必须出现在 `note.blocks` 里。没有 `note` 时只写纯文字。

```bash
cd ~/.aside-agent && arc afs exec /aside/.actions/aside \
  --args '{"action":"capabilities"}' \
  --standalone --json
```

不要调用 `/.actions/query`。它固定拒绝，文案是 `query is not served on this library`。

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

有嵌入时以 `blocks` 为准，可以不再传 `text`。链接只给 http 或 https 的 `url`。地点用 `latitude` 和 `longitude`，`kind` 写 `location` 或 `place`。图片、音频、文件、视频要有不带路径的 `filename`，字节放在 `contentBase64`。可以带 `mimeType`。音频和视频可以带 `duration`。图片最多 9 张，每张不超过 20MB。音频和文件每条不超过 20MB。图片、音频、文件合计不超过 60MB。视频最多 1 条，不超过 200MB，时长不超过 15 秒。不接收天气。`--args` 走命令行，放不下的附件不要改去自写 HTTP。告诉用户这条附件太大。

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

改一条已有笔记要带刚读到的 `resourceVersion`。要保留嵌入，`blocks` 必须是完整列表。已经在手机上的图片、音频、文件、视频可以只写 `resourceId`。只传 `text` 会把这篇收成一段文字。

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

`updateTag`、`createCollection`、`updateCollection`、`setMembership`、`setItemTag` 的字段在协议的内容动作表里。`setItemTag` 用 `itemId` 和 `name`。`member` 为真时，没有同名标签会先建好再挂上。为假时只从这条 item 拿下，标签本身还在。

批量只放非删除的写操作。有失败项时成功的留下。不要把整批再执行一遍。先读回，只对失败的步骤用新的 operation id 重试。

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
- 同一局域网：手机重启监听后，四位标记和端口都会变。已经选定的那一台用主机名认，沿用原来的凭证再 `probe`。用户还没选定、网上又有多台时，才对照手机上的标记来选。
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
- 不要把 Muse 或其他没跑过的工具写成已经支持。

## 协议

手机接受的动作和错误在 [references/protocol.md](references/protocol.md)。`type:` 的词在上面的搜索表。某台手机接受什么，以这次 `capabilities` 为准。
