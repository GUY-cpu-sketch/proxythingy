const socket = io();
const chatForm = document.createElement("form");
chatForm.id = "chatForm";

const chatBox = document.createElement("div");
chatBox.id = "chatBox";
chatBox.style.height = "400px";
chatBox.style.overflowY = "auto";
chatBox.style.border = "1px solid #ccc";
chatBox.style.padding = "10px";
document.body.appendChild(chatBox);

const input = document.createElement("input");
input.type = "text";
input.id = "chatInput";
input.placeholder = "Type a message...";
chatForm.appendChild(input);

const sendBtn = document.createElement("button");
sendBtn.textContent = "Send";
chatForm.appendChild(sendBtn);

document.body.appendChild(chatForm);

// Grab username from cookie
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
}

const username = getCookie("username") || "Anon";
socket.emit("setUser", username);

// Receive chat
socket.on("chat", (data) => {
  const p = document.createElement("p");
  p.textContent = `${data.user}: ${data.message}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// Send chat
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit("chat", msg);
  input.value = "";
});
