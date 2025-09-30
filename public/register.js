const form = document.getElementById("registerForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) return alert("Fill in all fields");

  const res = await fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (data.success) {
    alert("Registered successfully! You can now log in.");
    window.location.href = "/login.html";
  } else {
    alert(data.message || "Registration failed");
  }
});
