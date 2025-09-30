import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const body = document.body;

// --- Create chat container dynamically ---
const chatContainer = document.createElement("div");
chatContainer.classList.add("chat-container");
chatContainer.innerHTML = `
  <div id="chatBox" class="chat-box"></div>
  <form id="chatForm" class="chat-form">
    <input id="chatInput" type="text" placeholder="Type a message..." autocomplete="off" required />
    <button type="submit">Send</button>
  </form>
  <ul id="userList" class="user-list"></ul>
`;
body.appendChild(chatContainer);

const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const userListEl = document.getElementById("userList");

let sessionData = JSON.parse(localStorage.getItem("sessionData"));
if (!sessionData || !sessionData.username) {
  alert("Please login first.");
  window.location.href = "/login.html";
} else {
  const username = sessionData.username;
  const socket = io({ auth: { username } });

  socket.on("chat", data => {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${data.user}:</strong> ${data.message}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  socket.on("whisper", ({ from, message }) => {
    const p = document.createElement("p");
    p.style.color = "orange";
    p.innerHTML = `<em>(Whisper) ${from}:</em> ${message}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  socket.on("system", msg => {
    const p = document.createElement("p");
    p.style.fontStyle = "italic";
    p.style.color = "#999";
    p.textContent = msg;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  socket.on("clearChat", () => {
    chatBox.innerHTML = "";
  });

  socket.on("userList", users => {
    userListEl.innerHTML = "";
    users.forEach(u => {
      const li = document.createElement("li");
      li.textContent = u;
      userListEl.appendChild(li);
    });
  });

  socket.on("muted", info => {
    alert(`⛔ ${info.reason}. Muted until ${new Date(info.until).toLocaleTimeString()}.`);
  });

  socket.on("forceClose", () => {
    window.close();
  });

  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;
    socket.emit("chat", message);
    chatInput.value = "";
  });
}
