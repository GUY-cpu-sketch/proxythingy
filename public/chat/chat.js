import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const socket = io();
const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

// ----- Add your admin usernames here -----
const admins = ["DEV", "AdminUser2"]; // <-- edit usernames here

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
  timeEl.textContent = timestamp || new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

  p.appendChild(usernameEl);
  p.appendChild(msgEl);
  p.appendChild(timeEl);

  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ----- Command handling -----
function handleCommand(user, message) {
  if (!admins.includes(user)) return false; // not an admin

  const parts = message.trim().split(" ");
  const cmd = parts[0].toLowerCase();

  switch(cmd) {
    case "/clear":
      chatBox.innerHTML = "";
      return true;
    case "/kick":
      if (parts[1]) {
        socket.emit("admin-kick", parts[1]);
        return true;
      }
      break;
    case "/ban":
      if (parts[1]) {
        socket.emit("admin-ban", parts[1]);
        return true;
      }
      break;
    default:
      return false;
  }
}

// ----- Send message -----
sendBtn.addEventListener("click", async () => {
  const msg = chatInput.value.trim();
  if (!msg) return;

  // Get username from server-side session
  const res = await fetch('/session');
  const { username } = await res.json();

  if (handleCommand(username, msg)) {
    chatInput.value = "";
    return; // command executed
  }

  try {
    await fetch('/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    chatInput.value = '';
  } catch (err) {
    console.error(err);
  }
});

chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendBtn.click();
});

// ----- Receive messages -----
socket.on("chat", data => addMessage(data));

// ----- Admin kick/ban handling -----
socket.on("kick", target => {
  fetch('/session').then(r => r.json()).then(({ username }) => {
    if (username === target) {
      alert("You have been kicked by an admin!");
      window.location.href = "/login.html";
    }
  });
});

socket.on("ban", target => {
  fetch('/session').then(r => r.json()).then(({ username }) => {
    if (username === target) {
      alert("You have been banned by an admin!");
      window.location.href = "/login.html";
    }
  });
});
// Play sound on new message
const notificationSound = new Audio('/sounds/notification.mp3'); // place sound file in /public/sounds

socket.on("chat", data => {
  addMessage(data);
  // Notify if message not from self
  fetch('/session').then(r => r.json()).then(({ username }) => {
    if (data.user !== username) notificationSound.play();
  });
});
