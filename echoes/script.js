
// script.js (FULL — PART 2/2)

// =============================
// Firebase imports
// =============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  update,
  remove,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

import {
  getStorage,
  ref as sRef,
  uploadBytes,
  deleteObject,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// =============================
// Firebase config
// =============================
const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
  measurementId: "G-1LSTC0N3NJ",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

// DOM Elements (declared with let and initialized in DOMContentLoaded)
let loadingScreen;
let loginScreen;
let appContainer;
let loginCharlieBtn;
let loginKarlaBtn;
let userDisplay;
let newPostStoryBtn;
let postStoryModal;
let cancelPostStoryBtn;
let publishPostStoryBtn;
let contentTypeSelect;
let mediaUpload;
let postCaption;
let postsContainer;
let storiesContainer;
let publishLoadingSpinner;

// Story Viewer DOM Elements
let storyViewerModal;
let storyViewerAvatar;
let storyViewerUsername;
let storyViewerMediaImage;
let storyViewerMediaVideo;
let closeStoryViewerBtn;
let storyViewerPrevBtn;
let storyViewerNextBtn;
let deleteStoryViewerBtn;
let storyProgressBarContainer;
let storyViewerSeenBy; // New DOM element for seen by

// Custom Confirmation Modal DOM Elements
let confirmationModal;
let confirmationMessage;
let cancelConfirmationBtn;
let confirmDeletionBtn;

// Toast Notification DOM Elements
let toastNotification;
let toastMessage;

let currentUser = null;
let currentStories = []; // Stores stories for the currently viewed user
let currentStoryIndex = 0; // Index of the currently displayed story
let progressBarTimeout; // To hold the timeout for progress bar animation

// =============================
// Functions (moved to higher scope)
// =============================

// Function to show toast notifications
const showToast = (message, type = 'info') => {
    // Ensure toast elements are available before attempting to modify them
    if (!toastNotification || !toastMessage) {
        console.error("Toast notification elements not found. Cannot show toast.");
        return;
    }

    toastMessage.innerHTML = message; // Changed to innerHTML to support bold text
    toastNotification.classList.remove('hidden', 'success', 'error');
    toastNotification.classList.add('show');

    if (type === 'success') {
        toastNotification.classList.add('success');
    } else if (type === 'error') {
        toastNotification.classList.add('error');
    } else {
        // Default for 'info' or any other type, if needed
        // toastNotification.classList.add('info'); 
    }

    setTimeout(() => {
        toastNotification.classList.remove('show');
        toastNotification.classList.add('hidden');
    }, 3000); // Hide after 3 seconds
};

// Function to show the custom confirmation modal
const showConfirmationModal = (message, onConfirm) => {
    confirmationMessage.textContent = message;
    confirmationModal.classList.remove('hidden');

    // Clear previous event listeners to prevent multiple calls
    confirmDeletionBtn.onclick = null;
    cancelConfirmationBtn.onclick = null;

    confirmDeletionBtn.onclick = () => {
        confirmationModal.classList.add('hidden');
        onConfirm();
    };

    cancelConfirmationBtn.onclick = () => {
        confirmationModal.classList.add('hidden');
    };
};

// Helper to reset a single progress bar segment
const resetProgressBar = (index) => {
    const segment = storyProgressBarContainer.children[index];
    if (segment) {
        const innerBar = segment.querySelector('.story-progress-segment-inner');
        innerBar.style.width = '0%';
        innerBar.style.animation = 'none';
        void innerBar.offsetWidth; // Trigger reflow to restart animation
    }
};

// Helper to complete a single progress bar segment
const completeProgressBar = (index) => {
    const segment = storyProgressBarContainer.children[index];
    if (segment) {
        const innerBar = segment.querySelector('.story-progress-segment-inner');
        innerBar.style.width = '100%';
        innerBar.style.animation = 'none'; // Stop any ongoing animation
    }
};

// Start animating a single progress bar segment
const startProgressBar = (index) => {
    // Clear any existing timeout for safety
    if (progressBarTimeout) {
        clearTimeout(progressBarTimeout);
        progressBarTimeout = null;
    }

    // Reset all bars that are not the current one, and clear animation from current
    Array.from(storyProgressBarContainer.children).forEach((segment, i) => {
        const innerBar = segment.querySelector('.story-progress-segment-inner');
        if (i < index) {
            innerBar.style.width = '100%';
            innerBar.style.animation = 'none';
        } else if (i === index) {
            innerBar.style.width = '0%'; // Ensure it starts from 0
            innerBar.style.animation = 'none'; // Remove any old animation
            void innerBar.offsetWidth; // Trigger reflow
            innerBar.style.animation = 'progress-animation 5s linear forwards';
        } else {
            innerBar.style.width = '0%';
            innerBar.style.animation = 'none';
        }
    });

    // Set a timeout to advance to the next story if the current one finishes
    progressBarTimeout = setTimeout(() => {
        // Check if the current story is a video and if it's still playing
        if (storyViewerMediaVideo.classList.contains('hidden') === false && !storyViewerMediaVideo.paused) {
            // If it's a video and playing, let the video's 'ended' event handle the transition
            // For now, we will let the timeout trigger next, as video length can vary.
            // A better solution would be to tie progress to video duration.
            // For simplicity with fixed 5s, we proceed regardless of video state after 5s.
        }
        if (currentStoryIndex < currentStories.length - 1) {
            loadStoryContent(currentStoryIndex + 1);
        } else {
            closeStoryViewer(); // Close if it's the last story
        }
    }, 5000);
};

// Function to mark a story as seen by the current user
const markStoryAsSeen = async (storyId) => {
    if (!currentUser || !storyId) return;

    const seenByRef = ref(db, `stories/${storyId}/seenBy/${currentUser.id}`);
    try {
        await update(seenByRef, { timestamp: Date.now() });
        console.log(`Story ${storyId} marked as seen by ${currentUser.name}`);
    } catch (error) {
        console.error('Error marking story as seen:', error);
    }
};

// Display a specific story in the viewer and manage progress bars
const loadStoryContent = (index) => {
    if (index < 0 || index >= currentStories.length) {
        console.error("Attempted to load story out of bounds:", index);
        closeStoryViewer();
        return;
    }

    currentStoryIndex = index;
    const story = currentStories[currentStoryIndex];

    // Mark the story as seen by the current user
    markStoryAsSeen(story.id);

    storyViewerMediaImage.classList.add('hidden');
    storyViewerMediaVideo.classList.add('hidden');
    storyViewerMediaImage.src = '';
    storyViewerMediaVideo.src = '';
    storyViewerMediaVideo.pause(); // Pause any currently playing video
    storyViewerMediaVideo.currentTime = 0; // Reset video to start

    if (story.mediaURL) {
        const urlWithoutQueryParams = story.mediaURL.split('?')[0];
        if (urlWithoutQueryParams.match(/\.(jpeg|jpg|png|gif)$/i)) {
            // Apply blur-up effect for images
            storyViewerMediaImage.style.filter = 'blur(10px)';
            storyViewerMediaImage.style.transition = 'filter 0.5s ease-out';
            storyViewerMediaImage.src = story.thumbnailBase64 || ''; // Use base64 thumbnail if available
            storyViewerMediaImage.classList.remove('hidden');

            const img = new Image();
            img.src = story.mediaURL;
            img.onload = () => {
                storyViewerMediaImage.src = story.mediaURL;
                storyViewerMediaImage.style.filter = 'blur(0px)';
            };
            img.onerror = () => {
                console.error("Failed to load full story image:", story.mediaURL);
                storyViewerMediaImage.style.filter = 'blur(0px)'; // Remove blur even if full load fails
            };

        } else if (urlWithoutQueryParams.match(/\.(mp4|webm|ogg)$/i)) {
            storyViewerMediaVideo.src = story.mediaURL;
            storyViewerMediaVideo.classList.remove('hidden');
            storyViewerMediaVideo.play();
        } else {
            console.warn("Unsupported media type for URL:", urlWithoutQueryParams);
        }
    }

    storyViewerUsername.textContent = story.userName || 'Unknown';
    storyViewerAvatar.textContent = (story.userName || 'U').charAt(0).toUpperCase();

    // Populate "Seen By" information
    const seenBy = story.seenBy || {};
    let seenByUsers = [];
    let karlaViewCount = 0;

    for (const userId in seenBy) {
        if (userId === 'karla') {
            // If seenBy[userId] stores a timestamp, we count it as 1 view for simplicity.
            // If you want to count multiple views by Karla, you'd need a counter for each user in Firebase.
            // For now, if 'karla' key exists, it means Karla has viewed it at least once.
            karlaViewCount++; // Increment for each entry if we track multiple views
            // If seenBy[userId] stores an actual count for a user, use that.
            // For this implementation, we are just checking presence for other users, and counting Karla's entries.
        } else {
            seenByUsers.push(userId.charAt(0).toUpperCase() + userId.slice(1));
        }
    }
    
    let seenByText = '';
    if (Object.keys(seenBy).length > 0) {
        seenByText = 'Viewed by: ';
        if (seenByUsers.length > 0) {
            seenByText += seenByUsers.join(', ');
        }
        if (karlaViewCount > 0) {
            if (seenByUsers.length > 0) {
                seenByText += ` (Karla: ${karlaViewCount} time${karlaViewCount > 1 ? 's' : ''})`;
            } else {
                seenByText += `Karla: ${karlaViewCount} time${karlaViewCount > 1 ? 's' : ''}`;
            }
        }
    } else {
        seenByText = 'No views yet.';
    }
    storyViewerSeenBy.textContent = seenByText;


    // Manage navigation button visibility
    storyViewerPrevBtn.classList.toggle('hidden', currentStoryIndex === 0);
    storyViewerNextBtn.classList.toggle('hidden', currentStoryIndex === currentStories.length - 1);

    // Manage delete button visibility and functionality for stories
    const showStoryDeleteButton = currentUser && (currentUser.name === story.userName || !story.userName);
    if (showStoryDeleteButton) {
        deleteStoryViewerBtn.classList.remove('hidden');
        deleteStoryViewerBtn.onclick = async () => {
            showConfirmationModal('Are you sure you want to delete this story?', async () => {
                await deleteStory(story.id, story.mediaURL);
                // After deletion, if there are still stories, try to load the next one
                // otherwise, close the viewer.
                if (currentStories.length > 0) {
                    // Adjust currentStoryIndex if the deleted story was the last one
                    if (currentStoryIndex >= currentStories.length) {
                        currentStoryIndex = currentStories.length - 1;
                    }
                    loadStoryContent(currentStoryIndex);
                } else {
                    closeStoryViewer();
                }
            });
        };
    } else {
        deleteStoryViewerBtn.classList.add('hidden');
        deleteStoryViewerBtn.onclick = null;
    }

    startProgressBar(currentStoryIndex);
};


// Open the story viewer modal
const openStoryViewer = (stories, startIndex) => {
    if (!stories || stories.length === 0) {
        console.warn("Attempted to open story viewer with no stories.");
        return;
    }

    currentStories = stories;
    currentStoryIndex = startIndex;

    // Clear previous progress bars
    storyProgressBarContainer.innerHTML = '';

    // Create new progress bars
    currentStories.forEach((_, index) => {
        const segment = document.createElement('div');
        segment.classList.add('story-progress-segment');
        const innerBar = document.createElement('div');
        innerBar.classList.add('story-progress-segment-inner');
        segment.appendChild(innerBar);
        storyProgressBarContainer.appendChild(segment);
    });

    loadStoryContent(currentStoryIndex);
    storyViewerModal.classList.remove('hidden');
};

// Close the story viewer modal
const closeStoryViewer = () => {
    storyViewerModal.classList.add('hidden');
    storyViewerMediaVideo.pause(); // Pause video when closing
    storyViewerMediaVideo.currentTime = 0; // Reset video to start
    storyProgressBarContainer.innerHTML = ''; // Clear progress bars
    if (progressBarTimeout) {
        clearTimeout(progressBarTimeout);
        progressBarTimeout = null;
    }
    currentStories = []; // Clear stories
    currentStoryIndex = 0; // Reset index
};


// Function to compress images using a canvas
const compressImage = (imageFile, maxWidth = 1000, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = height * (maxWidth / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(new File([blob], imageFile.name, {
                                type: blob.type,
                                lastModified: Date.now(),
                            }));
                        } else {
                            reject(new Error('Canvas toBlob failed.'));
                        }
                    },
                    imageFile.type,
                    quality
                );
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

// New function to generate a tiny, blurred base64 thumbnail
const generateBase64Thumbnail = (imageFile, size = 20, quality = 0.1) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size * (img.height / img.width); // Maintain aspect ratio

                const ctx = canvas.getContext('2d');
                ctx.filter = 'blur(2px)'; // Apply a slight blur directly to the canvas
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                resolve(canvas.toDataURL(imageFile.type, quality));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

// Delete a comment
const deleteComment = async (postId, commentId) => {
    try {
        await remove(ref(db, `posts/${postId}/comments/${commentId}`));
        showToast('Comment deleted successfully!', 'success');
    } catch (error) {
        console.error('Error deleting comment:', error);
        showToast('Failed to delete comment. See console for details.', 'error');
    }
};

// Toggle like on a comment
const toggleCommentLike = async (postId, commentId, currentLikes) => {
    if (!currentUser) {
        showToast('Please log in to like comments.', 'error');
        return;
    }

    const commentRef = ref(db, `posts/${postId}/comments/${commentId}/likes`);
    let updatedLikes = { ...currentLikes }; // Create a mutable copy

    if (updatedLikes[currentUser.id]) {
        // User has already liked, so unlike
        delete updatedLikes[currentUser.id];
        showToast('Unliked comment.', 'info');
    } else {
        // User has not liked, so like
        updatedLikes[currentUser.id] = true;
        showToast('Liked comment!', 'success');
    }

    try {
        await set(commentRef, updatedLikes);
    } catch (error) {
        console.error('Error toggling comment like:', error);
        showToast('Failed to toggle comment like. See console for details.', 'error');
    }
};

// Load comments for a specific post
const loadComments = (postId, commentListElement) => {
    onValue(ref(db, `posts/${postId}/comments`), (snapshot) => {
        commentListElement.innerHTML = ''; // Clear existing comments
        const comments = snapshot.val();
        if (comments) {
            Object.entries(comments).reverse().forEach(([commentId, comment]) => {
                const commentLikes = comment.likes || {};
                const likeCount = Object.keys(commentLikes).length;
                const isLiked = currentUser && commentLikes[currentUser.id];

                const commentElement = document.createElement('div');
                commentElement.classList.add('text-sm', 'text-neutral-300', 'mb-2', 'flex', 'items-start', 'group'); // Added group for hover effects

                const commentContent = document.createElement('p');
                commentContent.classList.add('flex-grow');

                const commentTimestamp = new Date(comment.timestamp).toLocaleString();
                commentContent.innerHTML = `<span class=\"font-semibold text-neutral-100\">${comment.author}</span> ${comment.text} <span class=\"text-neutral-500 text-xs ml-2\">${commentTimestamp}</span>`;
                
                commentElement.appendChild(commentContent);

                // Comment actions container
                const commentActions = document.createElement('div');
                commentActions.classList.add('flex', 'items-center', 'ml-2', 'opacity-0', 'group-hover:opacity-100', 'transition-opacity', 'duration-150', 'ease-in-out');

                // Add like button for comments
                const likeButton = document.createElement('button');
                likeButton.classList.add('flex', 'items-center', 'space-x-1', 'text-neutral-400', 'hover:text-red-500', 'transition-colors', 'duration-150', 'ease-in-out', 'mr-2');
                likeButton.innerHTML = `
                    <span class=\"material-icons ${isLiked ? 'text-red-500' : ''}\">${isLiked ? 'favorite' : 'favorite_border'}</span>
                    <span class=\"text-xs\">${likeCount}</span>
                `;
                likeButton.title = isLiked ? 'Unlike comment' : 'Like comment';
                likeButton.addEventListener('click', async () => {
                    await toggleCommentLike(postId, commentId, commentLikes);
                });
                commentActions.appendChild(likeButton);

                // Add delete button if current user is the author
                if (currentUser && currentUser.name === comment.author) {
                    const deleteButton = document.createElement('button');
                    deleteButton.classList.add('text-red-400', 'hover:text-red-600', 'text-xs', 'material-icons');
                    deleteButton.textContent = 'delete';
                    deleteButton.title = 'Delete comment';
                    deleteButton.addEventListener('click', () => {
                        showConfirmationModal('Are you sure you want to delete this comment?', async () => {
                            await deleteComment(postId, commentId);
                        });
                    });
                    commentActions.appendChild(deleteButton);
                }

                commentElement.appendChild(commentActions);
                commentListElement.appendChild(commentElement);
            });
        } else {
            commentListElement.innerHTML = '<p class=\"text-neutral-400 text-sm\">No comments yet.</p>';
        }
    });
};

// Add a new comment to a post
const addComment = async (postId, commentText) => {
    if (!currentUser) {
        showToast('Please log in to comment.', 'error');
        return;
    }
    if (!commentText.trim()) {
        showToast('Comment cannot be empty.', 'error');
        return;
    }

    try {
        const newComment = {
            author: currentUser.name,
            text: commentText.trim(),
            timestamp: Date.now(),
            likes: {}, // Initialize likes as an empty object for comments
        };
        await push(ref(db, `posts/${postId}/comments`), newComment);
        showToast('Comment posted!', 'success');
    } catch (error) {
        console.error('Error adding comment:', error);
        showToast('Failed to post comment. See console for details.', 'error');
    }
};

// Toggle like on a post
const toggleLike = async (postId, currentLikes) => {
    if (!currentUser) {
        showToast('Please log in to like posts.', 'error');
        return;
    }

    const postRef = ref(db, `posts/${postId}/likes`);
    let updatedLikes = { ...currentLikes }; // Create a mutable copy

    if (updatedLikes[currentUser.id]) {
        // User has already liked, so unlike
        delete updatedLikes[currentUser.id];
        showToast('Unliked post.', 'info');
    } else {
        // User has not liked, so like
        updatedLikes[currentUser.id] = true;
        showToast('Liked post!', 'success');
    }

    try {
        await set(postRef, updatedLikes);
    } catch (error) {
        console.error('Error toggling like:', error);
        showToast('Failed to toggle like. See console for details.', 'error');
    }
};

// Load Posts (Instagram Feed Style)
const loadPosts = () => {
    onValue(ref(db, 'posts'), (snapshot) => {
        console.log("Loading posts...");
        postsContainer.innerHTML = ''; // Clear existing posts
        const posts = snapshot.val();
        console.log("Posts from Firebase:", posts);
        if (posts) {
            // Display newest posts first, Instagram-style (full width)
            Object.entries(posts).reverse().forEach(([key, post]) => {
                const postAuthor = post.author || 'Unknown';
                const postAuthorInitial = postAuthor.charAt(0).toUpperCase();
                const postLikes = post.likes || {};
                const likeCount = Object.keys(postLikes).length;
                const isLiked = currentUser && postLikes[currentUser.id];

                const showDeleteButton = currentUser && (currentUser.name === post.author || !post.author);

                const postElement = document.createElement('div');
                postElement.classList.add('bg-neutral-800', 'rounded-lg', 'shadow-lg', 'overflow-hidden', 'mb-6', 'post-item');
                postElement.dataset.postId = key; // Set data attribute for postId

                let mediaHtml = '';
                let mediaData = []; // To store media info for carousel

                if (post.media && Array.isArray(post.media) && post.media.length > 0) {
                    // Multi-image post (carousel)
                    mediaData = post.media;
                    mediaHtml = `
                        <div class=\"carousel-container relative overflow-hidden\">
                            <div class=\"carousel-wrapper flex transition-transform duration-300 ease-in-out\";\">
                                ${mediaData.map((media, index) => `
                                    <div class=\"carousel-slide flex-none post-media-wrapper bg-neutral-900\" style=\"width: calc(100% / ${mediaData.length});\">
                                        <img src=\"${media.thumbnailBase64 || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}\" 
                                            data-src=\"${media.mediaURL}\" 
                                            alt=\"Post media ${index + 1}\" 
                                            class=\"post-media-image w-full h-full object-contain filter blur-lg transition-filter duration-500 ease-in-out\">
                                        <div class=\"absolute inset-0 flex items-center justify-center\">\n                                            <div class=\"loader ease-linear rounded-full border-4 border-t-4 border-blue-500 h-8 w-8 text-white\"></div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            <button class=\"carousel-button carousel-button-prev left-0 ${mediaData.length <= 1 ? 'hidden' : ''}\"><span class=\"material-icons\">chevron_left</span></button>
                            <button class=\"carousel-button carousel-button-next right-0 ${mediaData.length <= 1 ? 'hidden' : ''}\"><span class=\"material-icons\">chevron_right</span></button>
                            ${mediaData.length > 1 ? `
                                <div class=\"carousel-indicators\">\n                                    ${mediaData.map((_, index) => `<span class=\"indicator-dot ${index === 0 ? 'active' : ''}\" data-slide-to=\"${index}\"></span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `;
                } else if (post.mediaURL) {
                    // Single image/video post (legacy or single file upload)
                    mediaData = [{ mediaURL: post.mediaURL, thumbnailBase64: post.thumbnailBase64 }];
                    const urlWithoutQueryParams = post.mediaURL.split('?')[0];
                    if (urlWithoutQueryParams.match(/\.(mp4|webm|ogg)$/i)) {
                         mediaHtml = `
                            <div class=\"relative w-full post-media-wrapper bg-neutral-900\">\n                                <video src=\"${post.mediaURL}\" controls class=\"w-full h-full object-contain\"></video>
                            </div>
                        `;
                    } else {
                         mediaHtml = `
                            <div class=\"relative w-full post-media-wrapper bg-neutral-900\">\n                                <img src=\"${post.thumbnailBase64 || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}\" 
                                    data-src=\"${post.mediaURL}\" 
                                    alt=\"Post media\" 
                                    class=\"post-media-image w-full h-full object-contain filter blur-lg transition-filter duration-500 ease-in-out\">
                                <div class=\"absolute inset-0 flex items-center justify-center\">\n                                    <div class=\"loader ease-linear rounded-full border-4 border-t-4 border-blue-500 h-8 w-8 text-white\"></div>
                                </div>
                            </div>
                        `;
                    }
                }

                postElement.innerHTML = `
                    <div class=\"flex items-center p-3\">\n                        <div class=\"w-8 h-8 bg-gradient-to-r from-teal-500 to-blue-500 rounded-full mr-3 flex items-center justify-center text-white text-sm font-bold\">${postAuthorInitial}</div>
                        <p class=\"font-semibold text-neutral-100\">${postAuthor}</p>
                        ${showDeleteButton ? `<button class=\"ml-auto text-red-400 hover:text-red-600 delete-post-btn text-sm\" data-id=\"${key}\">Delete</button>` : ''}
                    </div>
                    ${mediaHtml}
                    <div class=\"p-3\">\n                        ${post.caption ? `<p class=\"text-neutral-300 mb-1\"><span class=\"font-semibold text-neutral-100\">${postAuthor}</span> ${post.caption}</p>` : ''}
                        <div class=\"flex items-center space-x-4 mb-2\">\n                            <button class=\"like-button flex items-center space-x-1 text-neutral-400 hover:text-red-500 transition-colors duration-150 ease-in-out\" data-post-id=\"${key}\">\n                                <span class=\"material-icons ${isLiked ? 'text-red-500' : ''}\">${isLiked ? 'favorite' : 'favorite_border'}</span>
                                <span class=\"text-sm\">${likeCount}</span>
                            </button>
                            <p class=\"text-neutral-500 text-xs\">${new Date(post.timestamp).toLocaleString()}</p>
                        </div>
                        <div class=\"post-comment-section mt-4 pt-4 border-t border-neutral-700\">\n                            <div class=\"comment-list space-y-3 mb-4\">\n                                <!-- Comments will be loaded here by JavaScript -->\n                                <p class=\"text-neutral-400 text-sm\">Loading comments...</p>\n                            </div>
                            <div class=\"flex items-center space-x-2\">\n                                <textarea class=\"comment-input flex-grow rounded-lg py-2 px-4 bg-neutral-700 text-neutral-100 text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 border border-neutral-600\" placeholder=\"Add a comment...\"></textarea>
                                <button class=\"post-comment-btn bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 text-white font-bold py-2 px-4 rounded-full text-sm shadow-md transition duration-150 ease-in-out\" data-post-id=\"${key}\">\n                                    Post
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                postsContainer.appendChild(postElement);

                // Immediately load comments for the post (default open)
                const commentSection = postElement.querySelector('.post-comment-section');
                if (commentSection) {
                    loadComments(key, commentSection.querySelector('.comment-list'));
                }

                // Handle image loading and carousel functionality
                if (mediaData.length > 0) {
                    mediaData.forEach((media, index) => {
                        const imgElement = postElement.querySelector(`.carousel-slide:nth-child(${index + 1}) .post-media-image`) || postElement.querySelector('.post-media-image');
                        const loaderElement = imgElement ? imgElement.nextElementSibling : null;

                        if (imgElement && imgElement.dataset.src) {
                            const fullSrc = imgElement.dataset.src;
                            const tempImg = new Image();
                            tempImg.src = fullSrc;
                            tempImg.onload = () => {
                                imgElement.src = fullSrc;
                                imgElement.classList.remove('blur-lg');
                                if (loaderElement) loaderElement.classList.add('hidden');
                            };
                            tempImg.onerror = () => {
                                console.error("Failed to load full post image:", fullSrc);
                                imgElement.classList.remove('blur-lg');
                                if (loaderElement) loaderElement.classList.add('hidden');
                            };
                        }
                    });

                    // Carousel logic
                    if (mediaData.length > 1) {
                        let currentSlide = 0;
                        const carouselWrapper = postElement.querySelector('.carousel-wrapper');
                        const prevBtn = postElement.querySelector('.carousel-button-prev');
                        const nextBtn = postElement.querySelector('.carousel-button-next');
                        const indicatorDots = postElement.querySelectorAll('.indicator-dot');

                        const updateCarousel = () => {
                            carouselWrapper.style.transform = `translateX(-${currentSlide * 100}%)`;
                            indicatorDots.forEach((dot, idx) => {
                                dot.classList.toggle('active', idx === currentSlide);
                            });
                            prevBtn.classList.toggle('hidden', currentSlide === 0);
                            nextBtn.classList.toggle('hidden', currentSlide === mediaData.length - 1);
                        };

                        if (prevBtn) {
                            prevBtn.addEventListener('click', () => {
                                if (currentSlide > 0) {
                                    currentSlide--;
                                    updateCarousel();
                                }
                            });
                        }
                        if (nextBtn) {
                            nextBtn.addEventListener('click', () => {
                                if (currentSlide < mediaData.length - 1) {
                                    currentSlide++;
                                    updateCarousel();
                                }
                            });
                        }
                        indicatorDots.forEach(dot => {
                            dot.addEventListener('click', (e) => {
                                currentSlide = parseInt(e.target.dataset.slideTo);
                                updateCarousel();
                            });
                        });
                        updateCarousel(); // Initial setup
                    }
                }

                // Attach event listener if the delete button was rendered
                if (showDeleteButton) {
                    postElement.querySelector('.delete-post-btn').addEventListener('click', (e) => {
                        const postId = e.target.dataset.id;
                        // Pass the entire post object for deletion to get media URLs
                        showConfirmationModal('Are you sure you want to delete this post?', async () => {
                            await deletePost(postId, post.media || (post.mediaURL ? [{ mediaURL: post.mediaURL }] : []));
                        });
                    });
                }

                // Attach event listener for post comment button
                postElement.querySelector('.post-comment-btn').addEventListener('click', async (e) => {
                    const postId = e.currentTarget.dataset.postId;
                    const commentInput = e.currentTarget.closest('.post-comment-section').querySelector('.comment-input');
                    const commentText = commentInput.value; // Use .value for textarea
                    await addComment(postId, commentText);
                    commentInput.value = ''; // Clear input after posting
                });

                // Attach event listener for like button
                postElement.querySelector('.like-button').addEventListener('click', async (e) => {
                    const postId = e.currentTarget.dataset.postId;
                    await toggleLike(postId, postLikes);
                });
            });
        } else {
            postsContainer.innerHTML = '<p class=\"text-center text-neutral-500 mt-8\">No posts yet. Be the first to share!</p>';
        }
    });
};

// Load Stories (Instagram Circle Style)
const loadStories = () => {
    onValue(ref(db, 'stories'), (snapshot) => {
        console.log("Loading stories...");
        storiesContainer.innerHTML = ''; // Clear existing stories
        const stories = snapshot.val();
        console.log("Stories from Firebase (raw):", stories);
        
        const now = Date.now();
        const activeStoriesByUserName = {};
        if (stories) {
            Object.entries(stories).forEach(([key, story]) => {
                const storyUserName = story.userName || story.author || 'Unknown';
                const expiresAt = story.expiresAt;
                if (expiresAt && expiresAt > now) {
                    if (!activeStoriesByUserName[storyUserName]) {
                        activeStoriesByUserName[storyUserName] = [];
                    }
                    activeStoriesByUserName[storyUserName].push({ id: key, ...story, userName: storyUserName });
                }
            });
        }
        console.log("Active stories grouped by user (before currentUser removal):", activeStoriesByUserName);

        let anyStoryCircleRendered = false;
        let currentUserHasActiveStories = false;
        let currentUserStoriesForViewer = [];

        if (currentUser) {
            currentUserStoriesForViewer = activeStoriesByUserName[currentUser.name] || [];
            currentUserHasActiveStories = currentUserStoriesForViewer.length > 0;

            const yourStoryElement = document.createElement('div');
            yourStoryElement.classList.add('flex-shrink-0', 'flex', 'flex-col', 'items-center', 'w-20', 'cursor-pointer');
            
            // Determine border style for 'Your Story'
            const yourStoryBorderClass = currentUserHasActiveStories ? 'border-solid border-blue-500' : 'border-dashed border-neutral-500';

            yourStoryElement.innerHTML = `
                <div class=\"w-16 h-16 rounded-full bg-neutral-700 border-2 ${yourStoryBorderClass} flex items-center justify-center text-neutral-300 text-2xl font-bold\">${currentUserHasActiveStories ? (currentUser.name.charAt(0).toUpperCase()) : '+'}</div>
                <p class=\"text-xs text-neutral-400 mt-1 truncate w-full text-center\">Your Story</p>
            `;
            yourStoryElement.addEventListener('click', () => {
                if (currentUserHasActiveStories) {
                    openStoryViewer(currentUserStoriesForViewer, 0);
                } else {
                    contentTypeSelect.value = 'story';
                    // Manually trigger change to update multiple attribute
                    contentTypeSelect.dispatchEvent(new Event('change')); 
                    newPostStoryBtn.click();
                }
            });
            storiesContainer.appendChild(yourStoryElement);
            anyStoryCircleRendered = true;

            delete activeStoriesByUserName[currentUser.name]; 
        }

        Object.entries(activeStoriesByUserName).forEach(([userName, userStories]) => {
            const initial = userName.charAt(0).toUpperCase();

            // Determine if all of this user's stories have been seen by the currentUser
            const allStoriesSeen = currentUser && userStories.every(story => story.seenBy && story.seenBy[currentUser.id]);
            const storyBorderClass = allStoriesSeen ? 'story-seen-border' : 'bg-gradient-to-tr from-yellow-400 to-fuchsia-600 p-0.5';

            const storyElement = document.createElement('div');
            storyElement.classList.add('flex-shrink-0', 'flex', 'flex-col', 'items-center', 'w-20', 'cursor-pointer');
            storyElement.innerHTML = `
                <div class=\"w-16 h-16 rounded-full ${storyBorderClass} flex items-center justify-center\">
                    <div class=\"w-full h-full object-cover rounded-full border-2 border-neutral-900 bg-neutral-700 flex items-center justify-center text-white text-lg font-bold\">${initial}</div>
                </div>
                <p class=\"text-xs text-neutral-300 mt-1 truncate w-full text-center\">${userName}</p>
            `;
            storyElement.addEventListener('click', () => {
                openStoryViewer(userStories, 0);
            });
            storiesContainer.appendChild(storyElement);
            anyStoryCircleRendered = true;
            console.log(`Story circle appended for user: ${userName}`);
        });

        if (!anyStoryCircleRendered) {
            storiesContainer.innerHTML = '<p class=\"text-center text-neutral-500 mt-8\">No stories yet. Be the first to share!</p>';
        }
    });
};

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker: Registered'))
            .catch(err => console.log(`Service Worker: Error: ${err}`));
    });
}

// Show/Hide Screens
const showScreen = (screen) => {
    loadingScreen.classList.add('hidden');
    loginScreen.classList.add('hidden');
    appContainer.classList.add('hidden');
    screen.classList.remove('hidden');
};

// Handle Login
const loginUser = (username) => {
    currentUser = { id: username.toLowerCase(), name: username };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    userDisplay.textContent = `${currentUser.name}`;
    showScreen(appContainer);
    loadPosts();
    loadStories();
};

// Helper function to process and publish a single media item
const processAndPublishMedia = async (mediaFile, type) => {
    let mediaURL = '';
    let thumbnailBase64 = '';
    let mediaType = mediaFile.type; // Store original media type

    if (mediaFile) {
        if (mediaFile.type.startsWith('image/')) {
            console.log("Generating base64 thumbnail and compressing image...");
            thumbnailBase64 = await generateBase64Thumbnail(mediaFile);
            mediaFile = await compressImage(mediaFile, 1000, 0.7);
            console.log("Image compressed and thumbnail generated.");
        }

        const storageRef = sRef(storage, `${type}s/${Date.now()}_${mediaFile.name || 'file'}`);
        const snapshot = await uploadBytes(storageRef, mediaFile);
        mediaURL = await getDownloadURL(snapshot.ref);
    }

    return {
        mediaURL: mediaURL,
        thumbnailBase64: thumbnailBase64,
        mediaType: mediaType, // Include mediaType in the returned object
    };
};


// Check for existing login and initialize toast elements
document.addEventListener('DOMContentLoaded', () => {
    // Initialize ALL DOM elements here to ensure they are available
    loadingScreen = document.getElementById('loading-screen');
    loginScreen = document.getElementById('login-screen');
    appContainer = document.getElementById('app-container');
    loginCharlieBtn = document.getElementById('login-charlie');
    loginKarlaBtn = document.getElementById('login-karla');
    userDisplay = document.getElementById('user-display');
    newPostStoryBtn = document.getElementById('new-post-story-btn');
    postStoryModal = document.getElementById('post-story-modal');
    cancelPostStoryBtn = document.getElementById('cancel-post-story');
    publishPostStoryBtn = document.getElementById('publish-post-story');
    contentTypeSelect = document.getElementById('content-type-select');
    mediaUpload = document.getElementById('media-upload');
    postCaption = document.getElementById('post-caption');
    postsContainer = document.getElementById('posts-container');
    storiesContainer = document.getElementById('stories-container');
    publishLoadingSpinner = document.getElementById('publish-loading-spinner');

    // Story Viewer DOM Elements
    storyViewerModal = document.getElementById('story-viewer-modal');
    storyViewerAvatar = document.getElementById('story-viewer-avatar');
    storyViewerUsername = document.getElementById('story-viewer-username');
    storyViewerMediaImage = document.getElementById('story-viewer-media-image');
    storyViewerMediaVideo = document.getElementById('story-viewer-media-video');
    closeStoryViewerBtn = document.getElementById('close-story-viewer');
    storyViewerPrevBtn = document.getElementById('story-viewer-prev-btn');
    storyViewerNextBtn = document.getElementById('story-viewer-next-btn');
    deleteStoryViewerBtn = document.getElementById('delete-story-viewer-btn');
    storyProgressBarContainer = document.getElementById('story-progress-container');
    storyViewerSeenBy = document.getElementById('story-viewer-seen-by'); // Initialize new DOM element

    // Custom Confirmation Modal DOM Elements
    confirmationModal = document.getElementById('confirmation-modal');
    confirmationMessage = document.getElementById('confirmation-message');
    cancelConfirmationBtn = document.getElementById('cancel-confirmation-btn');
    confirmDeletionBtn = document.getElementById('confirm-deletion-btn');

    // Toast Notification DOM elements
    toastNotification = document.getElementById('toast-notification');
    toastMessage = document.getElementById('toast-message');

    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        userDisplay.textContent = `${currentUser.name}`;
        showScreen(appContainer);
        loadPosts();
        loadStories();
    } else {
        showScreen(loginScreen);
    }

    // Event Listeners for Login
    loginCharlieBtn.addEventListener('click', () => loginUser('Charlie'));
    loginKarlaBtn.addEventListener('click', () => loginUser('Karla'));

    // Show New Post/Story Modal
    newPostStoryBtn.addEventListener('click', () => {
        postStoryModal.classList.remove('hidden');
        // Set initial state of mediaUpload multiple attribute
        if (contentTypeSelect.value === 'post') {
            mediaUpload.setAttribute('multiple', 'multiple');
        } else {
            mediaUpload.removeAttribute('multiple');
        }
    });

    // Handle content type selection change
    contentTypeSelect.addEventListener('change', () => {
        if (contentTypeSelect.value === 'post') {
            mediaUpload.setAttribute('multiple', 'multiple');
        } else {
            mediaUpload.removeAttribute('multiple');
        }
        // Clear selected files when changing type, to avoid issues
        mediaUpload.value = '';
    });

    // Hide New Post/Story Modal
    cancelPostStoryBtn.addEventListener('click', () => {
        postStoryModal.classList.add('hidden');
        mediaUpload.value = '';
        postCaption.value = '';
        contentTypeSelect.value = 'post'; // Reset to post by default
        mediaUpload.setAttribute('multiple', 'multiple'); // Ensure post allows multiple

        // Ensure spinner is hidden and button is re-enabled if modal is cancelled
        publishLoadingSpinner.classList.add('hidden');
        publishPostStoryBtn.disabled = false;
    });

    // Publish Post or Story
    publishPostStoryBtn.addEventListener('click', async () => {
        const type = contentTypeSelect.value;
        const caption = postCaption.value;
        const mediaFiles = mediaUpload.files;

        if (!currentUser) {
            showToast('Please log in to publish content.', 'error');
            return;
        }

        // Show loading spinner and disable button
        publishLoadingSpinner.classList.remove('hidden');
        publishPostStoryBtn.disabled = true;

        try {
            if (type === 'post') {
                if (mediaFiles.length > 0) {
                    const mediaArray = [];
                    for (let i = 0; i < mediaFiles.length; i++) {
                        if (mediaFiles[i].type.startsWith('image/') || mediaFiles[i].type.startsWith('video/')) {
                            const mediaInfo = await processAndPublishMedia(mediaFiles[i], type);
                            mediaArray.push(mediaInfo);
                        } else {
                            showToast(`Skipping unsupported file type: ${mediaFiles[i].name}`, 'info');
                        }
                    }
                    if (mediaArray.length === 0 && !caption) {
                        showToast('Please provide a caption or at least one supported media file for your post.', 'error');
                        return;
                    }
                    const newContent = {
                        author: currentUser.name,
                        caption: caption,
                        timestamp: Date.now(),
                        media: mediaArray, // Store all media info in an array
                        likes: {}, // Initialize likes as an empty object
                    };
                    console.log("Publishing new multi-media post:", newContent);
                    await push(ref(db, 'posts'), newContent);
                    showToast(`<strong>Uploaded ${mediaArray.length} items to your post!</strong>`, 'success');
                } else if (caption) {
                    // Text-only post
                    const newContent = {
                        author: currentUser.name,
                        caption: caption,
                        timestamp: Date.now(),
                        likes: {}, // Initialize likes as an empty object
                    };
                    console.log("Publishing new text-only post:", newContent);
                    await push(ref(db, 'posts'), newContent);
                    showToast('<strong>Uploaded text post!</strong>', 'success');
                } else {
                    showToast('Please provide a caption or at least one media file for your post.', 'error');
                    return; // Exit if no media and no caption for a post
                }
            } else if (type === 'story') {
                if (mediaFiles.length === 0) {
                    showToast('Stories require a media file.', 'error');
                    return;
                }
                if (mediaFiles.length > 1) {
                    showToast('Stories can only have one media file. Using the first selected file.', 'info');
                    // Continue with only the first file
                }
                const mediaInfo = await processAndPublishMedia(mediaFiles[0], type);
                const newContent = {
                    userName: currentUser.name,
                    userId: currentUser.id,
                    expiresAt: Date.now() + 86400000, // Stories expire after 24 hours
                    mediaURL: mediaInfo.mediaURL,
                    thumbnailBase64: mediaInfo.thumbnailBase64,
                    mediaType: mediaInfo.mediaType, // Store media type for stories too
                    seenBy: {}, // Initialize seenBy as an empty object
                };
                console.log("Publishing new story:", newContent);
                await push(ref(db, 'stories'), newContent);
                showToast('<strong>Uploaded story!</strong>', 'success');
            }
            cancelPostStoryBtn.click(); // Close modal on success
        } catch (error) {
            console.error('Error publishing content:', error);
            showToast('Failed to publish content. See console for details.', 'error');
        } finally {
            publishLoadingSpinner.classList.add('hidden');
            publishPostStoryBtn.disabled = false;
        }
    });

    // Close the story viewer modal
    closeStoryViewerBtn.addEventListener('click', closeStoryViewer);

    // Navigate to the previous story
    storyViewerPrevBtn.addEventListener('click', () => {
        if (currentStoryIndex > 0) {
            loadStoryContent(currentStoryIndex - 1);
        }
    });

    // Navigate to the next story
    storyViewerNextBtn.addEventListener('click', () => {
        if (currentStoryIndex < currentStories.length - 1) {
            loadStoryContent(currentStoryIndex + 1);
        }
    });
});

// Delete Post
const deletePost = async (postId, mediaData) => {
    try {
        await remove(ref(db, `posts/${postId}`));
        // mediaData can be a single URL string or an array of objects
        const filesToDelete = Array.isArray(mediaData) ? mediaData.map(m => m.mediaURL) : (mediaData ? [mediaData] : []);

        for (const url of filesToDelete) {
            if (url) {
                const fileRef = sRef(storage, url);
                await deleteObject(fileRef);
            }
        }
        showToast('Post deleted successfully!', 'success');
    } catch (error) {
        console.error('Error deleting post:', error);
        showToast('Failed to delete post. See console for details.', 'error');
    }
};

// Delete Story (from a dedicated story view, not inline)
const deleteStory = async (storyId, mediaURL) => {
    try {
        // Before deleting, stop current progress bar and remove its listener
        if (progressBarTimeout) {
            clearTimeout(progressBarTimeout);
            progressBarTimeout = null;
        }
        await remove(ref(db, `stories/${storyId}`));
        if (mediaURL) {
            const fileRef = sRef(storage, mediaURL);
            await deleteObject(fileRef);
        }

        // Remove the deleted story from the currentStories array
        const deletedIndex = currentStories.findIndex(story => story.id === storyId);
        if (deletedIndex > -1) {
            currentStories.splice(deletedIndex, 1);
        }
        // If there are no more stories, close the viewer
        if (currentStories.length === 0) {
            closeStoryViewer();
            showToast('Story deleted and no more stories to show.', 'success');
        } else {
            // Adjust currentStoryIndex if the deleted story was the last one
            if (currentStoryIndex >= currentStories.length) {
                currentStoryIndex = currentStories.length - 1; // Go to the new last story
            }
            showToast('Story deleted successfully!', 'success');
            // Re-render progress bars and load the current story (which might be the previous one)
            openStoryViewer(currentStories, currentStoryIndex);
        }
    } catch (error) {
        console.error('Error deleting story:', error);
        showToast('Failed to delete story. See console for details.', 'error');
    }
};
