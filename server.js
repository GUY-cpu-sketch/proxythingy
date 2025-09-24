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

    // Inject script: forward console logs/errors to parent
    const inject = `
      <script>
        (function(){
          const oldLog = console.log;
          const oldWarn = console.warn;
          const oldError = console.error;

          console.log = function(...args){
            window.parent.postMessage({type:'log', data:args.join(' ')}, '*');
            oldLog.apply(console,args);
          };
          console.warn = function(...args){
            window.parent.postMessage({type:'warn', data:args.join(' ')}, '*');
            oldWarn.apply(console,args);
          };
          console.error = function(...args){
            window.parent.postMessage({type:'error', data:args.join(' ')}, '*');
            oldError.apply(console,args);
          };

          // Capture uncaught errors in iframe
          window.onerror = function(message, source, lineno, colno, err){
            window.parent.postMessage({type:'error', data: message + ' at ' + source + ':' + lineno + ':' + colno}, '*');
          };

          // Listen for parent JS commands
          window.addEventListener('message', e=>{
            try{
              const result = eval(e.data);
              e.source.postMessage({type:'result', data:result}, e.origin);
            } catch(err){
              e.source.postMessage({type:'error', data:err.toString()}, e.origin);
            }
          });
        })();
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
