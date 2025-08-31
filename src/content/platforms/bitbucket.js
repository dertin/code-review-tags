// Bitbucket platform adapter.
// Minimal interface consumed by content/main.js:
// - editorContainerSelector: CSS used by the observer to detect editor containers
// - toolbarSelector: CSS to find the editor toolbar
// - getEditorEl(container): return the editable root element the core will mutate
// - isReplyEditor(editorEl): decide if this editor is a reply (controls initial panel visibility)
// - ensureToolbarToggle(container, panel): insert/keep the toggle button in the toolbar
// Optional helpers: findToolbar(container), syncToolbarButton(container, visible)

(function () {
  // Broad container selector that matches Bitbucket's inline and bottom composers.
  const EDITOR_CONTAINER_SELECTOR =
    'div[data-testid="editor-content-container"], .ak-editor-content-area, div[data-testid="comment-box-container"]';
  // ProseMirror editable root inside the container; used as the core's target.
  const PROSE_SELECTOR = "#ak-editor-textarea.ProseMirror, div.ProseMirror";
  // Toolbar container that hosts formatting buttons (we append our toggle here).
  const TOOLBAR_SELECTOR = 'div[data-vc="toolbar-inner"]';

  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return (
      el.offsetParent !== null &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  }

  // Conversation container for a comment thread (stable id prefix on Bitbucket).
  function getThreadRoot(node) {
    return (
      node?.closest?.(
        '[id^="portal-parent-pr-inline-conversation--conversation-"]'
      ) || null
    );
  }

  // Visible comments inside the same thread (DOM order).
  function getVisibleComments(threadRoot) {
    return Array.from(threadRoot.querySelectorAll('[id^="comment-"]')).filter(
      isVisible
    );
  }

  // Heuristic: within the same comment node, detect a Reply/Responder button above the editor.
  function hasReplyButtonAbove(editorEl, commentEl) {
    if (!commentEl) return false;
    const btns = commentEl.querySelectorAll('button, [role="button"]');
    for (const b of btns) {
      const txt = (b.textContent || "").trim().toLowerCase();
      if (/\breply\b|\bresponder\b/.test(txt)) {
        const rel = b.compareDocumentPosition(editorEl);
        if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return true;
      }
    }
    return false;
  }

  // Decide if the editor is a reply composer (vs. the root/first comment editor).
  // Rules: editor inside non-first comment OR reply button above OR thread-level composer with comments above.
  function isReplyEditor(editorEl) {
    if (!editorEl || !editorEl.closest) return false;
    const threadRoot = getThreadRoot(editorEl);
    if (!threadRoot) return false;
    const comments = getVisibleComments(threadRoot);
    const firstComment = comments[0] || null;

    const commentEl = editorEl.closest('[id^="comment-"]');
    if (commentEl) {
      if (firstComment && commentEl !== firstComment) return true;
      const replyAbove = hasReplyButtonAbove(editorEl, commentEl);
      return replyAbove;
    }

    if (comments.length === 0) return false;

    const anyAbove = comments.some((c) => {
      const rel = c.compareDocumentPosition(editorEl);
      return !!(rel & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    return anyAbove;
  }

  // Return the editable element the core manipulates (<div.ProseMirror> or fallback in the container).
  function getEditorEl(container) {
    return (
      container.querySelector(PROSE_SELECTOR) ||
      container.querySelector('[data-testid="ak-editor-textarea"]') ||
      container
    );
  }

  // Locate the toolbar for this container, walking up a few ancestors as needed.
  function findToolbar(container) {
    let inner = container.querySelector(TOOLBAR_SELECTOR);
    if (inner) return inner;
    let p = container.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      inner = p.querySelector(TOOLBAR_SELECTOR);
      if (inner) return inner;
      p = p.parentElement;
    }
    const all = document.querySelectorAll(TOOLBAR_SELECTOR);
    if (all.length === 1) return all[0];
    return null;
  }

  // Insert a toggle button bound to "panel" and keep it visually last in the toolbar.
  function ensureToolbarToggle(container, panel) {
    const toolbar = findToolbar(container);
    if (!toolbar) return;

    // Keep our host as the last toolbar item even if the host reorders children later.
    const forceLast = (host) => {
      if (!host) return;
      const maxOrder = Array.from(toolbar.children).reduce((max, el) => {
        const v = parseInt(getComputedStyle(el).order, 10);
        return Number.isFinite(v) ? Math.max(max, v) : max;
      }, 0);
      host.style.order = String(maxOrder + 1);
      if (toolbar.lastElementChild !== host) toolbar.appendChild(host);
      queueMicrotask(() => {
        if (toolbar.lastElementChild !== host) toolbar.appendChild(host);
      });
      setTimeout(() => {
        if (toolbar.lastElementChild !== host) toolbar.appendChild(host);
      }, 250);
    };

    let btn = toolbar.querySelector('[data-crt-toggle="true"]');
    if (btn) {
      const host = btn.closest('[role="presentation"]') || btn;
      forceLast(host);
      btn.setAttribute("aria-pressed", String(!panel.hidden));
      return;
    }

    // Delay until a native button exists to mirror its classes/structure.
    const nativeButtons = toolbar.querySelectorAll("button, [role='button']");
    if (nativeButtons.length === 0) {
      setTimeout(() => ensureToolbarToggle(container, panel), 50);
      return;
    }

    const templateBtn =
      nativeButtons[nativeButtons.length - 1] || nativeButtons[0] || null;

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-crt-toggle", "true");
    button.setAttribute("aria-label", "Toggle Code Review Tags panel");
    button.setAttribute("title", "Toggle Code Review Tags panel");
    button.setAttribute("aria-pressed", String(!panel.hidden));
    button.textContent = "🏷️";
    if (templateBtn && templateBtn.className) {
      button.className = templateBtn.className;
    }

    button.addEventListener("click", () => {
      globalThis.CodeReviewTags.setPanelVisible(panel, panel.hidden);
      button.setAttribute("aria-pressed", String(!panel.hidden));
    });

    let host = document.createElement("div");
    host.setAttribute("role", "presentation");
    let inner = document.createElement("div");

    if (templateBtn) {
      const templateHost = templateBtn.closest('[role="presentation"]');
      if (templateHost && templateHost.className) {
        host.className = templateHost.className;
      }
      if (
        templateBtn.parentElement &&
        templateBtn.parentElement !== templateHost
      ) {
        inner.className = templateBtn.parentElement.className || "";
      }
    }

    inner.appendChild(button);
    host.appendChild(inner);
    toolbar.appendChild(host);
    forceLast(host);
  }

  function syncToolbarButton(container, isVisible) {
    const toolbar = findToolbar(container);
    const btn = toolbar?.querySelector?.('[data-crt-toggle="true"]');
    if (btn) btn.setAttribute("aria-pressed", String(isVisible));
  }

  const NS = (globalThis.CodeReviewTags = globalThis.CodeReviewTags || {});
  NS.platforms = NS.platforms || {};
  NS.platforms.bitbucket = {
    key: "bitbucket",
    editorContainerSelector: EDITOR_CONTAINER_SELECTOR,
    toolbarSelector: TOOLBAR_SELECTOR,
    getEditorEl,
    isReplyEditor,
    ensureToolbarToggle,
    findToolbar,
    syncToolbarButton,
  };
})();
