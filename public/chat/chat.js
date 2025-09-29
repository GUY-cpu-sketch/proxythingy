import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const userListEl = document.getElementById("userList");

// --- Load session data ---
let sessionData = JSON.parse(localStorage.getItem("sessionData"));
if (!sessionData || !sessionData.username) {
  alert("Please login first.");
  window.location.href = "/login.html";
} else {
  window.sessionData = sessionData;
  const username = sessionData.username;

  const socket = io({ auth: { username } });

  // --- Chat messages ---
  socket.on("chat", data => {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${data.user}:</strong> ${data.message}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  // --- Whispers ---
  socket.on("whisper", ({ from, message }) => {
    const p = document.createElement("p");
    p.style.color = "purple";
    p.innerHTML = `<em>(Whisper) ${from}:</em> ${message}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  // --- System messages ---
  socket.on("system", msg => {
    const p = document.createElement("p");
    p.style.fontStyle = "italic";
    p.style.color = "#999";
    p.textContent = msg;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  // --- User list ---
  socket.on("userList", users => {
    userListEl.innerHTML = "";
    users.forEach(u => {
      const li = document.createElement("li");
      li.textContent = u;
      userListEl.appendChild(li);
    });
  });

  // --- Muted warning ---
  socket.on("muted", info => {
    const untilTime = new Date(info.until).toLocaleTimeString();
    alert(`⛔ ${info.reason}. You are muted until ${untilTime}.`);
  });

  // --- Send chat message ---
  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    // Admin commands
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
      if (message.startsWith("/mute ")) {
        const parts = message.split(" ");
        const target = parts[1];
        const duration = parts[2] || "30";
        socket.emit("adminMute", { target, duration });
        chatInput.value = "";
        return;
      }
    }

    // --- Handle /whisper and /r locally ---
    if (message.startsWith("/whisper ")) {
      // Format: /whisper username message
      const parts = message.split(" ");
      const target = parts[1];
      const msgText = parts.slice(2).join(" ");
      socket.emit("chat", message); // handled server-side
      chatInput.value = "";
      return;
    }

    if (message.startsWith("/r ")) {
      const replyMsg = message.slice(3);
      socket.emit("chat", message); // handled server-side
      chatInput.value = "";
      return;
    }

    // Normal message
    socket.emit("chat", message);
    chatInput.value = "";
  });
}
