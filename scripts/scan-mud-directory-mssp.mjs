import fs from "node:fs/promises";
import { probeMssp } from "../src/services/mssp.js";

const outputPath = new URL("../data/mud-directory.json", import.meta.url);
const directory = JSON.parse(await fs.readFile(outputPath, "utf8"));
const entries = directory.entries;
const normalizeUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch { return ""; }
};
const pending = entries.filter((entry) => entry.msspSupported !== true && entry.msspSupported !== false);
for (const entry of entries) {
  if (entry.mssp && entry.msspSupported == null) entry.msspSupported = true;
  const declaredWebsite = entry.mssp?.WEBSITE || entry.mssp?.WEB_SITE;
  const declaredWiki = entry.mssp?.WIKI || entry.mssp?.WIKI_URL || entry.mssp?.WIKIPEDIA;
  if (!entry.website && normalizeUrl(declaredWebsite)) entry.website = normalizeUrl(declaredWebsite);
  if (!entry.wiki && normalizeUrl(declaredWiki)) entry.wiki = normalizeUrl(declaredWiki);
  if (!entry.wiki && /wiki/i.test(String(entry.website || ""))) entry.wiki = entry.website;
  if (!entry.genre && entry.mssp?.GENRE) entry.genre = String(entry.mssp.GENRE);
}

let completed = entries.length - pending.length;
const queue = pending.filter((entry) => entry.msspSupported == null);
const worker = async () => {
  while (queue.length) {
    const entry = queue.shift();
    const result = await probeMssp({
      host: entry.host,
      port: entry.port,
      useTls: entry.tls === true,
      timeoutMs: 2500
    });
    entry.msspSupported = result.supported === true;
    if (result.supported === true && Object.keys(result.values || {}).length) entry.mssp = result.values;
    completed += 1;
    if (completed % 25 === 0 || completed === entries.length) console.log(`MSSP scanned ${completed}/${entries.length}`);
  }
};
await Promise.all(Array.from({ length: Math.min(24, queue.length || 1) }, worker));
await fs.writeFile(outputPath, JSON.stringify({ ...directory, generatedAt: new Date().toISOString(), entries }, null, 2) + "\n", "utf8");
console.log(`MSSP scan complete: ${entries.filter((entry) => entry.msspSupported === true).length} supported, ${entries.filter((entry) => entry.msspSupported === false).length} unsupported.`);
