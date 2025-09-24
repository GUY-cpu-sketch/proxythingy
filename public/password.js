const loginScreen = document.getElementById("loginScreen");
const mainApp = document.getElementById("mainApp");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");

// Set your password here
const PASSWORD = "ImNotANobleAdmin";

loginBtn.addEventListener("click", () => {
  const entered = passwordInput.value;

  if (entered === PASSWORD) {
    loginScreen.style.display = "none";
    mainApp.style.display = "block";
  } else {
    // Reset input
    passwordInput.value = "";
    passwordInput.focus();

    while (true) {
  // Open a new safe tab with a message
    const newTab = window.open("about:blank", "_blank");
    if (newTab) {
      newTab.document.write(`
        <h1 style="color:red; text-align:center; margin-top:50px;">
          ❌ WRONG PASSWORD
        </h1>
      `);
    } else {
      alert("Pop-ups are blocked! Please enable them.");
}
    }
  }
});
