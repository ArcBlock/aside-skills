> 这是给 Agent 读的协议副本。工程原文在 [ArcBlock/aside](https://github.com/ArcBlock/aside) 的 `design/aside-agent-mode/PROTOCOL.md`。两边可以不一致。手机当前这一版接受什么，以连接后的 `capabilities` 为准。

# 前台连接协议与逐会话授权

2026-10-13 · #2289。给 #2290（内容投影）、#2286（iOS 终端页）、#2291（电脑 Skill）的契约。视觉与页面以 [HANDOFF](HANDOFF.md) 为准，本文不改 UI。

实现在 `ios/HostCompose/AgentForegroundSession.swift`。`ios/Aside` 生产 Swift 仍是 6 个文件；`AsideAFSService` 只负责在前后台、锁屏和资料库/账号切换时调用它。默认构造会打开真实 TCP 监听；进程内 `AgentLANClient` 覆盖授权状态机。两者都不是真机联调。

## 决定

- 不使用 `AFSHTTPServer` 的单个 `authToken`。那个 Bearer 是进程级的，撤销不了单独一个会话，也会把整个 AFS 树带出去。
- 不导出 `/user`、`/dev`、`/kv`、`/afs`。装上内容投影之后，`POST /rpc` 只提供当前登录库：客户端的 `/` 对应手机 AFS 的 `/user`，返回路径去掉 `/user` 前缀。配对、领取和探针仍走 `/agent/v1`。`delete`、`rename`、`write` 不落盘。笔记、标签、集合、成员、发布集合和待确认删除走 `exec /.actions/aside`。发布集合是登录凭证加上远程声明，不是本地文件写入。
- 不恢复 `LocalAFSDebugHTTPServer`、`ensureDebugHTTPServer`、`startDebugHTTPServer`。
- 发现载荷只在监听期间存在。它是以后 `_aside-agent._tcp` TXT 要逐字携带的连接元数据。`AsideAFSService` 使用的默认监听器绑定 IPv4 `INADDR_ANY`（`0.0.0.0`）的临时端口，发现载荷带 `port`，`transport` 为 `tcp`。测试可以注入不打开套接字的工厂，那种发现载荷没有 `port`，`transport` 为 `in-process`。
- v1 是 cleartext TCP（明文，不实现 TLS）。监听期间手机会注册 Bonjour `_aside-agent._tcp`。电脑只浏览这一个服务类型。只有一台时直接连接，多台时由用户选中后再连接。不扫描网段，也不探测其它端口。页面只显示服务名，不显示 `host:port`。离开终端页不停止监听。短暂离开前台大约三分钟内套接字保持。超过大约三分钟、锁屏或断网通知会先停套接字，授权还在，回到前台会重新打开。结束连接和确认断开会撤销。资料库或账号切换不停监听，也不撤销。Wi-Fi 不是信任。配对码和 Bearer 在撤销之前，对同一局域网上的观察者可见。
- 尚未领取凭证的待配对会话最多 8 个。第 9 次 `pair` 返回 `pairing-limit`，并且不创建会话。
- 每次新会话都要手机允许。没有「已信任设备」名单。已经允许的凭证放在钥匙串里，直到用户断开这一条、拒绝，或结束全部连接。杀掉进程之后，工具名、电脑名、最近一条状态和凭证都还在。没有时钟过期。
- 配对码 60 秒、6 位、加密随机、单次使用。生产代码里没有固定演示码。允许之后连续 5 次错误即作废。
- 会话凭证在 `claim` 成功时签发，32 字节、base64url。没有时钟过期，空闲再久仍然可以通过。结束全部连接、用户确认断开这一条、或拒绝会立刻撤销。锁屏、离开前台大约三分钟、断网通知只停套接字，不撤销，也不清空已保存的行。资料库或账号切换不停、不撤销。挂上的目录还不是当前磁盘时，内容和 RPC 返回 `library-changing`（不是 `revoked`，也不是 `expired`），不读不写上一份库，也不把新账号盖到旧数据上。同一份凭证的 probe 仍然通过。目录对齐之后，probe、capabilities、内容或 RPC 带上手机当前打开的账号：给人看的名字，加上 `HostDiskSession` 的 `stableID`。读写落在现在挂上的库。电脑不能另选账号。监听开着时手机会保持屏幕常亮。用户仍然可以锁屏；锁屏只停套接字。同一台电脑、同一个工具再配对时，上一场还活着的会话会被收起，页面上只留新的这一条。另一台电脑或另一个工具仍是独立会话。
- 手机允许/拒绝只存在于服务 API。网络上的 `/agent/v1/allow` 固定拒绝。
- 回到前台调用 `noteReturnedToForeground()`。还有已允许的凭证且监听已停时，这个方法自己重新 `start()`。服务的 `onAppForeground()` 不写 `.start(`。进程被杀掉之后同样如此，不需要新的配对码。
- 错误复用 `AFSError`（`forbiddenError`、`conflictError`、`runtimeError`、`unsupported`、`notFound`、`validationError`）。线上整数复用 `AFSWireErrorCode`，不另造错误类型。

## 终端状态

`closed`、`starting`、`waiting`、`active`、`ended`、`interrupted`、`failed`。

| 状态 | 行为 |
| --- | --- |
| `closed` | 初始。不监听，没有发现载荷。进程重启后已保存的授权还在，但要等监听重新打开才接受探针 |
| `starting` | `start()` 已进入，绑定尚未完成。发现和探针都拒绝，不宣称就绪 |
| `waiting` | 正在监听，没有有效授权会话。可以发现和配对 |
| `active` | 至少一个有效授权会话。手机已允许、未断开、凭证未撤销（尚未 `claim` 也算已授权）。没有时钟把 `state` 送回 `waiting` |
| `ended` | `stopAll()`。全部凭证撤销，监听停止。必须再次 `start()` 并重新配对 |
| `interrupted` | 离开前台超过大约三分钟、锁屏或网络。`interruptReason` 保留第一次原因。资料库或账号切换不会进入这里。授权还在。回到前台如果还有授权会重新打开监听 |
| `failed` | 监听工厂抛错，例如本地网络权限被拒绝。`lastFailure` 是真实原因。再次 `start()` 即重试 |

`noteReturnedToForeground()` 在宽限内只取消计时，不改变监听。宽限已过则先按后台暂停套接字，不撤销。然后如果状态不是 `ended`、监听已停、并且还有已允许的凭证，就调用 `start()`。`start()` 在 `waiting` 或 `active` 且已经在听时不会重绑，避免换掉 `instanceId`。绑定完成前如果已经进入 `interrupted` / `ended`，返回的句柄会被 `stop`，监听不会留下来。

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
  "scope": ["aside.agent.probe"]
}
```

允许之前的 `claim` 一律是 `not-allowed`，不透露码对不对，也不消耗尝试次数。码过期是 `pairing-expired`。允许后的错误码是 `pairing-invalid`；第五次错误或成功后再用是 `pairing-used`。拒绝后是 `denied`。`claim` 成功体没有 `expiresAt`。凭证没有时钟过期。

## 探针

这不是资料库。`/agent/v1/probe` 只认 `Authorization: Bearer <credential>`。查询字符串里的 token 无效。

```json
{
  "ok": true,
  "sessionId": "6f0c1d2e-3a4b-5c6d-7e8f-901234567890",
  "scope": ["aside.agent.probe"],
  "protocol": "aside-agent",
  "version": 1,
  "account": {
    "name": "本机",
    "id": "local"
  }
}
```

成功体是这六个键。`account.name` 是手机当前打开账号的显示名，`account.id` 是 `HostDiskSession` 当前磁盘的 `stableID`。客户端送来的账号字段会被忽略。不含凭证和收藏。未授权或已撤销会拒绝。空闲再久仍然可以通过，因为这份凭证没有时钟过期。撤销 A 不影响 B。`stopAll()` 之后，新请求先得到「监听未接受」；再次 `start()` 之后，被撤销的旧凭证仍是 `revoked`，新的允许会话可以通过。只暂停套接字（锁屏、离开较久、断网）不撤销；监听重新打开后，同一份凭证可以通过。

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
| 凭证没有时钟过期 | — | — | 空闲再久仍可通过。`expired` 留给删除确认超时，不用于这份凭证 | — |
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

`POST /agent/v1/content` 仍在。凭证与探针相同：缺少 Bearer 是 HTTP 401 `forbiddenError` / `unauthorized`；撤销是 HTTP 403，`reason` 为 `revoked`。没有时钟过期。挂上的目录还不是当前磁盘时是 HTTP 403，`reason` 为 `library-changing`，正文不含上一份库，也不盖上新账号。成功的内容 JSON 带 `account`（`name` 与 `id`）。未安装挂载仍是 HTTP 501 `aside.agent.content`。`/user`、`/dev`、`/kv`、`/afs` 仍是 HTTP 501 `aside.agent.export`。发现载荷仍只有上一节的连接键。

装上内容投影后，同一条监听另答 `POST /rpc`。这是 AFS HTTP RPC：正文 `{ method, args }`，`args` 是数组。成功是 `{ success: true, data }`。失败是 `{ success: false, error: { code, message } }`，`code` 用 CLI 的 1 找不到、2 拒绝、3 冲突、5 运行时、6 未授权。缺少 Bearer 是 HTTP 401，`reason` 为 `unauthorized`。撤销是 HTTP 403，`reason` 为 `revoked`。没有时钟过期。挂上的目录还不是当前磁盘时是 HTTP 403，`reason` 为 `library-changing`，不是 HTTP 200，因此不会盖上 `account`。HTTP 200 的成功体也带上外层 `account`。未安装投影时 `POST /rpc` 仍是 HTTP 501 `aside.agent.export`。进程内同步 `accept` 不打开 `/rpc`，TCP 监听走 `respond`。

客户端路径 `/` 映射到手机 `/user`，`/items/...` 映射到 `/user/items/...`。返回条目的路径去掉 `/user`。`..`、`/dev`、`/kv`、`/afs`，以及会再套一层的 `/user`，都拒绝，且不返回库正文。`list`、`read`、`stat`、`search`、`explain` 读这个库。`delete`、`rename`、`write` 返回拒绝，不删除、不改文件。`exec /.actions/aside` 把参数交给上面的内容动作，所以删除仍只登记手机确认。`GET /rpc` 和其他路径不提供订阅，也不导出整棵树。没有第二条 HTTP 服务。

电脑 skill 不另写 HTTP 客户端。配对、领取和探针仍走 `/agent/v1`。库挂到 `/aside` 之后，条目搜索是 `arc afs search /aside/items`（或 `/aside`），也就是这里的 RPC `search`。`/items` 与库根走 #2369 的资料库索引。没给 `limit` 时一页 500 条。传入的 `limit` 钳在 1...500，`0` 会变成 1。`cursor` 是十进制非负偏移，缺省从 0 开始；空字符串也是 0。还有下一页时成功体带 `meta`：`cursor` 是下一页偏移，`hasMore` 为 true。已经走完时不带 `meta`。越过末尾是空的 `data`，不是校验错误。`abc`、负数、带小数的 cursor 是 `invalid agent request`（HTTP 200，`code` 5）。空查询也先校验 cursor。集合和标签不是这份索引，没有这个 cursor。空查询是空页。电脑上翻页是 `arc afs search <path> <query> --limit <n> --cursor <meta.cursor> --json`。两个参数都不传时，请求与以前相同。`arc afs search` 聚合后的 JSON 带 `meta`，不带手机 RPC 体上的 `total`。写操作是 `arc afs exec /aside/.actions/aside`。不要调用 `/.actions/query`。

v1 仍是明文 TCP，不实现 TLS。监听期间注册 Bonjour，TXT 等于发现对象，不追加密钥。监听仍是 IPv4 `INADDR_ANY`，待配对上限仍是 8。本接口会把条目正文和附件字节放进响应。凭证有效的那段时间里，同一局域网上的观察者可以读到这些字节。这是残留，不是另开一条加密通道。监听线程等待响应，写入在主演员上 await 既有库函数。请求正文上限是 32MB。更大的 `Content-Length` 在读正文之前拒绝，响应是 `invalid agent request`。没有第二条 HTTP 服务。

`AsideAFSService` 在 `self` 存在后安装一次。挂载闭包指向当前的 `userSpaceFolder` 和已经挂上的 `afs`，也就是应用正在用的 `/user` 库。安装本身不调用 `start()`。

正文是 JSON。`action`：

| `action` | 行为 | 既有函数 |
| --- | --- | --- |
| `capabilities` | `items` / `collections` / `tags` 目录是否存在，加上 `/.meta` 里路径恰好为 `/user` 的 operations。另有 `note.kind`、`note.blocks` 和 `publish`。`publish.ready` 为真才表示当前有登录凭证。凭证为空时 `publish.ready` 为假、`publish.reason` 为 `arc-space`，不论 `account.name` 是「本机」还是 DID。响应不含凭证。不倾倒正文，也不列出 `/dev` 或 `/kv` | `AFS.read("/.meta")`、`HostLoginToken.persisted()` |
| `list` | 分页列出。`resource` 为 `items`、`collections` 或 `tags` | `UserSpaceDocumentReader.listItems` / `listCollections` / `listTags` |
| `query`、`search` | `items` 走资料库索引，不先列出再做子串。前缀是 `tag:`、`collection:`、`type:`、`link:` / `site:`、`after:` / `before:`、`status:archived`。默认排除已归档，`status:archived` 才包括它们。空查询或纯空白是空页。只有前缀、没有关键字也会查索引。`collections` 和 `tags` 仍是名称子串（集合再加描述），按 id 排序，空查询是空页。返回仍是 `id`、`title`、`type`、`resourceVersion`，没有正文。电脑上的条目搜索不走这个 action，走上面的 `arc afs search` | `LibrarySearchIndex`（items）；名称子串（collections、tags） |
| `read` | 读一条。返回 `resourceVersion`。笔记的 `text` 原样读回。有 Quick Note 时另返回 `noteKind` 与不含字节的 `noteBlocks`。有 `content.type`、地点或日历时一并读回。文章正文只从该条目自己的 `content.md` 载入 `markdown`，不接受调用方给的路径。`cover` 指向素材根下的普通文件时返回 `coverBase64` 与 `coverByteCount`。符号链接或逃出素材根的路径不返回字节 | `item(id:folder:)`、`collection(id:folder:)`、`listTags(folder:)` |
| `readAttachment` | `contentBase64` 与 `byteCount`。只接受该条目 `attachments` 目录里的普通文件。符号链接（包括中间目录）、`.did-space/space.db`、附件目录外的文件都是 HTTP 403 `forbiddenError` / `attachment`。`lstat` 拒绝链接，`open(O_NOFOLLOW)` 不跟随最后一级。手机本地路径不是成功 | 清单上的相对路径，读文件字节 |
| `createNote` | 保存一条 Quick Note。只有 `text` 时是一段文字。有 `blocks` 时以块为准，种类是 text、image、link、location、audio、file、video，不收 weather。新的侧车字节在 `contentBase64`。已经在别的条目上的图片、音频、文件、视频不传字节：块上写 `sourceItemId` 和 `resourceId`。手机把该条目附件目录里的普通文件复制进新笔记自己的 `assets/<slug>/attachments/`，分配新的 `resourceId`。笔记不保存 `sourceItemId`。来源文件保持不动。符号链接和目录外路径按 `readAttachment` 拒绝，并且不创建笔记。返回 `noteKind` 与不含字节的 `noteBlocks` | `UserSpaceDocumentWriter.createItem` |
| `updateNote` | 带当前 `resourceVersion` 才写。只给 `text` 时文档收成一段文字。给 `blocks` 时整篇替换。这篇笔记上已有的侧车可只带 `resourceId`。带 `sourceItemId` 时按 `createNote` 复制成这条笔记自己的新文件 | `UserSpaceDocumentWriter.persistItem` |
| `createItem` | 新建一条资料库条目，不是 Quick Note。只有这次 `capabilities` 的 `actions` 含有它才调用。`type` 是 `link`、`text`、`image`、`photos`、`file`、`contact`、`calendarEvent`、`place`。`note` 仍走 `createNote`。`link` 要有 `url` 和 `title`，可以带 `notes` 和 `contentType`（写入 `content.type`，必须是已有的 ContentType；缺省按 URL 识别）。`place` 要有标题和经纬度，地址可选。`image` 正好一张图，`photos` 一到九张，`file` 一个文件。新字节在 `contentBase64` 加无路径的 `filename`；已经在库里的附件不传字节，写 `sourceItemId` 和 `resourceId`。手机把来源附件目录里的普通文件复制进新条目自己的 `assets/<slug>/attachments/`，分配新的 `resourceId`，不保存 `sourceItemId`。大小沿用笔记附件限制。`text` 要有 `text`。`contact` 要有标题，正文是已有 vCard，或由电话、邮箱、组织、地址拼成 App 已保存的 `Tel:` / `Email:` 行。`calendarEvent` 要有标题、`startsAt`、`endsAt`，时区缺省为手机当前时区。可选 `collectionId`，集合必须已经存在，成员写在这条自己的 `collectionIds`。成功读回的 `resourceVersion` 是条目 JSON 字节的 SHA-256。`type: note` 拒绝，不创建。删除仍只登记手机确认 | `UserSpaceDocumentWriter.createItem` |
| `ensureTag` | 按名称确保标签。只建标签，不挂到 item | `UserSpaceDocumentWriter.ensureTag(named:)` |
| `updateTag` | 改名并保留 slug | `UserSpaceDocumentWriter.persistTag` |
| `setItemTag` | `member` 为真则挂上，为假则拿下。`slug` 对上系统标签目录时写入该目录的固定 id，不创建同名用户标签；分组规则在下面的「模板集合」。对不上目录时仍用 `name` 按名称确保用户标签。带当前 `resourceVersion`。已经挂上再挂一次不会重复 | `addItemTag` / `removeItemTag`（系统标签）；`tagItem` / `untagItem`（用户标签） |
| `createCollection`、`updateCollection` | 新建或改名，并可写说明和模板。请求字段是 `description`，`descriptionText` 与 `desc` 同样接受，存成 `descriptionText`。更新时不传说明就保留原来的；空白或 null 会清掉。改名保留 slug。`kind` 见「模板集合」。读回的 `description` 为空，说明这次没有写上。读回的 `kind` 仍是 `collection`，说明模板没有写上 | `UserSpaceDocumentWriter.persistCollection` |
| `setMembership` | `member` 为真则加入，否则移出 | `addItemCollection` / `removeItemCollection` |
| `publishCollection` | 把一个已经存在的集合按发布页的同一份计划声明出去。只有这次 `capabilities` 的 `actions` 含有它，并且 `publish.ready` 为真，才调用。凭证为空时 HTTP 403 `forbiddenError` / `arc-space`，不访问网络。`collectionId` 必须是已有集合。`visibility` 是 `public` 或 `unlisted`，`comments` 是 `off`、`open` 或 `locked`，`author` 是 `off` 或 `on`，`view` 是 `masonry`、`list` 或 `timeline`。不认识的值拒绝，不发布。`locked` 只在线上已经锁定时可以原样留下，不能改开或改关。缺省的项保持已发布记录；没有记录时用发布页默认：公开、评论关、不显示作者、瀑布流。成功返回 `url` 以及实际发出的 `visibility`、`comments`、`author`、`view`。不把整棵 `/dev` 交出去 | `CollectionPublishSheet.loadSeed`、`CollectionPublishSheet.perform` |
| `delete` | 只登记待确认，不删除 | 无删除 |
| `batch` | 逐项执行上面的非删除写操作。不执行下面三个建议动作 | 同上 |
| `readSuggestions` | 读当前建议批次。没有文件时 `status` 为 `none`，有文件但 `suggestions` 为空时为 `empty`，否则为 `snapshot`。`path` 是 `agent/suggestions.json`。不写消耗记录。只有这次 `capabilities` 的 `actions` 含有它才调用 | `AgentSuggestionDisk.readSnapshot` |
| `writeSuggestions` | 用一份快照替换当前批次。必须带 `operationId`。快照放在 `snapshot` 里，或把同样的字段放在动作旁边。`expectedRevision` 是 `snapshot` 的同级，不是快照里的字段。还没有批次时不要传它。已有批次时它必须等于上次读到的 `revision`，且新的 `generatedAt` 不早于已有的。不擦掉消耗记录。规则在「建议批次」 | `AgentSuggestionDisk.writeSnapshot` |
| `readSuggestionConsumes` | 读手机已经点过的 `id@version`。`path` 是 `agent/suggestion-consumes.json`。电脑不能写这个文件 | `AgentSuggestionDisk.readConsumes` |
| `confirm`、`confirmDelete` | 网络上不能确认 | 返回 `aside.agent.allow` |

### 建议批次

这三个动作只在这次 `capabilities` 的 `actions` 里列出时才存在。没有列出时调用是 `invalid agent request`。正式版手机没有它们。不要放进 `batch`。`batch` 不认识这三个名字。

写入和读回的快照：

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 必须是 `1`。别的值是 `unknown schema` |
| `revision` | 去掉空白后非空。空的是 `empty revision`。每次成功的新批次用一个新值 |
| `generatedAt` | ISO8601，例如 `2026-10-28T12:00:00Z`。带小数秒也可以。已有批次时早于旧的 `generatedAt` 是 `older revision` |
| `generatorId` | 要有这个字段。用当前工具名 |
| `suggestions` | 数组。空数组可以写下，`status` 为 `empty`，手机仍显示自带的三句。交给用户看的一批最多 3 条 |
| `expectedRevision` | 与 `snapshot` 同级。没有旧批次时省略；写了非空值是 `revision conflict`。有旧批次时必须等于旧的 `revision`，缺省或对不上也是 `revision conflict` |

每条建议：

| 字段 | 规则 |
| --- | --- |
| `id` | 去掉空白后非空，同一批里不重复。空的是 `bad ref` |
| `version` | 整数，从 `1` 起。小于 `1` 是 `invalid date` |
| `text` | 去掉空白后 1 到 80 个字符，同一批里不重复。空的是 `empty text`，更长是 `text too long`。含 `<` 或 `>` 是 `markup`。这就是点下去发出去的那句话 |
| `locale` | 跟手机界面语言对齐。界面是 `zh`、`zh-Hant`、`ja`、`en` 之一。比较前会把 `_` 换成 `-` 并转成小写。界面没有连字符时，这个语言再加一段后缀也对得上，所以 `zh-Hans` 对得上 `zh`，对不上 `zh-Hant`。`zh-Hant` 必须整段相同 |
| `refs` | 数组，可以是空的。每一项 `type` 去掉空白并小写后只能是 `item` 或 `collection`，`id` 非空，并且是当前资料库里的条目或集合。否则是 `bad ref` 或 `inaccessible ref`。`libraryId` 省略，或等于 `aside-library`。别的非空值是 `cross library` |
| `expiresAt` | ISO8601，必须晚于这条批次的 `generatedAt`。否则是 `invalid date`。打开页面时，不晚于当时的行会被藏起来，所以它也要晚于用户会打开手机的时刻 |

同一批里 `id` 或去掉空白后的 `text` 重复，是 `duplicate`。解码不了、或写操作缺 `operationId`，是 `invalid agent request`。同一个 `operationId` 换了正文，是 `conflictError`。

手机只在还没有对话 id 的新 Agent 对话上显示这些句子：集合的更多菜单、条目的更多菜单，或历史页的加号。首页没有这个入口。按数组顺序取出仍然有效的行，最多 3 条，不补满。语言不对、已到期、引用无效、或这个 `id@version` 已经在消耗记录里，这一行就跳过。一条有效的都没有时，显示三句自带的问题。`status` 为 `none` 或 `empty` 同样不是个性化建议。一份 `snapshot` 也可能因为每一行都被滤掉而仍显示那三句。

点下去之后，手机把那句 `text` 收成这条新对话里等待处理的用户消息，并记下消耗。消耗是 `id`、`@`、`version`。替换 `agent/suggestions.json` 不会删掉 `agent/suggestion-consumes.json`。同一个 `id` 和 `version` 会一直藏着。同一个 `id` 用更大的 `version` 再写，可以再出现。写入本身不因为已经消耗过而拒绝。电脑不写消耗文件，也不替用户点。这条 exec 没有领取等待中的消息、暂存写回或完成一轮对话的动作。

资料库里一条条目都没有时，手机不显示建议按钮。

### 模板集合

`createCollection` 和 `updateCollection` 接受 `kind`。`collectionType` 同样接受，存下去的是磁盘那一列。不传就是普通集合，磁盘上没有 `collectionType`，读回 `kind` 为 `collection`。

| 请求 | 读回 `kind` | 磁盘 `collectionType` | 概览 |
| --- | --- | --- | --- |
| 不传，或 `collection` / `general` | `collection` | 不写 | 没有 |
| `tradeShow`、`event`、`trade-show`、`conference` | `tradeShow` | `event` | 没有。条目只在成员列表 |
| `travel`、`trip` | `travel` | `travel` | 有 |
| `research` | `research` | `research` | 有 |
| `productResearch`、`research-product` | `productResearch` | `research-product` | 没有 |

不认识的 `kind` 是 `invalid agent request`，不创建、不修改。更新时不传 `kind` 就保留原来的类型和 slug。

展会和旅行可以带 `startsAt`、`endsAt`。值是 `yyyy-MM-dd`，也接受 ISO8601。读回是手机本地日历上的 `yyyy-MM-dd`。结束早于开始会拒绝。地点是 `locationName`、`locationAddress`、`latitude`、`longitude`。经纬度要成对。更新时不传就保留；空白或 null 清掉那一项。研究、产品研究和普通集合带上日期或地点会拒绝。展会、旅行、研究和产品研究在创建时 `captureStatus` 为 `active`。普通集合保持 `inactive`。改成普通集合不会清掉已经写下的日期。

概览分组比较的是系统标签目录里的固定 UUID，不是标签显示名。`setItemTag` 用 `slug`。下表的英文名、中文名和 protocolName 也能对上唯一的一条。对上之后挂的是目录 id，不会再建一个同名用户标签。`name` 对上不止一条（例如 `Notes`）会拒绝。`slug` 不在目录里会拒绝，不会当成新标签名。用户自己的标签仍然用 `name`，对不上目录时才会创建。

研究来源是单选。挂上一个来源会拿下其他 `research-*` 来源。旅行标签可以同时有多个。

`travel-place` 和 `travel-visited` 只接受已经有经纬度的 `place`。挂上 `travel-visited` 时会同时挂上 `travel-place`。拿下 `travel-place` 时会同时拿下 `travel-visited`。否则这一条会进旅行概览的冲突，而不是地图。

| 集合 | 概览行 | `slug` |
| --- | --- | --- |
| 旅行 | 照片 | 条目类型是 `image` 或 `photos`。`travel-photo` 可写，不写也会进这一行 |
| 旅行 | 吃喝 | `travel-food` |
| 旅行 | 攻略 | `travel-guide` |
| 旅行 | 预订 | `travel-stay` 或 `travel-ticket` |
| 旅行 | 随记 | `travel-note` |
| 旅行 | 地图上的去过 | `place`，并且同时有 `travel-place` 和 `travel-visited` |
| 旅行 | 没有这一行 | `travel-route` 只算已归类，概览不单列 |
| 研究 | 论文 | `research-paper` |
| 研究 | 博客和网站 | `research-blog` 或 `research-website` |
| 研究 | 社交 | `research-social` |
| 研究 | 视频 | `research-video` |
| 研究 | 笔记 | `research-note` |
| 研究 | 没有这一行 | `research-app-store` |

成员用 `setMembership`，或 `createItem` 的 `collectionId`。标签不代替成员。没有合适 slug 的条目可以只进集合，它们留在未分组，不要为了填满去打别的系统标签。展会没有上面这些行。

`cursor` 是十进制偏移，缺省从 0 开始。`limit` 缺省 50，钳在 1...100。不带 query 的 list 仍按 id 排序。items 的搜索顺序是索引顺序：精确 URL，精确标题，标题前缀，然后 bm25，然后 createdAt 降序。`nextCursor` 在还有剩余时给出。走完每一页不会漏。空库合法。列表项只有 `id`、`title`、`type`、`resourceVersion`。这组 `cursor`、`nextCursor` 和 1...100 的 `limit` 只属于内容动作 `list`。电脑上的条目搜索是上一节的 `arc afs search`。

`resourceVersion` 是该 JSON 文件字节的 SHA-256 十六进制。它不是 schema `version`，也不是秒级 `updatedAt`。更新时不一致返回 `conflictError`（HTTP 409，`wireCode` 3），`currentCid` 是当前文件哈希，不会静默覆盖。匹配才写入。更新笔记、标签、集合、成员关系和条目上的标签时，调用 `persistItem`、`persistTag`、`persistCollection`、`addItemCollection`、`removeItemCollection`、`tagItem`、`untagItem`、`addItemTag`、`removeItemTag` 之前会再读一次磁盘版本。版本已经变了就返回同一个 `conflictError`，不把旧快照写下去。这些函数进入之后、真正落盘之前仍会 await；要关上那段窗口需要改 afs。

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
- `onAppForeground()` → 先结束上述任务，再 `noteReturnedToForeground()`。这个方法在还有授权且监听已停时自己重新打开。服务里不写 `.start(`
- 宽限是 `AgentLANContract.backgroundGrace`，180 秒。再次进入后台不会把还没结束的宽限往后推。锁屏、结束、断网会取消宽限。资料库或账号切换不取消授权，也不改 `interruptReason`
- 资料库目录真正变化之前 → `stopForLibrarySwitch()`。这个调用不停监听、不撤销。目录还没对齐时内容和 RPC 是 `library-changing`。对齐之后，下一次响应使用现在挂上的库和当前账号
- `stopAgentSessionsForScreenLock()`：`AsideApp` 在 `protectedDataWillBecomeUnavailableNotification` 时调用。它暂停套接字，不撤销。短暂 `inactive`（例如权限弹窗）不停止
- `stopAgentSessionsForAccountSwitch()`：`HostDiskSession` 在切换磁盘和登出时调用。它不停监听、不撤销。目录还没换成当前磁盘时内容和 RPC 是 `library-changing`。对齐之后，下一次响应使用切换后的账号

#2286 通过 `AsideAFSService` 调用，不直接碰会话门：

- `startAgentSessions()` → `start()`
- `stopAllAgentSessions()` → `stopAll()`
- `revokeAgentSession(sessionID:)` → `revoke(sessionID:)`
- `agentSessionEvents` / `agentSessionState` 是当前事件和终端状态
- `confirmAgentDelete` / `cancelAgentDelete` 只在进程内结束删除确认。服务初始化时安装内容挂载，不调用 `start()`

回到前台只调用 `noteReturnedToForeground()`，不在服务里调用 `startAgentSessions()`。那个方法自己在还有授权时重新打开监听。离开终端页不调用 `stopAll()`。最后一个有效会话撤销后回到 `waiting`，监听保持，直到用户结束连接或确认断开。锁屏或离开大约三分钟只暂停套接字。
