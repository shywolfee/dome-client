import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { normalizeMsspValues, parseMsspPayload, probeMssp } from "../../src/services/mssp.js";

test("MSSP parser preserves repeated values and normalizes variable names", () => {
  const payload = Buffer.from([
    1, ...Buffer.from("NAME"), 2, ...Buffer.from("Example MUD"),
    1, ...Buffer.from("CHARSET"), 2, ...Buffer.from("UTF-8"), 2, ...Buffer.from("BIG5"),
    1, ...Buffer.from("ROOMS"), 2, ...Buffer.from("120")
  ]);
  const values = normalizeMsspValues(parseMsspPayload(payload));
  assert.deepEqual(values, {
    NAME: "Example MUD",
    CHARSET: ["UTF-8", "BIG5"],
    ROOMS: "120"
  });
});

test("MSSP probe negotiates option 70 and parses the response", async () => {
  const connection = new EventEmitter();
  connection.write = (data) => {
    assert.deepEqual([...data], [255, 253, 70]);
    queueMicrotask(() => connection.emit("data", Buffer.from([
      255, 250, 70, 1, ...Buffer.from("PLAYERS"), 2, ...Buffer.from("7"), 1,
      ...Buffer.from("RACES"), 2, ...Buffer.from("Human, Elf"), 255, 240
    ])));
  };
  connection.destroy = () => {};

  const result = await probeMssp({
    host: "example.test",
    port: 4000,
    connect: async () => connection,
    timeoutMs: 100
  });
  assert.deepEqual(result, {
    supported: true,
    values: { PLAYERS: "7", RACES: "Human, Elf" }
  });
});
