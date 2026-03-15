import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ──────────────────────────────────────────────────
const YOLO_HOST  = process.env.YOLO_URL  || "http://127.0.0.1:8000";
const FLASK_HOST = process.env.FLASK_URL || "http://127.0.0.1:5000";

// ─── Database ─────────────────────────────────────────────────
const db = new Database("faces.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    descriptor TEXT NOT NULL,
    encoding_json TEXT,
    thumb TEXT,
    count INTEGER DEFAULT 0,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ─── Proxy helper ─────────────────────────────────────────────
function proxyRequest(
  req: express.Request,
  res: express.Response,
  targetBase: string,
  rewritePath?: string
) {
  const targetUrl = new URL(rewritePath ?? req.url, targetBase);
  const options = {
    hostname: targetUrl.hostname,
    port: Number(targetUrl.port) || 80,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      "content-type": req.headers["content-type"] || "application/json",
    },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("error", (err) => {
    console.error("[proxy error]", err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: "Upstream service unavailable", detail: err.message });
    }
  });

  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const body = JSON.stringify(req.body);
    proxy.setHeader("content-length", Buffer.byteLength(body));
    proxy.write(body);
  }

  proxy.end();
}

// ─── Server ───────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3001;

  app.use(express.json({ limit: "50mb" }));

  // Allow CORS for dev
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (_req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  // ─── Face / User API ─────────────────────────────────────────

  // GET all users
  app.get("/api/users", (_req, res) => {
    const users = db.prepare("SELECT * FROM users").all() as any[];
    res.json(users.map((u) => ({
      ...u,
      descriptor: u.descriptor ? JSON.parse(u.descriptor) : [],
      count: u.count ?? 0,
    })));
  });

  // POST create user (original endpoint)
  app.post("/api/users", (req, res) => {
    const { name, descriptor } = req.body;
    if (!name || !descriptor) {
      return res.status(400).json({ error: "Name and descriptor are required" });
    }
    try {
      const info = db
        .prepare("INSERT INTO users (name, descriptor) VALUES (?, ?)")
        .run(name, JSON.stringify(descriptor));
      res.json({ id: info.lastInsertRowid });
    } catch (e: any) {
      res.status(409).json({ error: "User already exists", detail: e.message });
    }
  });

  // POST /api/register — used by App.tsx face induction flow
  app.post("/api/register", (req, res) => {
    const { name, encoding, thumb } = req.body;
    if (!name || !encoding) {
      return res.status(400).json({ ok: false, msg: "Name and encoding are required." });
    }
    try {
      // Parse encoding — App.tsx sends JSON.stringify(descriptor)
      const parsed = typeof encoding === "string" ? JSON.parse(encoding) : encoding;
      const info = db.prepare(`
        INSERT INTO users (name, descriptor, encoding_json, thumb, count)
        VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(name) DO UPDATE SET
          descriptor   = excluded.descriptor,
          encoding_json= excluded.encoding_json,
          thumb        = excluded.thumb
      `).run(
        name,
        JSON.stringify(parsed),
        JSON.stringify(parsed),
        thumb ?? null
      );
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e: any) {
      console.error("[register error]", e);
      res.status(500).json({ ok: false, msg: e.message });
    }
  });

  // DELETE /api/users/:id
  app.delete("/api/users/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM attendance WHERE user_id = ?").run(id);
    const info = db.prepare("DELETE FROM users WHERE id = ?").run(id);
    if (info.changes === 0) return res.status(404).json({ error: "User not found" });
    res.json({ success: true });
  });

  // ─── Attendance ───────────────────────────────────────────────

  app.post("/api/attendance", (req, res) => {
    const { user_id, name } = req.body;

    // Accept by user_id or by name
    let uid = user_id;
    let userName = name;
    if (!uid && name) {
      const u = db.prepare("SELECT id, name FROM users WHERE name = ?").get(name) as any;
      if (u) { uid = u.id; userName = u.name; }
    }

    if (!uid && !name) {
      return res.status(400).json({ error: "user_id or name required" });
    }

    // Duplicate guard: 5 minutes
    const recent = db
      .prepare(`SELECT * FROM attendance WHERE (user_id = ? OR name = ?) AND timestamp > datetime('now', '-5 minutes')`)
      .get(uid ?? -1, userName ?? "");

    if (recent) {
      return res.json({ message: "Attendance already logged recently", status: "duplicate" });
    }

    db.prepare("INSERT INTO attendance (user_id, name) VALUES (?, ?)").run(uid ?? null, userName ?? null);

    // Increment scan count on user
    if (uid) db.prepare("UPDATE users SET count = count + 1 WHERE id = ?").run(uid);

    res.json({ success: true, status: "logged" });
  });

  app.get("/api/attendance", (req, res) => {
    const { search, date } = req.query as Record<string, string>;
    let query = `
      SELECT a.id, COALESCE(u.name, a.name) as name, a.timestamp
      FROM attendance a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params: string[] = [];
    if (search) { query += ` AND COALESCE(u.name, a.name) LIKE ?`; params.push(`%${search}%`); }
    if (date)   { query += ` AND date(a.timestamp) = ?`;             params.push(date); }
    query += ` ORDER BY a.timestamp DESC LIMIT 200`;
    const logs = db.prepare(query).all(...params);
    res.json(logs);
  });

  // ─── Face matching ────────────────────────────────────────────

  app.get("/api/users/descriptors", (_req, res) => {
    const users = db.prepare("SELECT id, name, descriptor FROM users").all() as any[];
    res.json(users.map((u) => ({
      id: u.id,
      name: u.name,
      descriptor: JSON.parse(u.descriptor),
    })));
  });

  app.post("/api/recognize", (req, res) => {
    const { descriptor } = req.body;
    if (!descriptor || !Array.isArray(descriptor)) {
      return res.status(400).json({ error: "descriptor array required" });
    }
    const users = db.prepare("SELECT id, name, descriptor FROM users").all() as any[];
    if (users.length === 0) return res.json({ match: null, confidence: 0 });

    let bestMatch: { id: number; name: string } | null = null;
    let bestDist = Infinity;

    for (const user of users) {
      const known = JSON.parse(user.descriptor) as number[];
      const dist = Math.sqrt(
        known.reduce((sum: number, val: number, i: number) =>
          sum + Math.pow(val - (descriptor as number[])[i], 2), 0)
      );
      if (dist < bestDist) { bestDist = dist; bestMatch = { id: user.id, name: user.name }; }
    }

    const THRESHOLD = 0.6;
    return res.json(
      bestDist <= THRESHOLD
        ? { match: bestMatch, confidence: Math.round((1 - bestDist / THRESHOLD) * 100) / 100 }
        : { match: null, confidence: 0 }
    );
  });

  // ─── YOLO proxy routes ("/yolo/*" → localhost:8000) ──────────

  app.all("/yolo/*", (req, res) => {
    const upstreamPath = req.url.replace(/^\/yolo/, "") || "/";
    proxyRequest(req, res, YOLO_HOST, upstreamPath);
  });

  // ─── Flask proxy routes ("/flask/*" → localhost:5000) ────────

  app.all("/flask/*", (req, res) => {
    const upstreamPath = req.url.replace(/^\/flask/, "") || "/";
    proxyRequest(req, res, FLASK_HOST, upstreamPath);
  });

  // ─── Health check ─────────────────────────────────────────────

  app.get("/api/health", (_req, res) => {
    const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
    const logCount  = (db.prepare("SELECT COUNT(*) as c FROM attendance").get() as any).c;
    res.json({ status: "ok", users: userCount, attendance: logCount, port: PORT });
  });

  // ─── Vite middleware (dev only) ───────────────────────────────

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🟢 FaceNet-Node Express API  →  http://localhost:${PORT}`);
    console.log(`   /api/users          — face identity store`);
    console.log(`   /api/register       — face induction`);
    console.log(`   /api/attendance     — access logs`);
    console.log(`   /yolo/*             — proxy → YOLO :8000`);
    console.log(`   /flask/*            — proxy → Flask :5000`);
  });
}

startServer();
