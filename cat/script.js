// ==UserScript==
// @name         Gemini Code Bucket Consumer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Reads code blocks from GM_setValue and allows batch downloading.
// @author       AI-Assisted Coder / Fixed by User
// @match        https://chaelri.github.io/YOUR_REPO_NAME/code-bucket.html*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

// This file must be served on a domain/page that also has GM_getValue granted to it.
// Ensure your @match in this file and your Tampermonkey script are correctly set up.
(function() {
    "use strict";

    // Since this file is run directly on the GitHub page, it won't have the
    // GM_ functions globally unless you enable "Always run on this domain" in Tampermonkey,
    // OR if you include the necessary @grant statements here (as I have).
    // The GM_ functions will be called using the actual GM object at runtime.

    document.addEventListener("DOMContentLoaded", () => {
        const grid = document.getElementById("code-bucket-grid");
        const countDisplay = document.getElementById("item-count");
        const downloadAllBtn = document.getElementById("download-all-btn");
        const clearAllBtn = document.getElementById("clear-all-btn");
        const loadingMessage = document.getElementById("loading-message");

        // Use the global window object to get Tampermonkey's specific functions
        const GM_get = typeof GM_getValue !== 'undefined' ? GM_getValue : (key, def) => localStorage.getItem(key) || def;
        const GM_set = typeof GM_setValue !== 'undefined' ? GM_setValue : (key, val) => localStorage.setItem(key, val);
        
        // --- Core Functions ---

        /**
         * Triggers a download for a single file using a Blob.
         * @param {string} filename 
         * @param {string} content 
         */
        function triggerDownload(filename, content) {
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        /**
         * Clears all items from the bucket.
         */
        function clearBucket() {
            if (confirm("Are you sure you want to clear ALL items from the code bucket? This action cannot be undone.")) {
                GM_set('gemini_code_bucket', '[]');
                renderBucket();
            }
        }
        
        /**
         * Renders the items from the Tampermonkey storage.
         */
        function renderBucket() {
            let bucket;
            try {
                // Get the bucket content
                const bucketJson = GM_get('gemini_code_bucket', '[]');
                bucket = JSON.parse(bucketJson);
            } catch (e) {
                console.error("Failed to parse bucket JSON:", e);
                bucket = [];
            }
            
            // --- UI Updates ---
            if (loadingMessage) loadingMessage.style.display = 'none';
            grid.innerHTML = '';
            
            if (bucket.length === 0) {
                countDisplay.textContent = "Bucket is empty. Start adding code blocks from the Gemini Playground.";
                downloadAllBtn.classList.add('hidden');
                return;
            }

            countDisplay.textContent = `You have ${bucket.length} file(s) ready for download.`;
            downloadAllBtn.classList.remove('hidden');

            // Sort by newest first
            bucket.sort((a, b) => b.timestamp - a.timestamp);

            // --- Render Cards ---
            bucket.forEach(item => {
                const card = document.createElement('div');
                card.className = 'code-card';
                card.id = `item-${item.id}`;

                const safeLanguage = item.language.toLowerCase().replace(/[^a-z0-9]/g, '');

                card.innerHTML = `
                    <div class="flex-1">
                        <div class="flex items-center mb-1">
                            <span class="lang-badge lang-${safeLanguage}">${item.language.toUpperCase()}</span>
                            <h2 class="text-lg font-semibold text-white">${item.filename}</h2>
                        </div>
                        <p class="code-card-meta">
                            Added: ${new Date(item.timestamp).toLocaleString()} 
                            <span class="mx-2">|</span> 
                            Source: <a href="${item.sourceURL}" target="_blank" class="text-blue-400 hover:text-blue-300">Open Chat</a>
                        </p>
                    </div>
                    <div class="flex gap-4">
                        <button class="dl-single-btn btn-primary" data-id="${item.id}">
                            <span class="material-symbols-outlined">download</span> Download
                        </button>
                        <button class="del-single-btn btn-secondary" data-id="${item.id}">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                `;
                grid.appendChild(card);
            });

            // --- Event Listeners ---
            
            // Download All
            downloadAllBtn.onclick = () => {
                bucket.forEach(item => triggerDownload(item.filename, item.content));
            };

            // Clear All
            clearAllBtn.onclick = clearBucket;

            // Delete Single Item
            document.querySelectorAll('.del-single-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const idToDelete = e.currentTarget.dataset.id;
                    let currentBucket = JSON.parse(GM_get('gemini_code_bucket', '[]'));
                    const filteredBucket = currentBucket.filter(item => item.id !== idToDelete);
                    
                    if (confirm(`Are you sure you want to delete ${bucket.find(i => i.id === idToDelete)?.filename}?`)) {
                        GM_set('gemini_code_bucket', JSON.stringify(filteredBucket));
                        renderBucket();
                    }
                };
            });
            
            // Download Single Item
            document.querySelectorAll('.dl-single-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const idToDownload = e.currentTarget.dataset.id;
                    const item = bucket.find(i => i.id === idToDownload);
                    if (item) {
                        triggerDownload(item.filename, item.content);
                    }
                };
            });
        }
        
        // Initial call
        renderBucket();
    });

})();