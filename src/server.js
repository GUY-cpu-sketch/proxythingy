const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

// Target website
const targetUrl = 'https://blooketbot.glitch.me/';

// Proxy all requests
app.use('/', createProxyMiddleware({
  target: targetUrl,
  changeOrigin: true,
  pathRewrite: { '^/': '/' },
}));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
