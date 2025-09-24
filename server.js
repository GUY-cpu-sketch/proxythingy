const express = require('express');
const axios = require('axios');
const app = express();

// Serve frontend
app.use(express.static('public'));

// Proxy endpoint
app.get('/proxy', async (req, res) => {
  const target = 'https://www.blooket.com/'; // site to proxy
  try {
    const response = await axios.get(target);
    let html = response.data;

    // Inject custom JS
    const inject = `
      <script>
        console.log('Injected JS works!');
        window.alert('You can run JS here!');
      </script>
    `;
    html = html.replace('</body>', inject + '</body>');

    // Serve rewritten page
    res.send(html);
  } catch (err) {
    res.status(500).send('Error fetching target site.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy running on port', PORT));
