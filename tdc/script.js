import { LTO_TDC_QUESTIONS } from "./questions.js";

// --- Configuration ---
const QUIZ_SET_SIZE = 20; // Only review 20 questions at a time to reduce lag and increase focus
const PASSING_SCORE_PERCENTAGE = 75; // LTO passing score (45/60 or 75%)

// --- Global State Variables ---
let currentQuestions = [];
let currentQuestionIndex = 0;
let correctCount = 0;
let isAnswerLocked = false;

// --- DOM Elements ---
const quizContainer = document.getElementById("quiz-container");
const correctCountDisplay = document.getElementById("correct-count");
const totalCountDisplay = document.getElementById("total-count");
const progressBarDiv = document.querySelector("#progress-bar div");
const resultsScreen = document.getElementById("results-screen");
const finalScoreDisplay = document.getElementById("final-score");
const passingStatusDisplay = document.getElementById("passing-status");
const restartButton = document.getElementById("restart-button");
const loadingMessage = document.getElementById("loading-message");
const nextButton = document.getElementById("next-button");
const resultsTitle = document.getElementById("results-title");

/**
 * Shuffles an array (Fisher-Yates algorithm).
 * @param {Array} array
 * @returns {Array} Shuffled array.
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Initializes the quiz: shuffles questions, resets score, and loads the first card.
 */
function startQuiz() {
  if (!LTO_TDC_QUESTIONS || LTO_TDC_QUESTIONS.length === 0) {
    loadingMessage.textContent =
      "Error: Question data not loaded. Please check questions.js.";
    return;
  }

  // Shuffle the entire pool, then take only the first QUIZ_SET_SIZE questions
  const shuffledPool = shuffleArray([...LTO_TDC_QUESTIONS]);
  currentQuestions = shuffledPool.slice(0, QUIZ_SET_SIZE);

  // Reset state
  currentQuestionIndex = 0;
  correctCount = 0;

  // Update header
  totalCountDisplay.textContent = currentQuestions.length;
  resultsScreen.classList.add("hidden");
  quizContainer.classList.remove("hidden");
  nextButton.classList.add("hidden");

  // Start with the first question
  loadQuestionCard(currentQuestions[currentQuestionIndex], "card-entering");
  updateScoreDisplay();
}

/**
 * Renders the question and options into a new card element.
 * @param {Object} question The question object to render.
 * @param {string} animationClass The CSS class for the entry animation.
 */
function loadQuestionCard(question, animationClass) {
  isAnswerLocked = false;

  const card = document.createElement("div");
  // Ensure the card has the 'quiz-card' class with dynamic animation
  card.className = `quiz-card shadow-2xl ${animationClass}`;
  card.setAttribute("data-index", currentQuestionIndex);

  const shuffledOptions = shuffleArray([...question.options]);

  // Simple markdown-like replacement for **bold** text in the question
  const questionTextFormatted = question.q.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  card.innerHTML = `
        <p class="text-sm text-gray-400 mb-2 font-medium">Question ${
          currentQuestionIndex + 1
        } of ${currentQuestions.length} | Topic: ${question.topic}</p>
        <h2 class="text-2xl font-bold mb-6">${questionTextFormatted}</h2>
        <div id="options-container" class="space-y-3">
            ${shuffledOptions
              .map(
                (option, i) => `
                <button class="option-button w-full text-left p-3 flex items-center justify-between" data-value="${option}">
                    <span class="flex-grow">
                        <span class="font-extrabold mr-2">${String.fromCharCode(
                          65 + i
                        )}.</span> ${option}
                    </span>
                    <span class="checkmark-icon"></span>
                </button>
            `
              )
              .join("")}
        </div>
    `;

  // Empty container and add new card
  quizContainer.innerHTML = "";
  quizContainer.appendChild(card);

  // Attach click listeners to new option buttons
  const optionButtons = card.querySelectorAll(".option-button");
  optionButtons.forEach((button) => {
    button.addEventListener("click", handleAnswerClick);
  });

  // Clear loading message once loaded
  loadingMessage.classList.add("hidden");
}

/**
 * Handles a user's answer selection, provides feedback, and reveals the 'Next' button.
 * @param {Event} event The click event.
 */
function handleAnswerClick(event) {
  if (isAnswerLocked) return;
  isAnswerLocked = true;

  const selectedButton = event.currentTarget;
  const selectedAnswer = selectedButton.getAttribute("data-value");
  const currentQuestion = currentQuestions[currentQuestionIndex];
  const isCorrect = selectedAnswer === currentQuestion.a;

  // Apply immediate visual feedback to all buttons
  document.querySelectorAll(".option-button").forEach((button) => {
    button.classList.add("disabled"); // Disable all buttons

    const iconSpan = button.querySelector(".checkmark-icon");

    if (button.getAttribute("data-value") === currentQuestion.a) {
      // This is the correct answer
      if (selectedButton === button) {
        // User answered correctly: Apply correct state and checkmark
        button.classList.add("correct");
        iconSpan.textContent = "✅";
      } else {
        // User answered incorrectly: Highlight the correct one
        button.classList.add("correct-answer-highlight");
        iconSpan.textContent = "✅";
      }
    } else if (selectedButton === button) {
      // User answered incorrectly: Apply incorrect state and X mark
      button.classList.add("incorrect");
      iconSpan.textContent = "❌";
    }
  });

  if (isCorrect) {
    correctCount++;
  }

  updateScoreDisplay(true); // Update progress bar to include this question

  // Show the Next button immediately for review
  nextButton.classList.remove("hidden");
}

/**
 * Transitions to the next question or the results screen.
 */
function nextQuestion() {
  // Hide the next button
  nextButton.classList.add("hidden");

  const currentCard = quizContainer.querySelector(".quiz-card");

  if (currentCard) {
    // Apply the exit animation immediately
    currentCard.classList.add("card-leaving");

    // Wait for the animation duration (0.3s) before removing the card and loading the next one
    setTimeout(() => {
      currentQuestionIndex++;
      currentCard.remove(); // Clean up old card

      if (currentQuestionIndex < currentQuestions.length) {
        // Load next question, which starts the 'card-entering' animation
        loadQuestionCard(
          currentQuestions[currentQuestionIndex],
          "card-entering"
        );
      } else {
        showResults();
      }
    }, 300); // <-- This is the updated, faster transition time
  }
}

/**
 * Updates the score count and the progress bar.
 * @param {boolean} countCurrent If true, counts the current question as answered for progress bar.
 */
function updateScoreDisplay(countCurrent = false) {
  correctCountDisplay.textContent = correctCount;

  const questionsAnswered = currentQuestionIndex + (countCurrent ? 1 : 0);

  const progress =
    currentQuestions.length > 0
      ? (questionsAnswered / currentQuestions.length) * 100
      : 0;

  progressBarDiv.style.width = `${progress}%`;
}

/**
 * Displays the final results screen.
 */
function showResults() {
  quizContainer.classList.add("hidden");
  resultsScreen.classList.remove("hidden");

  const totalQuestions = currentQuestions.length;
  const finalScore = correctCount;
  const scorePercentage = (finalScore / totalQuestions) * 100;

  finalScoreDisplay.textContent = `${finalScore} / ${totalQuestions}`;

  // LTO passing score for NPDL is 45/60 or 75%
  if (scorePercentage >= PASSING_SCORE_PERCENTAGE) {
    resultsTitle.textContent = "CONGRATULATIONS!";
    resultsTitle.classList.add("text-correct-green");
    resultsTitle.classList.remove("text-incorrect-red");
    passingStatusDisplay.textContent = `Pumasa ka! (PASSED: ${scorePercentage.toFixed(
      1
    )}%) 🎉 Get ready for the LTO!`;
  } else {
    resultsTitle.textContent = "Review Needed!";
    resultsTitle.classList.add("text-incorrect-red");
    resultsTitle.classList.remove("text-correct-green");
    passingStatusDisplay.textContent = `Sayang! Practice pa (FAILED: ${scorePercentage.toFixed(
      1
    )}%) 😥 Don't give up!`;
  }

  // Ensure status text color matches title color
  if (scorePercentage >= PASSING_SCORE_PERCENTAGE) {
    passingStatusDisplay.classList.add("text-correct-green");
    passingStatusDisplay.classList.remove("text-incorrect-red");
  } else {
    passingStatusDisplay.classList.add("text-incorrect-red");
    passingStatusDisplay.classList.remove("text-correct-green");
  }
}

// --- Event Listeners and Initial Load ---
restartButton.addEventListener("click", startQuiz);
nextButton.addEventListener("click", nextQuestion);

// Initial call to start the quiz logic
document.addEventListener("DOMContentLoaded", () => {
  // Hide the results screen on initial load
  resultsScreen.classList.add("hidden");
  // Load the first question
  startQuiz();
});

// Expose the necessary function for future expansion
window.handleAnswerClick = handleAnswerClick;
