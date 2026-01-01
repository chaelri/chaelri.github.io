document.addEventListener("DOMContentLoaded", () => {
  const bucket = document.getElementById("link-bucket");
  const counter = document.getElementById("item-count");

  const updateUI = () => {
    const items = bucket.querySelectorAll(".anime-card-aesthetic");
    if (items.length > 0) {
      counter.innerText = `You have ${items.length} captured items in your bucket.`;
    } else {
      counter.innerText = "Bucket is empty.";
    }
  };

  // Watch for Tampermonkey injection
  const observer = new MutationObserver(updateUI);
  if (bucket) observer.observe(bucket, { childList: true });
});
