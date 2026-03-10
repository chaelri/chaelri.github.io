(function () {
  "use strict";

  const RETRY_KEY = "kwik_auto_retries";
  const MAX_RETRIES = 5;
  const BUTTON_TIMEOUT_MS = 15000; // wait up to 15s for the button before reloading

  let retries = parseInt(sessionStorage.getItem(RETRY_KEY) || "0");

  const startTime = Date.now();

  const idChecker = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const isCloudflare =
      document.title.toLowerCase().includes("cloudflare") ||
      !!document.querySelector("#challenge-form, #cf-challenge-running");

    // If Cloudflare challenge is active, just keep waiting (it auto-resolves)
    if (isCloudflare) {
      if (elapsed > BUTTON_TIMEOUT_MS) {
        clearInterval(idChecker);
        reloadAndRetry();
      }
      return;
    }

    const btn = document.querySelector(".button.is-success");
    const form = document.querySelector('form[action*="kwik.cx/d/"]');

    if (btn && form) {
      clearInterval(idChecker);
      sessionStorage.removeItem(RETRY_KEY); // success — reset counter

      btn.click();

      // Clean up title
      const title = document.querySelector(".title");
      if (title)
        title.innerText = title.innerText.replace("AnimePahe_", "").replace(/_/g, " ");

      // Remove clutter after 1s
      setTimeout(() => {
        document
          .querySelectorAll("iframe, nav, footer, .column.is-12")
          .forEach((el) => el.remove());
      }, 1000);

      // Countdown indicator on the button
      setTimeout(() => {
        btn.style.cssText =
          "margin: auto; width: 150px; height: 150px; border-radius: 50%; border: none; font-size: 4rem; display:flex; align-items:center; justify-content:center; background:#3B97FC; color:white;";
        let c = 16;
        const t = setInterval(() => {
          if (c > 0) btn.innerHTML = --c;
          else {
            clearInterval(t);
            chrome.runtime.sendMessage({ action: "closeTab" });
          }
        }, 1000);
      }, 1000);

      return;
    }

    // Button not found yet — check if we've timed out
    if (elapsed > BUTTON_TIMEOUT_MS) {
      clearInterval(idChecker);
      reloadAndRetry();
    }
  }, 300);

  function reloadAndRetry() {
    if (retries < MAX_RETRIES) {
      sessionStorage.setItem(RETRY_KEY, retries + 1);
      window.location.reload();
    }
    // Max retries hit — give up silently rather than looping forever
  }
})();
