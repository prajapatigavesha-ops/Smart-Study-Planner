// --- Authentication Check ---
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = 'login.html';
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// --- App State ---
let topic = '';
let status = 'idle'; // 'idle' | 'loading' | 'playing' | 'finished'
let quizData = null;
let currentQuestionIndex = 0;
let selectedAnswerIndex = null;
let score = 0;
let showRationale = false;

// --- DOM References ---
const quizSetupView = document.getElementById('quizSetupView');
const quizLoadingView = document.getElementById('quizLoadingView');
const quizPlayView = document.getElementById('quizPlayView');
const quizFinishedView = document.getElementById('quizFinishedView');

const quizTopicInput = document.getElementById('quizTopicInput');
const quizLoadingText = document.getElementById('quizLoadingText');
const questionProgressText = document.getElementById('questionProgressText');
const quizTopicBadge = document.getElementById('quizTopicBadge');
const questionText = document.getElementById('questionText');
const answerOptionsContainer = document.getElementById('answerOptionsContainer');
const rationaleContainer = document.getElementById('rationaleContainer');
const rationaleText = document.getElementById('rationaleText');
const hintContainer = document.getElementById('hintContainer');
const hintText = document.getElementById('hintText');
const nextBtnText = document.getElementById('nextBtnText');

const scoreReportText = document.getElementById('scoreReportText');
const accuracyPercentText = document.getElementById('accuracyPercentText');
const summaryTopicText = document.getElementById('summaryTopicText');

// --- Render View Routing Engine ---
function renderQuizState() {
    // Hide all views by default
    quizSetupView.style.display = 'none';
    quizLoadingView.style.display = 'none';
    quizPlayView.style.display = 'none';
    quizFinishedView.style.display = 'none';

    if (status === 'idle') {
        quizSetupView.style.display = 'block';
    } else if (status === 'loading') {
        quizLoadingView.style.display = 'block';
        quizLoadingText.innerText = `Synthesizing concepts for "${topic}"`;
    } else if (status === 'playing' && quizData) {
        quizPlayView.style.display = 'flex';
        renderQuestion();
    } else if (status === 'finished' && quizData) {
        quizFinishedView.style.display = 'flex';
        renderFinishedSummary();
    }

    // Refresh Lucide Icons to inject SVGs for newly toggled sections
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// --- Generate Quiz API Action ---
async function handleGenerate(e) {
    if (e) e.preventDefault();
    topic = quizTopicInput.value.trim();
    if (!topic) return;

    status = 'loading';
    renderQuizState();

    try {
        const res = await fetch('/api/quiz/generate', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ topic })
        });
        
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
            return;
        }

        if (res.ok) {
            quizData = await res.json();
            score = 0;
            currentQuestionIndex = 0;
            selectedAnswerIndex = null;
            showRationale = false;
            status = 'playing';
        } else {
            const errData = await res.json();
            alert(errData.error || 'Failed to generate quiz.');
            status = 'idle';
        }
    } catch (err) {
        console.error(err);
        alert('Connection error. Could not connect to AI quiz server.');
        status = 'idle';
    }
    renderQuizState();
}

// --- Render Active Question Screen ---
function renderQuestion() {
    if (!quizData) return;
    const currentQuestion = quizData.questions[currentQuestionIndex];
    
    // Update labels
    questionProgressText.innerText = `Question ${currentQuestionIndex + 1} of ${quizData.questions.length}`;
    quizTopicBadge.innerText = `Topic: ${topic}`;
    questionText.innerText = currentQuestion.question;
    
    // Render Options List
    answerOptionsContainer.innerHTML = '';
    const showResult = selectedAnswerIndex !== null;

    currentQuestion.answerOptions.forEach((option, idx) => {
        const isSelected = selectedAnswerIndex === idx;
        const isCorrect = option.isCorrect;
        
        const optionBtn = document.createElement('button');
        optionBtn.style.width = '100%';
        optionBtn.style.textAlign = 'left';
        optionBtn.style.padding = '16px';
        optionBtn.style.borderRadius = '12px';
        optionBtn.style.border = '2px solid var(--glass-border)';
        optionBtn.style.background = 'rgba(255, 255, 255, 0.02)';
        optionBtn.style.color = 'var(--text-primary)';
        optionBtn.style.fontFamily = 'var(--font-primary)';
        optionBtn.style.fontWeight = '500';
        optionBtn.style.fontSize = '0.98rem';
        optionBtn.style.cursor = showResult ? 'default' : 'pointer';
        optionBtn.style.transition = 'all 0.2s ease';
        optionBtn.style.display = 'flex';
        optionBtn.style.alignItems = 'center';
        optionBtn.style.justifyContent = 'space-between';
        
        // Interactive hover styling if not answered yet
        if (!showResult) {
            optionBtn.onmouseover = () => {
                optionBtn.style.borderColor = 'var(--accent-indigo)';
                optionBtn.style.background = 'rgba(99, 102, 241, 0.05)';
            };
            optionBtn.onmouseout = () => {
                optionBtn.style.borderColor = 'var(--glass-border)';
                optionBtn.style.background = 'rgba(255, 255, 255, 0.02)';
            };
            optionBtn.onclick = () => handleAnswerSelect(idx);
        } else {
            // Stylings after option selection
            if (isCorrect) {
                // Correct option turns green
                optionBtn.style.background = 'rgba(16, 185, 129, 0.1)';
                optionBtn.style.borderColor = '#10b981';
                optionBtn.style.color = '#34d399';
                optionBtn.innerHTML = `<span>${option.text}</span> <i data-lucide="check-circle-2" class="w-5 h-5 text-accent-mint"></i>`;
            } else if (isSelected) {
                // Wrong option turns red
                optionBtn.style.background = 'rgba(239, 68, 68, 0.1)';
                optionBtn.style.borderColor = '#ef4444';
                optionBtn.style.color = '#f87171';
                optionBtn.innerHTML = `<span>${option.text}</span> <i data-lucide="x-circle" class="w-5 h-5 text-red-400"></i>`;
            } else {
                // Other options fade out slightly
                optionBtn.style.opacity = '0.35';
                optionBtn.style.border = '1px solid var(--glass-border)';
                optionBtn.innerHTML = `<span>${option.text}</span>`;
            }
        }
        
        if (!showResult) {
            optionBtn.innerHTML = `<span>${option.text}</span>`;
        }

        answerOptionsContainer.appendChild(optionBtn);
    });

    // Toggle Rationale Panel Display
    if (showRationale) {
        hintContainer.style.display = 'none';
        rationaleContainer.style.display = 'block';
        rationaleText.innerText = currentQuestion.answerOptions[selectedAnswerIndex].rationale;
        
        // Change button text if last question
        if (currentQuestionIndex === quizData.questions.length - 1) {
            nextBtnText.innerText = 'See Results';
        } else {
            nextBtnText.innerText = 'Next Question';
        }
    } else {
        hintContainer.style.display = 'block';
        hintText.innerText = `Hint: ${currentQuestion.hint || "Review your core syllabus logs."}`;
        rationaleContainer.style.display = 'none';
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// --- Option Click Handler ---
function handleAnswerSelect(index) {
    if (selectedAnswerIndex !== null) return;
    selectedAnswerIndex = index;
    showRationale = true;
    
    const currentQuestion = quizData.questions[currentQuestionIndex];
    if (currentQuestion.answerOptions[index].isCorrect) {
        score++;
    }
    
    renderQuestion();
}

// --- Next Question Handler ---
function handleNext() {
    if (!quizData) return;
    const nextIndex = currentQuestionIndex + 1;
    
    if (nextIndex < quizData.questions.length) {
        currentQuestionIndex = nextIndex;
        selectedAnswerIndex = null;
        showRationale = false;
        renderQuestion();
    } else {
        status = 'finished';
        renderQuizState();
    }
}

// --- Finished Summary View ---
function renderFinishedSummary() {
    if (!quizData) return;
    const accuracy = Math.round((score / quizData.questions.length) * 100);
    
    scoreReportText.innerText = `You scored ${score} out of ${quizData.questions.length}`;
    accuracyPercentText.innerText = `${accuracy}%`;
    summaryTopicText.innerText = topic;

    // Apply color styling to accuracy display based on performance
    if (accuracy >= 80) {
        accuracyPercentText.style.color = 'var(--accent-mint)';
    } else if (accuracy >= 50) {
        accuracyPercentText.style.color = '#fbbf24';
    } else {
        accuracyPercentText.style.color = '#f87171';
    }
}

// --- Reset Quiz Setup ---
function resetQuiz() {
    status = 'idle';
    topic = '';
    quizData = null;
    quizTopicInput.value = '';
    renderQuizState();
}

// --- App Bootstrap ---
document.addEventListener("DOMContentLoaded", () => {
    renderQuizState();
});

// Expose handlers to window for HTML click calls
window.handleGenerate = handleGenerate;
window.handleNext = handleNext;
window.resetQuiz = resetQuiz;
