import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ASIDE_MOUNT_PATH,
  AsideAgentClient,
  assertBase,
  assertDiscovery,
  blockedContentAction,
  mountLibrary,
  mountURI,
  parseBrowse,
  parseResolve,
  privateNetworkMountFailure,
  redact,
  stableMachineId,
  unescapeDnsSd,
  unmountLibrary,
} from "./client.mjs";

const skillDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(skillDir, "..");
const scratch = path.join(os.tmpdir(), "aside-agent-skill");
const demoCode = ["482", "617"].join("");
const spacedDemo = ["482", "617"].join(" ");

function readSkillFiles() {
  const files = [
    path.join(skillRoot, "SKILL.md"),
    ...fs.readdirSync(path.join(skillRoot, "references"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join(skillRoot, "references", name)),
    ...fs.readdirSync(skillDir)
      .filter((name) => name.endsWith(".mjs"))
      .map((name) => path.join(skillDir, name)),
  ];
  return files.map((file) => ({
    name: path.relative(skillRoot, file),
    text: fs.readFileSync(file, "utf8"),
  }));
}

test("skill text has no sample bearer or demo code", () => {
  for (const file of readSkillFiles()) {
    assert.equal(file.text.includes(demoCode), false, file.name);
    assert.equal(file.text.includes(spacedDemo), false, file.name);
    assert.doesNotMatch(file.text, /Bearer [A-Za-z0-9_-]{16,}/, file.name);
  }
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.match(skill, /_aside-agent\._tcp/);
  assert.match(skill, /browse/);
  assert.match(skill, /不要扫描/);
  assert.match(skill, /明文/);
  assert.match(skill, /云端/);
  assert.match(skill, /只有一台/);
  assert.match(skill, /写笔记就是创建 Quick Note/);
  assert.match(skill, /blocks-file/);
  assert.match(skill, /图片/);
  assert.match(skill, /链接/);
  assert.match(skill, /地点/);
  assert.match(skill, /音频/);
  assert.match(skill, /文件/);
  assert.match(skill, /视频/);
  assert.match(skill, /不接收天气/);
  assert.match(skill, /已有凭证/);
  assert.match(skill, /端口每次/);
  assert.match(skill, /revoked/);
  assert.match(skill, /denied|拒绝/);
  assert.match(skill, /account/);
  assert.match(skill, /断开/);
  assert.match(skill, /library-changing/);
  assert.match(skill, /同一份/);
  assert.doesNotMatch(skill, /15 分钟后过期/);
  assert.doesNotMatch(skill, /锁屏后结束/);
  assert.doesNotMatch(skill, /也要确认/);
  assert.doesNotMatch(skill, /不要自己挑第一台就配对/);
});

test("omitted device id stays the same for this computer", () => {
  const file = path.join(scratch, "machine-id");
  fs.rmSync(file, { force: true });
  const first = stableMachineId(file);
  const second = stableMachineId(file);
  assert.equal(first, second);
  assert.match(first, /^mac-[a-f0-9]{32}$/);
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.match(skill, /不要自己写 `--device-id`/);
});

test("browse parses one Bonjour service and does not keep a removed name", () => {
  const listed = [
    "Browsing for _aside-agent._tcp.local.",
    "14:00:00.000  Add        2  14 local.               _aside-agent._tcp.   Aside · iPhone · ab12",
    "14:00:01.000  Add        2  15 local.               _aside-agent._tcp.   Aside · iPhone · ab12",
    "14:00:02.000  Add        2  14 local.               _aside-agent._tcp.   Aside · Other · cd34",
    "14:00:03.000  Add        2  15 local.               _aside-agent._tcp.   Aside · Other · cd34",
    "14:00:04.000  Rmv        0  14 local.               _aside-agent._tcp.   Aside · Other · cd34",
  ].join("\n");
  assert.deepEqual(parseBrowse(listed), ["Aside · Other · cd34", "Aside · iPhone · ab12"]);
  assert.deepEqual(parseBrowse("no services\n"), []);
  assert.equal(unescapeDnsSd("Nates-iPhone\\032.local."), "Nates-iPhone .local.");
  assert.deepEqual(
    parseResolve("Aside\\032·\\032iPhone._aside-agent._tcp.local. can be reached at Nates-iPhone.local.:53123 (interface 14)"),
    { host: "Nates-iPhone.local", port: 53123, base: "http://Nates-iPhone.local:53123" },
  );
  assert.equal(parseResolve("can be reached at 192.168.0.0/24:1"), null);
  assert.equal(parseResolve("not a result"), null);
});

test("arc private-network failures stay on the discovered address", () => {
  const hostname = [
    "Mount verification failed: could not reach provider at http://phone.local:9?allowPrivateNetwork=true.",
    "hostname phone.local resolves to fe80::1 — IPv6 link-local (fe80::/10)",
  ].join(" ");
  const literal = "Mount verification failed (provider creation): URL http://192.168.0.2:9 is blocked — private network (192.168.0.0/16)";
  assert.equal(privateNetworkMountFailure(hostname), true);
  assert.equal(privateNetworkMountFailure(literal), true);
  assert.equal(privateNetworkMountFailure("arc service start failed"), false);
});

test("one typed address is required and phone-only actions are not sent", async () => {
  assert.throws(() => assertBase("https://192.168.1.8:80"), /明文/);
  assert.throws(() => assertBase("http://192.168.1.8"), /端口/);
  assert.throws(() => assertBase("http://192.168.0.0/24"), /路径|网段/);
  assert.throws(() => assertBase("http://192.168.1.8:80,http://192.168.1.9:80"), /一个地址/);
  assert.equal(assertBase("192.168.1.8:53123").href, "http://192.168.1.8:53123/");
  assert.equal(assertBase("http://192.168.1.8:53123").href, "http://192.168.1.8:53123/");
  assert.doesNotThrow(() => assertBase("http://127.0.0.1:9"));
  assert.throws(() => assertDiscovery({ protocol: "aside-agent", version: 2 }), /版本/);
  assert.equal(blockedContentAction("confirm"), true);
  assert.equal(blockedContentAction("confirmDelete"), true);
  assert.equal(blockedContentAction("delete"), false);
  let calls = 0;
  const client = new AsideAgentClient({
    base: "http://127.0.0.1:9",
    onRequest: () => { calls += 1; },
  });
  await assert.rejects(() => client.content({ action: "confirmDelete" }), /手机必须在本机确认/);
  await assert.rejects(() => client.content({
    action: "batch",
    operationId: "batch-blocked",
    operations: [{ action: "delete", operationId: "nope", objectIds: [], count: 0 }],
  }), /不能删除/);
  assert.equal(calls, 0);
});

test("content uses afs rpc and mount hides the token", async () => {
  const credential = "credential-token-for-mount-test";
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.match(skill, /\/aside/);
  assert.match(skill, /allowPrivateNetwork/);
  assert.match(skill, /probe 和 capabilities/);
  assert.match(skill, /大约 60 秒/);
  assert.match(skill, /马上/);
  assert.match(skill, /不要自己拼 `arc afs mount add`/);
  assert.doesNotMatch(skill, /改成局域网 IPv4|解析成同一台手机的局域网 IPv4/);
  assert.match(skill, /exec \/\.actions\/aside/);
  assert.doesNotMatch(skill, /POST \/agent\/v1\/content/);
  assert.equal(mountURI("http://127.0.0.1:53123"), "http://127.0.0.1:53123?allowPrivateNetwork=true");
  assert.equal(mountURI("http://127.0.0.1:53123").includes(credential), false);

  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push({ path: req.url, body });
      const action = body.args?.[1]?.action;
      const data = action === "capabilities"
        ? { ok: true, actions: ["list", "read", "createNote"] }
        : { ok: true, entries: [{ id: "item-1" }] };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { success: true, data } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const client = new AsideAgentClient({
      base: `http://127.0.0.1:${port}`,
      credential,
      secrets: [credential],
    });
    const listed = await client.content({ action: "list", resource: "items" });
    assert.equal(listed.entries[0].id, "item-1");
    assert.deepEqual(requests.map((item) => item.path), ["/rpc", "/rpc"]);
    assert.equal(requests[0].body.method, "exec");
    assert.equal(requests[0].body.args[0], "/.actions/aside");
    assert.equal(requests[0].body.args[1].action, "capabilities");
    assert.equal(requests[1].body.args[1].action, "list");
    assert.equal(JSON.stringify(requests).includes(credential), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const arc = path.join(scratch, "fake-arc.mjs");
  const argvLog = path.join(scratch, "fake-arc-argv.log");
  fs.mkdirSync(scratch, { recursive: true });
  fs.writeFileSync(arc, [
    "#!/usr/bin/env node",
    "import fs from 'node:fs';",
    "const line = JSON.stringify(process.argv.slice(2));",
    `fs.appendFileSync(${JSON.stringify(argvLog)}, line + '\\n');`,
    "const args = process.argv.slice(2);",
    "if (args[0] === 'service' && args[1] === 'status') { process.stdout.write('Status:   up\\n'); process.exit(0); }",
    "if (args[0] === 'afs' && args[2] === 'remove') process.exit(0);",
    "if (args[0] === 'afs' && args[2] === 'add') { process.stdout.write('mounted\\n'); process.exit(0); }",
    "process.stderr.write('unexpected\\n');",
    "process.exit(1);",
    "",
  ].join("\n"));
  fs.chmodSync(arc, 0o755);
  fs.rmSync(argvLog, { force: true });
  const mounted = await mountLibrary({
    base: "http://127.0.0.1:53123",
    credential,
    secrets: [credential],
    arc,
  });
  assert.equal(mounted.path, ASIDE_MOUNT_PATH);
  assert.equal(mounted.mounted, true);
  assert.equal(mounted.uri, "http://127.0.0.1:53123?allowPrivateNetwork=true");
  assert.equal(JSON.stringify(mounted).includes(credential), false);
  const recorded = fs.readFileSync(argvLog, "utf8");
  assert.match(recorded, /allowPrivateNetwork=true/);
  assert.match(recorded, /--sensitive-args/);
  assert.equal(recorded.includes("token="), true);
  const loopbackAdd = JSON.parse(recorded.trim().split("\n").find((line) => line.includes('"add"')));
  assert.equal(loopbackAdd.includes("--set"), true);
  assert.equal(loopbackAdd.includes("allowPrivateNetwork=true"), true);
  const removed = await unmountLibrary({ secrets: [credential], arc });
  assert.equal(removed.removed, true);
  assert.equal(JSON.stringify(removed).includes(credential), false);

  fs.rmSync(argvLog, { force: true });
  const blockedArc = path.join(scratch, "fake-arc-blocked.mjs");
  fs.writeFileSync(blockedArc, [
    "#!/usr/bin/env node",
    "import fs from 'node:fs';",
    "const line = JSON.stringify(process.argv.slice(2));",
    `fs.appendFileSync(${JSON.stringify(argvLog)}, line + '\\n');`,
    "const args = process.argv.slice(2);",
    "if (args[0] === 'service' && args[1] === 'status') { process.stdout.write('Status:   up\\n'); process.exit(0); }",
    "if (args[0] === 'afs' && args[2] === 'remove') process.exit(0);",
    "if (args[0] === 'afs' && args[2] === 'add') {",
    "  const uri = args[3];",
    "  if (String(uri).includes('phone.local')) {",
    "    process.stderr.write('Mount verification failed: hostname phone.local resolves to fe80::1 — IPv6 link-local (fe80::/10)\\n');",
    "  } else {",
    "    process.stderr.write('Mount verification failed (provider creation): URL http://192.168.0.2:53123 is blocked — private network (192.168.0.0/16)\\n');",
    "  }",
    "  process.exit(1);",
    "}",
    "process.stderr.write('unexpected\\n');",
    "process.exit(1);",
    "",
  ].join("\n"));
  fs.chmodSync(blockedArc, 0o755);
  fs.rmSync(argvLog, { force: true });
  const named = await mountLibrary({
    base: "http://phone.local:53123",
    credential,
    secrets: [credential],
    arc: blockedArc,
  });
  assert.equal(named.mounted, false);
  assert.equal(named.reason, "private-network");
  assert.match(named.message, /同一个 base/);
  assert.match(named.message, /不要自己拼 arc afs mount add/);
  assert.equal(JSON.stringify(named).includes(credential), false);
  const namedLog = fs.readFileSync(argvLog, "utf8");
  assert.match(namedLog, /phone\.local:53123/);
  assert.equal(namedLog.includes("192.168.0.2"), false);
  const namedAdd = JSON.parse(namedLog.trim().split("\n").find((line) => line.includes('"add"')));
  assert.equal(namedAdd.includes("allowPrivateNetwork=true"), true);
  assert.equal(namedAdd.some((arg) => arg.startsWith("token=")), true);

  fs.rmSync(argvLog, { force: true });
  const literal = await mountLibrary({
    base: "http://192.168.0.2:53123",
    credential,
    secrets: [credential],
    arc: blockedArc,
  });
  assert.equal(literal.mounted, false);
  assert.equal(literal.reason, "private-network");
  const literalLog = fs.readFileSync(argvLog, "utf8");
  const literalAdd = JSON.parse(literalLog.trim().split("\n").find((line) => line.includes('"add"')));
  assert.equal(literalAdd.includes("http://192.168.0.2:53123?allowPrivateNetwork=true"), true);
  assert.equal(literalAdd.includes("allowPrivateNetwork=true"), true);
});

test("set-item-tag sends setItemTag and stops when the phone cannot tag items", async () => {
  fs.mkdirSync(scratch, { recursive: true });
  const credential = "credential-token-for-item-tag";
  const cred = path.join(scratch, "item-tag-credential");
  fs.writeFileSync(cred, `${credential}\n`, { mode: 0o600 });
  const itemID = "00000000-0000-4000-8000-0000000000aa";
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push(body);
      const action = body.args?.[1]?.action;
      const data = action === "capabilities"
        ? { ok: true, actions: ["read", "setItemTag"] }
        : {
          ok: true,
          id: itemID,
          tagIds: ["tag-ai"],
          resourceVersion: "after-tag",
          text: "talk",
        };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { success: true, data } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const runClient = (args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(skillDir, "client.mjs"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  try {
    const tagged = await runClient([
      "set-item-tag",
      "--base", `http://127.0.0.1:${port}`,
      "--credential-file", cred,
      "--operation-id", "tag-ai",
      "--item", itemID,
      "--name", "ai",
      "--member", "true",
      "--resource-version", "before-tag",
    ]);
    assert.equal(tagged.status, 0, tagged.stderr);
    assert.equal(tagged.stdout.includes(credential), false);
    const wrote = requests.find((body) => body.args?.[1]?.action === "setItemTag");
    assert.equal(wrote.args[0], "/.actions/aside");
    assert.equal(wrote.args[1].itemId, itemID);
    assert.equal(wrote.args[1].name, "ai");
    assert.equal(wrote.args[1].member, true);
    assert.equal(wrote.args[1].resourceVersion, "before-tag");
    assert.equal(JSON.stringify(requests).includes(credential), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const refused = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        data: { success: true, data: { ok: true, actions: ["ensureTag", "updateTag"] } },
      }));
    });
  });
  await new Promise((resolve) => refused.listen(0, "127.0.0.1", resolve));
  try {
    const failed = await runClient([
      "set-item-tag",
      "--base", `http://127.0.0.1:${refused.address().port}`,
      "--credential-file", cred,
      "--operation-id", "tag-ai",
      "--item", itemID,
      "--name", "ai",
      "--member", "true",
      "--resource-version", "before-tag",
    ]);
    assert.equal(failed.status, 1);
    assert.match(failed.stdout, /setItemTag/);
    assert.equal(failed.stdout.includes(credential), false);
  } finally {
    await new Promise((resolve) => refused.close(resolve));
  }
});

test("create-note sends quick note blocks and does not require text", async () => {
  fs.mkdirSync(scratch, { recursive: true });
  const credential = "credential-token-for-quick-note";
  const cred = path.join(scratch, "quick-note-credential");
  const blocksFile = path.join(scratch, "quick-note-blocks.json");
  fs.writeFileSync(cred, `${credential}\n`, { mode: 0o600 });
  const blocks = [
    { kind: "text", text: "field note" },
    { kind: "link", url: "https://example.com/notes", title: "Page" },
    { kind: "location", latitude: 31.25, longitude: 121.5, title: "Hall" },
    { kind: "image", filename: "pixel.png", contentBase64: "aGVsbG8=" },
  ];
  fs.writeFileSync(blocksFile, JSON.stringify(blocks));
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push(body);
      const action = body.args?.[1]?.action;
      const data = action === "capabilities"
        ? { ok: true, actions: ["createNote"], note: { kind: "quickNote", blocks: ["text", "image", "link", "location"] } }
        : { ok: true, id: "note-1", noteKind: "quickNote", text: "field note" };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { success: true, data } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const runClient = (args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(skillDir, "client.mjs"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  try {
    const created = await runClient([
      "create-note",
      "--base", `http://127.0.0.1:${port}`,
      "--credential-file", cred,
      "--operation-id", "rich-note",
      "--title", "Field",
      "--blocks-file", blocksFile,
    ]);
    assert.equal(created.status, 0, created.stdout);
    assert.equal(created.stdout.includes(credential), false);
    const wrote = requests.find((body) => body.args?.[1]?.action === "createNote");
    assert.equal(wrote.args[1].text, undefined);
    assert.equal(wrote.args[1].title, "Field");
    assert.deepEqual(wrote.args[1].blocks, blocks);
    assert.equal(JSON.stringify(requests).includes(credential), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const missing = await runClient([
    "create-note",
    "--base", "http://127.0.0.1:9",
    "--credential-file", cred,
    "--operation-id", "empty-note",
  ]);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /blocks-file/);
  assert.equal(missing.stdout.includes(credential), false);
});
