import { test } from "node:test";
import assert from "node:assert/strict";
/* global window, document */
import setupDom from "../../test-support/setup-dom.js";
import { createClientState } from "../../src/client/core/client-state.js";
import {
  createScreenReaderMode,
  isScreenReaderPrompt,
  stripScreenReaderNoise
} from "../../src/client/features/terminal/screen-reader-mode.js";

test("screen reader mode removes terminal noise but preserves multilingual text", () => {
  assert.equal(
    stripScreenReaderNoise("\u001b[31m┌────┐\u001b[0m\n  你好 Привет 안녕하세요  "),
    "你好 Привет 안녕하세요"
  );
  assert.equal(stripScreenReaderNoise("-----\nnormal output"), "normal output");
});

test("screen reader mode identifies prompts", () => {
  assert.equal(isScreenReaderPrompt("What is your password?"), true);
  assert.equal(isScreenReaderPrompt("Welcome to the MUD"), false);
});

test("screen reader mode labels new output without changing visible output", async (t) => {
  setupDom(t, "<!doctype html><html><body><div id=buffer aria-live=polite><div>old</div></div></body></html>");
  const client = createClientState();
  client.preferences = { screenReaderMode: true };
  const mode = createScreenReaderMode({ client, win: window });
  const target = document.querySelector("#buffer");
  target.insertAdjacentHTML("beforeend", "<div><span>\u001b[31mVisible\u001b[0m</span></div><div>What is your name?</div>");
  const addedNodes = Array.from(target.childNodes).slice(1);
  mode.applyToAddedNodes({ rawSegment: "\u001b[31mVisible\u001b[0m\nWhat is your name?", addedNodes, target });

  assert.equal(addedNodes[0].innerHTML, "<span>\u001b[31mVisible\u001b[0m</span>");
  assert.equal(addedNodes[0].getAttribute("aria-label"), "Visible");
  assert.equal(addedNodes[1].getAttribute("aria-hidden"), "true");
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  assert.equal(addedNodes[1].getAttribute("aria-hidden"), null);
  assert.equal(addedNodes[1].getAttribute("aria-label"), "What is your name?");
});
