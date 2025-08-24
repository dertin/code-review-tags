let LABELS = [];
let DECORATIONS = [];
let DEFAULT_LABEL = "suggestion";

const DEFAULTS = {
  labels: ["praise","nitpick","suggestion","issue","todo","question","thought","chore","note","typo","polish","quibble"],
  decorations: ["non-blocking","blocking","if-minor"],
  defaultLabel: "suggestion"
};

const api = globalThis.browser || globalThis.chrome;

/** Descriptions */
const LABEL_DESCRIPTIONS = {
  "": "No prefix. Removes the label from the beginning of the comment.",
  "praise": "Call out something positive that's worth keeping.",
  "nitpick": "Trivial or stylistic detail; not important on its own.",
  "suggestion": "A proposed improvement or alternative change.",
  "issue": "A problem that should be addressed.",
  "todo": "A future change or follow-up task.",
  "question": "A request for information or clarification.",
  "thought": "Non-actionable idea to consider.",
  "chore": "Maintenance task or housekeeping.",
  "note": "Non-actionable information related to context.",
  "typo": "Spelling/grammar correction.",
  "polish": "Small refinement to improve quality/readability.",
  "quibble": "Minor personal preference; subjective."
};

const DECORATION_DESCRIPTIONS = {
  "non-blocking": "This does not need to be resolved before merging.",
  "blocking": "Must be resolved before this can be merged.",
  "if-minor": "Only apply if the change is minor."
};

// --- Initialization: load settings, then watch for editors ---
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
  return { ...DEFAULTS, ...items };
}

// --- Bitbucket selectors ---
// TODO: Add support for GitLab, GitHub
const EDITOR_CONTAINER_SELECTOR =
  'div[data-testid="editor-content-container"], .ak-editor-content-area, div[data-testid="comment-box-container"]';
const PROSE_SELECTOR = '#ak-editor-textarea.ProseMirror, div.ProseMirror';

// --- Observe editor appearance and inject once per editor container ---
function startObserver() {
  const mo = new MutationObserver(() => injectIfNeeded());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  injectIfNeeded();
}

function injectIfNeeded() {
  document.querySelectorAll(EDITOR_CONTAINER_SELECTOR).forEach((container) => {
    if (container.querySelector(':scope > .cch-panel')) return; // avoid duplicates
    const editorEl =
      container.querySelector(PROSE_SELECTOR) ||
      container.closest('[data-testid="ak-editor-textarea"]') ||
      container;

    buildUI(container, editorEl);
  });
}

// --- UI: compact panel with a label dropdown + decoration chips ---
function buildUI(container, editorEl) {
  const panel = document.createElement('div');
  panel.className = 'cch-panel';

  // A dropdown for selecting the comment label. The first option is empty to allow removing the prefix.
  const labelSelect = createLabeledSelect(['', ...LABELS], LABEL_DESCRIPTIONS, 'Label');
  labelSelect.value = DEFAULT_LABEL || '';

  // Decorations as chips with title tooltips
  const chips = createDecorationChips(DECORATIONS, DECORATION_DESCRIPTIONS);

  panel.append(labelSelect, chips);
  container.prepend(panel);

  // Keep the prefix in sync with every change
  const updatePrefix = () => {
    const label = labelSelect.value;
    const decs = Array.from(chips.querySelectorAll('input:checked')).map(cb => cb.value);
    applyPrefixAtStart(editorEl, buildBoldLabel(label, decs)); // {boldText, hasPrefix}
  };

  labelSelect.addEventListener('change', updatePrefix);
  chips.querySelectorAll('input').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.target.closest('.cch-chip')?.classList.toggle('active', e.target.checked);
      updatePrefix();
    });
  });

  // Initial sync on load
  updatePrefix();
}

// --- Small UI helpers ---
function createLabeledSelect(options, descMap, aria) {
  const s = document.createElement('select');
  s.className = 'cch-select';
  s.setAttribute('aria-label', aria || '');
  options.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v === '' ? '— none —' : v;
    opt.title = descMap?.[v] || '';
    s.appendChild(opt);
  });
  return s;
}

function createDecorationChips(decorations, descMap) {
  const wrap = document.createElement('div');
  wrap.className = 'cch-chips';
  decorations.forEach(dec => {
    const id = `cch-dec-${dec}`;
    const chip = document.createElement('label');
    chip.className = 'cch-chip';
    chip.setAttribute('for', id);
    chip.title = descMap?.[dec] || '';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = dec;

    const txt = document.createElement('span');
    txt.textContent = dec;

    chip.append(cb, txt);
    wrap.appendChild(chip);
  });
  return wrap;
}

// --- Prefix building and application ---
// Returns { boldText, hasPrefix } where boldText = "label [a, b]" (no colon)
// If label is empty, returns { '', false } to remove the prefix entirely.
function buildBoldLabel(label, decs) {
  if (!label) return { boldText: '', hasPrefix: false };
  const d = (decs && decs.length) ? ` [${decs.join(', ')}]` : '';
  return { boldText: `${label}${d}`, hasPrefix: true };
}

// Apply/remove the prefix at the very beginning of the editor:
// Target structure: <strong>label [decorations]</strong>:␠
// (Bold applies only to label + decorations, not the colon)
function applyPrefixAtStart(editorEl, parts) {
  if (!editorEl) return;

  const { boldText, hasPrefix } = parts;
  const firstBlock = editorEl.querySelector('p, li, pre, blockquote, h1, h2, h3, h4, h5, h6') || editorEl;

  // Avoid an extra line break at the start
  if (firstBlock.firstChild && firstBlock.firstChild.nodeName === 'BR') {
    firstBlock.firstChild.remove();
  }

  // If <strong>...</strong> is already the first node, update in place
  const firstChild = firstBlock.firstChild;
  if (firstChild && firstChild.nodeName === 'STRONG') {
    const strong = firstChild;
    const after = strong.nextSibling;

    if (!hasPrefix) {
      // Remove existing bold + possible leading ": "
      if (after && after.nodeType === Node.TEXT_NODE && after.nodeValue.startsWith(':')) {
        after.nodeValue = after.nodeValue.replace(/^:\s?/, '');
      }
      strong.remove();
      placeCaretAtStart(firstBlock);
      return;
    }

    // Update bold content
    strong.textContent = boldText;

    // Ensure the following text node starts with ": "
    if (after && after.nodeType === Node.TEXT_NODE) {
      if (!/^:\s/.test(after.nodeValue)) {
        after.nodeValue = `: ${after.nodeValue.replace(/^:\s?/, '')}`;
      }
    } else {
      strong.after(document.createTextNode(': '));
    }

    // Caret after ": "
    moveCaretAfterPrefix(strong);
    return;
  }

  // No <strong> there might be a legacy plain prefix -> remove it first
  const fullText = firstBlock.textContent || '';
  const legacy = fullText.match(/^([A-Za-z][\w-]*)\s*(?:\[[^\]]*\]|\([^)]+\))?:\s*/);
  if (legacy) {
    const r = document.createRange();
    r.setStart(firstBlock, 0);
    const end = locateOffsetInTextNodes(firstBlock, legacy[0].length);
    r.setEnd(end.node, end.offset);
    r.deleteContents();
  }

  // Insert the new structure if needed
  if (hasPrefix) {
    const strong = document.createElement('strong');
    strong.textContent = boldText;

    const r0 = document.createRange();
    r0.setStart(firstBlock, 0);
    r0.collapse(true);
    r0.insertNode(strong);
    strong.after(document.createTextNode(': '));

    // If a stray <br> followed, remove it
    if (strong.nextSibling && strong.nextSibling.nextSibling && strong.nextSibling.nextSibling.nodeName === 'BR') {
      strong.nextSibling.nextSibling.remove();
    }

    moveCaretAfterPrefix(strong);
  } else {
    placeCaretAtStart(firstBlock);
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

// Place the caret immediately after "<strong>…</strong>: "
function moveCaretAfterPrefix(strongNode) {
  const sel = window.getSelection();
  sel.removeAllRanges();
  let after = strongNode.nextSibling;
  if (!(after && after.nodeType === Node.TEXT_NODE && /^:\s/.test(after.nodeValue))) {
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