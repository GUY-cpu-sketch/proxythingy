const username = localStorage.getItem("username");
if (!username) {
  window.location.href = "login.html";
}

const socket = io({ auth: { username } });

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatBox = document.getElementById("chatBox");
const userList = document.getElementById("userList");

function appendMessage(text, type = "chat") {
  const p = document.createElement("p");
  if (type === "system") p.style.color = "red";
  if (type === "whisper") p.style.color = "purple";
  p.textContent = text;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (chatInput.value.trim() !== "") {
    socket.emit("chat", chatInput.value);
    chatInput.value = "";
  }
});

socket.on("chat", (data) => appendMessage(`${data.user}: ${data.message}`));
socket.on("system", (msg) => appendMessage(msg, "system"));
socket.on("whisper", (data) => appendMessage(`(whisper) ${data.from}: ${data.message}`, "whisper"));

socket.on("userList", (users) => {
  userList.innerHTML = "";
  users.forEach(u => {
    const li = document.createElement("li");
    li.textContent = u;
    userList.appendChild(li);
  });
});

socket.on("muted", (data) => {
  appendMessage(`You are muted until ${new Date(data.until).toLocaleTimeString()}: ${data.reason}`, "system");
});

socket.on("closeTab", () => {
  alert("An admin has closed your session.");
  window.close();
});
