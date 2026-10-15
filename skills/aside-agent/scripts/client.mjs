#!/usr/bin/env node
// Aside computer client for POST /agent/v1.
// Browse _aside-agent._tcp, then the user picks one phone.
// No subnet scan, no second auth protocol.
// Credentials stay in the credential file and are redacted from output.

import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL = "aside-agent";
const VERSION = 1;
export const ASIDE_MOUNT_PATH = "/aside";
const PHONE_ONLY = new Set(["confirm", "confirmDelete", "allow"]);
const RESOURCES = new Set(["items", "collections", "tags"]);
const DELETE_MESSAGE = "手机需要确认后才会删除。电脑这次请求没有删除任何内容。";

export class AsideAgentError extends Error {
  constructor(fields) {
    const error = fields.error ?? {};
    const reason = error.reason || error.message || error.operation || fields.message || "request failed";
    super(reason);
    this.name = "AsideAgentError";
    this.status = fields.status ?? null;
    this.error = {
      name: error.name || fields.name || "AsideAgent.error",
      ...(error.reason ? { reason: error.reason } : {}),
      ...(error.message ? { message: error.message } : {}),
      ...(error.path ? { path: error.path } : {}),
      ...(error.operation ? { operation: error.operation } : {}),
      ...(error.wireCode != null ? { wireCode: error.wireCode } : {}),
      ...(fields.message && !error.message && !error.reason ? { message: fields.message } : {}),
    };
    this.secrets = fields.secrets ?? [];
  }

  toJSON() {
    return { ok: false, status: this.status, error: this.error };
  }
}

export function redact(text, secrets) {
  let out = String(text ?? "");
  const unique = [...new Set((secrets ?? []).filter((secret) => typeof secret === "string" && secret.length >= 8))];
  unique.sort((left, right) => right.length - left.length);
  for (const secret of unique) out = out.split(secret).join("[redacted]");
  return out;
}

export function assertBase(base) {
  if (typeof base !== "string" || base.trim() === "") {
    throw new AsideAgentError({ message: "要先写手机上显示的一个地址，例如 http://192.168.1.8:53123" });
  }
  if (/[\s,*]/.test(base) || (base.includes("://") && base.indexOf("://") !== base.lastIndexOf("://"))) {
    throw new AsideAgentError({ message: "只接受一个地址。有多个时先选一个，不要扫描网段。" });
  }
  const typed = base.includes("://") ? base : `http://${base}`;
  let url;
  try {
    url = new URL(typed);
  } catch {
    throw new AsideAgentError({ message: "地址无法解析。看手机上显示的那一个地址，不要扫描网段。" });
  }
  if (url.protocol !== "http:") {
    throw new AsideAgentError({ message: "这一版是明文 HTTP，没有 TLS。用手机上显示的 http 地址，不要改成 https。" });
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) {
    throw new AsideAgentError({ message: "地址只包含主机和端口。不要把路径、查询或网段写进来。" });
  }
  if (!url.port || !url.hostname) {
    throw new AsideAgentError({ message: "地址里要带手机上显示的端口。不要自己猜，也不要扫描局域网。" });
  }
  return url;
}

export function assertDiscovery(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new AsideAgentError({ name: "AsideAgent.version", message: "发现文档不是这一版的连接说明。停止连接，不要换一套协议。" });
  }
  const forbidden = ["credential", "pairingCode", "bearer", "authorization", "token"];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(document, key)) {
      throw new AsideAgentError({ name: "AsideAgent.version", message: "发现文档里不该有凭证。停止连接。" });
    }
  }
  if (document.protocol !== PROTOCOL || document.version !== VERSION) {
    throw new AsideAgentError({
      name: "AsideAgent.version",
      message: `协议版本不一致（需要 ${PROTOCOL} ${VERSION}）。停止连接，不要换一套协议。`,
    });
  }
  if (document.requiresPhoneAllow !== true || document.requiresPairing !== true) {
    throw new AsideAgentError({ name: "AsideAgent.version", message: "这一版必须配对，并且要等手机允许。停止连接。" });
  }
  for (const key of ["pairPath", "claimPath", "probePath"]) {
    if (typeof document[key] !== "string" || !document[key].startsWith("/agent/v1/")) {
      throw new AsideAgentError({ name: "AsideAgent.version", message: "发现文档缺少连接路径。停止连接。" });
    }
  }
  if (document.transport === "tcp" && (typeof document.port !== "number" || document.port <= 0)) {
    throw new AsideAgentError({ name: "AsideAgent.version", message: "发现文档没有监听端口。看手机上的地址是否还在。" });
  }
  return document;
}

export function blockedContentAction(action) {
  return PHONE_ONLY.has(action);
}

const SERVICE_TYPE = "_aside-agent._tcp";

export function unescapeDnsSd(text) {
  return String(text).replace(/\\(\d{3})/g, (_, digits) => {
    const code = Number(digits);
    return code <= 255 ? String.fromCharCode(code) : `\\${digits}`;
  });
}

export function parseBrowse(text) {
  const counts = new Map();
  const marker = `${SERVICE_TYPE}.`;
  for (const line of String(text).split(/\r?\n/)) {
    const typeAt = line.indexOf(marker);
    if (typeAt < 0) continue;
    const prefix = line.slice(0, typeAt);
    const action = /\bAdd\b/.test(prefix) ? "add" : (/\bRmv\b/.test(prefix) ? "remove" : null);
    if (!action) continue;
    const name = line.slice(typeAt + marker.length).trim();
    if (!name) continue;
    const next = (counts.get(name) ?? 0) + (action === "add" ? 1 : -1);
    counts.set(name, Math.max(0, next));
  }
  return [...counts.entries()].filter(([, count]) => count > 0).map(([name]) => name).sort();
}

export function parseResolve(text) {
  const match = String(text).match(/can be reached at\s+(\S+?):(\d+)/);
  if (!match) return null;
  let host = unescapeDnsSd(match[1]).replace(/\.$/, "");
  const port = Number(match[2]);
  if (!host || host.includes("/") || host.includes(",") || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }
  return { host, port, base: `http://${host}:${port}` };
}

function runDnsSd(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn("dns-sd", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { out += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { err += chunk.toString("utf8"); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out || err);
    });
  });
}

export async function browseAsideAgents({ timeoutMs = 2500, resolveMs = 1200 } = {}) {
  let browseText;
  try {
    browseText = await runDnsSd(["-B", SERVICE_TYPE, "local."], timeoutMs);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new AsideAgentError({ message: "这台电脑没有 dns-sd，不能浏览 Aside。不要改去扫描网段。" });
    }
    throw error;
  }
  const devices = [];
  for (const name of parseBrowse(browseText)) {
    const resolved = parseResolve(await runDnsSd(["-L", name, SERVICE_TYPE, "local."], resolveMs));
    if (!resolved) continue;
    devices.push({ name, ...resolved });
  }
  return devices;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

function phoneOnlyMessage() {
  return "手机必须在本机确认。电脑不能通过 HTTP 允许连接，也不能代替删除确认。";
}

/// 这台电脑的固定标识。省略 --device-id 时用它，避免每次配对都被手机当成另一台电脑。
export function stableMachineId(file = path.join(os.homedir(), ".grok", "skills", "aside-agent", "machine-id")) {
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (/^[A-Za-z0-9._-]{8,80}$/.test(existing)) return existing;
  } catch {
    // 还没有文件，下面新建。
  }
  const created = `mac-${crypto.randomBytes(16).toString("hex")}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${created}\n`, { mode: 0o600 });
  return created;
}

export class AsideAgentClient {
  constructor({ base, credential = null, secrets = [], onRequest = null } = {}) {
    this.base = assertBase(base);
    this.credential = credential;
    this.secrets = [...secrets];
    this.onRequest = onRequest;
    if (credential) this.track(credential);
  }

  track(secret) {
    if (typeof secret === "string" && secret.length >= 8) this.secrets.push(secret);
  }

  origin() {
    return `${this.base.protocol}//${this.base.host}`;
  }

  async request(method, requestPath, body) {
    const payload = body == null ? null : Buffer.from(JSON.stringify(stable(body)));
    this.onRequest?.({ method, path: requestPath, action: body?.action ?? body?.method ?? null });
    const headers = { Connection: "close", Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(payload.length);
    }
    if (this.credential) headers.Authorization = `Bearer ${this.credential}`;
    const raw = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          protocol: this.base.protocol,
          hostname: this.base.hostname,
          port: this.base.port,
          method,
          path: requestPath,
          headers,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            resolve({
              status: res.statusCode ?? 0,
              raw: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      req.on("error", (error) => {
        reject(new AsideAgentError({
          name: "AsideAgent.connection",
          message: `连不上 ${this.base.hostname}:${this.base.port}。先用同一个地址再试一次。已有凭证时，先对这次浏览到的 base 做 probe，不要马上重新配对。端口每次监听打开都会变。离开内容终端页不会断开。锁屏或离开较久只是监听先停，授权还在，把手机带回前台即可。只有没有凭证、手机说 revoked，或用户拒绝，才重新配对。不要扫描局域网。`,
          secrets: this.secrets,
          error: { message: error.message },
        }));
      });
      if (payload) req.write(payload);
      req.end();
    });
    let parsed = null;
    try {
      parsed = raw.raw ? JSON.parse(raw.raw) : null;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object") {
      throw new AsideAgentError({
        status: raw.status,
        name: "AsideAgent.response",
        message: "响应不是 JSON。先用同一个地址再试一次。离开页面不会断开。",
        secrets: this.secrets,
      });
    }
    if (parsed.ok === false && parsed.partial === true && raw.status === 200) return parsed;
    if (parsed.ok === false || raw.status >= 400) {
      throw new AsideAgentError({ status: raw.status, error: parsed.error ?? {}, secrets: this.secrets });
    }
    return parsed;
  }

  async discover() {
    const document = await this.request("GET", "/agent/v1/discovery");
    return assertDiscovery(document);
  }

  async pair({ tool, device, deviceId }) {
    const explicit = typeof deviceId === "string" ? deviceId.trim() : "";
    return this.request("POST", "/agent/v1/pair", {
      toolName: tool ?? "",
      deviceName: device ?? "",
      deviceId: explicit || stableMachineId(),
    });
  }

  async claim(sessionId, pairingCode) {
    const body = await this.request("POST", "/agent/v1/claim", {
      sessionId,
      pairingCode,
    });
    if (typeof body.credential === "string") this.track(body.credential);
    return body;
  }

  async waitForClaim(sessionId, pairingCode, { timeoutMs = 50_000, intervalMs = 1_000 } = {}) {
    const started = Date.now();
    for (;;) {
      try {
        return await this.claim(sessionId, pairingCode);
      } catch (error) {
        if (!(error instanceof AsideAgentError) || error.error.reason !== "not-allowed") throw error;
        if (Date.now() - started >= timeoutMs) {
          throw new AsideAgentError({
            name: "AsideAgent.timeout",
            message: "等到配对超时，手机还没有允许。请重新配对，不要沿用这次的码。",
            secrets: this.secrets,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }

  async probe() {
    return this.request("POST", "/agent/v1/probe", {});
  }

  async content(body, { skipCapabilityCheck = false } = {}) {
    const action = typeof body?.action === "string" ? body.action : "";
    if (blockedContentAction(action)) {
      throw new AsideAgentError({ message: phoneOnlyMessage(), secrets: this.secrets });
    }
    if (action === "batch") {
      const operations = Array.isArray(body.operations) ? body.operations : [];
      for (const operation of operations) {
        const nested = operation?.action;
        if (nested === "delete" || nested === "batch" || blockedContentAction(nested)) {
          throw new AsideAgentError({
            message: "批量里不能删除，也不能再套一层批量。删除要单独请求，并等手机确认。",
            secrets: this.secrets,
          });
        }
      }
    }
    if (!skipCapabilityCheck && action !== "capabilities") {
      const caps = await this.content({ action: "capabilities" }, { skipCapabilityCheck: true });
      const known = new Set(Array.isArray(caps.actions) ? caps.actions : []);
      const operations = Array.isArray(body.operations) ? body.operations : [];
      const needed = action === "batch" ? operations.map((operation) => operation?.action) : [action];
      for (const name of needed) {
        if (!known.has(name)) {
          throw new AsideAgentError({
            message: `能力元数据里没有 ${name}。不要改用别的路径或协议。`,
            secrets: this.secrets,
          });
        }
      }
    }
    const executed = await this.rpc("exec", ["/.actions/aside", body, {}]);
    const response = executed?.data;
    if (!response || typeof response !== "object") {
      throw new AsideAgentError({ message: "AFS exec 没有返回内容。", secrets: this.secrets });
    }
    if (action === "delete") {
      if (response.pending !== true || response.confirm !== "phone") {
        throw new AsideAgentError({
          message: "删除没有进入手机确认，不能当成已经删除。",
          secrets: this.secrets,
        });
      }
      return { ...response, message: DELETE_MESSAGE };
    }
    return response;
  }

  async rpc(method, args) {
    const envelope = await this.request("POST", "/rpc", { method, args });
    if (envelope.success !== true) {
      throw new AsideAgentError({
        status: envelope.error?.code === 6 ? 401 : 200,
        error: envelope.error ?? {},
        secrets: this.secrets,
      });
    }
    return envelope.data;
  }
}

export function mountURI(base) {
  const url = assertBase(base);
  return `http://${url.hostname}:${url.port}?allowPrivateNetwork=true`;
}

function arcBin() {
  return process.env.ASIDE_ARC_BIN || "arc";
}

function runProcess(command, args, secrets) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (error?.code === "ENOENT") {
        reject(new AsideAgentError({
          message: "这台电脑还没有 arc。先安装 AFS：curl -fsSL https://arc.afsd.io/install.sh | bash。装好后再挂载，不要扫描网段。",
          secrets,
        }));
        return;
      }
      reject(new AsideAgentError({ message: redact(error.message, secrets), secrets }));
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout: redact(stdout, secrets), stderr: redact(stderr, secrets) });
    });
  });
}

function daemonIsUp(result) {
  if (result.code !== 0) return false;
  const text = `${result.stdout}\n${result.stderr}`;
  return /Status:\s+up\b/.test(text) || /"running"\s*:\s*true/.test(text);
}

export function privateNetworkMountFailure(text) {
  return /private network|link-local|fe80::|SSRF protection|resolves to/i.test(String(text));
}

const PRIVATE_NETWORK_MOUNT_MESSAGE = "库还不能出现在 /aside。arc 拒绝了这个局域网地址。probe 和 capabilities 已经成功时，连接仍然有效。继续用同一个 base 和本客户端读写。不要扫描网段，不要改试别的地址，不要自己拼 arc afs mount add。";

export async function mountLibrary({ base, credential, secrets = [], arc = arcBin() } = {}) {
  if (typeof credential !== "string" || credential.length < 8) {
    throw new AsideAgentError({ message: "缺少凭证。先配对并等手机允许，再挂载。", secrets });
  }
  const uri = mountURI(base);
  if (uri.includes(credential)) {
    throw new AsideAgentError({ message: "挂载地址不能带凭证。", secrets });
  }
  const status = await runProcess(arc, ["service", "status"], secrets);
  if (!daemonIsUp(status)) {
    const started = await runProcess(arc, ["service", "start"], secrets);
    if (started.code !== 0) {
      throw new AsideAgentError({
        message: `AFS 服务没有起来。${started.stderr || started.stdout || "arc service start 失败"}`.trim(),
        secrets,
      });
    }
  }
  await runProcess(arc, ["afs", "mount", "remove", ASIDE_MOUNT_PATH], secrets);
  const added = await runProcess(arc, [
    "afs", "mount", "add", ASIDE_MOUNT_PATH, uri,
    "--set", "allowPrivateNetwork=true",
    "--set", `token=${credential}`,
    "--sensitive-args", "token",
  ], secrets);
  if (added.code !== 0) {
    const detail = `${added.stderr}\n${added.stdout}`;
    if (privateNetworkMountFailure(detail)) {
      return {
        ok: true,
        mounted: false,
        path: ASIDE_MOUNT_PATH,
        reason: "private-network",
        message: PRIVATE_NETWORK_MOUNT_MESSAGE,
      };
    }
    throw new AsideAgentError({
      message: `没有挂上 ${ASIDE_MOUNT_PATH}。${(added.stderr || added.stdout || "arc afs mount add 失败").trim()} 不要自己拼 arc afs mount add，也不要扫描网段。`.trim(),
      secrets,
    });
  }
  return { ok: true, mounted: true, path: ASIDE_MOUNT_PATH, uri };
}

export async function unmountLibrary({ secrets = [], arc = arcBin() } = {}) {
  const removed = await runProcess(arc, ["afs", "mount", "remove", ASIDE_MOUNT_PATH], secrets);
  if (removed.code !== 0) {
    const text = `${removed.stdout}\n${removed.stderr}`;
    if (/not found|not mounted|no mount|does not exist|未知/i.test(text)) {
      return { ok: true, path: ASIDE_MOUNT_PATH, removed: false };
    }
    throw new AsideAgentError({
      message: `没有卸下 ${ASIDE_MOUNT_PATH}。${removed.stderr || removed.stdout || "arc afs mount remove 失败"}`.trim(),
      secrets,
    });
  }
  return { ok: true, path: ASIDE_MOUNT_PATH, removed: true };
}

function requireValue(args, key, message) {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new AsideAgentError({ message });
  }
  return value;
}

function loadCredential(file, secrets, { required = true } = {}) {
  if (!file) return null;
  let text;
  try {
    text = fs.readFileSync(file, "utf8").trim();
  } catch {
    if (!required) return null;
    throw new AsideAgentError({ message: "找不到凭证文件。缺少凭证时不能读取。重新配对并等手机允许。" });
  }
  if (!text) throw new AsideAgentError({ message: "凭证文件是空的。重新配对并等手机允许。" });
  secrets.push(text);
  return text;
}

function publicClaim(body, credentialFile) {
  return {
    ok: true,
    sessionId: body.sessionId,
    expiresAt: body.expiresAt ?? null,
    scope: body.scope ?? [],
    credentialFile,
  };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    if (key === "object-id") {
      out.objectIds = out.objectIds ?? [];
      out.objectIds.push(next);
    } else {
      out[key] = next;
    }
    index += 1;
  }
  return out;
}

function clientFrom(args, secrets, { credentialRequired = true } = {}) {
  const base = requireValue(args, "base", "缺少 --base。先 browse。只有一台就用它的 base，多台再让用户选。");
  const credential = loadCredential(args["credential-file"], secrets, { required: credentialRequired });
  return new AsideAgentClient({ base, credential, secrets });
}

function writeCredential(file, credential) {
  if (typeof file !== "string" || file.length === 0) {
    throw new AsideAgentError({ message: "领取凭证时要给出 --credential-file。不要把凭证打印出来。" });
  }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${credential}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // The file is already created without the token on stdout.
  }
}

function readBlocksFile(args) {
  if (args["blocks-file"] === undefined) return null;
  const file = args["blocks-file"];
  if (typeof file !== "string" || file.length === 0) {
    throw new AsideAgentError({ message: "--blocks-file 要是一个 JSON 数组文件。" });
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new AsideAgentError({ message: "--blocks-file 要是一个 JSON 数组。" });
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((block) => !block || typeof block !== "object" || Array.isArray(block))) {
    throw new AsideAgentError({ message: "--blocks-file 要是非空的 JSON 数组，每一项是一个块。" });
  }
  return parsed;
}

function noteBody(args, action, fields) {
  const blocks = readBlocksFile(args);
  const text = typeof args.text === "string" ? args.text.trim() : "";
  if (!blocks && !text) {
    throw new AsideAgentError({
      message: "写笔记要有 --text，或用 --blocks-file 给出 Quick Note 的块。",
    });
  }
  return {
    action,
    ...fields,
    ...(text ? { text } : {}),
    ...(typeof args.title === "string" && args.title ? { title: args.title } : {}),
    ...(blocks ? { blocks } : {}),
  };
}

async function run(argv) {
  const args = parseArgs(argv);
  const command = args._[0];
  const secrets = [];
  if (!command || command === "help") {
    return {
      ok: true,
      commands: [
        "browse", "discover", "pair", "claim", "wait-claim", "probe", "capabilities",
        "list", "read", "read-attachment", "create-note", "update-note",
        "ensure-tag", "update-tag", "set-item-tag", "create-collection", "update-collection",
        "set-membership", "delete-request", "batch", "mount", "unmount",
      ],
    };
  }
  if (command === "unmount") {
    return unmountLibrary({ secrets });
  }
  if (command === "browse") {
    const devices = await browseAsideAgents({
      timeoutMs: Number(args["timeout-ms"] ?? 2500),
      resolveMs: Number(args["resolve-ms"] ?? 1200),
    });
    return { ok: true, serviceType: SERVICE_TYPE, devices };
  }
  const credentialRequired = command !== "discover" && command !== "pair" && command !== "claim" && command !== "wait-claim";
  const client = clientFrom(args, secrets, { credentialRequired });
  switch (command) {
    case "discover":
      return client.discover();
    case "pair":
      return client.pair({
        tool: args.tool,
        device: args.device,
        deviceId: args["device-id"],
      });
    case "claim":
    case "wait-claim": {
      const sessionId = requireValue(args, "session", "缺少 --session。");
      const pairingCode = requireValue(args, "code", "缺少 --code。这是手机和电脑对照的配对码，不是凭证。");
      const file = requireValue(args, "credential-file", "缺少 --credential-file。");
      const claimed = command === "wait-claim"
        ? await client.waitForClaim(sessionId, pairingCode, {
          timeoutMs: Number(args["timeout-ms"] ?? 50_000),
          intervalMs: Number(args["interval-ms"] ?? 1_000),
        })
        : await client.claim(sessionId, pairingCode);
      writeCredential(file, claimed.credential);
      return publicClaim(claimed, file);
    }
    case "probe":
      return client.probe();
    case "mount":
      return mountLibrary({
        base: args.base,
        credential: loadCredential(args["credential-file"], secrets),
        secrets,
      });
    case "capabilities":
      return client.content({ action: "capabilities" });
    case "list": {
      const resource = requireValue(args, "resource", "缺少 --resource。用 items、collections 或 tags。");
      if (!RESOURCES.has(resource)) {
        throw new AsideAgentError({ message: "resource 只能是 items、collections 或 tags。不要写收藏路径。" });
      }
      const body = { action: args.query ? "search" : "list", resource };
      if (args.query) body.query = args.query;
      if (args.cursor) body.cursor = String(args.cursor);
      if (args.limit) body.limit = Number(args.limit);
      return client.content(body);
    }
    case "read": {
      const resource = args.resource || "items";
      if (!RESOURCES.has(resource)) {
        throw new AsideAgentError({ message: "resource 只能是 items、collections 或 tags。" });
      }
      return client.content({
        action: "read",
        resource,
        id: requireValue(args, "id", "缺少 --id。"),
      });
    }
    case "read-attachment":
      return client.content({
        action: "readAttachment",
        id: requireValue(args, "id", "缺少 --id。"),
        attachment: requireValue(args, "attachment", "缺少 --attachment。"),
      });
    case "create-note":
      return client.content(noteBody(args, "createNote", {
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。重试沿用同一个，新笔记换一个。"),
      }));
    case "update-note":
      return client.content(noteBody(args, "updateNote", {
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。"),
        id: requireValue(args, "id", "缺少 --id。"),
        resourceVersion: requireValue(args, "resource-version", "缺少 --resource-version。先读再写。"),
      }));
    case "ensure-tag":
      return client.content({
        action: "ensureTag",
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。"),
        name: requireValue(args, "name", "缺少 --name。"),
      });
    case "update-tag":
      return client.content({
        action: "updateTag",
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。"),
        id: requireValue(args, "id", "缺少 --id。"),
        name: requireValue(args, "name", "缺少 --name。"),
        resourceVersion: requireValue(args, "resource-version", "缺少 --resource-version。"),
      });
    case "set-item-tag": {
      const member = args.member;
      if (member !== "true" && member !== "false") {
        throw new AsideAgentError({ message: "--member 只能是 true 或 false。" });
      }
      return client.content({
        action: "setItemTag",
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。"),
        itemId: requireValue(args, "item", "缺少 --item。"),
        name: requireValue(args, "name", "缺少 --name。这是要挂上或拿下的标签名。"),
        member: member === "true",
        resourceVersion: requireValue(args, "resource-version", "缺少 --resource-version。先读这条 item。"),
      });
    }
    case "create-collection":
      return client.content({
        action: "createCollection",
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。"),
        name: requireValue(args, "name", "缺少 --name。"),
      });
    case "update-collection":
      return client.content({
        action: "updateCollection",
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。"),
        id: requireValue(args, "id", "缺少 --id。"),
        name: requireValue(args, "name", "缺少 --name。"),
        resourceVersion: requireValue(args, "resource-version", "缺少 --resource-version。"),
      });
    case "set-membership": {
      const member = args.member;
      if (member !== "true" && member !== "false") {
        throw new AsideAgentError({ message: "--member 只能是 true 或 false。" });
      }
      return client.content({
        action: "setMembership",
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。"),
        itemId: requireValue(args, "item", "缺少 --item。"),
        collectionId: requireValue(args, "collection", "缺少 --collection。"),
        member: member === "true",
        resourceVersion: requireValue(args, "resource-version", "缺少 --resource-version。"),
      });
    }
    case "delete-request": {
      const objectIds = args.objectIds ?? [];
      if (objectIds.length === 0) throw new AsideAgentError({ message: "缺少 --object-id。可以重复多次。" });
      return client.content({
        action: "delete",
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。"),
        objectIds,
        count: objectIds.length,
      });
    }
    case "batch": {
      const file = requireValue(args, "operations-file", "缺少 --operations-file。");
      const operations = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(operations)) throw new AsideAgentError({ message: "operations 文件必须是 JSON 数组。" });
      return client.content({
        action: "batch",
        operationId: requireValue(args, "operation-id", "写操作要带 --operation-id。整批重试沿用同一个。"),
        operations,
      });
    }
    default:
      throw new AsideAgentError({ message: `不认识的命令 ${command}。` });
  }
}

function printResult(value, secrets) {
  const json = JSON.stringify(value);
  process.stdout.write(`${redact(json, secrets)}\n`);
}

async function main() {
  const secrets = [];
  try {
    const args = parseArgs(process.argv.slice(2));
    if (typeof args["credential-file"] === "string") {
      try {
        const loaded = fs.readFileSync(args["credential-file"], "utf8").trim();
        if (loaded.length >= 8) secrets.push(loaded);
      } catch {
        // The command reports a missing file itself.
      }
    }
    const result = await run(process.argv.slice(2));
    if (typeof result?.credential === "string") secrets.push(result.credential);
    const printed = result && typeof result === "object" ? { ...result } : { ok: true, result };
    delete printed.credential;
    printResult(printed, secrets);
    process.exit(printed.partial === true ? 2 : 0);
  } catch (error) {
    const secretsOnError = error instanceof AsideAgentError ? [...secrets, ...(error.secrets ?? [])] : secrets;
    const payload = error instanceof AsideAgentError
      ? error.toJSON()
      : { ok: false, error: { name: "AsideAgent.error", message: error?.message || "failed" } };
    printResult(payload, secretsOnError);
    process.exit(1);
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked && invoked === fileURLToPath(import.meta.url)) {
  main();
}
