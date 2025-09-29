// register.js
const registerForm = document.getElementById("registerForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!username || !password) return;

  const res = await fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();

  if (data.success) {
    alert("Registration successful! You can now login.");
    window.location.href = "/login.html";
  } else {
    alert(data.message);
  }
});
