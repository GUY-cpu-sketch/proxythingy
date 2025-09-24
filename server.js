import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser for POST requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Minimal proxy
app.get("/proxy", (req, res, next) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing ?url= parameter");

  createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    selfHandleResponse: false,
    onProxyRes: (proxyRes) => {
      delete proxyRes.headers["x-frame-options"];
      delete proxyRes.headers["content-security-policy"];
    }
  })(req, res, next);
});

// --- PASSWORD ATTEMPT LOGGING ---
const failedAttempts = {}; // { ip: count }
const bannedIPs = new Set();

app.post("/log-failed-password", (req, res) => {
  const ip = req.ip;

  if (bannedIPs.has(ip)) {
    return res.status(403).send("You are banned.");
  }

  failedAttempts[ip] = (failedAttempts[ip] || 0) + 1;

  // Ban after 5 failed attempts
  if (failedAttempts[ip] >= 5) {
    bannedIPs.add(ip);
    console.log(`IP banned: ${ip}`);
  } else {
    console.log(`Failed login from IP ${ip}. Count: ${failedAttempts[ip]}`);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
