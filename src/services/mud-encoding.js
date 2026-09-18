import iconv from "iconv-lite";
import { detect } from "chardet";

export const AUTO_ENCODING = "auto";
export const DEFAULT_ENCODING = "utf8";

const ENCODING_ALIASES = new Map([
  ["utf-8", "utf8"],
  ["utf8", "utf8"],
  ["gb2312", "gbk"],
  ["gb18030", "gb18030"],
  ["euc-kr", "euc-kr"],
  ["korean", "euc-kr"],
  ["koi8-r", "koi8-r"],
  ["koi8r", "koi8-r"],
  ["shift-jis", "shift_jis"],
  ["shift_jis", "shift_jis"]
]);

export const SUPPORTED_ENCODINGS = [
  { value: AUTO_ENCODING, label: "Auto-detect" },
  { value: "utf8", label: "UTF-8" },
  { value: "gbk", label: "GBK / GB2312" },
  { value: "gb18030", label: "GB18030" },
  { value: "big5", label: "Big5" },
  { value: "euc-kr", label: "EUC-KR" },
  { value: "cp949", label: "Korean UHC / CP949" },
  { value: "shift_jis", label: "Shift-JIS" },
  { value: "euc-jp", label: "EUC-JP" },
  { value: "koi8-r", label: "KOI8-R" },
  { value: "koi8-u", label: "KOI8-U" },
  { value: "cp866", label: "CP866" },
  { value: "cp437", label: "CP437" },
  { value: "windows-1251", label: "Windows-1251" },
  { value: "windows-1252", label: "Windows-1252" },
  { value: "iso-8859-1", label: "ISO-8859-1" },
  { value: "iso-8859-5", label: "ISO-8859-5" }
];

export function normalizeEncoding(value) {
  const normalized = String(value || AUTO_ENCODING).trim().toLowerCase();
  if (normalized === AUTO_ENCODING) return AUTO_ENCODING;
  const encoding = ENCODING_ALIASES.get(normalized) || normalized;
  return iconv.encodingExists(encoding) ? encoding : AUTO_ENCODING;
}

export function detectEncoding(data) {
  if (!data || data.length === 0) return DEFAULT_ENCODING;
  const bytes = Buffer.from(data);
  if (bytes.every(byte => byte < 0x80)) return DEFAULT_ENCODING;
  const detected = normalizeEncoding(detect(bytes));
  return detected === AUTO_ENCODING ? DEFAULT_ENCODING : detected;
}

export function createMudDecoder(requestedEncoding = AUTO_ENCODING) {
  let encoding = normalizeEncoding(requestedEncoding);
  let decoder;
  let autoProbe = Buffer.alloc(0);

  const ensureDecoder = (data) => {
    if (encoding === AUTO_ENCODING) encoding = detectEncoding(data);
    decoder = iconv.getDecoder(encoding);
    return encoding;
  };

  return {
    get encoding() {
      return encoding;
    },
    decode(data) {
      const bytes = Buffer.from(data);
      if (encoding === AUTO_ENCODING) {
        if (bytes.every(byte => byte < 0x80)) {
          // ASCII is shared by the supported encodings. Keep it flowing while
          // leaving auto-detection open for the first real multibyte text.
          return bytes.toString("utf8");
        }
        autoProbe = Buffer.concat([autoProbe, bytes]).subarray(-4096);
      }
      ensureDecoder(autoProbe.length ? autoProbe : bytes);
      if (autoProbe.length) {
        const output = decoder.write(autoProbe);
        autoProbe = Buffer.alloc(0);
        return output;
      }
      return decoder.write(bytes);
    },
    end() {
      return decoder ? decoder.end() : "";
    }
  };
}

export function encodeMudInput(value, encoding) {
  return iconv.encode(String(value), normalizeEncoding(encoding) === AUTO_ENCODING ? DEFAULT_ENCODING : normalizeEncoding(encoding));
}
