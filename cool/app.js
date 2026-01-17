/**
 * Native JavaScript for Robust Transition Control (using transitionend)
 */

const transitionOverlay = document.getElementById('transition-overlay');
const screen1 = document.getElementById('screen-1');
const screen2 = document.getElementById('screen-2');
const nextScreenBtn = document.getElementById('next-screen-btn');
const backScreenBtn = document.getElementById('back-screen-btn');

// --- State Management ---
let isTransitioning = false;
let targetScreenId = '';
const COVERED_CONTENT_SWITCH_DELAY_MS = 200; // Small delay for loading indicator visibility

// Utility function to lock the buttons while transitioning
function setButtonsDisabled(disabled) {
    nextScreenBtn.disabled = disabled;
    backScreenBtn.disabled = disabled;
}

/**
 * Executes the content switch and initiates the wipe-out phase.
 * This runs only when the wipe-in animation is fully complete.
 */
function handleWipeInComplete() {
    // 1. CONTENT SWITCH: Occurs while the screen is fully covered.
    if (targetScreenId === 'screen-2') {
        screen1.classList.add('hidden');
        screen2.classList.remove('hidden');
    } else {
        screen2.classList.add('hidden');
        screen1.classList.remove('hidden');
    }

    // 2. START WIPE-OUT: Trigger the collapse to the Top-Left corner.
    transitionOverlay.classList.add('is-wiping-out');

    // We no longer need to listen for the wipe-in, so we remove this listener 
    // and let the single 'transitionend' listener in 'initTransition' handle the rest.
}

/**
 * Executes the cleanup and enables interaction after the wipe-out is complete.
 */
function handleWipeOutComplete() {
    // 1. CLEANUP: Reset the overlay state.
    transitionOverlay.classList.remove('is-active', 'is-wiping-out');
    
    // 2. STATE UNLOCK: Allow new transitions/clicks.
    isTransitioning = false;
    setButtonsDisabled(false);
}


/**
 * The main transition listener that controls the flow.
 * This function fires at the end of every CSS transition.
 */
function transitionEndListener(event) {
    // Only care about the 'clip-path' property transition
    if (event.propertyName !== 'clip-path') return;

    if (transitionOverlay.classList.contains('is-active') && !transitionOverlay.classList.contains('is-wiping-out')) {
        // The overlay is 'is-active' but NOT 'is-wiping-out' -> WIPE-IN IS COMPLETE
        // Add a small buffer delay for the loading animation to be fully visible
        setTimeout(handleWipeInComplete, COVERED_CONTENT_SWITCH_DELAY_MS);
        
    } else if (transitionOverlay.classList.contains('is-wiping-out')) {
        // The overlay is 'is-wiping-out' -> WIPE-OUT IS COMPLETE
        handleWipeOutComplete();
    }
}


/**
 * Initiates a new transition sequence.
 */
function initTransition(screenId) {
    if (isTransitioning) return; // Block spamming

    isTransitioning = true;
    setButtonsDisabled(true);
    targetScreenId = screenId;

    // --- STEP 0: Reset the overlay to the Bottom-Right start point instantly ---
    transitionOverlay.classList.add('is-resetting');
    
    // Use rAF to ensure the DOM sees the reset *before* applying the transition class
    window.requestAnimationFrame(() => {
        // Re-enable transition for the smooth wipe-in
        transitionOverlay.classList.remove('is-resetting'); 
        
        // 1. START WIPE-IN: It now animates smoothly from Bottom-Right to Full Screen.
        transitionOverlay.classList.add('is-active');
    });
}


// --- Event Listeners Initialization ---
transitionOverlay.addEventListener('transitionend', transitionEndListener);
nextScreenBtn.addEventListener('click', () => initTransition('screen-2'));
backScreenBtn.addEventListener('click', () => initTransition('screen-1'));

// Initial call to disable buttons while the very first screen loads (optional)
setButtonsDisabled(false);