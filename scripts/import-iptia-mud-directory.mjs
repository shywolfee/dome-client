import fs from "node:fs/promises";
import https from "node:https";

const outputPath = new URL("../data/mud-directory.json", import.meta.url);
const softwareUrl = "https://www.ipingthereforeiam.com/bbs/?all=0&step=software";
const sourceName = "IPTIA BBS/MUD directory (MUD software entries)";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: false }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        fetchText(new URL(response.headers.location, url).href).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`IPTIA returned HTTP ${response.statusCode}`));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
    });
    request.setTimeout(15000, () => request.destroy(new Error("IPTIA request timed out")));
    request.on("error", reject);
  });
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_full, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_full, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, String.fromCharCode(34))
    .replace(/&#39;/g, String.fromCharCode(39))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function field(html, label) {
  const pattern = new RegExp(`<th[^>]*>\\s*${label}:\\s*<td[^>]*>([\\s\\S]*?)(?=<th[^>]*align=right|</tr>)`, "i");
  return decodeEntities(html.match(pattern)?.[1] || "");
}

function parseMssp(html) {
  const values = {};
  const block = html.match(/<ul[^>]*class=mssp[^>]*>([\s\S]*?)<\/ul>/i)?.[1] || "";
  const matcher = /<b[^>]*class=list[^>]*>([\s\S]*?)<\/b>\s*=\s*<b[^>]*class=data[^>]*>([\s\S]*?)<\/b>/gi;
  for (const match of block.matchAll(matcher)) {
    values[decodeEntities(match[1]).toUpperCase().replace(/\s+/g, "_")] = decodeEntities(match[2]);
  }
  return values;
}

function normalizeEncoding(value) {
  const charset = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases = {
    utf8: "utf8", ascii: "utf8", big5: "big5", cp950: "big5", gbk: "gbk", gb2312: "gbk",
    gb18030: "gb18030", euckr: "euc-kr", cp949: "cp949", ko: "euc-kr", koi8r: "koi8-r",
    koi8u: "koi8-u", cp866: "cp866", cp1251: "windows-1251", windows1251: "windows-1251",
    cp1252: "windows-1252", windows1252: "windows-1252", iso88591: "iso-8859-1"
  };
  return aliases[charset] || "auto";
}

function normalizeLanguage(value) {
  const aliases = { en: "English", zh: "Chinese", ru: "Russian", ko: "Korean", de: "German", es: "Spanish", fr: "French", ja: "Japanese", pl: "Polish", it: "Italian", pt: "Portuguese" };
  const language = String(value || "").trim();
  return aliases[language.toLowerCase()] || language || "Unknown";
}

function parseAddress(value) {
  const match = String(value || "").match(/(?:telnet:\/\/)?([^\s:/]+):(\d{2,5})/i);
  if (!match) return null;
  return { host: match[1].toLowerCase(), port: Number(match[2]) };
}

const current = JSON.parse(await fs.readFile(outputPath, "utf8"));
const entries = current.entries.filter((entry) => entry.source !== "TheMUDs.org");
const known = new Set(entries.map((entry) => `${entry.host}:${entry.port}`.toLowerCase()));
const knownDetailUrls = new Set(entries.map((entry) => entry.sourceDetailUrl).filter(Boolean));
const page = await fetchText(softwareUrl);
const candidates = [];
const sectionPattern = /<li id=software>([^<]*)<\/li>([\s\S]*?)(?=<li id=software>|<\/ul>)/gi;
const bbsSoftware = /BBS|BOARD|AMIEXPRESS|ANET|CNET|C-BASE|CBBS|CITADEL|DOOR|MODEM|TERMINAL|ABBS|BBBS|FIDO|WORLDGROUP|MAJORBBS|MAXIMUS|SEARCHLIGHT|SPITFIRE|WILDCAT|WWIV/i;
for (const section of page.matchAll(sectionPattern)) {
  const software = decodeEntities(section[1]);
  if (bbsSoftware.test(software)) continue;
  for (const link of section[2].matchAll(/<li class=list><a id="UP" href="([^"]+)">([^<]+)<\/a>/gi)) {
    const url = new URL(link[1], softwareUrl).href;
    if (!knownDetailUrls.has(url)) candidates.push({ software, name: decodeEntities(link[2]), url });
  }
}

const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [candidate.url, candidate])).values());
let added = 0;
for (let index = 0; index < uniqueCandidates.length; index += 12) {
  const batch = uniqueCandidates.slice(index, index + 12);
  const results = await Promise.all(batch.map(async (candidate) => {
    try {
      const detail = await fetchText(candidate.url);
      const category = field(detail, "category").toUpperCase();
      if (!/(^|[., ])(MUD|MUSH|MUCK|MOO)([., ]|$)/.test(category)) return null;
      const address = parseAddress(field(detail, "telnet"));
      if (!address) return null;
      const mssp = parseMssp(detail);
      const language = normalizeLanguage(field(detail, "languages") || mssp.LANGUAGE);
      return {
        name: field(detail, "name") || candidate.name,
        ...address,
        tls: false,
        encoding: normalizeEncoding(mssp.CHARSET),
        language,
        ...(mssp.PLAYERS ? { playersNow: Number(mssp.PLAYERS) || 0 } : {}),
        status: "confirmed-online",
        source: sourceName,
        sourceUrl: softwareUrl,
        sourceDetailUrl: candidate.url,
        software: field(detail, "software") || candidate.software,
        ...(Object.keys(mssp).length ? { mssp } : {}),
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
    entries.push(entry);
    added++;
  }
  console.log(`IPTIA checked ${Math.min(index + batch.length, uniqueCandidates.length)}/${uniqueCandidates.length}`);
}

entries.sort((a, b) => String(a.name).localeCompare(String(b.name)));
await fs.writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sources: Array.from(new Set([...(current.sources || []), sourceName])),
  entries
}, null, 2) + "\n", "utf8");
console.log(`Added ${added} IPTIA MUD entries; total ${entries.length}.`);
