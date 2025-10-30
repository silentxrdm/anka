/**
 * Silent SMS - server (zonder externe modules)
 * - Serveert /public (multi-page)
 * - Proxy naar Ankarex API (token blijft server-side)
 * - Local JSON DB: data/{contacts,lists,campaigns}.json
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

// ── Config ───────────────────────────────────────────────────────────────────
const cfgPath = path.join(__dirname, "config.json");
let fileCfg = {};
if (fs.existsSync(cfgPath)) {
  try { fileCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch {}
}
const CFG = {
  ANKAREX_BASE_URL: process.env.ANKAREX_BASE_URL || fileCfg.ANKAREX_BASE_URL || "https://rest.ankarex.ltd",
  ANKAREX_TOKEN: process.env.ANKAREX_TOKEN || fileCfg.ANKAREX_TOKEN || "",
  PORT: Number(process.env.PORT || fileCfg.PORT || 8080)
};
if (!CFG.ANKAREX_TOKEN || CFG.ANKAREX_TOKEN.includes("PUT_YOUR_REAL_TOKEN")) {
  console.warn("[WARN] ANKAREX_TOKEN ontbreekt of is voorbeeld. Vul config.json aan.");
}

// ── DB utils ────────────────────────────────────────────────────────────────
const dataDir = path.join(__dirname, "data");
const DB = {
  contacts: path.join(dataDir, "contacts.json"),
  lists: path.join(dataDir, "lists.json"),
  campaigns: path.join(dataDir, "campaigns.json")
};
function ensureFiles() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  for (const p of Object.values(DB)) {
    if (!fs.existsSync(p)) fs.writeFileSync(p, "[]", "utf8");
  }
}
ensureFiles();

function readJSON(p) {
  try {
    const t = fs.readFileSync(p, "utf8");
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeJSON(p, arr) {
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), "utf8");
  fs.renameSync(tmp, p);
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function send(res, status, data, headers = {}) {
  const isStr = typeof data === "string";
  res.writeHead(status, {
    "Content-Type": isStr ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(isStr ? data : JSON.stringify(data));
}
function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}
function parseJSON(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", ch => {
      raw += ch;
      if (raw.length > 5e6) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

// ── Normalisatie / validatie (NL-first) ──────────────────────────────────────
function isE164(s) { return /^\+\d{7,15}$/.test(s); }
function normalizeNumber(raw, defaultCc = "+31", assumeTrunk0 = true) {
  if (!raw) return { out: "", reason: "empty" };
  let s = String(raw).trim().replace(/[\s\-().]+/g, "");
  if (s.startsWith("00")) {
    s = "+" + s.slice(2).replace(/\D/g, "");
  } else if (s.startsWith("+")) {
    s = "+" + s.slice(1).replace(/\D/g, "");
  } else {
    s = s.replace(/\D/g, "");
    if (!s) return { out: "", reason: "nodigits" };
    if (assumeTrunk0 && s.startsWith("0")) {
      s = s.slice(1);
      s = (defaultCc || "+31") + s;
    } else {
      s = (defaultCc || "+31") + s;
    }
  }
  if (!isE164(s)) return { out: s, reason: "not_e164" };
  // extra NL mobiel check: +316 gevolgd door 8 cijfers
  if (s.startsWith("+316")) {
    const rest = s.slice(4);
    if (rest.length !== 8) return { out: s, reason: "nl_length" };
  }
  return { out: s, reason: "ok" };
}

// ── Ankarex proxy ───────────────────────────────────────────────────────────
function ankarexPost(payload) {
  const base = new URL(CFG.ANKAREX_BASE_URL);
  const body = JSON.stringify({ token: CFG.ANKAREX_TOKEN, ...payload });
  const options = {
    hostname: base.hostname,
    port: base.port || 443,
    path: base.pathname || "/",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "User-Agent": "silent-sms/2.0"
    }
  };
  return new Promise((resolve, reject) => {
    const rq = https.request(options, (rs) => {
      let chunks = "";
      rs.on("data", d => chunks += d);
      rs.on("end", () => {
        const text = chunks || "";
        let json;
        try { json = JSON.parse(text); }
        catch { json = { raw: text }; }
        if (rs.statusCode >= 200 && rs.statusCode < 300) resolve(json);
        else reject(new Error(`HTTP ${rs.statusCode}: ${text}`));
      });
    });
    rq.on("error", reject);
    rq.write(body);
    rq.end();
  });
}

// ── Static ──────────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, "public");
function serveStatic(_req, res, pathname) {
  const safe = path.normalize(path.join(publicDir, pathname));
  if (!safe.startsWith(publicDir)) return notFound(res);

  let filePath = safe;
  if (fs.existsSync(filePath)) {
    try {
      const st = fs.statSync(filePath);
      if (st.isDirectory()) filePath = path.join(filePath, "index.html");
    } catch {
      return notFound(res);
    }
  }
  if (!fs.existsSync(filePath)) return notFound(res);

  const ext = path.extname(filePath).toLowerCase();
  const ctype =
    ext === ".html" ? "text/html; charset=utf-8" :
    ext === ".css"  ? "text/css; charset=utf-8" :
    ext === ".js"   ? "application/javascript; charset=utf-8" :
                      "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": ctype,
    "Cache-Control": ext === ".html" ? "no-store" : "max-age=3600"
  });
  fs.createReadStream(filePath).pipe(res);
}

// ── API: Lists & Campaigns ──────────────────────────────────────────────────
async function handleLists(req, res, pathname, _query) {
  // /api/lists
  if (pathname === "/api/lists" && req.method === "GET") {
    const items = readJSON(DB.lists);
    const out = items.map(l => ({
      id: l.id,
      name: l.name,
      count: (l.items || []).length,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt
    }));
    return send(res, 200, { count: out.length, items: out });
  }
  if (pathname === "/api/lists" && req.method === "POST") {
    const { name } = await parseJSON(req);
    if (!name || !String(name).trim()) return send(res, 400, { error: "name verplicht" });
    const db = readJSON(DB.lists);
    const now = new Date().toISOString();
    db.push({ id: uid(), name: String(name).trim(), createdAt: now, updatedAt: now, items: [] });
    writeJSON(DB.lists, db);
    return send(res, 200, { info: "CREATED" });
  }

  // /api/lists/:id and nested
  if (pathname.startsWith("/api/lists/")) {
    const parts = pathname.split("/").filter(Boolean); // [api,lists,:id,(items|...)]
    const listId = parts[2];
    const db = readJSON(DB.lists);
    const i = db.findIndex(l => l.id === listId);
    if (i < 0) return send(res, 404, { error: "list not found" });

    // GET list detail
    if (parts.length === 3 && req.method === "GET") {
      return send(res, 200, db[i]);
    }
    // PUT rename
    if (parts.length === 3 && req.method === "PUT") {
      const { name } = await parseJSON(req);
      if (!name || !String(name).trim()) return send(res, 400, { error: "name verplicht" });
      db[i].name = String(name).trim();
      db[i].updatedAt = new Date().toISOString();
      writeJSON(DB.lists, db);
      return send(res, 200, { info: "UPDATED", list: db[i] });
    }
    // DELETE list
    if (parts.length === 3 && req.method === "DELETE") {
      db.splice(i, 1);
      writeJSON(DB.lists, db);
      return send(res, 200, { info: "DELETED" });
    }

    // /api/lists/:id/items*
    if (parts.length >= 4 && parts[3] === "items") {
      // GET /api/lists/:id/items
      if (parts.length === 4 && req.method === "GET") {
        return send(res, 200, { items: db[i].items || [] });
      }

      // POST /api/lists/:id/items/import
      if (parts.length === 5 && parts[4] === "import" && req.method === "POST") {
        const body = await parseJSON(req);
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const defaultCc = body.defaultCc || "+31";
        const assumeTrunk0 = body.assumeTrunk0 !== false;
        const dedupe = body.dedupe !== false;
        if (!rows.length) return send(res, 400, { error: "rows[] leeg" });

        const seen = new Set((db[i].items || []).map(x => x.normalized).filter(Boolean));
        let added = 0, skipped = 0;
        for (const r of rows) {
          const raw = String(r.raw || "").trim();
          const label = String(r.label || "").trim();
          const { out, reason } = normalizeNumber(raw, defaultCc, assumeTrunk0);
          const valid = reason === "ok";
          const normalized = out;
          if (dedupe && normalized && seen.has(normalized)) { skipped++; continue; }
          db[i].items.push({
            id: uid(),
            raw,
            normalized,
            label,
            valid,
            reason,
            createdAt: new Date().toISOString()
          });
          if (normalized) seen.add(normalized);
          added++;
        }
        db[i].updatedAt = new Date().toISOString();
        writeJSON(DB.lists, db);
        return send(res, 200, { info: "IMPORTED", added, total: (db[i].items || []).length });
      }

      // PUT /api/lists/:id/items  (bulk actions: dedupe|autofix_nl|delete_invalid|validate_all)
      if (parts.length === 4 && req.method === "PUT") {
        const body = await parseJSON(req);
        const action = String(body.action || "").toLowerCase();
        const items = db[i].items || [];

        if (action === "dedupe") {
          const map = new Map();
          for (const it of items) if (it.normalized) map.set(it.normalized, it);
          db[i].items = Array.from(map.values());
        } else if (action === "autofix_nl" || action === "validate_all") {
          for (const it of items) {
            const raw = it.raw || it.normalized || "";
            const n = normalizeNumber(raw, "+31", true);
            it.normalized = n.out;
            it.valid = n.reason === "ok";
            it.reason = n.reason;
          }
        } else if (action === "delete_invalid") {
          db[i].items = items.filter(it => it.valid);
        } else {
          return send(res, 400, { error: "unknown action" });
        }

        db[i].updatedAt = new Date().toISOString();
        writeJSON(DB.lists, db);
        return send(res, 200, { info: "BULK_OK", count: db[i].items.length });
      }

      // /api/lists/:id/items/:itemId  (PUT/DELETE)
      if (parts.length === 5 && req.method === "PUT") {
        const itemId = parts[4];
        const body = await parseJSON(req);
        const idx = (db[i].items || []).findIndex(x => x.id === itemId);
        if (idx < 0) return send(res, 404, { error: "item not found" });

        const it = db[i].items[idx];
        if (body.raw !== undefined) it.raw = String(body.raw);
        if (body.label !== undefined) it.label = String(body.label);
        if (body.normalized !== undefined) it.normalized = String(body.normalized);

        const base = it.raw || it.normalized || "";
        const n = normalizeNumber(base, "+31", true);
        it.normalized = n.out;
        it.valid = n.reason === "ok";
        it.reason = n.reason;

        db[i].items[idx] = it;
        db[i].updatedAt = new Date().toISOString();
        writeJSON(DB.lists, db);
        return send(res, 200, { info: "UPDATED", item: it });
      }

      if (parts.length === 5 && req.method === "DELETE") {
        const itemId = parts[4];
        const n = (db[i].items || []).filter(x => x.id !== itemId);
        if (n.length === (db[i].items || []).length) return send(res, 404, { error: "item not found" });
        db[i].items = n;
        db[i].updatedAt = new Date().toISOString();
        writeJSON(DB.lists, db);
        return send(res, 200, { info: "DELETED" });
      }
    }
  }

  return notFound(res);
}

async function handleCampaigns(req, res, pathname, _query) {
  if (pathname === "/api/campaigns" && req.method === "GET") {
    const items = readJSON(DB.campaigns).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return send(res, 200, { items });
  }
  if (pathname.startsWith("/api/campaigns/") && req.method === "GET") {
    const id = pathname.split("/").pop();
    const db = readJSON(DB.campaigns);
    const it = db.find(x => x.id === id);
    if (!it) return send(res, 404, { error: "not found" });
    return send(res, 200, it);
  }
  return notFound(res);
}

// ── API: Core (account/dlr/hlr/send) ────────────────────────────────────────
async function handleCore(req, res, pathname, _query) {
  if (pathname === "/api/account" && req.method === "GET") {
    return send(res, 200, await ankarexPost({ status: "account" }));
  }
  if (pathname.startsWith("/api/dlr/") && req.method === "GET") {
    const id = pathname.split("/").pop();
    return send(res, 200, await ankarexPost({ send: "dlr", id: String(id) }));
  }
  if (pathname === "/api/hlr" && req.method === "POST") {
    const { to } = await parseJSON(req);
    if (!to) return send(res, 400, { error: "to verplicht" });
    return send(res, 200, await ankarexPost({ send: "hlr", to }));
  }

  // extended send: { list_ids:[], extra_to_csv?, sender_id, message_content, unicode, option }
  if (pathname === "/api/send" && req.method === "POST") {
    const body = await parseJSON(req);
    const list_ids = Array.isArray(body.list_ids) ? body.list_ids : [];
    const extra_to_csv = String(body.extra_to_csv || "");
    const sender_id = String(body.sender_id || "").trim();
    const message_content = String(body.message_content || "");
    const unicode = !!body.unicode;
    const option = body.option;

    if (!sender_id || !message_content) return send(res, 400, { error: "sender_id en message_content zijn verplicht" });

    // verzamel nummers uit lijsten
    const lists = readJSON(DB.lists);
    const fromLists = [];
    for (const id of list_ids) {
      const l = lists.find(x => x.id === id);
      if (l && Array.isArray(l.items)) {
        for (const it of l.items) if (it.normalized) fromLists.push(it.normalized);
      }
    }

    // parse extra csv
    function quickParseCsvNumbers(csv) {
      return csv.split(/[\r\n,]+/g).map(s => s.trim()).filter(Boolean);
    }
    const extraRaw = extra_to_csv ? quickParseCsvNumbers(extra_to_csv) : [];
    const extraNorm = extraRaw.map(x => normalizeNumber(x, "+31", true).out).filter(Boolean);

    // merge + dedupe + filter valid
    const merged = Array.from(new Set(fromLists.concat(extraNorm))).filter(isE164);
    if (!merged.length) return send(res, 400, { error: "Geen geldige nummers om te versturen" });

    // versturen
    const payload = { send: "bulk", to: merged.join(","), sender_id, message_content, unicode };
    if (option) payload.option = option;
    const resp = await ankarexPost(payload);

    // campaign loggen
    const cdb = readJSON(DB.campaigns);
    const ourId = uid();
    cdb.push({
      id: ourId,
      createdAt: new Date().toISOString(),
      campaign_id: resp && (resp.campaign_id ?? null),
      sender_id,
      unicode,
      message_content,
      list_ids,
      to_numbers: merged
    });
    writeJSON(DB.campaigns, cdb);

    return send(res, 200, { info: "SENT", campaign_id: resp.campaign_id, campaign_local_id: ourId });
  }

  return notFound(res);
}

// ── Router ──────────────────────────────────────────────────────────────────
async function handleApi(req, res, pathname, query) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.end();

  if (pathname.startsWith("/api/lists")) return handleLists(req, res, pathname, query);
  if (pathname.startsWith("/api/campaigns")) return handleCampaigns(req, res, pathname, query);
  return handleCore(req, res, pathname, query);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || "/";
  if (pathname.startsWith("/api/")) return handleApi(req, res, pathname, parsed.query);
  const rel = pathname === "/" ? "/index.html" : pathname;
  return serveStatic(req, res, rel);
});

server.listen(CFG.PORT, () => {
  console.log(`Silent SMS draait op http://localhost:${CFG.PORT}`);
});
