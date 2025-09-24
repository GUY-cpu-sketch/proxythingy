// Mock dev console setup
const mockConsole = document.getElementById('mockConsole');
let consoleVisible = false;

// Toggle console with Shift+D
window.addEventListener('keydown', (e) => {
  if (e.shiftKey && e.code === 'KeyD') {
    consoleVisible = !consoleVisible;
    mockConsole.style.display = consoleVisible ? 'block' : 'none';
  }
});

// Function to log to mock console
function logToMockConsole(message, type='log') {
  const line = document.createElement('div');
  line.textContent = message;
  if(type === 'error') line.style.color = 'red';
  else if(type === 'warn') line.style.color = 'yellow';
  else line.style.color = 'green';
  mockConsole.appendChild(line);
  mockConsole.scrollTop = mockConsole.scrollHeight;
}

// Override console methods
['log','warn','error'].forEach(method => {
  const original = console[method];
  console[method] = function(...args){
    logToMockConsole(args.join(' '), method);
    original.apply(console, args);
  }
});

// Capture JS errors
window.onerror = function(message, source, lineno, colno, error) {
  logToMockConsole(`[Error] ${message} at ${source}:${lineno}:${colno}`, 'error');
};

// Proxy frontend interaction
const inputBox = document.getElementById('inputBox');
const sendBtn = document.getElementById('sendBtn');
const output = document.getElementById('output');

sendBtn.addEventListener('click', () => {
  const command = inputBox.value.trim();
  if (!command) return;

  console.log(`Sending command: ${command}`);

  fetch(`/api/${encodeURIComponent(command)}`)
    .then(res => res.text())
    .then(data => {
      const line = document.createElement('div');
      line.textContent = `> ${command}\n${data}`;
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
      console.log(`Received response: ${data}`);
    })
    .catch(err => {
      const line = document.createElement('div');
      line.textContent = `Error: ${err}`;
      line.style.color = 'red';
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
      console.error(`Fetch error: ${err}`);
    });

  inputBox.value = '';
});
