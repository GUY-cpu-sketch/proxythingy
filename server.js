const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));

// Proxy endpoint
app.get('/proxy', async (req, res) => {
  const target = 'https://www.blooket.com/';
  try {
    const response = await axios.get(target);
    let html = response.data;

    // Inject a script to allow receiving JS commands from parent
    const inject = `
      <script>
        window.addEventListener('message', e => {
          try {
            const result = eval(e.data);
            e.source.postMessage({ type: 'result', data: result }, e.origin);
          } catch(err) {
            e.source.postMessage({ type: 'error', data: err.toString() }, e.origin);
          }
        });
      </script>
    `;
    html = html.replace('</body>', inject + '</body>');
    res.send(html);
  } catch (err) {
    res.status(500).send('Error fetching target site.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy running on port', PORT));
