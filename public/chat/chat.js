const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const userList = document.getElementById("userList");

// Use username from login
const username = window.sessionData?.username;
if (!username) {
  alert("You must log in first!");
  window.location.href = "/login.html";
}

const socket = io();
socket.emit("register-user", username);

// Receive messages
socket.on("chat", (data) => addMessage(data));
socket.on("system", (msg) => addMessage({ user: "SYSTEM", message: msg }));
socket.on("clear-chat", () => { chatBox.innerHTML = ""; });

// Update user list
socket.on("update-users", (users) => {
  if (!userList) return;
  userList.innerHTML = "";
  users.forEach(u => {
    const li = document.createElement("li");
    li.textContent = u;
    userList.appendChild(li);
  });
});

// Add message
function addMessage({ user, message, timestamp }) {
  const div = document.createElement("div");
  div.className = "message";
  div.innerHTML = `<span class="username">${user}</span>: <span class="msg">${message}</span> <span class="timestamp">${timestamp || ""}</span>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Send messages
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit("send-chat", msg);
  chatInput.value = "";
});
