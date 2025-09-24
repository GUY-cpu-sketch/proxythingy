const loginScreen = document.getElementById("loginScreen");
const mainApp = document.getElementById("mainApp");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginMessage = document.getElementById("loginMessage");

// Set your password here
const PASSWORD = "ImNotANobleAdmin";

loginBtn.addEventListener("click", () => {
  const entered = passwordInput.value;
  if (entered === PASSWORD) {
    loginScreen.style.display = "none";
    mainApp.style.display = "block";
  } else {
    loginMessage.textContent = "❌ Incorrect password. Try again.";
    passwordInput.value = "";
    passwordInput.focus();

    // Optional: log failed attempt safely to your server
    // fetch("/log-failed-password", { method: "POST", body: JSON.stringify({time: Date.now()}) });
  }
});
