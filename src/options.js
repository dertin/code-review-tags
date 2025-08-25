const el = {
  labels: null,
  decorations: null,
  defaultLabel: null,
  repliesStartVisible: null,
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
  decorations: ["non-blocking", "blocking", "if-minor", "security", "test"],
  defaultLabel: "suggestion",
  repliesStartVisible: false,
};

const api = globalThis.browser || globalThis.chrome;

// --- helpers ---------------------------------------------------------------

// Reserved token used by the UI to clear/close.
const isReservedClearToken = (s) => String(s).trim().toLowerCase() === "x";

/** Trim, dedupe, and remove the reserved "X" entry. */
function sanitizeLabels(arr) {
  const out = [];
  const seen = new Set();
  for (const raw of arr || []) {
    const v = String(raw).trim();
    if (!v || isReservedClearToken(v)) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Populate the default label <select> with safe labels only. */
function populateDefaultLabelDropdown(labels, selected) {
  const safe = sanitizeLabels(labels);
  el.defaultLabel.innerHTML = "";
  safe.forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    el.defaultLabel.appendChild(option);
  });
  el.defaultLabel.value = safe.includes(selected) ? selected : safe[0] || "";
}

async function restoreOptions() {
  const items = await (api?.storage?.sync?.get
    ? api.storage.sync.get(DEFAULTS)
    : Promise.resolve(DEFAULTS));

  const safeLabels = sanitizeLabels(items.labels || DEFAULTS.labels);
  const safeDecorations = (items.decorations || DEFAULTS.decorations).map((s) =>
    String(s).trim()
  );

  el.labels.value = safeLabels.join(", ");
  el.decorations.value = safeDecorations.join(", ");
  populateDefaultLabelDropdown(
    safeLabels,
    items.defaultLabel || DEFAULTS.defaultLabel
  );
  el.repliesStartVisible.checked =
    typeof items.repliesStartVisible === "boolean"
      ? items.repliesStartVisible
      : DEFAULTS.repliesStartVisible;

  // Soft notice if an old saved "X" was removed.
  if ((items.labels || []).some(isReservedClearToken)) {
    el.status.textContent = 'Note: removed reserved label "X".';
    setTimeout(() => (el.status.textContent = ""), 2000);
  }
}

async function saveOptions() {
  const customLabelsRaw = el.labels.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const customDecorations = el.decorations.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const finalLabels = sanitizeLabels(
    customLabelsRaw.length ? customLabelsRaw : DEFAULTS.labels
  );

  // Guard default against "X" or a value not present in the final list.
  let defaultChoice = el.defaultLabel.value || DEFAULTS.defaultLabel;
  if (isReservedClearToken(defaultChoice) || !finalLabels.includes(defaultChoice)) {
    defaultChoice =
      finalLabels.includes(DEFAULTS.defaultLabel)
        ? DEFAULTS.defaultLabel
        : finalLabels[0] || "";
  }

  await api.storage.sync.set({
    labels: finalLabels.length ? finalLabels : DEFAULTS.labels,
    decorations: customDecorations.length
      ? customDecorations
      : DEFAULTS.decorations,
    defaultLabel: defaultChoice,
    repliesStartVisible: !!el.repliesStartVisible.checked,
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
  el.repliesStartVisible.checked = DEFAULTS.repliesStartVisible;
}

document.addEventListener("DOMContentLoaded", () => {
  el.labels = document.getElementById("custom-labels");
  el.decorations = document.getElementById("custom-decorations");
  el.defaultLabel = document.getElementById("default-label");
  el.repliesStartVisible = document.getElementById("replies-start-visible");
  el.saveBtn = document.getElementById("save-btn");
  el.restoreBtn = document.getElementById("restore-btn");
  el.status = document.getElementById("status");

  restoreOptions();
  el.saveBtn.addEventListener("click", saveOptions);
  el.restoreBtn.addEventListener("click", restoreDefaultsUI);
});
