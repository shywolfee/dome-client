import fs from "node:fs/promises";

const outputPath = new URL("../data/mud-directory.json", import.meta.url);
const mudStatsListUrl = "https://www.mudstats.com/WorldList?sEcho=1&iDisplayStart=0&iDisplayLength=1000&iSortingCols=1&iSortCol_0=4&sSortDir_0=desc&sSearch=&sSearch_0=&sSearch_1=&sSearch_2=UP&sSearch_3=";

function decodeEntities(value) {
  return value
    .replace(/&#39;/g, String.fromCharCode(39))
    .replace(/&quot;/g, String.fromCharCode(34))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#37;/g, "%")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseAddress(html) {
  const match = html.match(/telnet:\/\/([^":/]+):(\d+)/i);
  if (!match) return null;
  return { host: match[1], port: Number(match[2]) };
}

function normalizeLanguage(language) {
  const value = String(language || "").trim();
  const aliases = {
    en: "English", zh: "Chinese", ru: "Russian", ko: "Korean",
    de: "German", es: "Spanish", fr: "French", ja: "Japanese",
    pl: "Polish", it: "Italian", pt: "Portuguese"
  };
  return aliases[value.toLowerCase()] || value || "Unknown";
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

const current = JSON.parse(await fs.readFile(outputPath, "utf8"));
const retained = current.entries
  .filter(entry => entry.source !== "TheMUDs.org")
  .map(entry => ({ ...entry, language: normalizeLanguage(entry.language) }));
const known = new Set(retained.map(entry => `${entry.host}:${entry.port}`.toLowerCase()));
const list = JSON.parse(await fetchText(mudStatsListUrl));
const candidates = list.aaData
  .map(row => {
    const link = row[0]?.match(/href="\/World\/([^"]+)"/i);
    if (!link) return null;
    return {
      name: decodeEntities(row[0]),
      url: `https://www.mudstats.com/World/${link[1]}`
    };
  })
  .filter(Boolean);

let added = 0;
for (let index = 0; index < candidates.length; index += 16) {
  const batch = candidates.slice(index, index + 16);
  const results = await Promise.all(batch.map(async candidate => {
    try {
      const detail = await fetchText(candidate.url);
      const address = parseAddress(detail);
      if (!address) return null;
      return {
        name: candidate.name,
        ...address,
        tls: false,
        encoding: "auto",
        language: "Unknown",
        status: "confirmed-online",
        source: "MudStats",
        sourceUrl: "https://www.mudstats.com/Browse",
        sourceDetailUrl: candidate.url,
        checkedAt: new Date().toISOString().slice(0, 10)
      };
    } catch {
      return null;
    }
  }));
  for (const entry of results) {
    if (!entry) continue;
    const key = `${entry.host}:${entry.port}`.toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    retained.push(entry);
    added += 1;
  }
  console.log(`MudStats checked ${Math.min(index + batch.length, candidates.length)}/${candidates.length}`);
}

retained.sort((a, b) => {
  const statusRank = entry => entry.status === "confirmed-online" ? 0 : 1;
  return statusRank(a) - statusRank(b) || String(a.language || "Unknown").localeCompare(String(b.language || "Unknown")) || String(a.name).localeCompare(String(b.name));
});

await fs.writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sources: [
    "mu*index active/players-now API",
    "MUDVerse active/recently reached directory",
    "MudStats online worlds",
    "IPTIA BBS/MUD directory (MUD software entries)"
  ],
  entries: retained
}, null, 2) + "\n", "utf8");
console.log(`Removed TheMUDs.org entries and added ${added} new MudStats entries; total ${retained.length}.`);
