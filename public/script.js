const iframe = document.getElementById('blooketFrame');
const inputBox = document.getElementById('inputBox');
const sendBtn = document.getElementById('sendBtn');
const consoleOutput = document.getElementById('consoleOutput');

// Receive messages from iframe
window.addEventListener('message', e => {
  if(e.data.type === 'result') {
    const div = document.createElement('div');
    div.textContent = `Result: ${e.data.data}`;
    consoleOutput.appendChild(div);
  } else if(e.data.type === 'error') {
    const div = document.createElement('div');
    div.textContent = `Error: ${e.data.data}`;
    div.style.color = 'red';
    consoleOutput.appendChild(div);
  }
});

// Send JS commands to iframe
sendBtn.addEventListener('click', () => {
  const code = inputBox.value;
  iframe.contentWindow.postMessage(code, '*');
  inputBox.value = '';
});
