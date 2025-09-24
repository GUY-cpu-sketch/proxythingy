const iframe = document.getElementById('targetFrame');
const urlInput = document.getElementById('urlInput');
const loadBtn = document.getElementById('loadBtn');
const jsInput = document.getElementById('jsInput');
const runBtn = document.getElementById('runBtn');
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

function logToMockConsole(msg, type='log'){
  const line = document.createElement('div');
  line.textContent = msg;
  if(type==='error') line.style.color='red';
  else if(type==='warn') line.style.color='yellow';
  else line.style.color='green';
  mockConsole.appendChild(line);
  mockConsole.scrollTop = mockConsole.scrollHeight;
}

// Capture main page JS errors
window.onerror = function(message, source, lineno, colno, error){
  logToMockConsole(`[Error] ${message} at ${source}:${lineno}:${colno}`, 'error');
};

// Override main page console to also show in mock console
['log','warn','error'].forEach(method=>{
  const original = console[method];
  console[method] = function(...args){
    logToMockConsole(args.join(' '), method);
    original.apply(console,args);
  }
});

// Load the user-input URL into the iframe
loadBtn.addEventListener('click', () => {
  iframe.src = urlInput.value;
  console.log(`Loaded URL: ${urlInput.value}`);
});

// Run JS on the iframe (only works for same-origin pages)
runBtn.addEventListener('click', () => {
  try {
    const result = iframe.contentWindow.eval(jsInput.value);
    const div = document.createElement('div');
    div.textContent = `Result: ${result}`;
    consoleOutput.appendChild(div);
    logToMockConsole(`Result: ${result}`);
  } catch (err) {
    const div = document.createElement('div');
    div.textContent = `Error: ${err}`;
    div.style.color = 'red';
    consoleOutput.appendChild(div);
    logToMockConsole(`Error: ${err}`, 'error');
  }
  jsInput.value = '';
});
