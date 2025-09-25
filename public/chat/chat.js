import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const socket = io();
const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

// Generate color for username
function getUsernameColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 70%, 50%)`;
}

// Add message to chat box
function addMessage({ user, message, timestamp }) {
  const p = document.createElement("div");
  p.classList.add("message");

  const usernameEl = document.createElement("div");
  usernameEl.classList.add("username");
  usernameEl.textContent = user;
  usernameEl.style.color = getUsernameColor(user);

  const msgEl = document.createElement("div");
  msgEl.textContent = message;

  const timeEl = document.createElement("div");
  timeEl.classList.add("timestamp");
  timeEl.textContent = timestamp || new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

  p.appendChild(usernameEl);
  p.appendChild(msgEl);
  p.appendChild(timeEl);

  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Receive messages from server
socket.on("chat", data => addMessage(data));

// Send messages to server
sendBtn.addEventListener("click", async () => {
  if (!chatInput.value) return;

  try {
    await fetch('/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: chatInput.value })
    });
    chatInput.value = '';
  } catch (err) {
    console.error(err);
  }
});

chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendBtn.click();
});
