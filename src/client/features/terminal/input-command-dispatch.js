const echoCommand = (client, command) => {
  if (client.preferences.localEcho) {
    client.buffer.insertAdjacentHTML("beforeend", "<span class=\"input-echo\">&gt;" + command + "</span>\n");
  }
};

export const createCommandDispatcher = ({ client, socket, getSocket = () => socket ?? client.socket }) => ({
  sendCommand(command) {
    const normalizedCommand = String(command ?? "");
    if (!normalizedCommand) return;
    if (normalizedCommand.startsWith("@client-option")) {
      echoCommand(client, normalizedCommand);
      if (client.parseClientOptionCommand) client.parseClientOptionCommand(normalizedCommand);
    } else if (normalizedCommand === "@test") {
      echoCommand(client, normalizedCommand);
      client.openIDE?.({
        editorName: "Test Tab",
        uploadCommand: "@save-test",
        buffer: "This is some test data"
      });
    } else {
      echoCommand(client, normalizedCommand);
      const activeSocket = getSocket();
      if (!activeSocket || typeof activeSocket.emit !== "function") {
        client.health?.showStatus("ERROR: socket is not connected", { persist: true });
        return;
      }
      activeSocket.emit("input", normalizedCommand, (state = {}) => {
        client.health?.showStatus(
          (state.status && state.status.indexOf("command sent") == 0) ? "SENT" : state.status
        );
      });
    }
  }
});
