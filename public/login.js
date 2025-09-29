const loginForm = document.getElementById("loginForm");
const loginInput = document.getElementById("loginUsername");
const passwordInput = document.getElementById("loginPassword");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = loginInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) return alert("Fill in all fields");

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success) {
      // Save session data locally
      const sessionData = { username };
      window.sessionData = sessionData;
      localStorage.setItem("sessionData", JSON.stringify(sessionData));

      // Redirect to chat
      window.location.href = "/chat.html";
    } else {
      alert(data.message);
    }
  } catch (err) {
    console.error(err);
    alert("Login failed. Try again.");
  }
});
