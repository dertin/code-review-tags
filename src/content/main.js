// Runtime settings loaded from storage
let LABELS = [];
let DECORATIONS = [];
let DEFAULT_LABEL = "suggestion";
let REPLIES_START_VISIBLE = false;

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
const DEBUG = false;

// --- Initialization ---
(async function init() {
  await loadSettings();
  const platform = detectPlatform();
  if (!platform) return;
  startObserver(platform);
})();

async function loadSettings() {
  const items = await (api?.storage?.sync?.get
    ? api.storage.sync.get(DEFAULTS)
    : Promise.resolve(DEFAULTS));
  LABELS = items.labels || DEFAULTS.labels;
  DECORATIONS = items.decorations || DEFAULTS.decorations;
  DEFAULT_LABEL = items.defaultLabel || DEFAULTS.defaultLabel;
  REPLIES_START_VISIBLE =
    typeof items.repliesStartVisible === "boolean"
      ? items.repliesStartVisible
      : DEFAULTS.repliesStartVisible;
  return { ...DEFAULTS, ...items };
}

// Platform detection (simple host check, ready to extend for GitHub/GitLab)
function detectPlatform() {
  const host = location.hostname;
  if (/(^|\.)bitbucket\.org$/.test(host))
    return globalThis.CodeReviewTags?.platforms?.bitbucket;
  // TODO: add GitHub/GitLab modules here
  return null;
}

// --- Observe editor appearance and inject once per editor container ---
let _rafScheduled = false;
function startObserver(platform) {
  const mo = new MutationObserver((records) => {
    // Filter out ProseMirror keystroke mutations; schedule only when relevant nodes appear.
    let relevant = false;
    for (const r of records) {
      if (relevant) break;
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue; // elements only
        const el = /** @type {Element} */ (n);
        if (
          el.matches?.(platform.editorContainerSelector) ||
          el.matches?.(platform.toolbarSelector) ||
          el.querySelector?.(platform.editorContainerSelector) ||
          el.querySelector?.(platform.toolbarSelector)
        ) {
          relevant = true;
          break;
        }
      }
    }
    if (!relevant) return;

    if (_rafScheduled) return;
    _rafScheduled = true;
    requestAnimationFrame(() => {
      _rafScheduled = false;
      injectIfNeeded(platform);
    });
  });

  mo.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
  injectIfNeeded(platform);
}

function injectIfNeeded(platform) {
  document
    .querySelectorAll(platform.editorContainerSelector)
    .forEach((container) => {
      const editorEl = platform.getEditorEl(container);

      // Skip injection if editor is inside Bitbucket's conversation assistant chat
      if (platform.isInAssistantChat && platform.isInAssistantChat(editorEl)) {
        if (DEBUG)
          console.debug("[crt] injectIfNeeded -> skipping assistant chat", {
            container,
            editorEl,
          });
        return;
      }

      const reply = platform.isReplyEditor(editorEl);
      const startVisible = reply ? REPLIES_START_VISIBLE : true;

      if (DEBUG)
        console.debug("[crt] injectIfNeeded -> reply?", reply, {
          container,
          editorEl,
        });

      let panel = container.querySelector(':scope > [data-crt-panel="true"]');

      if (!panel) {
        panel = globalThis.CodeReviewTags.buildUI(
          container,
          editorEl,
          startVisible,
          LABELS,
          DECORATIONS,
          {
            onVisibilityChange(visible) {
              if (typeof platform.syncToolbarButton === "function") {
                platform.syncToolbarButton(container, visible);
              }
            },
          }
        );
        globalThis.CodeReviewTags.setPanelVisible(panel, startVisible);
      }

      // Ensure toolbar toggle exists and is bound to this panel
      platform.ensureToolbarToggle(container, panel);
    });
}
