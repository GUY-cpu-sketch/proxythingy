const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const userList = document.getElementById("userList");

// --- Use logged-in username ---
const username = window.sessionData?.username;
if (!username) {
  alert("You must log in first!");
  window.location.href = "/login.html";
}

// --- Socket setup ---
const socket = io();

// Register user once after connection
socket.on("connect", () => {
  socket.emit("register-user", username);
});

// --- Listen once for incoming chat messages ---
socket.off("chat").on("chat", (data) => addMessage(data));
socket.off("system").on("system", (msg) => addMessage({ user: "SYSTEM", message: msg }));
socket.off("clear-chat").on("clear-chat", () => { chatBox.innerHTML = ""; });

// --- Update user list ---
socket.off("update-users").on("update-users", (users) => {
  if (!userList) return;
  userList.innerHTML = "";
  users.forEach(u => {
    const li = document.createElement("li");
    li.textContent = u;
    userList.appendChild(li);
  });
});

// --- Add message to chat box ---
function addMessage({ user, message, timestamp }) {
  const div = document.createElement("div");
  div.className = "message";
  div.innerHTML = `<span class="username">${user}</span>: <span class="msg">${message}</span> <span class="timestamp">${timestamp || ""}</span>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// --- Send messages ---
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;

  socket.emit("send-chat", msg); // send to server
  chatInput.value = "";
});
