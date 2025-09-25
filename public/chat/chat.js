import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const userListEl = document.getElementById("userList");

if (!window.sessionData || !window.sessionData.username) {
  console.error("No username found. Please login first.");
} else {

  const socket = io({ auth: { username: window.sessionData.username } });

  // --- Chat messages ---
  socket.off("chat").on("chat", data => {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${data.user}:</strong> ${data.message}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  // --- System messages ---
  socket.off("system").on("system", msg => {
    const p = document.createElement("p");
    p.style.fontStyle = "italic";
    p.style.color = "#999";
    p.textContent = msg;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  // --- User list ---
  socket.off("userList").on("userList", users => {
    userListEl.innerHTML = "";
    users.forEach(u => {
      const li = document.createElement("li");
      li.textContent = u;
      userListEl.appendChild(li);
    });
  });

  // --- Send chat message ---
  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    // Admin commands
    const username = window.sessionData.username;
    if (username === "DEV") {
      if (message.startsWith("/kick ")) {
        const target = message.split(" ")[1];
        socket.emit("adminKick", target);
        chatInput.value = "";
        return;
      }
      if (message === "/clear") {
        socket.emit("adminClear");
        chatInput.value = "";
        return;
      }
    }

    socket.emit("chat", message);
    chatInput.value = "";
  });
}
