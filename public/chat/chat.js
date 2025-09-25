const socket = io();

// Register user after session check
fetch('/session').then(r => r.json()).then(({ username }) => {
  socket.emit('register-user', username);
});

// Receive messages
socket.on('chat', data => addMessage(data));

// Update online users
socket.on('update-users', users => {
  const userList = document.getElementById('userList');
  if (!userList) return;
  userList.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.textContent = u;
    userList.appendChild(li);
  });
});

// Send chat
document.getElementById('sendBtn').addEventListener('click', () => {
  const msg = document.getElementById('chatInput').value.trim();
  if (msg) {
    socket.emit('send-chat', msg);
    document.getElementById('chatInput').value = '';
  }
});

function addMessage({ user, message, timestamp }) {
  const chatBox = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `<span class="username">${user}</span><span class="msg">${message}</span><span class="timestamp">${timestamp}</span>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
