import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const userListEl = document.getElementById("userList");

// Get username from sessionStorage
const username = sessionStorage.getItem("username");

if (!username) {
  alert("Please login first.");
  window.location.href = "/";
} else {
  const socket = io({ auth: { username } });

  socket.on("chat", data => {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${data.user}:</strong> ${data.message}`;
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

  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

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
