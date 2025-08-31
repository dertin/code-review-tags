(() => {
  const api = globalThis.browser || globalThis.chrome;
  document.addEventListener("DOMContentLoaded", () => {
    try {
      const v = api?.runtime?.getManifest?.()?.version;
      const el = document.getElementById("version");
      if (el && v) el.textContent = `v${v}`;
    } catch (_) {
      // noop
    }
  });
})();
