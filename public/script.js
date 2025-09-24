const urlInput = document.getElementById("urlInput");
const loadBtn = document.getElementById("loadBtn");
const runBtn = document.getElementById("runBtn");
const jsInput = document.getElementById("jsInput");
const targetFrame = document.getElementById("targetFrame");
const consoleOutput = document.getElementById("consoleOutput");

loadBtn.addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (!url.startsWith("http")) {
    logToConsole("❌ URL must start with http:// or https://");
    return;
  }
  targetFrame.src = `/proxy?url=${encodeURIComponent(url)}`;
  logToConsole(`🌐 Loaded ${url}`);
});

runBtn.addEventListener("click", () => {
  const code = jsInput.value;
  if (!targetFrame.contentWindow) {
    logToConsole("⚠️ No site loaded in iframe.");
    return;
  }
  try {
    targetFrame.contentWindow.eval(code);
    logToConsole(`✅ Ran JS: ${code}`);
  } catch (err) {
    logToConsole(`❌ Error: ${err}`);
  }
});

function logToConsole(msg) {
  const p = document.createElement("p");
  p.textContent = msg;
  consoleOutput.appendChild(p);
}

// Mock dev console toggle (Shift+D)
document.addEventListener("keydown", (e) => {
  if (e.shiftKey && e.key.toLowerCase() === "d") {
    consoleOutput.style.display =
      consoleOutput.style.display === "none" ? "block" : "none";
  }
});
