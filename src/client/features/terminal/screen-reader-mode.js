/* eslint-disable no-control-regex */
const ANSI_ESCAPE_SEQUENCE = /\u001b(?:\][^\u0007]*(?:\u0007|\u001b\\)|\[[0-?]*[ -/]*[@-~]|[()][0-2A-Z])/g;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const BOX_DRAWING_CHARACTER = /[\u2500-\u257f\u2580-\u259f\u25a0-\u25ff]/g;
const DECORATIVE_LINE = /^[\s|/\\_*#=~.-]+$/;

export function stripScreenReaderNoise(value) {
  if (value == null) return "";

  const lines = String(value)
    .replace(/\r\n?/g, "\n")
    .replace(ANSI_ESCAPE_SEQUENCE, "")
    .replace(CONTROL_CHARACTER, "")
    .replace(BOX_DRAWING_CHARACTER, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line !== "" && !DECORATIVE_LINE.test(line));

  return lines.join("\n");
}

export function isScreenReaderPrompt(value) {
  const line = stripScreenReaderNoise(value);
  if (!line) return false;

  return /(?:[?:]|(?:enter|type|choose|select|pick|provide|input|what is|please)\b[^\n]*?)\s*[?:]\s*$/i.test(line)
    || /^(?:enter|type|choose|select|pick|provide|input|please enter)\b/i.test(line);
}

export function createScreenReaderMode({ client, win = globalThis.window } = {}) {
  const timers = new Set();
  const managedNodes = new Set();

  const clearTimers = () => {
    timers.forEach((timer) => (win?.clearTimeout || clearTimeout)(timer));
    timers.clear();
  };

  const restoreManagedNodes = () => {
    managedNodes.forEach((node) => {
      node.removeAttribute("aria-label");
      node.removeAttribute("aria-hidden");
    });
    managedNodes.clear();
  };

  const releasePrompt = (node, text) => {
    const release = () => {
      timers.delete(timer);
      if (client.preferences?.screenReaderMode !== true || !node.isConnected) return;
      node.removeAttribute("aria-hidden");
      node.setAttribute("aria-label", text);
    };
    const timer = (win?.setTimeout || setTimeout)(release, 0);
    timers.add(timer);
  };

  const applyToAddedNodes = ({ rawSegment, addedNodes }) => {
    if (client.preferences?.screenReaderMode !== true || !addedNodes?.length) return;

    const lines = String(rawSegment ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
    if (lines.at(-1) === "") lines.pop();

    addedNodes.forEach((node, index) => {
      const ElementType = win?.Element || globalThis.Element;
      if (ElementType && !(node instanceof ElementType)) return;
      if (!ElementType && node?.nodeType !== 1) return;
      managedNodes.add(node);
      const text = stripScreenReaderNoise(lines[index] ?? node.textContent);
      if (!text) {
        node.setAttribute("aria-hidden", "true");
        return;
      }

      node.setAttribute("aria-label", text);
      if (isScreenReaderPrompt(text)) {
        node.setAttribute("aria-hidden", "true");
        releasePrompt(node, text);
      }
    });
  };

  return {
    applyToAddedNodes,
    refresh(enabled) {
      if (!enabled) {
        clearTimers();
        restoreManagedNodes();
      }
    }
  };
}
