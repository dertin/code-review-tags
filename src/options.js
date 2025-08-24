const el = {
  labels: null,
  decorations: null,
  defaultLabel: null,
  showReplies: null,
  saveBtn: null,
  restoreBtn: null,
  status: null,
};

const DEFAULTS = {
  labels: [
    "praise",
    "nitpick",
    "suggestion",
    "issue",
    "todo",
    "question",
    "thought",
    "chore",
    "note",
    "typo",
    "polish",
    "quibble",
  ],
  decorations: ["non-blocking", "blocking", "if-minor"],
  defaultLabel: "suggestion",
  showOnReplies: false,
};

const api = globalThis.browser || globalThis.chrome;

function populateDefaultLabelDropdown(labels, selected) {
  el.defaultLabel.innerHTML = "";
  labels.forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    el.defaultLabel.appendChild(option);
  });
  el.defaultLabel.value = selected || labels[0] || "";
}

async function restoreOptions() {
  const items = await (api?.storage?.sync?.get
    ? api.storage.sync.get(DEFAULTS)
    : Promise.resolve(DEFAULTS));

  el.labels.value = (items.labels || DEFAULTS.labels).join(", ");
  el.decorations.value = (items.decorations || DEFAULTS.decorations).join(", ");
  populateDefaultLabelDropdown(
    items.labels || DEFAULTS.labels,
    items.defaultLabel || DEFAULTS.defaultLabel
  );
  el.showReplies.checked =
    typeof items.showOnReplies === "boolean"
      ? items.showOnReplies
      : DEFAULTS.showOnReplies;
}

async function saveOptions() {
  const customLabels = el.labels.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const customDecorations = el.decorations.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await api.storage.sync.set({
    labels: customLabels.length ? customLabels : DEFAULTS.labels,
    decorations: customDecorations.length
      ? customDecorations
      : DEFAULTS.decorations,
    defaultLabel: el.defaultLabel.value || DEFAULTS.defaultLabel,
    showOnReplies: !!el.showReplies.checked,
  });

  el.status.textContent = "Saved! Reloading add-on to apply changes...";
  setTimeout(() => {
    api.runtime?.reload && api.runtime.reload();
    el.status.textContent = "";
  }, 1200);
}

function restoreDefaultsUI() {
  el.labels.value = DEFAULTS.labels.join(", ");
  el.decorations.value = DEFAULTS.decorations.join(", ");
  populateDefaultLabelDropdown(DEFAULTS.labels, DEFAULTS.defaultLabel);
  el.showReplies.checked = DEFAULTS.showOnReplies;
}

document.addEventListener("DOMContentLoaded", () => {
  el.labels = document.getElementById("custom-labels");
  el.decorations = document.getElementById("custom-decorations");
  el.defaultLabel = document.getElementById("default-label");
  el.showReplies = document.getElementById("show-on-replies");
  el.saveBtn = document.getElementById("save-btn");
  el.restoreBtn = document.getElementById("restore-btn");
  el.status = document.getElementById("status");

  restoreOptions();
  el.saveBtn.addEventListener("click", saveOptions);
  el.restoreBtn.addEventListener("click", restoreDefaultsUI);
});
