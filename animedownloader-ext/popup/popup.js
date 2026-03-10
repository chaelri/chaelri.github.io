const listEl = document.getElementById("bucket-list");
const countBadge = document.getElementById("count-badge");

function renderBucket() {
  chrome.storage.local.get(["anime_bucket"], (result) => {
    const bucket = JSON.parse(result.anime_bucket || "[]");
    countBadge.innerText = bucket.length;

    if (bucket.length === 0) {
      listEl.innerHTML = `<div class="empty-state">BUCKET IS EMPTY<br><br>Go to LiveChart.me and hit SCAN on any anime.</div>`;
      return;
    }

    listEl.innerHTML = [...bucket]
      .reverse()
      .map(
        (item, idx) => `
      <div class="bucket-item">
        <div class="item-info">
          <div class="item-title">${item.title}</div>
          <div class="item-meta">EP ${item.progress} &nbsp;·&nbsp; ${item.date}</div>
          <div class="item-quality">${item.quality}</div>
        </div>
        <div class="item-actions">
          <a href="${item.link}" target="_blank" class="dl-link">DL</a>
          <button class="del-btn" data-idx="${idx}">✕</button>
        </div>
      </div>`
      )
      .join("");

    listEl.querySelectorAll(".del-btn").forEach((btn) => {
      btn.onclick = () => {
        chrome.storage.local.get(["anime_bucket"], (r) => {
          let cur = JSON.parse(r.anime_bucket || "[]");
          // idx is from reversed array, so map back
          const realIdx = cur.length - 1 - parseInt(btn.dataset.idx);
          cur.splice(realIdx, 1);
          chrome.storage.local.set({ anime_bucket: JSON.stringify(cur) }, renderBucket);
        });
      };
    });
  });
}

document.getElementById("dl-all-btn").onclick = () => {
  chrome.storage.local.get(["anime_bucket"], (result) => {
    const bucket = JSON.parse(result.anime_bucket || "[]");
    bucket.forEach((item) => {
      chrome.tabs.create({ url: item.link, active: false });
    });
  });
};

document.getElementById("clear-btn").onclick = () => {
  if (confirm("Clear all saved downloads?")) {
    chrome.storage.local.set({ anime_bucket: "[]" }, renderBucket);
  }
};

renderBucket();
