const iframe = document.getElementById('blooketFrame');
const inputBox = document.getElementById('inputBox');
const sendBtn = document.getElementById('sendBtn');
const consoleOutput = document.getElementById('consoleOutput');

// Mock dev console
const mockConsole = document.createElement('div');
mockConsole.style.cssText = `
  display:none;
  position:fixed;
  bottom:0;
  left:0;
  width:100%;
  max-height:250px;
  overflow-y:auto;
  background:rgba(0,0,0,0.9);
  color:#0f0;
  font-family:monospace;
  font-size:12px;
  padding:5px;
  z-index:9999;
`;
mockConsole.innerHTML = '<strong>DEV CONSOLE</strong><br>';
document.body.appendChild(mockConsole);

let consoleVisible = false;
window.addEventListener('keydown', e => {
  if(e.shiftKey && e.code === 'KeyD'){
    consoleVisible = !consoleVisible;
    mockConsole.style.display = consoleVisible ? 'block' : 'none';
  }
});

// Function to log to mock console
function logToMockConsole(msg, type='log'){
  const line = document.createElement('div');
  line.textContent = msg;
  if(type==='error') line.style.color='red';
  else if(type==='warn') line.style.color='yellow';
  else line.style.color='green';
  mockConsole.appendChild(line);
  mockConsole.scrollTop = mockConsole.scrollHeight;
}

// Capture messages from iframe
window.addEventListener('message', e => {
  if(e.data.type === 'result'){
    const div = document.createElement('div');
    div.textContent = `Result: ${e.data.data}`;
    consoleOutput.appendChild(div);
    logToMockConsole(`Result: ${e.data.data}`);
  } else if(e.data.type === 'error'){
    const div = document.createElement('div');
    div.textContent = `Error: ${e.data.data}`;
    div.style.color='red';
    consoleOutput.appendChild(div);
    logToMockConsole(`Error: ${e.data.data}`, 'error');
  } else if(e.data.type === 'log'){
    logToMockConsole(`Log: ${e.data.data}`);
  }
});

// Send JS commands to iframe
sendBtn.addEventListener('click', () => {
  const code = inputBox.value;
  iframe.contentWindow.postMessage(code, '*');
  inputBox.value = '';
});

// Override main page console to also show in mock console
['log','warn','error'].forEach(method=>{
  const original = console[method];
  console[method] = function(...args){
    logToMockConsole(args.join(' '), method);
    original.apply(console,args);
  }
});

// Capture main page JS errors
window.onerror = function(message, source, lineno, colno, error){
  logToMockConsole(`[Error] ${message} at ${source}:${lineno}:${colno}`, 'error');
};
