const inputBox = document.getElementById('inputBox');
const sendBtn = document.getElementById('sendBtn');
const output = document.getElementById('output');

sendBtn.addEventListener('click', () => {
  const command = inputBox.value.trim();
  if (!command) return;

  fetch(`/api/${encodeURIComponent(command)}`)
    .then(res => res.text())
    .then(data => {
      const line = document.createElement('div');
      line.textContent = `> ${command}\n${data}`;
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    })
    .catch(err => {
      const line = document.createElement('div');
      line.textContent = `Error: ${err}`;
      line.style.color = 'red';
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    });

  inputBox.value = '';
});
