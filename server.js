const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const cors = require('cors');
const app = express();

// Enable CORS
app.use(cors());

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Proxy all requests starting with /api to blooketbot.glitch.me
const targetUrl = 'https://youtube.com/';
app.use('/api', createProxyMiddleware({
  target: targetUrl,
  changeOrigin: true,
  pathRewrite: { '^/api': '/' },
}));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
