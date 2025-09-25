const socket = io();
let username = "";

// Fetch session
fetch('/session')
  .then(r => r.json())
  .then(data => {
    username = data.username;
    socket.emit('register-user', username);
  })
  .catch(() => window.location.href = '/login.html');

// Send chat
document.getElementById('sendBtn').addEventListener('click', () => {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg || !username) return;
  socket.emit('send-chat', msg);
  input.value = '';
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

// Add message to chat box
function addMessage({ user, message, timestamp }) {
  const chatBox = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `<span class="username">${user}</span>: <span class="msg">${message}</span> <span class="timestamp">${timestamp}</span>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
