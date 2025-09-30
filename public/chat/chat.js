import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

// --- Load session ---
const sessionData = JSON.parse(localStorage.getItem("sessionData"));
if (!sessionData || !sessionData.username) {
  alert("Please login first.");
  window.location.href = "/login.html";
} else {
  const username = sessionData.username;
  const socket = io({ auth: { username } });

  // --- Only create container if it doesn't exist ---
  let container = document.querySelector(".chat-container");
  if (!container) {
    container = document.createElement("div");
    container.classList.add("container", "chat-container");

    // Title
    const title = document.createElement("h1");
    title.textContent = "Chat Room";

    // Chat box
    const chatBox = document.createElement("div");
    chatBox.id = "chatBox";
    chatBox.classList.add("chat-box");

    // User list
    const userListEl = document.createElement("ul");
    userListEl.id = "userList";
    userListEl.classList.add("user-list");

    // Form
    const chatForm = document.createElement("form");
    chatForm.id = "chatForm";

    const chatInput = document.createElement("input");
    chatInput.type = "text";
    chatInput.id = "chatInput";
    chatInput.placeholder = "Type a message...";
    chatInput.autocomplete = "off";

    const sendButton = document.createElement("button");
    sendButton.type = "submit";
    sendButton.textContent = "Send";

    chatForm.appendChild(chatInput);
    chatForm.appendChild(sendButton);

    container.appendChild(title);
    container.appendChild(chatBox);
    container.appendChild(userListEl);
    container.appendChild(chatForm);

    document.body.appendChild(container);
  }

  const chatBox = document.getElementById("chatBox");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const userListEl = document.getElementById("userList");

  // --- Socket events ---
  socket.on("chat", data => {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${data.user}:</strong> ${data.message}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  socket.on("whisper", ({ from, message }) => {
    const p = document.createElement("p");
    p.style.color = "#ffb86c"; // easier to see
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

  socket.on("userList", users => {
    userListEl.innerHTML = "";
    users.forEach(u => {
      const li = document.createElement("li");
      li.textContent = u;
      userListEl.appendChild(li);
    });
  });

  socket.on("muted", info => {
    const untilTime = new Date(info.until).toLocaleTimeString();
    alert(`⛔ ${info.reason}. You are muted until ${untilTime}.`);
  });

  socket.on("forceClose", () => {
    alert("Admin closed your chat. Closing window...");
    window.close();
  });

  socket.on("clearChat", () => {
    chatBox.innerHTML = "";
  });

  // --- Send chat ---
  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;
    socket.emit("chat", message);
    chatInput.value = "";
  });
}
