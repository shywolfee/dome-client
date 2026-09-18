import test from "node:test";
import assert from "node:assert/strict";
import { createMudDecoder, detectEncoding, encodeMudInput, normalizeEncoding } from "../../src/services/mud-encoding.js";

test("normalizes common encoding aliases and rejects unknown values", () => {
  assert.equal(normalizeEncoding("KOI8R"), "koi8-r");
  assert.equal(normalizeEncoding("gb2312"), "gbk");
  assert.equal(normalizeEncoding("not-a-code-page"), "auto");
});

test("decodes explicit legacy encodings", () => {
  const decoder = createMudDecoder("big5");
  assert.equal(decoder.decode(Buffer.from([0xA4, 0xA4])), "\u4e2d");
  assert.equal(encodeMudInput("\u4e2d", "big5").toString("hex"), "a4a4");
});

test("auto detection identifies UTF-8 and produces text", () => {
  const data = Buffer.from("\u041f\u0440\u0438\u0432\u0435\u0442, \u043c\u0438\u0440!", "utf8");
  assert.equal(detectEncoding(data), "utf8");
  const decoder = createMudDecoder("auto");
  assert.equal(decoder.decode(data), "\u041f\u0440\u0438\u0432\u0435\u0442, \u043c\u0438\u0440!");
});

test("auto detection does not lock onto a legacy encoding from an ASCII prompt", () => {
  const decoder = createMudDecoder("auto");
  assert.equal(decoder.decode(Buffer.from("Enter an option:\r\n", "ascii")), "Enter an option:\r\n");
  assert.equal(decoder.decode(encodeMudInput("Привет\r\n", "utf8")), "Привет\r\n");
  assert.equal(decoder.encoding, "utf8");
});
