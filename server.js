require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SECRET = process.env.SESSION_SECRET || "development-only-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-now";

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

function initialDb() {
  return {
    tasks: [
      { id: "youtube", title: "Subscribe to YouTube", description: "Subscribe to our YouTube channel.", url: "https://youtube.com/", provider: "youtube", enabled: true },
      { id: "whatsapp", title: "Follow WhatsApp Channel", description: "Follow our WhatsApp channel.", url: "https://whatsapp.com/channel/", provider: "whatsapp", enabled: true },
      { id: "telegram", title: "Join Telegram", description: "Join our Telegram channel.", url: "https://t.me/", provider: "telegram", enabled: true }
    ],
    rewardUrl: "https://example.com/your-reward",
    rewardLabel: "Your reward link"
  };
}
function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb(), null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest();
  let actual;
  try { actual = Buffer.from(sig, "base64url"); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.exp > Date.now();
  } catch { return false; }
}
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!verifyToken(token)) return res.status(401).json({ error: "Admin login required." });
  next();
}

app.get("/api/config", (req, res) => {
  const db = readDb();
  res.json({
    tasks: db.tasks.filter(t => t.enabled).map(({ id, title, description, url, provider }) => ({ id, title, description, url, provider })),
    rewardLabel: db.rewardLabel || "Your reward link"
  });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  const a = Buffer.from(password);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  res.json({ token: sign({ role: "admin", exp: Date.now() + 8 * 60 * 60 * 1000 }) });
});

app.get("/api/admin/config", requireAdmin, (req, res) => res.json(readDb()));
app.put("/api/admin/config", requireAdmin, (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.tasks) || body.tasks.length > 20) return res.status(400).json({ error: "Invalid task list." });
  const tasks = body.tasks.map((t, i) => ({
    id: String(t.id || `task-${i + 1}`).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40),
    title: String(t.title || "").slice(0, 80),
    description: String(t.description || "").slice(0, 180),
    url: String(t.url || ""),
    provider: ["youtube", "whatsapp", "telegram", "custom"].includes(t.provider) ? t.provider : "custom",
    enabled: Boolean(t.enabled)
  }));
  for (const t of tasks) {
    try {
      const u = new URL(t.url);
      if (!["https:", "http:"].includes(u.protocol)) throw new Error();
    } catch { return res.status(400).json({ error: `Invalid URL for task: ${t.title || t.id}` }); }
    if (!t.title) return res.status(400).json({ error: "Every task needs a title." });
  }
  let rewardUrl;
  try {
    rewardUrl = new URL(String(body.rewardUrl || ""));
    if (!["https:", "http:"].includes(rewardUrl.protocol)) throw new Error();
  } catch { return res.status(400).json({ error: "Enter a valid reward URL." }); }
  writeDb({ tasks, rewardUrl: rewardUrl.toString(), rewardLabel: String(body.rewardLabel || "Your reward link").slice(0, 80) });
  res.json({ ok: true });
});

/*
 * Verification adapter contract:
 * - Never accept a client-side "completed=true" flag as proof.
 * - Telegram: validate Telegram Login Widget/WebApp initData on the server,
 *   then call getChatMember with the bot token and confirm member/admin/creator.
 * - YouTube: implement Google OAuth for the visitor and check the authenticated
 *   user's subscriptions.list result for the configured channel ID.
 * - WhatsApp Channels: no general public follower-verification API is available.
 *   Keep this task disabled or use a clearly disclosed alternative.
 *
 * These routes intentionally fail closed until a provider adapter is configured.
 */
app.post("/api/verify/:taskId", (req, res) => {
  const db = readDb();
  const task = db.tasks.find(t => t.id === req.params.taskId && t.enabled);
  if (!task) return res.status(404).json({ error: "Task not found." });
  return res.status(501).json({
    verified: false,
    error: `${task.provider} verification is not configured yet. A button click is not accepted as proof.`
  });
});

app.post("/api/reward", (req, res) => {
  // The reward is intentionally not exposed by this endpoint until real
  // server-side verification adapters and visitor identity/session storage exist.
  return res.status(503).json({ unlocked: false, error: "Reward unlocking is disabled until all verification providers are configured." });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`xRTasks running on http://localhost:${PORT}`));
