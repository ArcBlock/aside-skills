#!/usr/bin/env node
/**
 * Aside cloud agent transport for https://www.aside.sh.
 *
 * The access key stays in ~/.aside-agent/mcp-token. This process reads that
 * file itself. Do not pass the key through the shell or print it.
 *
 *   node aside-cloud.mjs auth
 *   node aside-cloud.mjs auth --wait
 *   node aside-cloud.mjs list
 *   node aside-cloud.mjs read --path /user/items/<id>.json
 *   node aside-cloud.mjs write --request req-... --title ... --summary ... --body-file note.json
 *   node aside-cloud.mjs self-test
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const HOST = "https://www.aside.sh";
const MCP = `${HOST}/mcp`;
const ROOT = join(homedir(), ".aside-agent");
const TOKEN_PATH = join(ROOT, "mcp-token");
const CLIENT_PATH = join(ROOT, "oauth-client.json");
const PENDING_PATH = join(ROOT, "device-pending.json");
const INSTALL_PATH = join(ROOT, "installation.json");
const HEADER_MAX = 2048;
const BODY_MAX = 100_000;

const ID_RE = /^(req|thr|art|agt)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const READ_PREFIXES = ["/user/items/", "/user/collections/", "/user/agent/threads/"];

function home() {
  mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  chmodSync(ROOT, 0o700);
}

function writeSecret(path, text) {
  home();
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function readSecret(path) {
  return readFileSync(path, "utf8").trim();
}

function tokenPath() {
  const flag = argValue("--token-file");
  return flag || TOKEN_PATH;
}

function readToken() {
  return readSecret(tokenPath());
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  return process.argv[index + 1] || "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function canonical(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
  return out;
}

function scalars(value) {
  return typeof value === "string" ? Array.from(value).length : -1;
}

function artifactIdFor(requestId) {
  if (!ID_RE.test(requestId) || !requestId.startsWith("req-")) return "";
  return `art-${requestId.slice(4)}`;
}

function allowRead(path) {
  return typeof path === "string" && path.startsWith("/user/") && !path.includes("..") && READ_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function redact(text) {
  return String(text).replace(/blocklet-[A-Za-z0-9-]+/g, "blocklet-[redacted]");
}

function clearProxy() {
  for (const key of ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "all_proxy"]) {
    delete process.env[key];
  }
}

async function mcp(token, name, args) {
  clearProxy();
  let response;
  try {
    response = await fetch(MCP, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": "aside-scan/1",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
  } catch (error) {
    return { http: 0, ok: false, network: true, text: redact(error?.cause?.message || error?.message || "network") };
  }
  const raw = await response.text();
  let message;
  try {
    message = parseMcp(raw);
  } catch {
    return { http: response.status, ok: false, text: redact(raw).slice(0, 400) };
  }
  const text = (message.result?.content ?? []).map((part) => part.text ?? "").join("\n");
  return {
    http: response.status,
    ok: response.status === 200 && message.result?.isError !== true,
    text,
    isError: message.result?.isError === true,
  };
}

function parseMcp(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const lines = [...trimmed.matchAll(/^data: (.*)$/gm)].map((match) => match[1]).filter((line) => line !== "[DONE]");
  if (lines.length === 0) throw new Error("empty mcp response");
  return JSON.parse(lines[lines.length - 1]);
}

function contentJson(text) {
  const marker = "CONTENT_JSON";
  const index = text.indexOf(marker);
  if (index < 0) return null;
  return JSON.parse(text.slice(index + marker.length).trim());
}

async function listPaths(token, path) {
  const paths = [];
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const listed = await mcp(token, "afs_list", { path, limit: 1000, offset });
    if (listed.network) return { network: true, paths, text: listed.text };
    if (listed.http === 401) return { auth: true, paths, text: listed.text };
    if (listed.text.includes("D1_ERROR")) return { d1: true, paths, text: listed.text };
    if (!listed.ok && listed.text.includes("AFS_NOT_FOUND")) return { missing: true, paths };
    if (!listed.ok) return { error: listed.text.split("\n")[0] || "list failed", paths };
    for (const line of listed.text.split("\n")) {
      const match = line.match(/^ENTRY (\S+)/);
      if (match) paths.push(match[1]);
    }
    const next = listed.text.match(/NEXT_OFFSET (\d+)/);
    if (!next) return { paths };
    offset = Number(next[1]);
  }
  return { paths };
}

async function signedIn(token) {
  if (!token.startsWith("blocklet-")) return false;
  const listed = await mcp(token, "afs_list", { path: "/user", limit: 100 });
  if (listed.network) return "network";
  if (listed.http === 401 || listed.isError || listed.text.includes("AFS_NOT_FOUND")) return false;
  return listed.ok && listed.text.includes("ENTRY /user/");
}

function stopForGate(gate) {
  if (gate === "network") {
    console.log("UNCHECKED");
    process.exitCode = 3;
    return true;
  }
  if (gate !== true) {
    console.log("AUTH");
    process.exitCode = 2;
    return true;
  }
  return false;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function ensureLocalInstallation(name) {
  home();
  try {
    const current = loadJson(INSTALL_PATH);
    if (ID_RE.test(current.installationId) && current.installationId.startsWith("agt-") && typeof current.name === "string") {
      return current;
    }
  } catch {
    // Create the installation the first time.
  }
  const record = {
    installationId: `agt-${randomUUID()}`,
    name: name.slice(0, 80) || "Aside agent",
  };
  writeSecret(INSTALL_PATH, `${canonical(record)}\n`);
  return record;
}

async function ensureCloudInstallation(token, record) {
  const path = `/user/agent/installations/${record.installationId}.json`;
  const existing = await mcp(token, "afs_read", { path });
  if (existing.ok && existing.text.includes(record.installationId)) return "present";
  const written = await mcp(token, "afs_write", {
    path,
    mode: "create",
    content: canonical({ installationId: record.installationId, name: record.name }),
  });
  if (written.ok) return "created";
  return "skipped";
}

async function postForm(url, fields) {
  clearProxy();
  const body = new URLSearchParams(fields);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "user-agent": "aside-scan/1",
      },
      body,
    });
  } catch (error) {
    return { http: 0, network: true, json: null, text: redact(error?.cause?.message || error?.message || "network") };
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { http: response.status, json, text: redact(text).slice(0, 400) };
}

async function registerClient() {
  try {
    const saved = loadJson(CLIENT_PATH);
    if (typeof saved.client_id === "string" && saved.client_id.length > 0) return saved.client_id;
  } catch {
    // Register once.
  }
  const attempts = [
    {
      client_name: "Aside agent",
      grant_types: ["urn:ietf:params:oauth:grant-type:device_code"],
      response_types: [],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    },
    {
      client_name: "Aside agent",
      redirect_uris: ["http://127.0.0.1/callback"],
      grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  ];
  let last = "register failed";
  for (const payload of attempts) {
    clearProxy();
    const response = await fetch(`${HOST}/.well-known/service/oauth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "aside-scan/1",
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (response.ok && json?.client_id) {
      writeSecret(CLIENT_PATH, `${JSON.stringify({ client_id: json.client_id })}\n`);
      return json.client_id;
    }
    last = redact(text).slice(0, 300);
  }
  throw new Error(last);
}

async function beginAuth(name) {
  try {
    const gate = await signedIn(readToken());
    if (gate === "network") {
      console.log("UNCHECKED");
      process.exitCode = 3;
      return;
    }
    if (gate === true) {
      await finishInstall(readToken(), name);
      console.log("AUTH_OK");
      return;
    }
  } catch {
    // No saved token yet.
  }
  const clientId = await registerClient();
  const started = await postForm(`${HOST}/.well-known/service/oauth/device_authorization`, {
    client_id: clientId,
    scope: "mcp",
  });
  if (started.network) {
    console.log("UNCHECKED");
    process.exitCode = 3;
    return;
  }
  const device = started.json;
  if (!device?.device_code || !device.verification_uri_complete || !device.user_code) {
    console.log("AUTH");
    console.log(started.text || "device authorization failed");
    process.exitCode = 2;
    return;
  }
  const pending = {
    client_id: clientId,
    device_code: device.device_code,
    interval: Math.max(5, Number(device.interval) || 5),
    expires_at: Date.now() + (Number(device.expires_in) || 300) * 1000,
    user_code: device.user_code,
    url: device.verification_uri_complete,
  };
  writeSecret(PENDING_PATH, `${JSON.stringify(pending)}\n`);
  openBrowser(pending.url);
  console.log("APPROVE");
  console.log(`user_code: ${pending.user_code}`);
  console.log(`url: ${pending.url}`);
  console.log("role: owner");
}

function openBrowser(url) {
  if (process.platform !== "darwin") return;
  try {
    const child = spawn("open", [url], { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    // The URL is already printed.
  }
}

async function waitAuth(name) {
  let pending;
  try {
    pending = loadJson(PENDING_PATH);
  } catch {
    console.log("AUTH");
    console.log("no pending approval");
    process.exitCode = 2;
    return;
  }
  while (Date.now() < pending.expires_at) {
    const token = await postForm(`${HOST}/.well-known/service/oauth/token`, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: pending.device_code,
      client_id: pending.client_id,
    });
    if (token.network) {
      await new Promise((resolve) => setTimeout(resolve, pending.interval * 1000));
      continue;
    }
    const access = token.json?.access_token;
    if (typeof access === "string" && access.startsWith("blocklet-")) {
      writeSecret(TOKEN_PATH, access);
      rmSync(PENDING_PATH, { force: true });
      if (!(await signedIn(access))) {
        console.log("AUTH");
        console.log("token was rejected");
        process.exitCode = 2;
        return;
      }
      await finishInstall(access, name);
      console.log("AUTH_OK");
      return;
    }
    const error = token.json?.error;
    if (error && error !== "authorization_pending" && error !== "slow_down" && error !== "invalid_grant") {
      console.log("AUTH");
      console.log(redact(error));
      process.exitCode = 2;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pending.interval * 1000));
  }
  rmSync(PENDING_PATH, { force: true });
  console.log("AUTH");
  console.log("approval expired");
  process.exitCode = 2;
}

async function finishInstall(token, name) {
  const record = ensureLocalInstallation(name);
  const cloud = await ensureCloudInstallation(token, record);
  if (cloud === "skipped") console.error("INSTALL_SKIPPED");
}

async function readRequest(token, path) {
  const read = await mcp(token, "afs_read", { path });
  if (read.network) return { network: true };
  if (read.http === 401) return { auth: true };
  if (!read.ok) return { missing: true };
  const record = contentJson(read.text);
  if (!record?.requestId || !record.threadId || typeof record.instruction !== "string") return { bad: true };
  return { record };
}

async function headerPresent(token, threadId, artifactId) {
  const read = await mcp(token, "afs_read", {
    path: `/user/agent/threads/${threadId}/artifacts/${artifactId}.json`,
  });
  if (read.network) return { network: true };
  if (read.http === 401) return { auth: true };
  if (read.text.includes("D1_ERROR")) return { d1: true };
  if (!read.ok || read.text.includes("AFS_NOT_FOUND")) return { present: false };
  return { present: read.text.includes(artifactId) };
}

async function listOpen() {
  const token = readToken();
  if (stopForGate(await signedIn(token))) return;
  const threads = await listPaths(token, "/user/agent/threads");
  if (threads.network) {
    console.log("UNCHECKED");
    console.log(redact(threads.text || "network"));
    process.exitCode = 3;
    return;
  }
  if (threads.auth) {
    console.log("AUTH");
    process.exitCode = 2;
    return;
  }
  if (threads.missing) {
    console.log("QUEUE_EMPTY");
    return;
  }
  if (threads.d1 || threads.error) {
    console.log("UNCHECKED");
    console.log(redact(threads.text || threads.error || "D1_ERROR"));
    process.exitCode = 3;
    return;
  }
  const open = [];
  let unchecked = false;
  for (const threadPath of threads.paths) {
    const threadId = threadPath.split("/").pop();
    if (!ID_RE.test(threadId) || !threadId.startsWith("thr-")) continue;
    const tomb = await mcp(token, "afs_read", { path: `/user/agent/tombstones/${threadId}.json` });
    if (tomb.network) {
      unchecked = true;
      continue;
    }
    if (tomb.ok && tomb.text.includes(threadId)) continue;
    const requests = await listPaths(token, `${threadPath}/requests`);
    const artifacts = await listPaths(token, `${threadPath}/artifacts`);
    if (requests.network || artifacts.network) {
      console.log("UNCHECKED");
      process.exitCode = 3;
      return;
    }
    if (requests.auth || artifacts.auth) {
      console.log("AUTH");
      process.exitCode = 2;
      return;
    }
    if (requests.d1 || artifacts.d1) {
      unchecked = true;
      continue;
    }
    const names = new Set((artifacts.paths ?? []).map((item) => item.split("/").pop()));
    for (const requestPath of requests.paths ?? []) {
      const name = requestPath.split("/").pop();
      if (!name?.endsWith(".json")) continue;
      const requestId = name.slice(0, -".json".length);
      if (!requestId.startsWith("req-")) continue;
      const artifactId = artifactIdFor(requestId);
      if (names.has(`${artifactId}.json`)) continue;
      if (artifacts.error) {
        const header = await headerPresent(token, threadId, artifactId);
        if (header.network) {
          unchecked = true;
          continue;
        }
        if (header.auth) {
          console.log("AUTH");
          process.exitCode = 2;
          return;
        }
        if (header.d1) {
          unchecked = true;
          continue;
        }
        if (header.present) continue;
      }
      const loaded = await readRequest(token, requestPath);
      if (loaded.network) {
        unchecked = true;
        continue;
      }
      if (loaded.auth) {
        console.log("AUTH");
        process.exitCode = 2;
        return;
      }
      if (!loaded.record) continue;
      open.push(loaded.record);
    }
  }
  open.sort((left, right) => {
    const time = String(left.submittedAt ?? "").localeCompare(String(right.submittedAt ?? ""));
    if (time !== 0) return time;
    return left.requestId.localeCompare(right.requestId);
  });
  if (unchecked) {
    console.log("UNCHECKED");
    process.exitCode = 3;
    return;
  }
  if (open.length === 0) {
    console.log("QUEUE_EMPTY");
    return;
  }
  const first = open[0];
  console.log("OPEN");
  console.log(`OPEN_COUNT ${open.length}`);
  console.log(canonical({
    threadId: first.threadId,
    requestId: first.requestId,
    submittedAt: first.submittedAt ?? null,
    instruction: first.instruction,
    source: first.source ?? { type: "none" },
  }));
}

function validateBody(noteDocument) {
  if (!noteDocument || noteDocument.version !== 1 || !Array.isArray(noteDocument.blocks)) {
    return "noteDocument must be version 1 with blocks";
  }
  for (const block of noteDocument.blocks) {
    if (!block || typeof block !== "object" || Object.keys(block).length !== 1) return "a block must have one key";
    if (block.text) {
      const text = block.text._0;
      if (typeof text !== "string" || text.length === 0) return "text block is empty";
      if (text.includes("http://") || text.includes("https://")) return "text block contains a URL";
      continue;
    }
    const attachment = block.attachment?._0;
    if (!attachment || attachment.kind !== "link") return "only link attachments are written";
    if (typeof attachment.url !== "string" || !/^https?:\/\//.test(attachment.url)) return "link url is missing";
    if (scalars(attachment.title) < 1 || scalars(attachment.title) > 80) return "link title must be 1..80";
    const keys = Object.keys(attachment).sort().join(",");
    if (keys !== "kind,title,url") return "link attachment has extra fields";
  }
  return "";
}

async function readPath() {
  const path = argValue("--path");
  if (!allowRead(path)) {
    console.log("FAIL");
    console.log("path is outside the library and the agent directory");
    process.exitCode = 3;
    return;
  }
  const token = readToken();
  if (stopForGate(await signedIn(token))) return;
  const read = await mcp(token, "afs_read", { path });
  if (read.network) {
    console.log("UNCHECKED");
    process.exitCode = 3;
    return;
  }
  if (read.http === 401) {
    console.log("AUTH");
    process.exitCode = 2;
    return;
  }
  if (read.text.includes("D1_ERROR")) {
    console.log("UNCHECKED");
    process.exitCode = 3;
    return;
  }
  if (!read.ok || read.text.includes("AFS_NOT_FOUND")) {
    console.log("NOT_FOUND");
    return;
  }
  const json = contentJson(read.text);
  const body = json ? canonical(json) : read.text;
  const limited = body.length > 80_000 ? `${body.slice(0, 80_000)}\nTRUNCATED` : body;
  console.log("READ");
  console.log(redact(limited));
}

async function writeReply() {
  const token = readToken();
  const requestId = argValue("--request");
  const title = argValue("--title");
  const summary = argValue("--summary");
  const bodyFile = argValue("--body-file");
  if (!ID_RE.test(requestId) || !bodyFile) {
    console.log("FAIL");
    console.log("request and body file are required");
    process.exitCode = 3;
    return;
  }
  if (scalars(title) < 1 || scalars(title) > 80 || scalars(summary) < 1 || scalars(summary) > 240) {
    console.log("FAIL");
    console.log("title must be 1..80 and summary 1..240");
    process.exitCode = 3;
    return;
  }
  const noteDocument = loadJson(bodyFile);
  const bodyError = validateBody(noteDocument);
  if (bodyError) {
    console.log("FAIL");
    console.log(bodyError);
    process.exitCode = 3;
    return;
  }
  const threads = await listPaths(token, "/user/agent/threads");
  if (threads.network) {
    console.log("UNCHECKED");
    process.exitCode = 3;
    return;
  }
  if (threads.auth) {
    console.log("AUTH");
    process.exitCode = 2;
    return;
  }
  let record = null;
  for (const threadPath of threads.paths ?? []) {
    const candidate = `${threadPath}/requests/${requestId}.json`;
    const loaded = await readRequest(token, candidate);
    if (loaded.network) {
      console.log("UNCHECKED");
      process.exitCode = 3;
      return;
    }
    if (loaded.auth) {
      console.log("AUTH");
      process.exitCode = 2;
      return;
    }
    if (loaded.record?.requestId === requestId) {
      record = loaded.record;
      break;
    }
  }
  if (!record) {
    console.log("FAIL");
    console.log("request was not found");
    process.exitCode = 3;
    return;
  }
  const artifactId = artifactIdFor(requestId);
  const headerPath = `/user/agent/threads/${record.threadId}/artifacts/${artifactId}.json`;
  const bodyPath = `/user/agent/threads/${record.threadId}/artifacts/${artifactId}.body.json`;
  const installation = ensureLocalInstallation(argValue("--name") || "Aside agent");
  const header = {
    agentLabel: installation.name,
    artifactId,
    cause: "request",
    installationId: installation.installationId,
    outcome: "replied",
    previousArtifactId: null,
    recommendations: [],
    refs: [],
    requestId,
    requestIds: [requestId],
    source: record.source ?? { type: "none" },
    summary,
    threadId: record.threadId,
    title,
  };
  if (header.source?.type === "none") header.source = { type: "none" };
  const headerText = canonical(header);
  const bodyText = canonical({ noteDocument });
  if (Buffer.byteLength(headerText) > HEADER_MAX || Buffer.byteLength(bodyText) > BODY_MAX) {
    console.log("FAIL");
    console.log("header or body is too large");
    process.exitCode = 3;
    return;
  }
  const existing = await headerPresent(token, record.threadId, artifactId);
  if (existing.network) {
    console.log("UNCHECKED");
    process.exitCode = 3;
    return;
  }
  if (existing.auth) {
    console.log("AUTH");
    process.exitCode = 2;
    return;
  }
  if (!existing.present) {
    const wrote = await mcp(token, "afs_write", { path: headerPath, mode: "create", content: headerText });
    if (wrote.network) {
      console.log("UNCHECKED");
      process.exitCode = 3;
      return;
    }
    if (wrote.http === 401) {
      console.log("AUTH");
      process.exitCode = 2;
      return;
    }
    if (!wrote.ok) {
      console.log("FAIL");
      console.log(redact(wrote.text).slice(0, 300));
      process.exitCode = 3;
      return;
    }
  }
  const bodyRead = await mcp(token, "afs_read", { path: bodyPath });
  if (bodyRead.network) {
    console.log("UNCHECKED");
    process.exitCode = 3;
    return;
  }
  if (!(bodyRead.ok && bodyRead.text.includes("noteDocument"))) {
    const wrote = await mcp(token, "afs_write", { path: bodyPath, mode: "create", content: bodyText });
    if (wrote.network) {
      console.log("UNCHECKED");
      process.exitCode = 3;
      return;
    }
    if (!wrote.ok) {
      console.log("FAIL");
      console.log(redact(wrote.text).slice(0, 300));
      process.exitCode = 3;
      return;
    }
  }
  const check = await headerPresent(token, record.threadId, artifactId);
  if (check.network || check.d1) {
    console.log("UNCHECKED");
    process.exitCode = 3;
    return;
  }
  if (check.auth) {
    console.log("AUTH");
    process.exitCode = 2;
    return;
  }
  if (!check.present) {
    console.log("FAIL");
    console.log("header was not readable after write");
    process.exitCode = 3;
    return;
  }
  console.log(existing.present ? "ALREADY" : "HEADER_PRESENT");
  console.log(artifactId);
}

function selfTest() {
  const sorted = canonical({ b: 1, a: { d: 1, c: 2 } });
  if (sorted !== '{"a":{"c":2,"d":1},"b":1}') throw new Error("canonical");
  if (artifactIdFor("req-a158ed99-cdbc-4203-a8d5-b85e3f2dff94") !== "art-a158ed99-cdbc-4203-a8d5-b85e3f2dff94") {
    throw new Error("artifact id");
  }
  if (!validateBody({ version: 1, blocks: [{ text: { _0: "没有链接。" } }] })) {
    // empty string is success
  } else throw new Error("text");
  if (validateBody({ version: 1, blocks: [{ text: { _0: "see https://example.com" } }] }) === "") {
    throw new Error("url in text");
  }
  const requests = [
    { requestId: "req-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", submittedAt: "2026-11-04T00:00:02Z" },
    { requestId: "req-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", submittedAt: "2026-11-04T00:00:02Z" },
    { requestId: "req-cccccccc-cccc-4ccc-8ccc-cccccccccccc", submittedAt: "2026-11-04T00:00:01Z" },
  ];
  requests.sort((left, right) => left.submittedAt.localeCompare(right.submittedAt) || left.requestId.localeCompare(right.requestId));
  if (requests[0].requestId !== "req-cccccccc-cccc-4ccc-8ccc-cccccccccccc") throw new Error("oldest");
  if (requests[1].requestId !== "req-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") throw new Error("tie break");
  if (!allowRead("/user/items/abc.json")) throw new Error("allow item");
  if (allowRead("/user/items/../.secrets")) throw new Error("reject traversal");
  if (allowRead("/user/agent/installations/agt.json")) throw new Error("reject installation");
  console.log("SELF_TEST_OK");
}

async function main() {
  const command = process.argv[2];
  const name = argValue("--name") || "Aside agent";
  if (command === "self-test") selfTest();
  else if (command === "auth" && hasFlag("--wait")) await waitAuth(name);
  else if (command === "auth") await beginAuth(name);
  else if (command === "list") await listOpen();
  else if (command === "read") await readPath();
  else if (command === "write") await writeReply();
  else {
    console.log("usage: aside-cloud.mjs auth [--wait] | list | read | write | self-test");
    process.exitCode = 2;
  }
}

try {
  await main();
} catch (error) {
  if (error?.code === "ENOENT" && error.path === tokenPath()) {
    console.log("AUTH");
    process.exitCode = 2;
  } else {
    console.log("FAIL");
    console.log(redact(error?.message || "failed"));
    process.exitCode = 3;
  }
}
