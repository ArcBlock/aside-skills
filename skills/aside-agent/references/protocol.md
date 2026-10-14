> 这是给 Agent 读的协议副本。工程原文在 [ArcBlock/aside](https://github.com/ArcBlock/aside) 的 `design/aside-agent-mode/PROTOCOL.md`。两边可以不一致。手机当前这一版接受什么，以连接后的 `capabilities` 为准。

# 前台连接协议与逐会话授权

2026-10-13 · #2289。给 #2290（内容投影）、#2286（iOS 终端页）、#2291（电脑 Skill）的契约。视觉与页面以 [HANDOFF](HANDOFF.md) 为准，本文不改 UI。

实现在 `ios/HostCompose/AgentForegroundSession.swift`。`ios/Aside` 生产 Swift 仍是 6 个文件；`AsideAFSService` 只负责在前后台、锁屏和资料库/账号切换时调用它。默认构造会打开真实 TCP 监听；进程内 `AgentLANClient` 覆盖授权状态机。两者都不是真机联调。

## 决定

- 不使用 `AFSHTTPServer` 的单个 `authToken`。那个 Bearer 是进程级的，撤销不了单独一个会话，也会把整个 AFS 树带出去。
- 不导出 `/user`、`/dev`、`/kv`、`/afs`。装上内容投影之后，`POST /rpc` 只提供当前登录库：客户端的 `/` 对应手机 AFS 的 `/user`，返回路径去掉 `/user` 前缀。配对、领取和探针仍走 `/agent/v1`。`delete`、`rename`、`write` 不落盘。笔记、标签、集合、成员和待确认删除走 `exec /.actions/aside`。
- 不恢复 `LocalAFSDebugHTTPServer`、`ensureDebugHTTPServer`、`startDebugHTTPServer`。
- 发现载荷只在监听期间存在。它是以后 `_aside-agent._tcp` TXT 要逐字携带的连接元数据。`AsideAFSService` 使用的默认监听器绑定 IPv4 `INADDR_ANY`（`0.0.0.0`）的临时端口，发现载荷带 `port`，`transport` 为 `tcp`。测试可以注入不打开套接字的工厂，那种发现载荷没有 `port`，`transport` 为 `in-process`。
- v1 是 cleartext TCP（明文，不实现 TLS）。监听期间手机会注册 Bonjour `_aside-agent._tcp`。电脑只浏览这一个服务类型。只有一台时直接连接，多台时由用户选中后再连接。不扫描网段，也不探测其它端口。页面只显示服务名，不显示 `host:port`。离开终端页不停止监听。短暂离开前台会保持同一条连接大约三分钟。锁屏、离开大约三分钟、结束连接、断网、资料库或账号切换会停止。Wi-Fi 不是信任。配对码和 Bearer 在过期或撤销之前，对同一局域网上的观察者可见。
- 尚未领取凭证的待配对会话最多 8 个。第 9 次 `pair` 返回 `pairing-limit`，并且不创建会话。
- 每次新会话都要手机允许。没有「已信任设备」，凭证不落盘。没有请求就不会续期。
- 配对码 60 秒、6 位、加密随机、单次使用。生产代码里没有固定演示码。允许之后连续 5 次错误即作废。
- 会话凭证在 `claim` 成功时签发，32 字节、base64url。空闲 15 分钟后过期。成功的 probe、`/agent/v1/content` 或 `POST /rpc` 会把这 15 分钟重新算起。没有请求就不会续期，过期必须重新配对并再次允许。结束连接、离开前台大约三分钟、锁屏、断网通知、资料库或账号切换会撤销全部凭证并停止监听。只离开终端页，或在大约三分钟内回到前台，不会。监听开着时手机会保持屏幕常亮，避免离开页面后自动锁屏把连接关掉。同一台电脑、同一个工具再配对时，上一场还活着的会话会被收起，页面上只留新的这一条。另一台电脑或另一个工具仍是独立会话。
- 手机允许/拒绝只存在于服务 API。网络上的 `/agent/v1/allow` 固定拒绝。
- 回到前台不会自动 `start()`。
- 错误复用 `AFSError`（`forbiddenError`、`conflictError`、`runtimeError`、`unsupported`、`notFound`、`validationError`）。线上整数复用 `AFSWireErrorCode`，不另造错误类型。

## 终端状态

`closed`、`starting`、`waiting`、`active`、`ended`、`interrupted`、`failed`。

| 状态 | 行为 |
| --- | --- |
| `closed` | 初始。不监听，没有发现载荷，没有有效会话 |
| `starting` | `start()` 已进入，绑定尚未完成。发现和探针都拒绝，不宣称就绪 |
| `waiting` | 正在监听，没有有效授权会话。可以发现和配对 |
| `active` | 至少一个有效授权会话。手机已允许、未断开、凭证未过期（尚未 `claim` 也算已授权）。凭证到期后即使没有探针，`state` 也会回到 `waiting` |
| `ended` | `stopAll()`。全部凭证撤销，监听停止。必须再次 `start()` |
| `interrupted` | 离开前台超过大约三分钟、锁屏、网络、资料库或账号切换。`interruptReason` 保留第一次原因。必须再次 `start()` |
| `failed` | 监听工厂抛错，例如本地网络权限被拒绝。`lastFailure` 是真实原因。再次 `start()` 即重试 |

`noteReturnedToForeground()` 在宽限内只取消计时，不改变监听，也不调用监听工厂。宽限已过则按后台打断结束。两种情况都不调用 `start()`。`start()` 在 `waiting` 或 `active` 时不会重绑，避免换掉 `instanceId`。绑定完成前如果已经进入 `interrupted` / `ended`，返回的句柄会被 `stop`，监听不会留下来。

## 会话

同一工具名 + 同一设备名可以同时有两个会话，内部 `sessionID` 不同，凭证不同。显示名相同且已经有过会话时，短标识为 `会话 01`、`会话 02`，只用于显示。第二个会话配对时，事件流会补一条第一个会话的快照，`shortLabel` 为 `会话 01`。

名称缺失或空白时，工具显示「未知工具」，设备显示「未命名设备」。控制字符会被删掉，显示名最长 64 个字符，设备 ID 最长 128。名称和设备 ID 都是客户端声明，不能当作 Bearer，也不能用来允许会话。

阶段：`pendingAuthorization`、`idle`、`reading`、`mutating`、`completed`、`failed`、`disconnected`。`completed` 和 `failed` 都不是断开。`reportActivity` 只接受 `idle`、`reading`、`mutating`、`completed`、`failed`。空闲会话的 `lastActivity` 保持为空，不会写成「正在读取」。`authorizedCount` 只数有效授权会话。

快照字段：`sessionID`、`deviceID`、`deviceLabel`、`toolLabel`、`shortLabel`、`scope`、`phase`、`phoneAllowed`、`credentialState`（`none` / `valid` / `expired` / `revoked`）、`lastActivity`、`startedAt`、`lastActivityAt`。快照和发现载荷都不含凭证。

## 发现

`GET /agent/v1/discovery` 在监听期间返回下面的对象，键不能多也不能少。有端口时才出现 `port`，并且 `transport` 为 `tcp`。生产默认监听器一定会带端口。注入的无端口工厂才把 `transport` 记为 `in-process`。

```json
{
  "protocol": "aside-agent",
  "version": 1,
  "instanceId": "0f1b7c2e-6a4d-4e5f-9c8b-1a2b3c4d5e6f",
  "serviceType": "_aside-agent._tcp",
  "transport": "tcp",
  "port": 18080,
  "pairPath": "/agent/v1/pair",
  "claimPath": "/agent/v1/claim",
  "probePath": "/agent/v1/probe",
  "requiresPairing": true,
  "requiresPhoneAllow": true
}
```

禁止出现：配对码、会话凭证、Bearer、工具名、设备名、收藏标题或正文、`/user`、`/dev`、`/kv`。`instanceId` 每次成功 `start()` 更换，把它当作 Bearer 会得到未授权。监听停止时发现载荷变为 `nil`，发现回调也会收到 `nil`。

## 配对与手机确认

`POST /agent/v1/pair`

```json
{ "toolName": "Codex", "deviceName": "Studio", "deviceId": "mac-1" }
```

```json
{
  "ok": true,
  "sessionId": "6f0c1d2e-3a4b-5c6d-7e8f-901234567890",
  "pairingCode": "042817",
  "expiresAt": "2026-10-13T05:01:00Z",
  "toolLabel": "Codex",
  "deviceLabel": "Studio",
  "shortLabel": "会话 02"
}
```

响应里的码和手机事件里的码是同一个，供两端对照。发现广播里没有这个码。响应里没有凭证。客户端声明的 scope 会被忽略。

手机调用 `allow(sessionID:)` 或 `deny(sessionID:)`。允许之后，客户端才能：

`POST /agent/v1/claim`

```json
{ "sessionId": "6f0c1d2e-3a4b-5c6d-7e8f-901234567890", "pairingCode": "042817" }
```

```json
{
  "ok": true,
  "sessionId": "6f0c1d2e-3a4b-5c6d-7e8f-901234567890",
  "credential": "base64url-32-bytes",
  "expiresAt": "2026-10-13T05:16:00Z",
  "scope": ["aside.agent.probe"]
}
```

允许之前的 `claim` 一律是 `not-allowed`，不透露码对不对，也不消耗尝试次数。码过期是 `pairing-expired`。允许后的错误码是 `pairing-invalid`；第五次错误或成功后再用是 `pairing-used`。拒绝后是 `denied`。

## 探针

这不是资料库。`/agent/v1/probe` 只认 `Authorization: Bearer <credential>`。查询字符串里的 token 无效。

```json
{
  "ok": true,
  "sessionId": "6f0c1d2e-3a4b-5c6d-7e8f-901234567890",
  "scope": ["aside.agent.probe"],
  "protocol": "aside-agent",
  "version": 1
}
```

成功体只有这五个键，不含凭证和收藏。未授权、过期、已撤销都会拒绝；一个新签发的凭证可以通过。撤销 A 不影响 B。全部停止或打断之后，新请求先得到「监听未接受」；再次 `start()` 之后，旧凭证仍是 `revoked`，新的允许会话可以通过。

## 错误

HTTP 体：

```json
{
  "ok": false,
  "error": {
    "name": "AFSError.forbiddenError",
    "path": "/agent/v1/probe",
    "reason": "unauthorized",
    "wireCode": 6
  }
}
```

| 情况 | HTTP | `AFSError` | `reason` 或说明 | `wireCode` |
| --- | --- | --- | --- | --- |
| 缺少或未知凭证 | 401 | `forbiddenError` | `unauthorized` | 6 `unauthorized` |
| 凭证过期 | 403 | `forbiddenError` | `expired` | 6 |
| 会话已撤销 | 403 | `forbiddenError` | `revoked` | 6 |
| 尚未允许 | 403 | `forbiddenError` | `not-allowed` | 6 |
| 配对码错误 | 403 | `forbiddenError` | `pairing-invalid` | 6 |
| 配对码已使用或尝试耗尽 | 403 | `forbiddenError` | `pairing-used` | 6 |
| 配对码过期 | 403 | `forbiddenError` | `pairing-expired` | 6 |
| 手机已拒绝 | 403 | `forbiddenError` | `denied` | 6 |
| 已撤销后再允许，监听仍在 | — | `forbiddenError` | `revoked`。不是 `denied` | 6 |
| 监听已停后再允许 | — | `runtimeError` | `listener is not accepting` | 5 |
| 待配对已满 | 403 | `forbiddenError` | `pairing-limit` | 6 |
| 监听未接受 | 503 | `runtimeError` | `listener is not accepting` | 5 `runtimeError` |
| 请求字段不合法 | 400 | `validationError` | `invalid agent request` | 5 |
| 资源版本过期，或同一 `operationId` 换了正文 | 409 | `conflictError` | `currentCid` 是当前文件哈希或该 `operationId` | 3 `conflict` |
| 未知会话（手机 API） | — | `notFound` | `path` 为 sessionID | 1 `notFound` |
| 网络上调用允许 | 501 | `unsupported` | `aside.agent.allow` | 5 |
| 内容挂载未安装 | 501 | `unsupported` | `aside.agent.content` | 5 |
| `/user`、`/dev`、`/kv`、`/afs` 及其他路径 | 501 | `unsupported` | `aside.agent.export` | 5 |
| 未安装投影时的 `POST /rpc` | 501 | `unsupported` | `aside.agent.export` | 5 |

错误体不回显请求正文、Authorization 或凭证。手机 API 的 `allow` / `reportActivity` 直接抛出 `AFSError`，路径是 `/agent/v1/sessions/<sessionID>`。

## 事件

`events` 给手机 UI，不走网络。

- `state(AgentTerminalState, reason: String?)`
- `pairing(sessionID, code, toolLabel, deviceLabel, expiresAt)`：手机要显示这个码
- `session(AgentSessionSnapshot)`：快照不含凭证

## 扩展点

- 内容挂载：`AgentContentMount` 的参数是 `sessionID` 和原始正文，不提供 `AFS` 实例。可以在构造时传入，也可以在第一次 `start()` 之前调用一次 `installContentMount`。第二次安装是 `alreadyExists`。`start()` 之后再安装是 `forbiddenError` / `already-started`。停止监听不会重新打开安装。未安装时 `POST /agent/v1/content` 返回 `aside.agent.content`。不要把产品字段塞进发现载荷，也不要导出整棵树。
- 活动：`reportActivity(sessionID:phase:summary:)`。未授权会话调用会失败。摘要会去掉控制字符并截断到 80 个字符，不能当成凭证，也不能携带正文或附件字节。#2286 只显示这里记下的真实阶段。
- 手机确认：`allow` / `deny`。#2286 把配对事件画出来后调用它们。Skill 提示词不能代替这次调用。
- 监听与发现：省略 `makeListener` 时，`start()` 绑定 IPv4 任意地址的临时端口，并在该套接字上只回答本协议的 HTTP/1.1。有端口时同时注册 `_aside-agent._tcp`，服务名给用户选择，TXT 的键等于发现对象，值是字符串，不能追加密钥、配对码、凭证或正文。没有端口的测试工厂不注册。`stop` 关闭监听套接字并撤销 Bonjour，新连接直接失败，而不是继续返回业务 JSON。句柄的 `stop` 在停止时调用。`discoverySink` 收到载荷或 `nil`。本工作包不安装 `NWPathMonitor`；路径真正断开时调用 `stopForNetworkChange()`。

## 内容

`POST /agent/v1/content` 仍在。凭证与探针相同：缺少 Bearer 是 HTTP 401 `forbiddenError` / `unauthorized`；撤销或过期是 HTTP 403，`reason` 为 `revoked` 或 `expired`。未安装挂载仍是 HTTP 501 `aside.agent.content`。`/user`、`/dev`、`/kv`、`/afs` 仍是 HTTP 501 `aside.agent.export`。发现载荷仍只有上一节的连接键。

装上内容投影后，同一条监听另答 `POST /rpc`。这是 AFS HTTP RPC：正文 `{ method, args }`，`args` 是数组。成功是 `{ success: true, data }`。失败是 `{ success: false, error: { code, message } }`，`code` 用 CLI 的 1 找不到、2 拒绝、3 冲突、5 运行时、6 未授权。缺少 Bearer 是 HTTP 401，`reason` 为 `unauthorized`。撤销或过期是 HTTP 403，`reason` 为 `revoked` 或 `expired`。未安装投影时 `POST /rpc` 仍是 HTTP 501 `aside.agent.export`。进程内同步 `accept` 不打开 `/rpc`，TCP 监听走 `respond`。

客户端路径 `/` 映射到手机 `/user`，`/items/...` 映射到 `/user/items/...`。返回条目的路径去掉 `/user`。`..`、`/dev`、`/kv`、`/afs`，以及会再套一层的 `/user`，都拒绝，且不返回库正文。`list`、`read`、`stat`、`search`、`explain` 读这个库。`delete`、`rename`、`write` 返回拒绝，不删除、不改文件。`exec /.actions/aside` 把参数交给上面的内容动作，所以删除仍只登记手机确认。`GET /rpc` 和其他路径不提供订阅，也不导出整棵树。没有第二条 HTTP 服务。

v1 仍是明文 TCP，不实现 TLS。监听期间注册 Bonjour，TXT 等于发现对象，不追加密钥。监听仍是 IPv4 `INADDR_ANY`，待配对上限仍是 8。本接口会把条目正文和附件字节放进响应。凭证有效的那段时间里，同一局域网上的观察者可以读到这些字节。这是残留，不是另开一条加密通道。监听线程等待响应，写入在主演员上 await 既有库函数。没有第二条 HTTP 服务。

`AsideAFSService` 在 `self` 存在后安装一次。挂载闭包指向当前的 `userSpaceFolder` 和已经挂上的 `afs`，也就是应用正在用的 `/user` 库。安装本身不调用 `start()`。

正文是 JSON。`action`：

| `action` | 行为 | 既有函数 |
| --- | --- | --- |
| `capabilities` | `items` / `collections` / `tags` 目录是否存在，加上 `/.meta` 里路径恰好为 `/user` 的 operations。另有 `note.kind` 与 `note.blocks`。不倾倒正文，也不列出 `/dev` 或 `/kv` | `AFS.read("/.meta")` |
| `list` | 分页列出。`resource` 为 `items`、`collections` 或 `tags` | `UserSpaceDocumentReader.listItems` / `listCollections` / `listTags` |
| `query`、`search` | 同上，按标题、正文、名称过滤。空字符串返回空页 | 同上 |
| `read` | 读一条。返回 `resourceVersion`。笔记的 `text` 原样读回。有 Quick Note 时另返回 `noteKind` 与不含字节的 `noteBlocks`。文章正文只从该条目自己的 `content.md` 载入 `markdown`，不接受调用方给的路径。`cover` 指向素材根下的普通文件时返回 `coverBase64` 与 `coverByteCount`。符号链接或逃出素材根的路径不返回字节 | `item(id:folder:)`、`collection(id:folder:)`、`listTags(folder:)` |
| `readAttachment` | `contentBase64` 与 `byteCount`。只接受该条目 `attachments` 目录里的普通文件。符号链接（包括中间目录）、`.did-space/space.db`、附件目录外的文件都是 HTTP 403 `forbiddenError` / `attachment`。`lstat` 拒绝链接，`open(O_NOFOLLOW)` 不跟随最后一级。手机本地路径不是成功 | 清单上的相对路径，读文件字节 |
| `createNote` | 保存一条 Quick Note。只有 `text` 时是一段文字。有 `blocks` 时以块为准，种类是 text、image、link、location、audio、file、video，不收 weather。侧车字节在 `contentBase64`。返回 `noteKind` 与不含字节的 `noteBlocks` | `UserSpaceDocumentWriter.createItem` |
| `updateNote` | 带当前 `resourceVersion` 才写。只给 `text` 时文档收成一段文字。给 `blocks` 时整篇替换；已有侧车可只带 `resourceId` | `UserSpaceDocumentWriter.persistItem` |
| `ensureTag` | 按名称确保标签。只建标签，不挂到 item | `UserSpaceDocumentWriter.ensureTag(named:)` |
| `updateTag` | 改名并保留 slug | `UserSpaceDocumentWriter.persistTag` |
| `setItemTag` | `member` 为真则按名称确保标签并挂到这条 item；为假则从这条 item 拿下，标签本身还在。带当前 `resourceVersion`。已经挂上再挂一次不会重复 | `UserSpaceDocumentWriter.tagItem` / `untagItem` |
| `createCollection`、`updateCollection` | 新建或改名，改名保留 slug | `UserSpaceDocumentWriter.persistCollection` |
| `setMembership` | `member` 为真则加入，否则移出 | `addItemCollection` / `removeItemCollection` |
| `delete` | 只登记待确认，不删除 | 无删除 |
| `batch` | 逐项执行上面的非删除写操作 | 同上 |
| `confirm`、`confirmDelete` | 网络上不能确认 | 返回 `aside.agent.allow` |

`cursor` 是十进制偏移，缺省从 0 开始。`limit` 缺省 50，钳在 1...100。排序按 id。`nextCursor` 在还有剩余时给出。走完每一页不会漏。空库合法。列表项只有 `id`、`title`、`type`、`resourceVersion`。

`resourceVersion` 是该 JSON 文件字节的 SHA-256 十六进制。它不是 schema `version`，也不是秒级 `updatedAt`。更新时不一致返回 `conflictError`（HTTP 409，`wireCode` 3），`currentCid` 是当前文件哈希，不会静默覆盖。匹配才写入。更新笔记、标签、集合、成员关系和条目上的标签时，调用 `persistItem`、`persistTag`、`persistCollection`、`addItemCollection`、`removeItemCollection`、`tagItem`、`untagItem` 之前会再读一次磁盘版本。版本已经变了就返回同一个 `conflictError`，不把旧快照写下去。这些函数进入之后、真正落盘之前仍会 await；要关上那段窗口需要改 afs。

写操作必须带 `operationId`。占位发生在 await 写入之前。同一会话、同一 `operationId`、同一规范化 JSON（键排序）若第一次还在进行，第二次等待它的结果，不开始另一次写入；完成后重放第一次的结果，不创建第二个对象。同一 `operationId` 换正文是 `conflictError`，不写，也不替换进行中的占位。成功之后从磁盘读回。创建、更新、成员变更和已确认删除都会发送 `asideItemsDidChange`：对象是 UUID 时打开的行可以 patch，接着再发一次 `object` 为 `nil`，让列表、当前页和打开的集合重新加载。笔记另发 `AUPItemDetailCanvasContentDidChange`，成员关系另发 `AUPItemDetailMembershipDidChange`。

`batch` 的 HTTP 状态是 200。有失败项时 `ok` 为 false、`partial` 为 true。失败项留在 `results` 里，成功项保持成功。嵌套的 `delete`、`confirm`、`batch` 是校验失败，不会删除。

活动经过已有的 `reportActivity(sessionID:phase:summary:)`。读是 `reading` 然后 `completed`，写是 `mutating` 然后 `completed`，失败是 `failed`。摘要是固定短句，例如 `read item`、`save note`、`delete pending`、`replay`、`conflict`、`failed`。不含模型推理、正文、附件字节或凭证。

### 删除确认

电脑请求永久删除不会删除。它记下一条待确认，绑定 session ID、operation ID、object IDs 和 count，60 秒后过期。响应 `pending: true`、`confirm: "phone"`。

网络上的 `confirm` / `confirmDelete` 与 `POST /agent/v1/allow` 一样，返回 501 `aside.agent.allow`。电脑不能在 HTTP 上满足这次确认。

进程内由以后的手机 UI 调用：

- `AsideAFSService.confirmAgentDelete(sessionID:operationID:objectIDs:count:)`
- `AsideAFSService.cancelAgentDelete(sessionID:operationID:)`

绑定必须与待确认完全一致，才会删除那些对象（`UserSpaceDocumentWriter.deleteItem`）。对象、数量、会话或 operation 不同则不删除，原来的待确认还在。取消、超时（`forbiddenError` / `expired`）或会话撤销、停止（`forbiddenError` / `revoked`）都不删除。普通非破坏性编辑不需要这次确认。

## 宿主接线

`AsideAFSService` 持有会话门：

- `onAppBackground()` → `beginBackgroundGrace()`，并 `beginBackgroundTask(withName: "aside-agent-listener")`。系统到期回调只结束这个任务，不撤销凭证
- `onAppForeground()` → 先结束上述任务，再 `noteReturnedToForeground()`，不调用 `start()`
- 宽限是 `AgentLANContract.backgroundGrace`，180 秒。再次进入后台不会把还没结束的宽限往后推。锁屏、结束、断网、资料库或账号切换会取消宽限，避免稍后的计时改写 `interruptReason`
- 资料库目录真正变化之前 → `stopForLibrarySwitch()`
- `stopAgentSessionsForScreenLock()`：`AsideApp` 在 `protectedDataWillBecomeUnavailableNotification` 时调用。短暂 `inactive`（例如权限弹窗）不停止
- `stopAgentSessionsForAccountSwitch()`：`HostDiskSession` 在切换磁盘和登出时调用

#2286 通过 `AsideAFSService` 调用，不直接碰会话门：

- `startAgentSessions()` → `start()`
- `stopAllAgentSessions()` → `stopAll()`
- `revokeAgentSession(sessionID:)` → `revoke(sessionID:)`
- `agentSessionEvents` / `agentSessionState` 是当前事件和终端状态
- `confirmAgentDelete` / `cancelAgentDelete` 只在进程内结束删除确认。服务初始化时安装内容挂载，不调用 `start()`

回到前台只调用 `noteReturnedToForeground()`，不调用 `startAgentSessions()`。离开终端页不调用 `stopAll()`。最后一个有效会话撤销后回到 `waiting`，监听保持，直到用户结束、锁屏、离开大约三分钟，或宿主打断。
