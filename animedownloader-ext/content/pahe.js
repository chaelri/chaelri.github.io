(function () {
  "use strict";

  const wait = setInterval(() => {
    const btn = document.querySelector(".col-sm-6");
    if (btn?.innerText.includes("Continue")) {
      btn.querySelector("a")?.click();
      clearInterval(wait);
    }
  }, 100);
})();
