import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (your frontend)
app.use(express.static(path.join(__dirname, "public")));

// Proxy endpoint
app.use("/proxy", createProxyMiddleware({
  target: "", // dynamic target, overridden by router
  changeOrigin: true,
  selfHandleResponse: false,
  onProxyReq: (proxyReq, req) => {
    // Dynamically change target based on ?url=
    const url = req.query.url;
    if (url) {
      proxyReq.path = new URL(url).pathname + (new URL(url).search || "");
      proxyReq.setHeader("host", new URL(url).host);
    }
  },
  router: (req) => {
    const url = req.query.url;
    if (!url) return "https://example.com";
    return url;
  },
  onProxyRes: (proxyRes) => {
    // 🔑 Strip frame-blocking headers
    delete proxyRes.headers["x-frame-options"];
    delete proxyRes.headers["content-security-policy"];
  }
}));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
