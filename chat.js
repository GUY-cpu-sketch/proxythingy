const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatBox = document.getElementById("chatBox");

const socket = io({ auth: { session: window.sessionData } });

socket.on("chat", data => {
  const p = document.createElement("p");
  p.textContent = `${data.user}: ${data.message}`;
  chatBox.appendChild(p);
});

socket.on("system", msg => {
  const p = document.createElement("p");
  p.textContent = `[SYSTEM] ${msg}`;
  p.style.color="red";
  chatBox.appendChild(p);
});

socket.on("clear", ()=> chatBox.innerHTML="");

chatForm.addEventListener("submit", e=>{
  e.preventDefault();
  const msg = chatInput.value.trim();
  if(!msg) return;
  socket.emit("chat", msg);
  chatInput.value="";
});
