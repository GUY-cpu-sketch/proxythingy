const loginScreen = document.getElementById("loginScreen");
const mainApp = document.getElementById("mainApp");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginMessage = document.getElementById("loginMessage");

const PASSWORD = "IMNOTNOBLEADMIN";

loginBtn.addEventListener("click", () => {
  const entered = passwordInput.value;

  if (entered === PASSWORD) {
    loginScreen.style.display = "none";
    mainApp.style.display = "block";
  } else {
    loginMessage.textContent = "❌ Incorrect password. Try again.";
    passwordInput.value = "";
    passwordInput.focus();

    // Log failed attempt to server
    fetch("/log-failed-password", { method: "POST" })
      .catch(() => console.warn("Could not log failed attempt."));
  }
});
