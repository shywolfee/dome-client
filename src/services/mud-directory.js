import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const directoryPath = path.join(__dirname, "..", "..", "data", "mud-directory.json");
let cachedDirectory;

export function loadMudDirectory() {
  if (cachedDirectory) return cachedDirectory;
  try {
    const directory = JSON.parse(fs.readFileSync(directoryPath, "utf8"));
    cachedDirectory = Array.isArray(directory.entries) ? directory.entries : [];
  } catch {
    cachedDirectory = [];
  }
  return cachedDirectory;
}
