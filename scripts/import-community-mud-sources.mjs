import fs from "node:fs/promises";
import { JSDOM } from "jsdom";

const outputPath = new URL("../data/mud-directory.json", import.meta.url);
const current = JSON.parse(await fs.readFile(outputPath, "utf8"));
const entries = current.entries.map((entry) => ({ ...entry }));
const known = new Map(entries.map((entry) => [`${entry.host}:${entry.port}`.toLowerCase(), entry]));

const sourceNames = {
  mudhaven: "Mudhaven.net public worlds",
  vineyard: "Vineyard.haus public MUD list",
  grapevine: "Grapevine.haus public game directory",
  evennia: "Evennia Game Index",
  amn: "Anime MUD Network"
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value) {
  const text = clean(value);
  if (!text) return "";
  try {
    const url = new URL(text.startsWith("//") ? `https:${text}` : text);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function add(entry) {
  if (!entry.host || !entry.port || !entry.name) return false;
  const key = `${entry.host}:${entry.port}`.toLowerCase();
  const existing = known.get(key);
  if (existing) {
    for (const keyName of ["website", "wiki", "genre", "language", "software", "sourceDetailUrl"]) {
      if (!existing[keyName] && entry[keyName]) existing[keyName] = entry[keyName];
    }
    existing.sources = Array.from(new Set([...(existing.sources || [existing.source]), ...(entry.sources || [entry.source])].filter(Boolean)));
    return false;
  }
  entry.sources = [entry.source];
  known.set(key, entry);
  entries.push(entry);
  return true;
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function baseEntry({ name, host, port, source, sourceUrl, sourceDetailUrl, website, wiki, genre, language = "Unknown", software }) {
  return {
    name: clean(name), host: clean(host), port: Number(port), tls: false, encoding: "auto",
    language: clean(language) || "Unknown", status: "directory-listed", source, sourceUrl,
    sourceDetailUrl, ...(normalizeUrl(website) ? { website: normalizeUrl(website) } : {}),
    ...(normalizeUrl(wiki) ? { wiki: normalizeUrl(wiki) } : {}),
    ...(clean(genre) ? { genre: clean(genre) } : {}), ...(clean(software) ? { software: clean(software) } : {})
  };
}

async function importMudhaven() {
  const html = await fetchText("https://mudhaven.net/worlds");
  const dom = new JSDOM(html);
  const urls = Array.from(dom.window.document.querySelectorAll("a[href*=\"/worlds/\"]"))
    .map((link) => new URL(link.getAttribute("href"), "https://mudhaven.net").href)
    .filter((url) => !url.endsWith("/worlds") && !url.includes("/connect"));
  for (const url of Array.from(new Set(urls))) {
    try {
      const detail = new JSDOM(await fetchText(url));
      const text = clean(detail.window.document.body.textContent);
      if (!/\bMUD\b/i.test(text)) continue;
      const address = text.match(/(?:Connect|Telnet)\s+([a-z0-9.-]+):(\d{2,5})/i);
      if (!address) continue;
      const title = clean(detail.window.document.querySelector("h1")?.textContent || url.split("/").pop().replace(/-/g, " "));
      const website = Array.from(detail.window.document.querySelectorAll("a[href]"))
        .map((link) => link.href).find((href) => !href.includes("mudhaven.net") && /^https?:/i.test(href));
      const tags = Array.from(detail.window.document.querySelectorAll("a, li, span"))
        .map((node) => clean(node.textContent)).filter(Boolean);
      add(baseEntry({ name: title, host: address[1], port: address[2], source: sourceNames.mudhaven,
        sourceUrl: "https://mudhaven.net/worlds", sourceDetailUrl: url, website,
        genre: tags.find((tag) => /fantasy|sci-fi|horror|historical|roleplay|wilderness/i.test(tag)),
        software: text.match(/Codebase\s+([^·|]+)/i)?.[1] }));
    } catch (error) { console.warn(`Mudhaven skipped ${url}: ${error.message}`); }
  }
}

async function importVineyard() {
  const dom = new JSDOM(await fetchText("https://vineyard.haus/muds"));
  const links = Array.from(dom.window.document.querySelectorAll("a[href^=\"telnet://\"]"));
  for (const link of links) {
    const address = link.href.match(/^telnet:\/\/([^:]+):(\d+)/i);
    if (!address) continue;
    const row = link.closest("tr");
    const cells = row ? Array.from(row.querySelectorAll("td")).map((cell) => clean(cell.textContent)) : [];
    const website = row ? Array.from(row.querySelectorAll("a[href^=\"http\"]")).map((item) => item.href)[0] : "";
    add(baseEntry({ name: cells[0] || link.textContent, host: address[1], port: address[2],
      source: sourceNames.vineyard, sourceUrl: "https://vineyard.haus/muds", website,
      software: cells.find((cell) => /MUD|MUSH|MOO|LP|Circle|ROM|Diku/i.test(cell)) }));
  }
}

async function importGrapevine() {
  const listDom = new JSDOM(await fetchText("https://grapevine.haus/games"));
  const games = Array.from(listDom.window.document.querySelectorAll("li.game")).map((item) => {
    const title = clean(item.querySelector("h4.title a")?.textContent);
    const detail = item.querySelector("h4.title a")?.href;
    const tagline = clean(item.querySelector(".tagline")?.textContent);
    const software = clean(item.querySelector(".user-agent")?.textContent);
    return title && detail ? { title, detail: new URL(detail, "https://grapevine.haus").href, tagline, software } : null;
  }).filter(Boolean);
  for (let index = 0; index < games.length; index += 12) {
    const batch = await Promise.all(games.slice(index, index + 12).map(async (game) => {
      try {
        const dom = new JSDOM(await fetchText(game.detail));
        const text = clean(dom.window.document.body.textContent);
        const address = text.match(/Host:\s*([^\s]+)\s+Port:\s*(\d+)/i);
        if (!address) return null;
        const website = Array.from(dom.window.document.querySelectorAll("a[href^=\"http\"]"))
          .map((link) => link.href).find((href) => !href.includes("grapevine.haus") && !href.includes("google.com"));
        const wiki = Array.from(dom.window.document.querySelectorAll("a[href]")).map((link) => link.href)
          .find((href) => /wiki/i.test(href));
        return baseEntry({ name: game.title, host: address[1], port: address[2], source: sourceNames.grapevine,
          sourceUrl: "https://grapevine.haus/games", sourceDetailUrl: game.detail, website,
          wiki, genre: game.tagline, software: game.software });
      } catch { return null; }
    }));
    batch.filter(Boolean).forEach(add);
    console.log(`Grapevine checked ${Math.min(index + 12, games.length)}/${games.length}`);
  }
}

async function importEvennia() {
  const dom = new JSDOM(await fetchText("http://games.evennia.com/"));
  for (const row of dom.window.document.querySelectorAll(".game-table-row tr")) {
    const name = clean(row.querySelector("a[href^=\"/game/\"]")?.textContent);
    const telnet = row.querySelector("a[href^=\"telnet://\"]")?.href.match(/^telnet:\/\/([^:]+):(\d+)/i);
    if (!name || !telnet) continue;
    const blurb = clean(row.querySelector("td:nth-child(2)")?.textContent);
    add(baseEntry({ name, host: telnet[1], port: telnet[2], source: sourceNames.evennia,
      sourceUrl: "https://games.evennia.com/", sourceDetailUrl: new URL(row.querySelector("a[href^=\"/game/\"]").getAttribute("href"), "http://games.evennia.com").href,
      genre: blurb, software: "Evennia", website: row.querySelector("a[href^=\"https://\"]")?.href }));
  }
}

async function importAmn() {
  const dom = new JSDOM(await fetchText("http://amn.biyg.org/"));
  for (const link of dom.window.document.querySelectorAll("a[href^=\"telnet://\"]")) {
    const address = link.href.match(/^telnet:\/\/([^:]+):(\d+)/i);
    const name = clean(link.closest("p")?.textContent).replace(/\s+[a-z0-9.-]+\s+\d+$/i, "");
    if (!address || !name) continue;
    add(baseEntry({ name, host: address[1], port: address[2], source: sourceNames.amn,
      sourceUrl: "http://amn.biyg.org/", genre: /dragonball|naruto|hunter|inuyasha/i.test(name) ? "Anime" : "Anime / fantasy" }));
  }
}

for (const task of [importMudhaven, importVineyard, importGrapevine, importEvennia, importAmn]) {
  try { await task(); } catch (error) { console.warn(`Source unavailable: ${error.message}`); }
}

entries.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.host).localeCompare(String(b.host)) || a.port - b.port);
const sources = Array.from(new Set([...(current.sources || []), ...Object.values(sourceNames)])).filter(Boolean);
await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), sources, entries }, null, 2) + "\n", "utf8");
console.log(`Community import complete: ${entries.length} total entries.`);
