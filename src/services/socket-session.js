import { encodeMudInput } from "./mud-encoding.js";

export function bindSocketSession({
  socket,
  moo,
  logger,
  poweredBy,
  shortenEnabled,
  logUser,
  logError,
  encoding
}) {
  let writeQueue = Promise.resolve();
  const writeRaw = data => new Promise((resolve, reject) => {
    const output = encoding ? encodeMudInput(data, encoding) : data;
    const done = (error) => error ? reject(error) : resolve();
    if (Buffer.isBuffer(output)) {
      moo.write(output, done);
    } else {
      moo.write(output, "utf8", done);
    }
  });
  const writeAsync = data => {
    const write = writeQueue.then(() => writeRaw(data));
    writeQueue = write.catch(() => {});
    return write;
  };

  moo.on("end", function() {
    logger.debug("moo connection sent end");
    if (socket.isActive) {
      logger.debug("socket is active, sending disconnect and marking inactive");
      socket.isActive = false;
      socket.emit("disconnected");
    } else {
      logger.debug("socket is no longer active");
    }
  });

  moo.on("error", function(err) {
    logger.error("moo error event occurred");
    logError(socket, err);
    if (socket.isActive) {
      socket.emit("error", err);
    }
  });

  socket.on("error", function(err) {
    logger.error("socket error event occurred");
    logError(socket, err);
  });

  socket.on("shorten-on", function(_data, acknowledge) {
    if (!shortenEnabled) {
      acknowledge?.({ status: "shortening disabled" });
      return;
    }
    socket.shortenUrls = true;
    acknowledge?.({ status: "shortening enabled" });
  });

  socket.on("disconnect", function(data) {
    logUser(socket, "BYE");
    if (!socket.isActive) return;
    socket.isActive = false;
    if (data) {
      logger.debug("disconnected from client: " + data);
    }
    if (!moo.socketQuit) {
      const output = encoding ? encodeMudInput("@quit" + "\r\n", encoding) : "@quit" + "\r\n";
      if (Buffer.isBuffer(output)) {
        moo.write(output, function() {});
      } else {
        moo.write(output, "utf8", function() {});
      }
    }
  });

  socket.on("input", async function(command, acknowledge) {
    if (typeof command !== "string" || !command.length) {
      socket.emit("error", new Error("no input"));
      acknowledge?.({ status: "error: no input" });
      return;
    }
    if (socket.isActive === false) {
      acknowledge?.({ status: "error: not connected" });
      return;
    }
    logConnectCommand(socket, command, logUser);
    try {
      await writeAsync(command + "\r\n");
      if (command.match(/^@quit(\r\n)?$/)) {
        moo.socketQuit = true;
        socket.isActive = false;
        moo.end();
        socket.emit("disconnected");
        acknowledge?.({ status: "command sent" });
      } else {
        const sentStatus = "sent " + command.length + " characters";
        socket.emit("status", sentStatus);
        acknowledge?.({ status: "command sent" });
      }
      socket.emit("status", "command sent from " + poweredBy + " to moo at " + new Date().toString());
    } catch (exception) {
      logger.error("exception while writing to moo");
      logger.error(exception.stack);
      if (socket.isActive) {
        socket.emit("error", exception);
      }
      acknowledge?.({ status: "error: " + exception.message });
    }
  });
}

function logConnectCommand(socket, command, logUser) {
  if (command.indexOf("connect ") === -1 && command.indexOf("co ") === -1) {
    return;
  }
  const charmatch = command.match(/(connect|co) (\w+) \w/);
  if (charmatch) {
    const charname = charmatch[charmatch.length - 1];
    logUser(socket, "USR", [charname]);
  }
}
