const socket = io();
let username = "";

// Fetch session and register username
async function init() {
  try {
    const res = await fetch('/session');
    if (!res.ok) throw new Error('Not logged in');
    const data = await res.json();
    username = data.username;
    socket.emit('register-user', username);
  } catch (err) {
    window.location.href = '/login.html';
    return;
  }

  // Send chat only after username is registered
  const sendBtn = document.getElementById('sendBtn');
  const input = document.getElementById('chatInput');

  sendBtn.addEventListener('click', () => {
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('send-chat', msg);
    input.value = '';
  });

  input.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendBtn.click();
  });
}

// --- Receive messages ---
socket.on('chat', data => addMessage(data));

// --- Update online users ---
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

// --- Add message to chat box ---
function addMessage({ user, message, timestamp }) {
  const chatBox = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `<span class="username">${user}</span>: <span class="msg">${message}</span> <span class="timestamp">${timestamp}</span>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Initialize
init();
