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
  decorations: ["non-blocking", "blocking", "if-minor"],
  defaultLabel: "suggestion",
  repliesStartVisible: false,
};

const api = globalThis.browser || globalThis.chrome;
const DEBUG = false;

/** Hover tooltips */
const LABEL_DESCRIPTIONS = {
  "": "",
  praise: "Call out something positive that's worth keeping.",
  nitpick: "Trivial or stylistic detail; not important on its own.",
  suggestion: "A proposed improvement or alternative change.",
  issue: "A problem that should be addressed.",
  todo: "A future change or follow-up task.",
  question: "A request for information or clarification.",
  thought: "Non-actionable idea to consider.",
  chore: "Maintenance task or housekeeping.",
  note: "Non-actionable information related to context.",
  typo: "Spelling/grammar correction.",
  polish: "Small refinement to improve quality/readability.",
  quibble: "Minor personal preference; subjective.",
};

const DECORATION_DESCRIPTIONS = {
  "non-blocking": "This does not need to be resolved before merging.",
  blocking: "Must be resolved before this can be merged.",
  "if-minor": "Only apply if the change is minor.",
};

// --- Initialization ---
(async function init() {
  await loadSettings();
  startObserver();
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

// --- Bitbucket selectors ---
// TODO: Add support for GitLab, GitHub
const EDITOR_CONTAINER_SELECTOR =
  'div[data-testid="editor-content-container"], .ak-editor-content-area, div[data-testid="comment-box-container"]';
const PROSE_SELECTOR = "#ak-editor-textarea.ProseMirror, div.ProseMirror";

// --- Observe editor appearance and inject once per editor container ---
let _rafScheduled = false;
function startObserver() {
  const mo = new MutationObserver((records) => {
    // Filter out ProseMirror keystroke mutations; schedule only when relevant nodes appear.
    let relevant = false;
    for (const r of records) {
      if (relevant) break;
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue; // elements only
        const el = /** @type {Element} */ (n);
        if (
          el.matches?.(EDITOR_CONTAINER_SELECTOR) ||
          el.matches?.('div[data-vc="toolbar-inner"]') ||
          el.querySelector?.(EDITOR_CONTAINER_SELECTOR) ||
          el.querySelector?.('div[data-vc="toolbar-inner"]')
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
      injectIfNeeded();
    });
  });

  mo.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
  injectIfNeeded();
}

function injectIfNeeded() {
  document.querySelectorAll(EDITOR_CONTAINER_SELECTOR).forEach((container) => {
    const editorEl =
      container.querySelector(PROSE_SELECTOR) ||
      container.closest('[data-testid="ak-editor-textarea"]') ||
      container;

    const reply = isReplyEditor(editorEl);
    const startVisible = reply ? REPLIES_START_VISIBLE : true;

    if (DEBUG)
      console.debug("[cch] injectIfNeeded -> reply?", reply, {
        container,
        editorEl,
      });

    // Avoid duplicates for panel
    let panel = container.querySelector(':scope > [data-cch-panel="true"]');

    if (!panel) {
      panel = buildUI(container, editorEl, startVisible);
      setPanelVisible(panel, startVisible);
    }

    // Ensure toolbar toggle exists and is bound to this panel
    ensureToolbarToggle(container, panel);
  });
}

function setPanelVisible(panel, visible) {
  // Use both hidden + inline display for robustness against host CSS overrides.
  panel.hidden = !visible;
  panel.style.display = visible ? "" : "none";
}

/** Small helper */
function isVisible(el) {
  if (!el) return false;
  const style = getComputedStyle(el);
  return (
    el.offsetParent !== null &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

/** Thread root by stable id prefix */
function getThreadRoot(node) {
  return (
    node?.closest?.(
      '[id^="portal-parent-pr-inline-conversation--conversation-"]'
    ) || null
  );
}

/** All visible comment containers inside a thread root, in DOM order */
function getVisibleComments(threadRoot) {
  return Array.from(threadRoot.querySelectorAll('[id^="comment-"]')).filter(
    isVisible
  );
}

/** Check if there is a "Reply/Responder" button above the editor inside the same comment. */
function hasReplyButtonAbove(editorEl, commentEl) {
  if (!commentEl) return false;
  const btns = commentEl.querySelectorAll('button, [role="button"]');
  for (const b of btns) {
    const txt = (b.textContent || "").trim().toLowerCase();
    // cover common locales: English & Spanish; extendable if needed
    if (/\breply\b|\bresponder\b/.test(txt)) {
      const rel = b.compareDocumentPosition(editorEl);
      // If the button precedes the editor in DOM -> the editor sits below actions -> reply composer
      if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return true;
    }
  }
  return false;
}

/**
 * isReplyEditor(editorEl)
 * -----------------------
 * Decide whether the given editor is for a **reply** (composer or edit of a reply),
 * or for the **first/root comment**.
 *
 * Robust rules:
 * 1) Find the conversation container: id starts with "portal-parent-pr-inline-conversation--conversation-".
 * 2) Collect all visible `[id^="comment-"]` nodes inside; index 0 is the root comment.
 * 3) If the editor sits **inside a comment**:
 *    3a) If that comment is NOT the first -> it's a reply (editing a reply or its inline composer) -> return true.
 *    3b) If it *is* the first comment:
 *        - If there is a "Reply/Responder" button **above** the editor in the same comment,
 *          then the editor is the reply composer anchored to the first comment -> return true.
 *        - Otherwise, it's editing the first comment -> return false.
 * 4) If the editor is **not inside any comment** but inside the thread:
 *    - If there are **no comments above** (i.e., zero comments) -> composing the very first comment -> return false.
 *    - If there is at least one comment above -> it's a bottom reply composer -> return true.
 */
function isReplyEditor(editorEl) {
  if (!editorEl || !editorEl.closest) return false;

  const threadRoot = getThreadRoot(editorEl);
  if (!threadRoot) {
    if (DEBUG) console.debug("[cch] isReplyEditor: no threadRoot -> false");
    return false;
  }

  const comments = getVisibleComments(threadRoot);
  const firstComment = comments[0] || null;

  // Case A: editor lives inside a particular comment container
  const commentEl = editorEl.closest('[id^="comment-"]');
  if (commentEl) {
    // If it's not the first comment, it's definitely a reply.
    if (firstComment && commentEl !== firstComment) {
      if (DEBUG)
        console.debug("[cch] isReplyEditor: inside non-first comment -> true");
      return true;
    }

    // Ambiguous case: editor inside the first/root comment container.
    // Distinguish "editing root comment" vs "reply composer anchored to root".
    const replyAbove = hasReplyButtonAbove(editorEl, commentEl);
    if (DEBUG)
      console.debug(
        "[cch] isReplyEditor: inside first comment, replyAbove?",
        replyAbove
      );
    return replyAbove; // true -> reply composer; false -> editing the first comment
  }

  // Case B: editor is at thread level (common bottom composer)
  if (comments.length === 0) {
    if (DEBUG) console.debug("[cch] isReplyEditor: no comments yet -> false");
    return false;
  }

  // If any comment precedes the editor, this is a reply composer.
  const anyAbove = comments.some((c) => {
    const rel = c.compareDocumentPosition(editorEl);
    return !!(rel & Node.DOCUMENT_POSITION_FOLLOWING); // c precedes editor
  });

  if (DEBUG)
    console.debug(
      "[cch] isReplyEditor: at thread level, any comment above?",
      anyAbove
    );
  return anyAbove;
}

// --- UI: compact panel with a label dropdown + decoration chips ---
function buildUI(container, editorEl, startVisible) {
  const panel = document.createElement("div");
  panel.className = "cch-panel";
  panel.setAttribute("data-cch-panel", "true");

  const labelSelect = createLabeledSelect(
    ["", ...LABELS],
    LABEL_DESCRIPTIONS,
    "Label"
  );
  const chips = createDecorationChips(DECORATIONS, DECORATION_DESCRIPTIONS);

  panel.append(labelSelect, chips);
  container.prepend(panel);

  // Detect existing prefix (edit mode) and capture baseline
  const existing = readExistingPrefix(editorEl); // {label, decs, hasPrefix}
  let baseLabel = existing.label || "";
  let baseDecs = existing.decs || [];

  // Interaction flags
  let labelTouched = false;
  let chipsTouched = false;

  // Initial state:
  if (existing.hasPrefix) {
    // Edit mode: neutral UI so we don't overwrite on load
    labelSelect.value = ""; // none
  } else {
    // New comment:
    if (startVisible) {
      // Only auto-apply defaults when the panel starts visible (root editor or setting enabled).
      labelSelect.value = DEFAULT_LABEL || "";
      applyPrefixFromUI(editorEl, labelSelect, chips);
      baseLabel = labelSelect.value;
      baseDecs = [];
    } else {
      // Panel starts hidden on replies: do not touch the editor content.
      labelSelect.value = "";
    }
  }

  // Events
  labelSelect.addEventListener("change", () => {
    labelTouched = true;
    _suppressCaretOnce = true;
    applyPrefixSmart(editorEl, labelSelect, chips, {
      baseLabel,
      baseDecs,
      labelTouched,
      chipsTouched,
    });
    _suppressCaretOnce = false;
  });

  chips.querySelectorAll("input").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      e.target
        .closest(".cch-chip")
        ?.classList.toggle("active", e.target.checked);
      chipsTouched = true;
      _suppressCaretOnce = true;
      applyPrefixSmart(editorEl, labelSelect, chips, {
        baseLabel,
        baseDecs,
        labelTouched,
        chipsTouched,
      });
      _suppressCaretOnce = false;
    });
  });

  return panel;
}

// Find the toolbar container for this editor with minimal DOM walking.
function findToolbar(container) {
  // First, try within the container (usual case)
  let inner = container.querySelector('div[data-vc="toolbar-inner"]');
  if (inner) return inner;

  // Walk up a few ancestors to cover structures where toolbar is outside editor-content-container.
  let p = container.parentElement;
  for (let i = 0; i < 5 && p; i++) {
    inner = p.querySelector('div[data-vc="toolbar-inner"]');
    if (inner) return inner;
    p = p.parentElement;
  }

  // Fallback: if there's only one toolbar on the page, use it.
  const all = document.querySelectorAll('div[data-vc="toolbar-inner"]');
  if (all.length === 1) return all[0];

  return null;
}

// Ensure a toolbar toggle button exists and is scoped to this editor container
function ensureToolbarToggle(container, panel) {
  const toolbar = findToolbar(container);
  if (!toolbar) return;

  // Avoid duplicates (but keep it as the LAST child)
  let btn = toolbar.querySelector('[data-cch-toggle="true"]');
  if (btn) {
    const host = btn.closest('[role="presentation"]') || btn;
    if (toolbar.lastElementChild !== host) toolbar.appendChild(host);
    btn.setAttribute("aria-pressed", String(!panel.hidden));
    return;
  }

  // If toolbar hasn't populated yet, wait a tick so we append truly at the end.
  const nativeButtons = toolbar.querySelectorAll("button, [role='button']");
  if (nativeButtons.length === 0 && toolbar.childElementCount < 2) {
    setTimeout(() => ensureToolbarToggle(container, panel), 50);
    return;
  }

  // Clone native classes from a sibling button for look & feel
  const templateBtn =
    toolbar.querySelector(".css-8jb74d") ||
    nativeButtons[nativeButtons.length - 1] ||
    nativeButtons[0] ||
    null;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("data-cch-toggle", "true");
  button.setAttribute("aria-label", "Toggle Conventional Comments panel");
  button.setAttribute("title", "Toggle Conventional Comments panel");
  button.setAttribute("aria-pressed", String(!panel.hidden));
  button.textContent = "🏷️";
  if (templateBtn && templateBtn.className) {
    button.className = templateBtn.className;
  }

  button.addEventListener("click", () => {
    setPanelVisible(panel, panel.hidden); // toggle
    button.setAttribute("aria-pressed", String(!panel.hidden));
  });

  // Match Bitbucket's toolbar structure for spacing/alignment
  const wrap2 = document.createElement("div");
  wrap2.className = "css-ab8yd1";
  wrap2.appendChild(button);

  const wrap1 = document.createElement("div");
  wrap1.setAttribute("role", "presentation");
  wrap1.appendChild(wrap2);

  toolbar.appendChild(wrap1);
}

// --- UI helpers ---
function createLabeledSelect(options, descMap, aria) {
  const s = document.createElement("select");
  s.className = "cch-select";
  s.setAttribute("aria-label", aria || "");
  options.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v === "" ? "---" : v;
    opt.title = descMap?.[v] || "";
    s.appendChild(opt);
  });
  return s;
}

function createDecorationChips(decorations, descMap) {
  const wrap = document.createElement("div");
  wrap.className = "cch-chips";
  decorations.forEach((dec) => {
    const id = `cch-dec-${dec}`;
    const chip = document.createElement("label");
    chip.className = "cch-chip";
    chip.setAttribute("for", id);
    chip.title = descMap?.[dec] || "";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.value = dec;

    const txt = document.createElement("span");
    txt.textContent = dec;

    chip.append(cb, txt);
    wrap.appendChild(chip);
  });
  return wrap;
}

// --- Prefix read/parse helpers ---
function readExistingPrefix(editorEl) {
  const firstBlock =
    editorEl.querySelector("p, li, pre, blockquote, h1, h2, h3, h4, h5, h6") ||
    editorEl;

  // Preferred: <strong>label [decs]</strong>: ...
  const firstChild = firstBlock.firstChild;
  if (firstChild && firstChild.nodeName === "STRONG") {
    const bold = firstChild.textContent || "";
    const m = bold.match(/^([A-Za-z][\w-]*)(?:\s*\[([^\]]*)\])?$/);
    if (m) {
      const label = m[1] || "";
      const decs = (m[2] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return { label, decs, hasPrefix: true };
    }
  }

  // Fallback: plain text prefix
  const fullText = firstBlock.textContent || "";
  const m = fullText.match(/^([A-Za-z][\w-]*)\s*(?:\[(.*?)\]|\((.*?)\))?:\s*/);
  if (m) {
    const label = m[1] || "";
    const decsRaw = m[2] ?? m[3] ?? "";
    const decs = decsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { label, decs, hasPrefix: true };
  }

  return { label: "", decs: [], hasPrefix: false };
}

// --- Prefix building/apply ---
function buildBoldLabel(label, decs) {
  if (!label) return { boldText: "", hasPrefix: false };
  const d = decs && decs.length ? ` [${decs.join(", ")}]` : "";
  return { boldText: `${label}${d}`, hasPrefix: true };
}

// Use current UI directly (new comments)
function applyPrefixFromUI(editorEl, labelSelect, chips) {
  const label = labelSelect.value;
  const decs = Array.from(chips.querySelectorAll("input:checked")).map(
    (cb) => cb.value
  );
  applyPrefixAtStart(editorEl, buildBoldLabel(label, decs));
}

// Use "smart" baseline logic (edit mode on first changes)
function applyPrefixSmart(editorEl, labelSelect, chips, ctx) {
  const selected = Array.from(chips.querySelectorAll("input:checked")).map(
    (cb) => cb.value
  );
  const baseOrCurrent = ctx.baseLabel || labelSelect.value;
  const effectiveLabel = ctx.labelTouched ? labelSelect.value : baseOrCurrent;
  const effectiveDecs = ctx.chipsTouched ? selected : ctx.baseDecs;
  applyPrefixAtStart(editorEl, buildBoldLabel(effectiveLabel, effectiveDecs));
}

/** Track when UI-originated changes should not move the caret. */
let _suppressCaretOnce = false;

/** Only adjust caret when the ProseMirror editor really has focus/selection. */
function editorHasFocus(editorEl) {
  if (!editorEl) return false;
  const ae = editorEl.ownerDocument.activeElement;
  if (ae && editorEl.contains(ae)) return true;
  const sel = editorEl.ownerDocument.getSelection();
  if (sel && sel.rangeCount) {
    const node = sel.getRangeAt(0).startContainer;
    if (node && editorEl.contains(node)) return true;
  }
  return false;
}

// Apply/remove the prefix at the very beginning of the editor
function applyPrefixAtStart(editorEl, parts) {
  if (!editorEl) return;

  const { boldText, hasPrefix } = parts;
  const firstBlock =
    editorEl.querySelector("p, li, pre, blockquote, h1, h2, h3, h4, h5, h6") ||
    editorEl;

  if (firstBlock.firstChild && firstBlock.firstChild.nodeName === "BR") {
    firstBlock.firstChild.remove();
  }

  const adjustCaret = editorHasFocus(editorEl) && !_suppressCaretOnce;
  const firstChild = firstBlock.firstChild;
  if (firstChild && firstChild.nodeName === "STRONG") {
    const strong = firstChild;
    const after = strong.nextSibling;

    if (!hasPrefix) {
      if (
        after &&
        after.nodeType === Node.TEXT_NODE &&
        after.nodeValue.startsWith(":")
      ) {
        after.nodeValue = after.nodeValue.replace(/^:\s?/, "");
      }
      strong.remove();
      if (adjustCaret) placeCaretAtStart(firstBlock);
      return;
    }

    strong.textContent = boldText;

    if (after && after.nodeType === Node.TEXT_NODE) {
      if (!/^:\s/.test(after.nodeValue)) {
        after.nodeValue = `: ${after.nodeValue.replace(/^:\s?/, "")}`;
      }
    } else {
      strong.after(document.createTextNode(": "));
    }

    if (adjustCaret) moveCaretAfterPrefix(strong);
    return;
  }

  // Remove legacy plain prefix if present
  const fullText = firstBlock.textContent || "";
  const legacy = fullText.match(
    /^([A-Za-z][\w-]*)\s*(?:\[[^\]]*\]|\([^)]+\))?:\s*/
  );
  if (legacy) {
    const r = document.createRange();
    r.setStart(firstBlock, 0);
    const end = locateOffsetInTextNodes(firstBlock, legacy[0].length);
    r.setEnd(end.node, end.offset);
    r.deleteContents();
  }

  if (hasPrefix) {
    const strong = document.createElement("strong");
    strong.textContent = boldText;

    const r0 = document.createRange();
    r0.setStart(firstBlock, 0);
    r0.collapse(true);
    r0.insertNode(strong);
    strong.after(document.createTextNode(": "));

    if (
      strong.nextSibling &&
      strong.nextSibling.nextSibling &&
      strong.nextSibling.nextSibling.nodeName === "BR"
    ) {
      strong.nextSibling.nextSibling.remove();
    }

    if (adjustCaret) moveCaretAfterPrefix(strong);
  } else {
    if (adjustCaret) placeCaretAtStart(firstBlock);
  }
}

// Map a character offset to { node, offset } within text nodes
function locateOffsetInTextNodes(root, charOffset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node = walker.nextNode();
  let remaining = charOffset;
  while (node) {
    const len = node.nodeValue.length;
    if (remaining <= len) return { node, offset: remaining };
    remaining -= len;
    node = walker.nextNode();
  }
  return { node: root, offset: 0 };
}

function placeCaretAtStart(root) {
  const sel = window.getSelection();
  sel.removeAllRanges();
  const caret = document.createRange();
  caret.setStart(root, 0);
  caret.collapse(true);
  sel.addRange(caret);
}

// Place the caret immediately after `strongNode`
function moveCaretAfterPrefix(strongNode) {
  const sel = window.getSelection();
  sel.removeAllRanges();
  let after = strongNode.nextSibling;
  if (
    !(
      after &&
      after.nodeType === Node.TEXT_NODE &&
      /^:\s/.test(after.nodeValue)
    )
  ) {
    const r = document.createRange();
    r.setStartAfter(strongNode);
    r.collapse(true);
    sel.addRange(r);
    return;
  }
  const r = document.createRange();
  r.setStart(after, after.nodeValue.length);
  r.collapse(true);
  sel.addRange(r);
}
