import config from "../config/index.js";
import { parseSocketPort, parseTransportMode } from "../services/socket-address.js";
import { normalizeMsspVariable, probeMssp } from "../services/mssp.js";

export async function check(req, res) {
  if (config.node.multiMud !== true) {
    res.status(404).json({ error: "MSSP directory checks require MULTI_MUD=true" });
    return;
  }

  const host = String(req.query.host || "").trim();
  const port = parseSocketPort(req.query.port);
  const variable = normalizeMsspVariable(req.query.variable);
  if (!host || port == null) {
    res.status(400).json({ error: "A valid host and port are required" });
    return;
  }

  const result = await probeMssp({
    host,
    port,
    variable,
    useTls: config.moo.tlsEnabled === true && parseTransportMode(req.query.transport_mode) === "tls"
  });
  res.json({ host, port, ...result });
}
