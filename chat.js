// public/chat.js

import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatBox = document.getElementById("chatBox");

// Connect with session auth
const socket = io({
  auth: { session: window.sessionData }
});

// Listen for chat messages
socket.on("chat", (data) => {
  const p = document.createElement("p");
  p.textContent = `${data.user}: ${data.message}`;
  chatBox.appendChild(p);
});

// System messages
socket.on("system", (msg) => {
  const p = document.createElement("p");
  p.textContent = `[SYSTEM] ${msg}`;
  p.style.color = "red";
  chatBox.appendChild(p);
});

// Clear messages
socket.on("clear", () => {
  chatBox.innerHTML = "";
});

// Send messages
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit("chat", msg);
  chatInput.value = "";
});
