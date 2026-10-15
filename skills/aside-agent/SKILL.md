---
name: aside-agent
description: 在电脑上连接同一局域网里的 Aside 手机，完成配对，并用本客户端读写当前资料库。用户说「连接我的 Aside」，或要在手机上写一条笔记时使用。写笔记就是创建 Quick Note。先浏览 Bonjour `_aside-agent._tcp`。只有一台时直接连接，多台时请用户选择。连接成功看同一条 base 上的 probe 和 capabilities。不要扫描网段，不要导出 /user、/dev 或 /kv，不要自己拼 arc afs mount add。
license: Apache-2.0
compatibility: macOS, Node.js 22, dns-sd, and the arc CLI. The phone and computer share a LAN. Transport is cleartext TCP. No TLS.
metadata:
  author: ArcBlock
  version: "0.1.2"
---

# Aside 电脑 Skill

这个 skill 让电脑上的 Agent 按 [references/protocol.md](references/protocol.md) 使用手机前台终端。协议以那份文档为准。不要另做一套登录或内容协议。

在这个 skill 的目录里运行命令。客户端是 `node scripts/client.mjs`。

Skill 不是安全边界。手机上的允许才是授权。电脑不能自己允许，也不能自己确认永久删除。

## 支持范围

只把下面这次实际跑过的环境写成可用：

- 操作系统：macOS 27.0.1（Build 26A434）
- 工具：Node.js v22.16.0，运行 `scripts/client.mjs`
- 没有交互式 Codex、Claude 或 Muse 会话。Muse 不是已支持的集成。不要把没跑过的工具写成支持。

配对、领取和探针走 `POST /agent/v1` 和 `GET /agent/v1/discovery`。发现用系统 `dns-sd` 浏览 `_aside-agent._tcp`。连接成功是同一条 Bonjour `base` 上 `probe` 和 `capabilities` 都成功。内容走本客户端的 AFS HTTP `POST /rpc`，动作是 `exec /.actions/aside`。不请求 `/user`、`/dev`、`/kv`、`/afs`。不扫描网段。客户端可以尝试把库挂到 `/aside`，挂不上也不算连接失败。

## 安装

不需要 npm install。进入这个 skill 的目录，用 Node.js 22 运行：

```bash
node scripts/client.mjs help
```

把整个 skill 目录交给 Agent，包含 `SKILL.md`、`scripts/` 和 `references/`。客户端和说明必须一起走，不要只复制提示词。

凭证文件由 `--credential-file` 指定，权限保持仅当前用户可读。不要把凭证写进聊天、日志、提交或这个 skill。

## 首次连接

1. 请用户在手机上打开 Aside 的内容终端页。打开后可以离开这一页。切到别的应用、锁屏，或离开较久，授权都会保留，直到用户自己断开这一条。监听在锁屏或离开较久时会先停，回到前台如果还有授权会自己重新打开，不需要再进这一页，也不需要新的配对码。点「结束连接」或「结束全部连接」，以及确认断开某一条，会立刻取消那一份授权。切换资料库或账号不会取消授权。资料库还没换成现在这个账号时，内容读写会以 `library-changing` 失败，凭证还在，用同一份再试，不要重新配对。挂上之后，读写落在现在打开的库，结果里的 `account` 用那个名字。第一次打开时，系统可能询问本地网络权限，需要允许。
2. 手机和电脑在同一个局域网。这一版是明文 TCP，没有 TLS。发现用 Bonjour `_aside-agent._tcp`。同网不等于信任。配对码和凭证在撤销前，同一局域网上的观察者可以看见。
3. 先浏览。`devices` 只有一台时，直接用它的 `base` 继续，不要停下来问选哪一台。两台或更多时，请用户对照手机上的四位标记来选，不要自己挑第一台，也不要把整段服务名念成标题。不要探测整个网段，不要依次试地址。

```bash
node scripts/client.mjs browse
```

确定 `base` 之后只用那一条。它是 Bonjour 给出的主机名和这一次的端口。端口每次打开终端都会变，不要复用上一场的端口。不要把这个地址改成 IPv4 或其他主机。如果 `devices` 是空的，请用户把 Aside 带回前台。还有授权时监听会自己重新打开。点过结束连接，或已经断开了这一条，才需要重新打开终端页。手机和电脑要在同一个 Wi-Fi，并允许本地网络。离开这一页本身不会让列表变空。页面不提供地址。不要扫描网段，也不要向用户要 `host:port`。
4. 先发现，再判断版本。第一次可能连不上，用同一个 `base` 再试一次。不要换地址。

```bash
node scripts/client.mjs discover --base http://HOST:PORT
```

`protocol` 必须是 `aside-agent`，`version` 必须是 `1`，并且要求配对和手机允许。否则停止。告诉用户版本不一致，不要改去别的路径或再发明一个协议。

5. 已有凭证时，先对这一次浏览到的 `_aside-agent._tcp` base 做 `probe`。端口每次监听打开都会变，不要复用上一场的端口。`probe` 成功就用这份凭证继续，跳到第 7 步，不要再 `pair`。只有没有凭证、手机返回 `revoked`、或用户拒绝（`denied`）时才配对。`--tool` 填当前这个 Agent 的真实工具名，`--device` 填这台电脑的名字。不要假装成没有跑过的工具。

```bash
node scripts/client.mjs pair \
  --base http://HOST:PORT \
  --tool "当前工具名" \
  --device "这台电脑"
```

不要自己写 `--device-id`。省略时，客户端会带上这台电脑已经保存的固定标识。自己编一个新标识，手机会把这台电脑收成另一条连接。

把返回的工具名、设备名和配对码立刻给用户，并马上执行下面的 `wait-claim`。手机上的配对码大约 60 秒后过期，客户端默认只等 50 秒。不要在这个窗口里读源码、查实现或做别的事。配对码不是凭证。不要在电脑上调用允许。网上的允许接口会拒绝。

6. 等用户在手机上点允许，然后领取凭证。允许之前领取会得到 `not-allowed`，这不代表码错了。窗口用完得到 `pairing-expired` 时，重新 `pair`，把新码给用户，不要沿用旧码。码过期通常是窗口被用完了，不是用户拒绝。

```bash
node scripts/client.mjs wait-claim \
  --base http://HOST:PORT \
  --session SESSION_ID \
  --code PAIRING_CODE \
  --credential-file /path/to/aside-agent-credential
```

标准输出有会话和凭证文件路径，没有凭证本身。`expiresAt` 为空，因为凭证没有时钟过期。凭证放在手机钥匙串里，不写进聊天或日志。空闲再久，同一份凭证仍然可以 `probe`。用户断开这一条、拒绝，或结束全部连接，才会作废。没有已信任设备名单。每次结果里的 `account` 是手机当前打开的账号，用这个名字，电脑不能另选账号。

7. 用同一个 `base` 做 `probe`，再做 `capabilities`。这两步都成功，连接就成功了。每次结果里的 `account` 是手机当前打开的账号，用返回的名字。`tree` 里应有 items、collections、tags。写带嵌入的笔记还要看 `note.blocks`。一次内容请求失败，而 `probe` 仍然成功时，用同一个 `base` 再试那一次内容请求。不要重新配对，也不要换地址。只有 `probe` 也连不上时才重新 `browse`。浏览还能看到这台手机时，继续用原来的凭证。

8. 挂到本地 AFS 是附加步骤，不是连接成功的条件。没有 `arc` 时，客户端会说明安装命令：`curl -fsSL https://arc.afsd.io/install.sh | bash`。装好后再挂。这一步会在本机守护进程没开时执行 `arc service start`，不会停止已经在跑的服务。挂载点固定是 `/aside`。再挂一次会先卸掉旧的，避免凭证叠在一起。

```bash
node scripts/client.mjs mount \
  --base http://HOST:PORT \
  --credential-file /path/to/aside-agent-credential
```

客户端把 `allowPrivateNetwork=true` 作为挂载选项传给 arc。只写在 URI 查询参数里会被 arc 丢掉，局域网地址随后会触发 SSRF。凭证不进 URI。不要自己拼 `arc afs mount add`，也不要把凭证打出来。

返回 `mounted: true` 时，库在 `/aside`。`/` 就是手机上当前登录的资料库，下面是 `items`、`collections`、`tags`。这时可以用：

```bash
arc afs list /aside
arc afs list /aside/items
arc afs read /aside/items/ITEM_ID
```

返回 `mounted: false` 且原因是私网拒绝时，告诉用户库还不能出现在 `/aside`，然后继续用本客户端。不要扫描网段，不要把地址改成 IPv4 或其他主机，也不要另挂一条服务。

不要 `arc afs delete`，也不要直接 `arc afs write`。这两条会被拒绝，不会改库。用户断开这一条、拒绝，或点了结束连接之后，如果曾经挂上，再卸下。锁屏或离开较久不要因此卸掉并重新配对。

```bash
node scripts/client.mjs unmount
```

9. 读取能力也可以在第 7 步做完。不要写死示例条目路径或假数量：

```bash
node scripts/client.mjs capabilities \
  --base http://HOST:PORT \
  --credential-file /path/to/aside-agent-credential
```

后面的动作必须出现在返回的 `actions` 里。写带嵌入的笔记时，种类还要出现在 `note.blocks` 里。`tree` 只说明 items、collections、tags 是否存在。列表项只有 id、title、type、resourceVersion。要正文再按 id 读。

## 日常使用

每次命令都带浏览得到的同一个 `--base` 和 `--credential-file`。这些命令不再请求 `/agent/v1/content`。它们对 `/rpc` 做 `exec /.actions/aside`。`/aside` 没有挂上时，读写仍然走这些命令。写操作每次新的变更用新的 `--operation-id`。同一次重试必须沿用同一个 id，并且正文参数完全一样。换了正文会被当成冲突，不会写成第二个对象。写完再读同一条，`resourceVersion` 和 `noteBlocks` 与写入返回一致，才算写成功。

读：

```bash
node scripts/client.mjs list \
  --base http://HOST:PORT --credential-file FILE --resource items
node scripts/client.mjs list \
  --base http://HOST:PORT --credential-file FILE --resource items --cursor CURSOR
node scripts/client.mjs list \
  --base http://HOST:PORT --credential-file FILE --resource items --query "要找的词"
node scripts/client.mjs read \
  --base http://HOST:PORT --credential-file FILE --resource items --id ITEM_ID
node scripts/client.mjs read-attachment \
  --base http://HOST:PORT --credential-file FILE --id ITEM_ID --attachment ATTACHMENT_ID
```

`list` 的 `--query` 会走搜索。items 使用资料库索引。前缀是 `tag:`、`collection:`、`type:`、`link:` / `site:`、`after:` / `before:`、`status:archived`。默认排除已归档。空查询是空页。结果仍是 id、title、type、resourceVersion，没有正文。有 `nextCursor` 就继续传 `--cursor`，不要假设一页就是全部。附件结果是 base64 字节和 `byteCount`，不是手机上的本地路径。

写完要再读一次，确认手机和这次返回是同一结果，然后再告诉用户成功。

用户要写笔记、记一条、记下来，用 `create-note`。这会创建一条 Quick Note。

Quick Note 的正文是按顺序排好的块，可以嵌入文字、图片、链接、地点、音频、文件，也可以有一条视频。先看 `capabilities` 的 `note.blocks`。没有 `note` 时，只能用 `--text` 写纯文字。

纯文字：

```bash
node scripts/client.mjs create-note \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --text "正文" --title "标题"
```

有嵌入时，把块写成 JSON 数组，用 `--blocks-file`。有这份文件时以它为准，可以不再传 `--text`。链接只给 http 或 https 的 `url`。地点用 `latitude` 和 `longitude`，`kind` 写 `location` 或 `place`。图片、音频、文件、视频要有不带路径的 `filename`，字节放在 `contentBase64`。可以带 `mimeType`。音频和视频可以带 `duration`。图片最多 9 张，每张不超过 20MB。音频和文件每条不超过 20MB。图片、音频、文件合计不超过 60MB。视频最多 1 条，不超过 200MB，时长不超过 15 秒。不接收天气。

```json
[
  {"kind": "text", "text": "正文"},
  {"kind": "link", "url": "https://example.com/notes", "title": "页面"},
  {"kind": "location", "latitude": 31.25, "longitude": 121.5, "title": "地点", "detail": "街道"},
  {"kind": "image", "filename": "photo.png", "mimeType": "image/png", "contentBase64": "<字节>"},
  {"kind": "audio", "filename": "voice.m4a", "contentBase64": "<字节>"},
  {"kind": "file", "filename": "notes.txt", "contentBase64": "<字节>"},
  {"kind": "video", "filename": "clip.mp4", "duration": 8, "contentBase64": "<字节>"}
]
```

```bash
node scripts/client.mjs create-note \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --title "标题" --blocks-file note.json
```

返回的 `noteKind` 是 `quickNote`。`noteBlocks` 是同样顺序的块，不含字节。要字节就用 `read-attachment`，`--attachment` 用块上的 `resourceId`。

改一条已有笔记要带刚读到的 `resourceVersion`。要保留嵌入，`--blocks-file` 必须是完整的块列表。已经在手机上的图片、音频、文件、视频可以只写 `resourceId`，不必再传字节。只传 `--text` 会把这篇收成一段文字，嵌入不再出现在 `noteBlocks` 里。

```bash
node scripts/client.mjs update-note \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --id ITEM_ID --resource-version RESOURCE_VERSION \
  --blocks-file note.json
```

```bash
node scripts/client.mjs ensure-tag \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --name "标签"
node scripts/client.mjs update-tag \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --id TAG_ID --name "新名称" \
  --resource-version RESOURCE_VERSION
node scripts/client.mjs create-collection \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --name "集合"
node scripts/client.mjs update-collection \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --id COLLECTION_ID --name "新名称" \
  --resource-version RESOURCE_VERSION
node scripts/client.mjs set-membership \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --item ITEM_ID --collection COLLECTION_ID \
  --member true --resource-version RESOURCE_VERSION
```

把标签挂到一条 item 上，或从这条 item 拿下。`member true` 时，没有同名标签会先建好再挂上，不会只留下一个空标签。`member false` 只从这条 item 拿下，标签本身还在。先读这条 item，用它的 `resourceVersion`。

```bash
node scripts/client.mjs set-item-tag \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --item ITEM_ID --name "标签" \
  --member true --resource-version RESOURCE_VERSION
```

更新、成员变更和给条目打标签都要带刚读到的 `resourceVersion`。返回冲突时，重新读取当前版本，用新的 operation id 再写。不要拿旧版本覆盖。

批量只放非删除的写操作。文件是 JSON 数组。部分失败时进程退出码是 2，标准输出仍有每一项的结果：成功的留下，失败的留在 `results` 里。不要把整批再执行一遍。先读回，只对失败的步骤用新的 operation id 重试。

```bash
node scripts/client.mjs batch \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --operations-file operations.json
```

永久删除只登记手机确认，不会删掉内容：

```bash
node scripts/client.mjs delete-request \
  --base http://HOST:PORT --credential-file FILE \
  --operation-id OP_ID --object-id ITEM_ID
```

把返回告诉用户：手机上要确认这些对象和数量，大约 60 秒内有效。取消、超时或会话被撤销，都不会删除。离开终端页也不会删除。不要调用确认接口。那不会删除任何东西。客户端拒绝把确认当成删除。

两个不同的客户端是两次配对、两个会话、两份凭证。用户撤销其中一个，之后只有那一个失败。另一个继续用自己的凭证。不要共用一个凭证文件。同一台电脑、同一个工具再配对时，手机会收起上一场，页面上只留这一条。不要因为用户离开了终端页就再配一次。

你使用的 AI 工具可能会把读到的内容发到它自己的云端服务。开始读之前把这句话告诉用户。不要把正文、附件字节或凭证写进日志。

## 恢复

- 锁屏或离开较久：监听先停，授权还在。请用户把 Aside 带回前台，然后重新 `browse`。已有凭证就对这次的 base 先 `probe`。成功就继续，不要重新配对。不要扫描网段找新端口。
- 用户点了结束连接，或在手机上断开了这一条：这一份作废。请用户重新打开终端页。重新 `browse`。只有一台就直接用，多台再请用户选。然后重新配对并再次允许。
- 用户只是离开了终端页，或短暂切到别的应用：连接还在，原来的 `base` 和凭证还能用。不要重新配对。一次内容请求失败，而 `probe` 仍然成功时，用同一个 `base` 再试那一次内容请求。不要重新配对，也不要重新浏览。已经有凭证就先 `probe`，成功就继续，不要再 `pair`。连不上再 `browse`。浏览仍然能找到这台手机时，用原来的凭证，不要开第二场配对。
- 切换资料库或账号：授权还在，不要重新配对。资料库还在换时，内容或 RPC 会以 `library-changing` 失败，这不是 `revoked`，也不是 `expired`。用同一份凭证再试。挂上之后，下一次结果里的 `account` 会换成现在打开的账号，用那个名字。
- 同一局域网：手机重启监听后，屏幕上的四位标记会变，端口也会变。多台时以这次浏览和手机上的标记为准。明文传输，不要把 Wi-Fi 当成信任。
- 用户在手机上拒绝：客户端得到 `denied`。停下来问用户是否要重新配对。不要继续领取。
- 配对超时或码已使用：得到 `pairing-expired` 或 `pairing-used`。重新 `pair`，让用户对照新的码。
- 凭证被撤销：`revoked`。这一份不能再用。其他会话不受影响。需要的话另配一次。断开是用户在手机上的动作。
- 缺少或错误的凭证：`unauthorized`。不要打印那份凭证。重新走配对。
- 连不上，或监听不接受：可能锁屏或离开较久，手机还没回到前台。看手机。已有凭证时先 `probe`，不要马上重新配对。不要换一套协议。
- 版本不一致：停止。不要降级，也不要自己拼内容路径。
- 写到一半断线：先读回。对象已经在就不要再创建。没有写上，就用同一个 operation id 和同一份正文重试。结果不确定时，读到之后再继续。
- 删除确认超时或用户取消：内容还在。不要在电脑上补一次确认。

## 不要做

- 不要探测子网。只浏览 `_aside-agent._tcp`。不要把发现文档以外的字段当成入口，也不要把服务名当成凭证。
- 不要自己拼 `arc afs mount add`。挂载失败后不要改试别的地址。
- 不要在配对窗口里读源码。先把配对码给用户，并马上 `wait-claim`。
- 不要在 skill、日志或示例里放凭证、配对码或演示码。
- 不要请求 `/user`、`/dev`、`/kv`。读库用 `/aside` 或本客户端，不要自己再挂一条会导出整棵树的服务。
- 不要把 HTTP 确认当成删除，也不要在批量里放删除。
- 不要把 Muse 或其他没跑过的工具写成已经支持。

## 验证记录

- 命令：在这个 skill 的目录里运行 `node --test scripts/client.test.mjs`。
- 这一份测试不改 Xcode 工程，也不启动 iOS 模拟器。对着真实前台监听的套件留在 Aside 应用仓库 `design/aside-agent-mode/skill/`。
- 跑在 macOS 上，工具是 Node.js 22。
- 没有交互式 Codex、Claude 或 Muse 会话。真机和多 Agent 仍由 Aside 仓库的 #2292 负责。
