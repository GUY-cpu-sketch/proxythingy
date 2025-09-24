const loginScreen = document.getElementById("loginScreen");
const mainApp = document.getElementById("mainApp");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const loginMessage = document.getElementById("loginMessage");

function loginUser(){
  fetch("/login", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value })
  }).then(res=>res.json()).then(data=>{
    if(data.success){
      loginScreen.style.display="none";
      mainApp.style.display="block";
      window.sessionData = { username: usernameInput.value };
    } else {
      loginMessage.textContent="❌ Login failed";
    }
  });
}

function registerUser(){
  fetch("/register", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value })
  }).then(res=>res.json()).then(data=>{
    if(data.success){
      loginMessage.textContent="✅ Registered! You can login now.";
    } else loginMessage.textContent="❌ Username taken";
  });
}

loginBtn.addEventListener("click", loginUser);
registerBtn.addEventListener("click", registerUser);
