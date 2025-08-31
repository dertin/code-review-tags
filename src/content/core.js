// Common UI and prefix logic for Code Review Tags
// Exposes a small API via globalThis.CodeReviewTags for content scripts.

(function () {
  const DEBUG = false;

  // Hover tooltips
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
    X: "Clear the label and decorations, remove the prefix, and close the panel.",
  };

  const DECORATION_DESCRIPTIONS = {
    "non-blocking": "This does not need to be resolved before merging.",
    blocking: "Must be resolved before this can be merged.",
    "if-minor": "Only apply if the change is minor.",
    security: "Highlights potential security risks.",
    test: "Relates to testing, test coverage, or test quality.",
  };

  // Public: toggle panel visibility in a robust way
  function setPanelVisible(panel, visible) {
    panel.hidden = !visible;
    panel.style.display = visible ? "" : "none";
  }

  // --- UI: compact panel with a label control + decoration chips ---
  function buildUI(
    container,
    editorEl,
    startVisible,
    labels,
    decorations,
    opts
  ) {
    const panel = document.createElement("div");
    panel.className = "crt-panel";
    panel.setAttribute("data-crt-panel", "true");

    const labelSelect = createLabeledSelect(
      ["", ...labels, "X"],
      LABEL_DESCRIPTIONS,
      "Label"
    );
    const sep = document.createElement("span");
    sep.className = "crt-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.title = "applies to";
    sep.innerHTML = `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;">
      <path d="M2 0 L6 4 L2 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    const chips = createDecorationChips(decorations, DECORATION_DESCRIPTIONS);

    panel.append(labelSelect, sep, chips);
    container.prepend(panel);

    const existing = readExistingPrefix(editorEl); // {label, decs, hasPrefix}
    let baseLabel = existing.label || "";
    let baseDecs = existing.decs || [];

    let labelTouched = false;
    let chipsTouched = false;
    let collapsed = false;

    function updateVisibility() {
      const has = !!labelSelect.value && labelSelect.value !== "X";
      const useCollapsed = has && collapsed;
      labelSelect.classList.toggle("collapsed", useCollapsed);
      sep.style.display = useCollapsed ? "" : "none";
      chips.style.display = useCollapsed ? "" : "none";
    }

    function clearAndClose() {
      labelSelect.value = "";
      setChipsFromDecs(chips, []);
      baseLabel = "";
      baseDecs = [];
      labelTouched = true;
      chipsTouched = true;
      collapsed = false;
      updateVisibility();

      _suppressCaretOnce = true;
      applyPrefixAtStart(editorEl, { boldText: "", hasPrefix: false });
      _suppressCaretOnce = false;

      setPanelVisible(panel, false);
      if (opts && typeof opts.onVisibilityChange === "function") {
        try {
          opts.onVisibilityChange(false);
        } catch (_) {}
      }
    }

    // Initial state
    if (existing.hasPrefix) {
      labelSelect.value = baseLabel || "";
      setChipsFromDecs(chips, baseDecs);
      collapsed = true;
    } else {
      labelSelect.value = "";
      collapsed = false;
    }
    updateVisibility();

    labelSelect.addEventListener("change", () => {
      if (labelSelect.value === "X") {
        clearAndClose();
        return;
      }

      labelTouched = true;
      collapsed = true;
      updateVisibility();
      _suppressCaretOnce = true;
      applyPrefixSmart(editorEl, labelSelect, chips, {
        baseLabel,
        baseDecs,
        labelTouched,
        chipsTouched,
      });
      _suppressCaretOnce = false;
    });

    labelSelect.addEventListener("click", (e) => {
      const lab = e.target.closest(".crt-label");
      if (!lab) return;
      const input = lab.querySelector('input[type="radio"]');
      if (!input) return;

      const isCollapsed = labelSelect.classList.contains("collapsed");
      const isActive = lab.classList.contains("active");

      if (isCollapsed && isActive) {
        collapsed = false;
        updateVisibility();
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (!isCollapsed) {
        if (input.value === "X") {
          e.preventDefault();
          e.stopPropagation();
          clearAndClose();
          return;
        }
        if (isActive) {
          labelTouched = true;
          collapsed = true;
          updateVisibility();
          _suppressCaretOnce = true;
          applyPrefixSmart(editorEl, labelSelect, chips, {
            baseLabel,
            baseDecs,
            labelTouched,
            chipsTouched,
          });
          _suppressCaretOnce = false;

          e.preventDefault();
          e.stopPropagation();
        }
      }
    });

    chips.querySelectorAll("input").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        e.target
          .closest(".crt-chip")
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

  // --- UI helpers ---
  function createLabeledSelect(options, descMap, aria) {
    const wrap = document.createElement("div");
    wrap.className = "crt-labels";
    wrap.setAttribute("role", "radiogroup");
    if (aria) wrap.setAttribute("aria-label", aria);

    const name = `crt-labels-${Math.random().toString(36).slice(2)}`;
    let _value = "";

    function syncActive() {
      wrap.querySelectorAll(".crt-label").forEach((el) => {
        const radio = el.querySelector("input[type=radio]");
        el.classList.toggle("active", !!radio?.checked);
      });
    }

    options.forEach((v) => {
      if (v === "") return;
      const id = `${name}-${v}`;
      const label = document.createElement("label");
      label.className = "crt-label";
      label.setAttribute("for", id);
      label.title = descMap?.[v] || "";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = name;
      radio.id = id;
      radio.value = v;

      const txt = document.createElement("span");
      txt.textContent = v;

      radio.addEventListener("change", () => {
        if (radio.checked) {
          _value = v;
          syncActive();
          wrap.dispatchEvent(new Event("change", { bubbles: false }));
        }
      });

      label.append(radio, txt);
      wrap.appendChild(label);
    });

    Object.defineProperty(wrap, "value", {
      get() {
        return _value;
      },
      set(v) {
        _value = v || "";
        const radios = wrap.querySelectorAll(`input[name="${name}"]`);
        radios.forEach((r) => (r.checked = r.value === _value));
        syncActive();
      },
    });

    return wrap;
  }

  function createDecorationChips(decorations, descMap) {
    const wrap = document.createElement("div");
    wrap.className = "crt-chips";

    decorations.forEach((dec) => {
      const chip = document.createElement("label");
      chip.className = "crt-chip";
      chip.title = descMap?.[dec] || "";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = dec;

      const txt = document.createElement("span");
      txt.textContent = dec;

      chip.append(cb, txt);
      wrap.appendChild(chip);
    });

    return wrap;
  }

  function setChipsFromDecs(container, decs) {
    const set = new Set(decs || []);
    container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = set.has(cb.value);
      cb.closest(".crt-chip")?.classList.toggle("active", cb.checked);
    });
  }

  // --- Prefix read/parse helpers ---
  function readExistingPrefix(editorEl) {
    const firstBlock =
      editorEl.querySelector(
        "p, li, pre, blockquote, h1, h2, h3, h4, h5, h6"
      ) || editorEl;

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

    const fullText = firstBlock.textContent || "";
    const m = fullText.match(
      /^([A-Za-z][\w-]*)\s*(?:\[(.*?)\]|\((.*?)\))?:\s*/
    );
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

  function buildBoldLabel(label, decs) {
    if (!label) return { boldText: "", hasPrefix: false };
    const d = decs && decs.length ? ` [${decs.join(", ")}]` : "";
    return { boldText: `${label}${d}`, hasPrefix: true };
  }

  function applyPrefixSmart(editorEl, labelSelect, chips, ctx) {
    const selected = Array.from(chips.querySelectorAll("input:checked")).map(
      (cb) => cb.value
    );
    const baseOrCurrent = ctx.baseLabel || labelSelect.value;
    const effectiveLabel = ctx.labelTouched ? labelSelect.value : baseOrCurrent;
    const effectiveDecs = ctx.chipsTouched ? selected : ctx.baseDecs;
    applyPrefixAtStart(editorEl, buildBoldLabel(effectiveLabel, effectiveDecs));
  }

  let _suppressCaretOnce = false;

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

  function applyPrefixAtStart(editorEl, parts) {
    if (!editorEl) return;

    const { boldText, hasPrefix } = parts;
    const firstBlock =
      editorEl.querySelector(
        "p, li, pre, blockquote, h1, h2, h3, h4, h5, h6"
      ) || editorEl;

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

  // Public API under a single namespace shared by our content scripts.
  // Using globalThis keeps it explicit and avoids confusion with page window.
  const NS = (globalThis.CodeReviewTags = globalThis.CodeReviewTags || {});
  NS.buildUI = buildUI;
  NS.setPanelVisible = setPanelVisible;
  NS.platforms = NS.platforms || {};
})();
