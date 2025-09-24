const socket = io();

// Load iframe
document.getElementById("loadBtn").addEventListener("click", () => {
  const url = document.getElementById("urlInput").value;
  document.getElementById("siteFrame").src = "/proxy?url=" + encodeURIComponent(url);
});

// Chat
socket.emit("login", window.username);

document.getElementById("sendBtn").addEventListener("click", () => {
  const msg = document.getElementById("chatInput").value;
  socket.emit("message", msg);
  document.getElementById("chatInput").value = "";
});

socket.on("message", (data) => {
  const messages = document.getElementById("messages");
  messages.innerHTML += `<div><b>${data.from}:</b> ${data.message}</div>`;
});

socket.on("muted", () => {
  alert("You are muted!");
});

socket.on("clearChat", () => {
  document.getElementById("messages").innerHTML = "";
});
