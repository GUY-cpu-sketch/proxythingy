const loginScreen = document.getElementById("loginScreen");
const mainApp = document.getElementById("mainApp");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");

loginBtn.addEventListener("click", async () => {
  const res = await fetch("/login", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      username: usernameInput.value,
      password: passwordInput.value
    })
  });
  const data = await res.json();
  if (data.success) {
    loginScreen.style.display = "none";
    mainApp.style.display = "block";
    window.username = data.user.username;
  } else {
    alert(data.error);
  }
});
