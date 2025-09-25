import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const socket = io();

const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

socket.on("chat", data => {
  const p = document.createElement("p");
  p.textContent = `${data.user}: ${data.message}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
});

sendBtn.addEventListener("click", () => {
  if (!chatInput.value || !userInput.value) return;
  const data = { user: userInput.value, message: chatInput.value };
  socket.emit("chat", data);
  chatInput.value = "";
});

chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendBtn.click();
});
