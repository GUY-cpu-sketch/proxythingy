import fs from "fs";

const updatesFile = "./temp-update/updates.json";

if (!fs.existsSync(updatesFile)) {
  console.log("No updates.json found.");
  process.exit(0);
}

const updates = JSON.parse(fs.readFileSync(updatesFile, "utf-8"));

updates.forEach(file => {
  fs.mkdirSync(file.path.split("/").slice(0, -1).join("/"), { recursive: true });
  fs.writeFileSync(file.path, file.content, "utf-8");
  console.log(`Updated ${file.path}`);
});
