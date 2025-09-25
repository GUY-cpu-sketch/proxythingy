// Elements
const authContainer = document.getElementById("authContainer");
const registerContainer = document.getElementById("registerContainer");
const chatContainer = document.getElementById("chatContainer");

const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const showRegister = document.getElementById("showRegister");
const showLogin = document.getElementById("showLogin");
const logoutBtn = document.getElementById("logoutBtn");

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const regUsernameInput = document.getElementById("regUsername");
const regPasswordInput = document.getElementById("regPassword");

const authMessage = document.getElementById("authMessage");
const regMessage = document.getElementById("regMessage");

// --- Switch between Login/Register ---
showRegister?.addEventListener("click", () => {
  authContainer.style.display = "none";
  registerContainer.style.display = "block";
});

showLogin?.addEventListener("click", () => {
  registerContainer.style.display = "none";
  authContainer.style.display = "block";
});

// --- Helper to set session ---
const setSession = (username) => {
  window.sessionData = { username };
};

// --- Login ---
loginBtn?.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    authMessage.textContent = "Please fill in all fields";
    return;
  }

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();

  if (data.success) {
    setSession(username);
    authContainer.style.display = "none";
    registerContainer.style.display = "none";
    chatContainer.style.display = "flex";
  } else {
    authMessage.textContent = data.message;
  }
});

// --- Register ---
registerBtn?.addEventListener("click", async () => {
  const username = regUsernameInput.value.trim();
  const password = regPasswordInput.value.trim();

  if (!username || !password) {
    regMessage.textContent = "Please fill in all fields";
    return;
  }

  const res = await fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();

  if (data.success) {
    setSession(username);
    authContainer.style.display = "none";
    registerContainer.style.display = "none";
    chatContainer.style.display = "flex";
  } else {
    regMessage.textContent = data.message;
  }
});

// --- Logout ---
logoutBtn?.addEventListener("click", () => {
  window.sessionData = null;
  chatContainer.style.display = "none";
  authContainer.style.display = "block";
  usernameInput.value = "";
  passwordInput.value = "";
  regUsernameInput.value = "";
  regPasswordInput.value = "";
  authMessage.textContent = "";
  regMessage.textContent = "";
});
