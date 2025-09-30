import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const userListEl = document.getElementById("userList");

// --- Load session ---
let sessionData = JSON.parse(localStorage.getItem("sessionData"));
if (!sessionData || !sessionData.username) {
  alert("Please login first.");
  window.location.href = "/login.html";
} else {
  const username = sessionData.username;
  const socket = io({ auth: { username } });

  // --- Display chat messages ---
  socket.on("chat", data => {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${data.user}:</strong> ${data.message}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  // --- Display whispers ---
  socket.on("whisper", ({ from, message }) => {
    const p = document.createElement("p");
    p.style.color = "purple"; // easier to see
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

  // --- Send chat ---
  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    socket.emit("chat", message);
    chatInput.value = "";
  });
}
