# 云端交代目录

`scripts/aside-cloud.mjs` 是唯一的客户端。它请求 `https://www.aside.sh`。`https://aside.sh` 会 301 到 www，POST 不会跟着跳转。

授权是 OAuth 设备码，scope 只有 `mcp`。用户在浏览器里以账号 owner 批准。成功后的访问密钥以 `blocklet-` 开头，写在 `~/.aside-agent/mcp-token`，权限 `0600`。脚本自己读这个文件。

安装记录在 `~/.aside-agent/installation.json`。`installationId` 是 `agt-` 加 UUID，`name` 默认 `Aside agent`。脚本会尝试把同一份写到 `/user/agent/installations/<installationId>.json`。写不上时扫描仍可继续。

## 未完成的交代

线程在 `/user/agent/threads/<threadId>/`。

| 文件 | 含义 |
| --- | --- |
| `requests/<requestId>.json` | 一条交代 |
| `artifacts/<artifactId>.json` | 成果头 |
| `artifacts/<artifactId>.body.json` | 成果正文 |
| `/user/agent/tombstones/<threadId>.json` | 墓碑 |

`artifactId` 是把 `requestId` 的 `req-` 换成 `art-`。以 `.body.json` 结尾的文件不是头。墓碑的内容包含这个 `threadId` 时，整条线程跳过。一条请求没有对应的头，并且线程没有墓碑，才是未完成。

`list` 只打印 `submittedAt` 最早的一条。时间相同再比 `requestId`。一次回复这一条，`requestIds` 只有这一个 id。D1 错误不是未完成，脚本打印 `UNCHECKED`。

## 请求

请求 JSON 含有 `instruction`、`requestId`、`threadId`、`submittedAt` 和 `source`。

| `source.type` | 内容 | 回复前 |
| --- | --- | --- |
| `none` | 只有 `{"type":"none"}` | 按 `instruction` 做 |
| `item` | `type`、`id`、`label` | `node SCRIPT read --item <id>` |
| `collection` | `type`、`id`、`label` | `node SCRIPT read --collection <id>` |
| `share` | `type`、`label` | 把 `label` 当上下文，没有资料库文件 |

`--collection` 和 `--item` 同时接受内部 id 和 slug。`8a82d3e4-e44c-4d6b-8151-df757556a37a` 与 `家庭菜谱--8a82d3e4` 打开同一条集合。集合结果里有文件路径，以及其中条目的路径和标题。要某一条的正文，再用 `read --item` 传它的 id 或 slug，或 `read --path` 刚才列出的路径。

`read` 打印 `NOT_FOUND` 时，说明这份资料没有打开。不要编它的正文。打印 `UNCHECKED` 时这一轮不要回复。`read --path` 只接受 `/user/items/`、`/user/collections/` 和 `/user/agent/threads/` 下面的路径。

事实以你打开过的页面为准。说清楚哪一段来自资料库，哪一段来自打开的页面。页面打不开时，用你的理解把交代做完，并说明这一页没有打开。

## 正文

你提供标题、摘要和 body 文件。脚本写成果头，不要自己拼头。头不超过 2048 字节，正文不超过 100000 字节。`recommendations` 固定是空数组。头里没有 `effects`。

标题 1 到 80 个字，摘要 1 到 240 个字。字按 Unicode 码位计。

body 文件就是 `noteDocument`，不要再包一层：

```json
{
  "version": 1,
  "blocks": [
    { "text": { "_0": "句子。" } },
    {
      "attachment": {
        "_0": { "kind": "link", "title": "页面名", "url": "https://example.com/page" }
      }
    }
  ]
}
```

文字块只有句子，里面不要出现 `http://` 或 `https://`。链接块只有 `kind`、`title`、`url`，`title` 是 1 到 80 个字。只引用你打开过的页面，或这条资料里已经有的 URL。不要写 image、audio、video、file、location、weather。

用交代的语言写。头已经存在就不覆盖。头在、正文不在时，脚本只补正文，`artifactId` 不变。
