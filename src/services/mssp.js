import { connectToMud, DEFAULT_SOCKET_CONNECT_TIMEOUT_MS } from "./mud-connection.js";

export const MSSP_OPTION = 70;
export const MSSP_VAR = 1;
export const MSSP_VAL = 2;
const IAC = 255;
const DO = 253;
const SB = 250;
const SE = 240;
const DEFAULT_PROBE_TIMEOUT_MS = 5000;

function findSequence(buffer, sequence, fromIndex = 0) {
  return buffer.indexOf(Buffer.from(sequence), fromIndex);
}

export function parseMsspPayload(payload) {
  const values = {};
  let variable = null;
  let currentValues = [];
  let currentValue = null;
  const saveVariable = () => {
    if (!variable) return;
    if (currentValue !== null) currentValues.push(currentValue);
    if (currentValues.length) values[variable] = currentValues.length === 1 ? currentValues[0] : currentValues;
    currentValues = [];
    currentValue = null;
  };
  for (const byte of payload) {
    if (byte === MSSP_VAR) {
      saveVariable();
      variable = "";
    } else if (byte === MSSP_VAL) {
      if (variable !== null) {
        if (currentValue !== null) currentValues.push(currentValue);
        currentValue = "";
      }
    } else if (variable !== null && currentValue === null) {
      variable += String.fromCharCode(byte);
    } else if (variable !== null) {
      currentValue += String.fromCharCode(byte);
    }
  }
  saveVariable();
  return values;
}

export function normalizeMsspValues(values) {
  return Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [
    key.trim().toUpperCase().replace(/\s+/g, "_"),
    Array.isArray(value) ? value.map((item) => String(item)) : String(value)
  ]));
}

export async function probeMssp({
  host,
  port,
  useTls = false,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  connect = connectToMud
} = {}) {
  let connection;
  try {
    connection = await connect({
      host,
      port,
      useTls,
      timeoutMs: Math.min(timeoutMs, DEFAULT_SOCKET_CONNECT_TIMEOUT_MS)
    });
  } catch (error) {
    return { supported: false, error: error.message || String(error) };
  }

  return await new Promise((resolve) => {
    let buffer = Buffer.alloc(0);
    let settled = false;
    const timer = setTimeout(() => finish({ supported: false }), timeoutMs);
    if (typeof timer.unref === "function") timer.unref();

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connection.removeListener("data", onData);
      connection.removeListener("error", onError);
      connection.removeListener("close", onClose);
      connection.destroy();
      resolve(result);
    };
    const onError = (error) => finish({ supported: false, error: error.message || String(error) });
    const onClose = () => finish({ supported: false });
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      const start = findSequence(buffer, [IAC, SB, MSSP_OPTION]);
      if (start < 0) return;
      const end = findSequence(buffer, [IAC, SE], start + 3);
      if (end < 0) return;
      const payload = buffer.subarray(start + 3, end).filter((byte, index, source) => {
        return !(byte === IAC && source[index + 1] === IAC);
      });
      finish({ supported: true, values: normalizeMsspValues(parseMsspPayload(payload)) });
    };

    connection.on("data", onData);
    connection.once("error", onError);
    connection.once("close", onClose);
    connection.write(Buffer.from([IAC, DO, MSSP_OPTION]));
  });
}
