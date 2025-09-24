const loginScreen = document.getElementById("loginScreen");
const mainApp = document.getElementById("mainApp");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginMessage = document.getElementById("loginMessage");

const PASSWORD = "mySecret123"; // set your password here

loginBtn.addEventListener("click", () => {
  const entered = passwordInput.value;
  if (entered === PASSWORD) {
    loginScreen.style.display = "none";
    mainApp.style.display = "block";
  } else {
    loginMessage.textContent = "❌ Incorrect password. Try again.";
    passwordInput.value = "";
    passwordInput.focus();

    // Safe log example:
    // fetch("/log-failed-password", { method: "POST", body: JSON.stringify({time: Date.now()}) });
  }
});
