const urlInput = document.getElementById("urlInput");
const loadBtn = document.getElementById("loadBtn");
const runBtn = document.getElementById("runBtn");
const jsInput = document.getElementById("jsInput");
const targetFrame = document.getElementById("targetFrame");
const consoleOutput = document.getElementById("consoleOutput");

// Shift+D mock console
const mockConsole = document.createElement("div");
mockConsole.id = "mockConsole";
mockConsole.style.display = "none";
document.body.appendChild(mockConsole);

let consoleVisible = false;
document.addEventListener("keydown", e => {
  if(e.shiftKey && e.code === "KeyD"){
    consoleVisible = !consoleVisible;
    mockConsole.style.display = consoleVisible ? "block" : "none";
  }
});

function logToConsole(msg, type="log"){
  const p = document.createElement("p");
  p.textContent = msg;
  if(type==="error") p.style.color = "red";
  else if(type==="warn") p.style.color = "yellow";
  else p.style.color = "green";
  consoleOutput.appendChild(p);
  const mc = document.createElement("p");
  mc.textContent = msg;
  if(type==="error") mc.style.color = "red";
  else if(type==="warn") mc.style.color = "yellow";
  else mc.style.color = "green";
  mockConsole.appendChild(mc);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
  mockConsole.scrollTop = mockConsole.scrollHeight;
}

// Load URL via proxy
loadBtn.addEventListener("click", () => {
  const url = urlInput.value.trim();
  if(!url.startsWith("http")){
    logToConsole("❌ URL must start with http:// or https://", "error");
    return;
  }
  targetFrame.src = `/proxy?url=${encodeURIComponent(url)}`;
  logToConsole(`🌐 Loaded ${url}`);
});

// Run JS on iframe (works only on same-origin)
runBtn.addEventListener("click", () => {
  const code = jsInput.value;
  if(!targetFrame.contentWindow){
    logToConsole("⚠️ No site loaded in iframe.", "warn");
    return;
  }
  try{
    const result = targetFrame.contentWindow.eval(code);
    logToConsole(`✅ Result: ${result}`);
  }catch(err){
    logToConsole(`❌ Error: ${err}`, "error");
  }
  jsInput.value = "";
});

// Capture main page errors
window.onerror = function(msg, src, ln, col, err){
  logToConsole(`[Error] ${msg} at ${src}:${ln}:${col}`, "error");
};

// Override console
["log","warn","error"].forEach(m=>{
  const orig = console[m];
  console[m] = (...args)=>{
    logToConsole(args.join(" "), m);
    orig.apply(console,args);
  }
});
