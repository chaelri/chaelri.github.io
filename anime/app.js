// chaelri.github.io/anime/app.js

document.addEventListener("DOMContentLoaded", () => {
  console.log("Bucket UI System Initialized...");

  // 1. Setup Search Logic
  // This allows you to filter through your bucket instantly
  const searchInput = document.querySelector("input"); // Make sure you have an input in index.html

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      const cards = document.querySelectorAll("#link-bucket > div");

      cards.forEach((card) => {
        const title = card.querySelector("h3").innerText.toLowerCase();
        // If search term matches title, show card, otherwise hide
        if (title.includes(term)) {
          card.style.display = "block";
          card.style.opacity = "1";
        } else {
          card.style.display = "none";
        }
      });
    });
  }

  // 2. UI Polish: Refresh the item count
  const updateCount = () => {
    const countLabel = document.querySelector("p.text-zinc-500");
    const totalItems = document.querySelectorAll("#link-bucket > div").length;
    if (countLabel && totalItems > 0) {
      countLabel.innerText = `You have ${totalItems} captured items in your bucket.`;
    }
  };

  // Since Tampermonkey injects cards after the page loads,
  // we check every second to update the counter
  const countInterval = setInterval(() => {
    const cards = document.querySelectorAll("#link-bucket > div");
    if (cards.length > 0 && !cards[0].innerText.includes("Waiting")) {
      updateCount();
      clearInterval(countInterval);
    }
  }, 1000);
});

// 3. Global function for aesthetic feedback when downloading
window.notifyDownload = (title) => {
  console.log(`Starting download for: ${title}`);
  // You could add a toast notification here if you wanted!
};
