import {
  buildMooConnectCommand,
  buildPlayerClientUrl,
  normalizeTransportMode,
  resolvePlayerClientAddress
} from "./client-connect-intent.js";

export function getParameterByName(name, locationSearch = globalThis.window?.location?.search || "") {
  const match = RegExp("[?&]" + name + "=([^&]*)").exec(locationSearch);
  return match && decodeURIComponent(match[1].replace(/\+/g, " "));
}

export function createConnectAction({
  doc = globalThis.document,
  win = globalThis.window,
  store,
  savedUsersStore
}) {
  return function connect() {
    const username = doc.getElementById("moo-username").value;
    const password = doc.getElementById("moo-password").value;
    const command = buildMooConnectCommand({ username, password });
    if (command) {
      savedUsersStore.addUser({ username, password });
      store.put("last-username", username);
      store.put("dc-user-login", command);
    }
    const hostField = doc.getElementById("moo-hostname");
    const portField = doc.getElementById("moo-port");
    const tlsField = doc.getElementById("mud-use-tls");
    const { host, port } = resolvePlayerClientAddress({
      host: hostField?.value,
      port: portField?.value
    });
    const useTls = tlsField?.checked === true;
    const encoding = doc.getElementById("mud-encoding")?.value || "auto";
    store.put("game-hostname", host);
    store.put("game-port", port);
    if (tlsField) {
      store.put(`game-transport-tls:${host}:${port}`, useTls);
    }
    store.put(`game-encoding:${host}:${port}`, encoding);
    win.location = buildPlayerClientUrl({
      host,
      port,
      transportMode: useTls ? "tls" : "tcp"
      ,encoding
    });
  };
}

export function initializeEncodingField({ doc = globalThis.document, store, host, port }) {
  const field = doc.getElementById("mud-encoding");
  if (!field) return;
  const sync = () => {
    const { host: addressHost, port: addressPort } = resolvePlayerClientAddress({
      host: doc.getElementById("moo-hostname")?.value || host,
      port: doc.getElementById("moo-port")?.value || port
    });
    field.value = store?.get(`game-encoding:${addressHost}:${addressPort}`) || "auto";
  };
  sync();
  doc.getElementById("moo-hostname")?.addEventListener("input", sync);
  doc.getElementById("moo-port")?.addEventListener("input", sync);
}

export function initializeMudDirectoryField({ doc = globalThis.document }) {
  const searchField = doc.getElementById("mud-directory-search");
  const languageField = doc.getElementById("mud-language-filter");
  const links = Array.from(doc.querySelectorAll(".mud-directory-link"));
  if ((!searchField && !languageField) || links.length === 0) return;
  const applyFilters = () => {
    const query = searchField?.value.trim().toLowerCase() || "";
    const language = languageField?.value || "";
    const msspFilter = doc.getElementById("mud-mssp-filter")?.value || "";
    links.forEach((link) => {
      const entry = link.closest(".mud-directory-entry") || link;
      const languageLabel = entry.querySelector(".mud-directory-language")?.textContent.trim().toLowerCase()
        || link.nextElementSibling?.textContent.trim().toLowerCase()
        || "unknown";
      const matchesSearch = query === "" || link.dataset.search.includes(query);
      const matchesLanguage = language === "" || languageLabel === language;
      const values = (entry.dataset.msspValues || "").split(",").filter(Boolean);
      const matchesMssp = msspFilter === ""
        || (msspFilter === "supported" && entry.dataset.msspSupported === "true")
        || (msspFilter.startsWith("has:") && values.includes(msspFilter.slice(4)));
      entry.classList.toggle("hide", !matchesSearch || !matchesLanguage || !matchesMssp);
    });
  };
  searchField?.addEventListener("input", applyFilters);
  languageField?.addEventListener("change", applyFilters);
  doc.getElementById("mud-mssp-filter")?.addEventListener("change", applyFilters);
  applyFilters();
}

export function initializeMsspDirectoryField({
  doc = globalThis.document,
  win = globalThis.window,
  fetchFn = win?.fetch?.bind(win)
}) {
  const directory = doc.getElementById("mud-directory");
  const checkAll = doc.getElementById("mud-mssp-check-all");
  const filter = doc.getElementById("mud-mssp-filter");
  const status = doc.getElementById("mud-mssp-status");
  const entries = Array.from(doc.querySelectorAll(".mud-directory-entry"));
  if (!directory || !fetchFn || entries.length === 0) return;

  const addValueOption = (key) => {
    if (!filter || !key || Array.from(filter.options).some((option) => option.value === `has:${key}`)) return;
    const option = doc.createElement("option");
    option.value = `has:${key}`;
    option.textContent = `MUDs declaring ${key.toLowerCase()}`;
    filter.append(option);
  };

  const updateEntry = (entry, result) => {
    const values = Object.keys(result.values || {}).map((key) => key.toUpperCase());
    entry.dataset.msspSupported = result.supported === true ? "true" : "false";
    entry.dataset.msspValues = values.join(",");
    values.forEach(addValueOption);
    const resultElement = entry.querySelector(".mud-mssp-result");
    if (resultElement) {
      const summary = Object.entries(result.values || {})
        .map(([key, value]) => `${key.toLowerCase()}=${Array.isArray(value) ? value.join(", ") : value}`)
        .join("; ");
      resultElement.textContent = result.supported === true
        ? `MSSP: ${summary || "supported"}`
        : "MSSP unavailable";
      if (summary) resultElement.title = summary;
    }
    doc.getElementById("mud-language-filter")?.dispatchEvent(new doc.defaultView.Event("change"));
  };

  const checkEntry = async (entry) => {
    const link = entry.querySelector(".mud-directory-link");
    const button = entry.querySelector(".mud-mssp-check");
    if (!link) return;
    button?.setAttribute("aria-busy", "true");
    try {
      const params = new URLSearchParams({ host: link.dataset.msspHost, port: link.dataset.msspPort });
      if (link.dataset.msspTls === "true") params.set("transport_mode", "tls");
      const response = await fetchFn(`/mssp/?${params.toString()}`);
      const result = await response.json();
      updateEntry(entry, result);
    } catch {
      updateEntry(entry, { supported: false });
    } finally {
      button?.removeAttribute("aria-busy");
    }
  };

  entries.forEach((entry) => entry.querySelector(".mud-mssp-check")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    checkEntry(entry);
  }));

  checkAll?.addEventListener("click", async () => {
    checkAll.disabled = true;
    let completed = 0;
    if (status) status.textContent = `Checking MSSP support (0/${entries.length})...`;
    const queue = entries.slice();
    const worker = async () => {
      while (queue.length) {
        const entry = queue.shift();
        await checkEntry(entry);
        completed++;
        if (status) status.textContent = `Checking MSSP support (${completed}/${entries.length})...`;
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, entries.length) }, worker));
    checkAll.disabled = false;
    if (status) status.textContent = "MSSP directory loaded. Choose a filter to narrow the list.";
  });
}

export function setupConnectPageChrome({ doc = globalThis.document, win = globalThis.window }) {
  doc.body.style.overflowY = "auto";
  doc.body.style.msOverflowStyle = "none";
  doc.body.style.scrollbarWidth = "none";
  const hideScrollbar = doc.createElement("style");
  hideScrollbar.textContent = "body::-webkit-scrollbar { display: none; }";
  doc.head.appendChild(hideScrollbar);

  const body = doc.body;
  const backgroundImage = win.getComputedStyle(body).backgroundImage;
  if (backgroundImage && backgroundImage !== "none") {
    body.style.backgroundImage = "none";
    win.setTimeout(() => {
      body.style.backgroundImage = backgroundImage;
    }, 10);
  }
}

export function initializeAddressFields({ doc = globalThis.document, host, port }) {
  const hostnameField = doc.getElementById("moo-hostname");
  const portField = doc.getElementById("moo-port");
  if (hostnameField && !hostnameField.value) {
    hostnameField.value = host;
  }
  if (portField && !portField.value) {
    portField.value = port;
  }
}

export function initializeTransportModeField({
  doc = globalThis.document,
  storage = globalThis.localStorage,
  store,
  host,
  port
}) {
  const tlsField = doc.getElementById("mud-use-tls");
  if (!tlsField) return;
  const resolveStoredValue = (addressHost, addressPort) => {
    const key = `game-transport-tls:${addressHost}:${addressPort}`;
    if (store && typeof store.get === "function") {
      return store.get(key);
    }
    const raw = storage?.getItem?.(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw === "true";
    }
  };
  const syncFromAddress = () => {
    const { host: addressHost, port: addressPort } = resolvePlayerClientAddress({
      host: doc.getElementById("moo-hostname")?.value || host,
      port: doc.getElementById("moo-port")?.value || port
    });
    tlsField.checked = resolveStoredValue(addressHost, addressPort) === true;
  };
  syncFromAddress();
  const hostnameField = doc.getElementById("moo-hostname");
  const portField = doc.getElementById("moo-port");
  hostnameField?.addEventListener("input", syncFromAddress);
  hostnameField?.addEventListener("change", syncFromAddress);
  portField?.addEventListener("input", syncFromAddress);
  portField?.addEventListener("change", syncFromAddress);
}

export function parsePlayerClientTransportMode(locationSearch = globalThis.window?.location?.search || "") {
  const params = new URLSearchParams(locationSearch || "");
  return normalizeTransportMode(params.get("transport_mode"));
}

export function bindSavedUserPicker({
  doc = globalThis.document,
  win = globalThis.window,
  logger,
  savedUsersStore,
  usernames,
  autoUser
}) {
  const usernamePicker = doc.getElementById("user-picker");
  const usernamePickerLabel = usernamePicker ? usernamePicker.querySelector(".user-picker-label") : null;
  const usernamePickerToggle = usernamePicker ? usernamePicker.querySelector(".dropdown-toggle") : null;
  const usernameField = doc.getElementById("moo-username");
  const passwordField = doc.getElementById("moo-password");
  if (!usernameField || !passwordField || usernames.length === 0 || !usernamePicker || !usernamePickerLabel) {
    return;
  }

  const readyUser = function(username, password) {
    usernamePickerLabel.textContent = username;
    usernameField.value = username;
    passwordField.value = password;
  };

  usernameField.style.display = "none";
  const charsMenu = usernamePicker.querySelector(".dropdown-menu");
  const charsList = charsMenu
    ? Array.from(charsMenu.querySelectorAll("li.character")).map(entry => entry.textContent.toLowerCase())
    : [];

  if (charsList.length > 0) {
    logger.info(`Preset characters: ${charsList.join(", ")}`);
  }

  const divider = usernamePicker.querySelector(".divider");
  usernames.forEach((username) => {
    if (charsList.includes(username.toLowerCase())) return;
    divider?.insertAdjacentHTML("beforebegin", `<li class="username" data-username="${username}">${username}</li>`);
  });

  usernamePicker.querySelectorAll("ul.dropdown-menu li:not(.divider)").forEach((li) => {
    li.setAttribute("tabindex", "-1");
  });

  const bestUser = (autoUser ? savedUsersStore.getUser(autoUser) : null) || savedUsersStore.getUser(usernames[0]);
  if (bestUser) {
    readyUser(bestUser.username, bestUser.password);
  }

  bindSavedUserMenu({ doc, win, logger, savedUsersStore, usernamePicker, passwordField, readyUser });
  bindPickerToggle({ doc, usernamePicker, usernamePickerToggle });
  usernamePicker.classList.remove("hide");
}

function bindSavedUserMenu({
  win,
  logger,
  savedUsersStore,
  usernamePicker,
  passwordField,
  readyUser
}) {
  const userOptions = usernamePicker.querySelector("ul.dropdown-menu");
  if (!userOptions) return;
  userOptions.addEventListener("click", (event) => {
    const clicked = event.target;
    if (clicked.classList.contains("username") || clicked.classList.contains("character")) {
      const usernameClicked = clicked.getAttribute("data-username");
      const user = savedUsersStore.getUser(usernameClicked) || { username: usernameClicked, password: "" };
      readyUser(user.username, user.password);
      return;
    }
    if (!clicked.classList.contains("command")) return;
    const command = clicked.getAttribute("data-command");
    logger.info(`Command selected: ${command}`);
    if (command === "purgeAll" && win.confirm("You really want to delete all local user profiles?")) {
      savedUsersStore.purge();
      win.location.reload();
    } else if (command === "newChar") {
      const newName = win.prompt("What is your character name?");
      readyUser(newName, "");
      passwordField.focus();
    }
  });
}

function bindPickerToggle({ doc, usernamePicker, usernamePickerToggle }) {
  if (!usernamePickerToggle) return;
  const pickerMenu = usernamePicker.querySelector(".dropdown-menu");
  const closeMenu = () => {
    usernamePicker.classList.remove("open");
    usernamePickerToggle.setAttribute("aria-expanded", "false");
    usernamePickerToggle.focus();
    doc.removeEventListener("keydown", onKeydown);
    doc.removeEventListener("click", onDocClick);
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  };
  const onDocClick = (event) => {
    if (!usernamePicker.contains(event.target)) {
      closeMenu();
    }
  };
  usernamePickerToggle.setAttribute("aria-expanded", "false");
  usernamePickerToggle.addEventListener("click", (event) => {
    event.preventDefault();
    if (usernamePicker.classList.contains("open")) {
      closeMenu();
      return;
    }
    usernamePicker.classList.add("open");
    usernamePickerToggle.setAttribute("aria-expanded", "true");
    pickerMenu?.querySelector("li:not(.divider)")?.focus();
    doc.addEventListener("keydown", onKeydown);
    doc.addEventListener("click", onDocClick);
  });
}

export function bindConnectPageActions({
  doc = globalThis.document,
  win = globalThis.window,
  store,
  connect,
  guestConnectCommand
}) {
  const usernameField = doc.getElementById("moo-username");
  const passwordField = doc.getElementById("moo-password");
  if (usernameField && passwordField) {
    doc.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && !event.shiftKey && usernameField.value && passwordField.value) {
        connect();
      }
    });
  }

  doc.querySelectorAll(".btn-connect-guest").forEach((guest) => {
    guest.addEventListener("click", (event) => {
      event.preventDefault();
      store.put("dc-initial-command", guestConnectCommand || "connect guest");
      win.location = "/player-client/";
    });
  });

  doc.getElementById("connect_as")?.addEventListener("click", connect);
  doc.getElementById("connect_now")?.addEventListener("click", (event) => {
    event.preventDefault();
    connect();
  });

  doc.querySelectorAll(".btn-connect-other").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      store.remove("dc-user-login");
      store.remove("dc-initial-command");
      win.location = "/player-client/";
    });
  });
}

export function bindConnectPanelNavigation({ doc = globalThis.document }) {
  const contactPanel = doc.getElementById("contact_panel");
  const addressPanel = doc.getElementById("address_panel");
  const nextButton = doc.getElementById("next_btn");
  if (nextButton && contactPanel && addressPanel) {
    nextButton.addEventListener("click", (event) => {
      event.preventDefault();
      contactPanel.classList.remove("hidden-panel");
      addressPanel.classList.add("hidden-panel");
    });
  }
  const backButton = doc.getElementById("back_btn");
  if (backButton && contactPanel && addressPanel) {
    backButton.addEventListener("click", (event) => {
      event.preventDefault();
      addressPanel.classList.remove("hidden-panel");
      contactPanel.classList.add("hidden-panel");
    });
  }
}
