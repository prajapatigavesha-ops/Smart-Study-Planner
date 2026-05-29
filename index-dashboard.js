/**
 * Smart Study Planner - Homepage AI Study Dashboard Controller
 */

// --- Authentication & Context Setup ---
const token = localStorage.getItem('token');
const isAuthenticated = !!token;

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Global elements
const localBanner = document.getElementById('localBanner');
const navAuthLinks = document.getElementById('navAuthLinks');

// Mock database of tailored Feynman critiques
const critiqueDatabase = {
    "biology": {
        jargon: "Thylakoid, photophosphorylation, Calvin Cycle. Try swapping these for 'solar collectors' or 'sugar production assembly line'.",
        gaps: "Explain clearly *where* the water and carbon dioxide enter the leaf structure, and why oxygen is released as a byproduct.",
        analogy: "Think of a leaf as a tiny solar-powered kitchen: sunlight is the power stove, water and CO2 are ingredients, and glucose is the freshly baked cake."
    },
    "history": {
        jargon: "Estates-General, Bourgeoisie, Reign of Terror. Try describing these as 'the king's assembly' or 'middle-class merchants'.",
        gaps: "Clarify the immediate economic trigger factors—such as the bread shortage and national debt—that pushed citizens to action.",
        analogy: "Imagine three roommates where two of them eat all the food and throw parties, but force the third roommate to pay 100% of the rent."
    },
    "default": {
        jargon: "Detected technical abbreviations and academic terminology. Try substituting them with everyday, colloquial descriptions.",
        gaps: "Missing the fundamental 'Why' and 'How' explanations. Expand on the causal triggers and basic mechanics of this concept.",
        analogy: "Explain it like a bicycle: one cog turns the chain, which rotates the wheel. Define which parts act as the driver, chain, and wheel."
    }
};

// State Variables
let sessionsCompleted = 0;
let totalStudyTime = 0; // in seconds
let timerMode = 'study';
let timeLeft = 1500; // 25 min default
let timerInterval = null;
let activeFeynmanTopic = null;
let currentView = 'home';

document.addEventListener("DOMContentLoaded", async () => {
    setupAuthNavbar();
    await loadTimerStats();
    generateStreakTracker();
    renderSpacedRepetition();
    setupTextareaListener();
    
    // Default to home view
    switchView('home');
});

// --- SPA View Switch Controller ---
function switchView(viewName) {
    currentView = viewName;
    const homeView = document.getElementById("homeView");
    const dashboardView = document.getElementById("dashboardView");
    
    if (viewName === 'home') {
        if (homeView) homeView.style.display = "block";
        if (dashboardView) dashboardView.style.display = "none";
    } else if (viewName === 'dashboard') {
        if (homeView) homeView.style.display = "none";
        if (dashboardView) dashboardView.style.display = "block";
        // Refresh grids and timelines
        renderSpacedRepetition();
        generateStreakTracker();
    }
}
window.switchView = switchView;

// --- Auth navbar and local banner setup ---
function setupAuthNavbar() {
    if (isAuthenticated) {
        if (localBanner) localBanner.style.display = 'none';
        
        // Show Logout and Dashboard button instead of Login/Signup
        if (navAuthLinks) {
            navAuthLinks.innerHTML = `
                <button onclick="switchView('home')" id="homeNavBtn" style="padding: 8px 16px; cursor: pointer; background:transparent; border:none; color: var(--text-secondary); font-size: 0.85rem; font-family: var(--font-body); font-weight: 600; margin-right: 5px;">Home</button>
                <a href="dashboard.html" style="text-decoration: none; margin-right: 10px;"><button class="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground hover:scale-[1.03]" style="cursor:pointer; border-radius: 50px; font-family: var(--font-body); font-weight: 600;">Dashboard</button></a>
                <button onclick="logout()" id="logoutBtn" style="background:transparent; color:var(--danger-color); border:1px solid var(--danger-color); padding: 8px 16px; cursor:pointer; border-radius:50px; font-family: var(--font-body); font-weight: 600; font-size: 0.85rem;">Log Out</button>
            `;
        }
    } else {
        if (localBanner) localBanner.style.display = 'flex';
    }
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}
window.logout = logout;

// --- Load Pomodoro Study Stats ---
async function loadTimerStats() {
    if (isAuthenticated) {
        try {
            const res = await fetch('/api/stats', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                sessionsCompleted = data.sessionsCompleted || 0;
                totalStudyTime = data.totalStudyTime || 0;
            }
        } catch (err) {
            console.error("Failed to load cloud stats, falling back to local:", err);
            loadLocalStats();
        }
    } else {
        loadLocalStats();
    }
    updateTimerStatsDisplay();
}

function loadLocalStats() {
    sessionsCompleted = parseInt(localStorage.getItem('sessionsCompleted')) || 0;
    totalStudyTime = parseInt(localStorage.getItem('totalStudyTime')) || 0;
}

async function saveTimerStats() {
    if (isAuthenticated) {
        try {
            await fetch('/api/stats', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ totalStudyTime, sessionsCompleted })
            });
        } catch (err) {
            console.error("Failed to save stats to server:", err);
        }
    } else {
        localStorage.setItem('sessionsCompleted', sessionsCompleted.toString());
        localStorage.setItem('totalStudyTime', totalStudyTime.toString());
    }
}

// --- Pomodoro Timer Functions ---
function updateTimerStatsDisplay() {
    const sessionCountEl = document.getElementById("sessionCount");
    const totalTimeEl = document.getElementById("totalStudyTimeStr");
    if (sessionCountEl) sessionCountEl.innerText = sessionsCompleted;
    if (totalTimeEl) {
        const mins = Math.floor(totalStudyTime / 60);
        totalTimeEl.innerText = `${mins}m`;
    }
    const modeEl = document.getElementById("timerMode");
    if (modeEl) {
        modeEl.innerText = timerMode === 'study' ? "Study Mode" : "Break Mode";
        modeEl.style.color = timerMode === 'study' ? "var(--accent-indigo)" : "var(--accent-mint)";
    }
}

function playAlarm() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 1);
        oscillator.stop(audioCtx.currentTime + 1);
    } catch (e) {
        console.error(e);
    }
}

function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
        if (timeLeft <= 0) {
            playAlarm();
            clearInterval(timerInterval);
            timerInterval = null;
            
            if (timerMode === 'study') {
                sessionsCompleted++;
                saveTimerStats();
                alert("Study session complete! Take a 5-minute break.");
                timerMode = 'break';
                timeLeft = 300; // 5 mins
            } else {
                alert("Break finished! Get ready to study.");
                timerMode = 'study';
                timeLeft = 1500; // 25 mins
            }
            updateTimerStatsDisplay();
            generateStreakTracker();
            updateTimerDisplay();
            return;
        }
        
        timeLeft--;
        if (timerMode === 'study') {
            totalStudyTime++;
            if (totalStudyTime % 60 === 0) {
                saveTimerStats();
                updateTimerStatsDisplay();
            }
        }
        updateTimerDisplay();
    }, 1000);
}

// Global binds
window.startTimer = startTimer;

function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    saveTimerStats();
}
window.pauseTimer = pauseTimer;

function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerMode = 'study';
    timeLeft = 1500;
    saveTimerStats();
    updateTimerStatsDisplay();
    updateTimerDisplay();
}
window.resetTimer = resetTimer;

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeEl = document.getElementById("time");
    if (timeEl) {
        timeEl.innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
}

// --- Study Streak Tracker Heatmap ---
function generateStreakTracker() {
    const matrix = document.getElementById("heatmapMatrix");
    if (!matrix) return;
    matrix.innerHTML = "";
    
    // Seed with 34 days of past study levels
    const pastLevels = [
        0, 1, 2, 0, 3, 2, 1,
        0, 0, 1, 2, 3, 0, 1,
        2, 1, 0, 2, 3, 2, 1,
        0, 1, 1, 2, 0, 3, 2,
        1, 2, 0, 3, 3, 2
    ];
    
    let todayLevel = 0;
    if (sessionsCompleted >= 3) todayLevel = 3;
    else if (sessionsCompleted === 2) todayLevel = 2;
    else if (sessionsCompleted === 1) todayLevel = 1;
    
    const levels = [...pastLevels, todayLevel];
    
    levels.forEach((level, idx) => {
        const cell = document.createElement("div");
        const isToday = idx === levels.length - 1;
        
        cell.className = `heatmap-cell streak-level-${level} ${isToday ? 'today-cell' : ''}`;
        cell.style.width = "12px";
        cell.style.height = "12px";
        cell.style.borderRadius = "2px";
        
        // Colors matching zinc theme
        let bg = "rgba(255,255,255,0.05)";
        if (level === 1) bg = "rgba(99, 102, 241, 0.3)";
        else if (level === 2) bg = "rgba(99, 102, 241, 0.6)";
        else if (level === 3) bg = "rgba(99, 102, 241, 1)";
        cell.style.background = bg;
        
        const dayLabel = isToday ? "Today" : `Day -${levels.length - 1 - idx}`;
        const mins = level === 3 ? "75+ mins" : level === 2 ? "50 mins" : level === 1 ? "25 mins" : "0 mins";
        cell.setAttribute("title", `${dayLabel}: Study level ${level} (${mins})`);
        
        matrix.appendChild(cell);
    });
}

// --- Spaced Repetition Simulator Rendering ---
function renderSpacedRepetition() {
    // 1. Render Topics List
    const topicsList = document.getElementById("srTopicsList");
    if (topicsList) {
        topicsList.innerHTML = "";
        
        if (window.studyTopics.length === 0) {
            topicsList.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding: 20px; font-style:italic; font-size:0.85rem;">No topics scheduled yet. Add one above!</div>`;
        } else {
            window.studyTopics.forEach(topic => {
                const card = document.createElement("div");
                card.className = `topic-mastery-row ${topic.mastered ? 'mastered' : ''}`;
                card.style.display = "flex";
                card.style.justifyContent = "space-between";
                card.style.alignItems = "center";
                card.style.background = "var(--glass-bg)";
                card.style.border = "1px solid var(--glass-border)";
                card.style.borderRadius = "12px";
                card.style.padding = "10px 15px";
                
                card.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:2px; text-align:left;">
                        <span class="step-badge" style="background:rgba(99,102,241,0.1); color:var(--accent-indigo); font-size:0.6rem; padding: 1px 6px; border-radius:4px; font-weight:800; width:fit-content;">
                            ${topic.grade}
                        </span>
                        <strong class="topic-name-label" style="font-size:0.95rem; margin-top:2px;">${topic.subject}</strong>
                        <span style="font-size:0.8rem; color:var(--text-secondary);">${topic.topic}</span>
                    </div>
                    <div>
                        ${topic.mastered 
                          ? `<span style="color:var(--accent-mint); font-weight:800; font-size:0.8rem;">Mastered ✓</span>`
                          : `<button class="btn-master" onclick="window.markTopicAsMastered('${topic.id}')" style="padding: 6px 12px; font-size: 0.75rem; border-radius:15px; border: 1px solid var(--accent-indigo);">Master</button>`
                        }
                    </div>
                `;
                topicsList.appendChild(card);
            });
        }
    }
    
    // 2. Render Spaced Timeline
    const reviewsList = document.getElementById("srReviewsList");
    if (reviewsList) {
        reviewsList.innerHTML = "";
        
        if (window.calendarStore.length === 0) {
            reviewsList.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding: 30px 20px; font-style:italic; font-size:0.9rem; border:1px dashed var(--glass-border); border-radius:16px;">No upcoming reviews. Click Master next to a topic to generate a spaced review schedule!</div>`;
        } else {
            const sortedEvents = [...window.calendarStore].sort((a, b) => {
                return new Date(a.startDateTime) - new Date(b.startDateTime);
            });
            
            sortedEvents.forEach(evt => {
                const dateObj = new Date(evt.startDateTime);
                const formattedDate = dateObj.toLocaleDateString(undefined, { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                }) + ` at 9:00 AM`;
                
                // Get topic attributes
                const associatedTopic = window.studyTopics.find(t => t.id === evt.topicId);
                const gradeText = associatedTopic ? associatedTopic.grade : "General";
                
                const card = document.createElement("div");
                card.className = "review-schedule-card animate-fade-in-up stagger-1";
                card.style.display = "flex";
                card.style.justifyContent = "space-between";
                card.style.alignItems = "center";
                card.style.padding = "14px 18px";
                card.style.margin = "0 0 12px 0";
                card.style.background = "var(--glass-bg)";
                card.style.border = "1px solid var(--glass-border)";
                card.style.borderRadius = "16px";
                
                card.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="step-badge" style="background:rgba(99,102,241,0.1); color:var(--accent-indigo); font-size:0.65rem; padding: 2px 6px; border-radius:4px; font-weight:800;">
                                ${gradeText}
                            </span>
                            <span class="step-badge step-badge-${evt.intervalStep}" style="font-size:0.65rem; padding: 2px 6px; border-radius:4px; font-weight:800;">
                                Step ${evt.intervalStep}
                            </span>
                        </div>
                        <span class="review-card-title" style="font-size:0.95rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${evt.title}</span>
                        <span class="review-card-date" style="font-size:0.8rem; color:var(--text-secondary);">📅 ${formattedDate}</span>
                    </div>
                    <div>
                        ${evt.status === 'completed'
                          ? `<span style="color:var(--accent-mint); font-weight:800; font-size:0.82rem;">Reviewed ✓</span>`
                          : `<button class="btn-master-outline" onclick="openFeynmanModal('${evt.topicId}')" style="padding: 6px 12px; font-size: 0.75rem; border-radius:15px;">🎓 Practice Feynman Mode</button>`
                        }
                    </div>
                `;
                reviewsList.appendChild(card);
            });
        }
    }
}

// Hook renderSpacedRepetition to global so spaced-repetition.js calls it on update
window.renderSpacedRepetition = renderSpacedRepetition;

// --- Form submission handler ---
function handleSRAddTopic(e) {
    e.preventDefault();
    const subjectInput = document.getElementById("srSubject");
    const topicInput = document.getElementById("srTopic");
    const gradeInput = document.getElementById("srGrade");
    
    if (!subjectInput || !topicInput || !gradeInput) return;
    
    const subject = subjectInput.value.trim();
    const topic = topicInput.value.trim();
    const grade = gradeInput.value.trim();
    
    if (!subject || !topic || !grade) return;
    
    window.addNewTopic(subject, topic, grade);
    
    // Reset form fields
    subjectInput.value = "";
    topicInput.value = "";
    gradeInput.value = "";
}
window.handleSRAddTopic = handleSRAddTopic;


// --- Fullscreen Feynman Technique Focus Modal Logic ---
function openFeynmanModal(topicId) {
    activeFeynmanTopic = window.studyTopics.find(t => t.id === topicId);
    if (!activeFeynmanTopic) return;
    
    // Render metadata badge
    const activeInfo = document.getElementById("activeTopicInfo");
    if (activeInfo) {
        activeInfo.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <span class="step-badge" style="background:rgba(99,102,241,0.15); color:var(--accent-indigo); border:1px solid rgba(99,102,241,0.25); font-size:0.75rem; padding: 2px 8px; border-radius:6px; font-weight:800;">
                    ${activeFeynmanTopic.grade}
                </span>
                <h2 style="margin: 0; font-size: 1.25rem; font-weight: 800;">${activeFeynmanTopic.subject}</h2>
            </div>
            <p style="margin: 4px 0 0 0; color: var(--text-secondary); font-size: 0.9rem; font-weight: 600;">Chapter: ${activeFeynmanTopic.topic}</p>
        `;
    }
    
    // Reset modal form state
    const textarea = document.getElementById("explanationDraft");
    if (textarea) textarea.value = "";
    
    const countLabel = document.getElementById("wordCountLabel");
    if (countLabel) countLabel.innerText = "Words: 0 (Min 10 recommended)";
    
    document.getElementById("blankStateCard").style.display = "flex";
    document.getElementById("loadingStateCard").style.display = "none";
    document.getElementById("resultsStateCard").style.display = "none";
    
    // Show Modal Overlay
    const modal = document.getElementById("feynmanModal");
    if (modal) modal.style.display = "flex";
}

function closeFeynmanModal() {
    const modal = document.getElementById("feynmanModal");
    if (modal) modal.style.display = "none";
    activeFeynmanTopic = null;
}

window.openFeynmanModal = openFeynmanModal;
window.closeFeynmanModal = closeFeynmanModal;

// Monitor textarea words length
function setupTextareaListener() {
    const textarea = document.getElementById("explanationDraft");
    const countLabel = document.getElementById("wordCountLabel");
    if (!textarea || !countLabel) return;
    
    textarea.addEventListener("input", () => {
        const text = textarea.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        countLabel.innerText = `Words: ${words} ${words < 10 ? '(Min 10 recommended)' : ''}`;
    });
}

// Simulated AI Evaluate
function evaluateExplanation() {
    const textarea = document.getElementById("explanationDraft");
    if (!textarea) return;
    
    const text = textarea.value.trim();
    if (!text) {
        alert("Please write your explanation first!");
        return;
    }
    
    const words = text.split(/\s+/).length;
    if (words < 10) {
        alert("Your explanation is a bit too short (under 10 words). Let's expand on it a bit before evaluating!");
        return;
    }
    
    // Toggle loader
    document.getElementById("blankStateCard").style.display = "none";
    document.getElementById("resultsStateCard").style.display = "none";
    document.getElementById("loadingStateCard").style.display = "flex";
    
    // Simulate AI critique computation
    setTimeout(() => {
        document.getElementById("loadingStateCard").style.display = "none";
        
        let score = Math.floor(Math.random() * 15) + 70;
        if (words > 40) score += 10;
        if (words > 80) score += 5;
        score = Math.min(98, score);
        
        let key = "default";
        if (activeFeynmanTopic) {
            const sub = activeFeynmanTopic.subject.toLowerCase();
            const top = activeFeynmanTopic.topic.toLowerCase();
            if (sub.includes("biol") || top.includes("photo") || top.includes("cell")) {
                key = "biology";
            } else if (sub.includes("hist") || sub.includes("soc") || top.includes("revol")) {
                key = "history";
            }
        }
        
        const critique = critiqueDatabase[key];
        
        document.getElementById("jargonFeedback").innerText = critique.jargon;
        document.getElementById("gapFeedback").innerText = critique.gaps;
        document.getElementById("analogyFeedback").innerText = critique.analogy;
        
        document.getElementById("clarityScorePercent").innerText = score;
        const circle = document.getElementById("clarityScoreCircle");
        if (circle) {
            const circumference = 263.89;
            const offset = circumference - (score / 100) * circumference;
            circle.style.strokeDashoffset = offset;
        }
        
        document.getElementById("resultsStateCard").style.display = "flex";
    }, 1500);
}
window.evaluateExplanation = evaluateExplanation;

// Finalize mastery from feynman modal
function finalizeMastery() {
    if (!activeFeynmanTopic) return;
    
    // 1. Mark the topic itself as mastered
    window.markTopicAsMastered(activeFeynmanTopic.id);
    
    // 2. Mark corresponding events in the review timeline as completed
    window.calendarStore.forEach(evt => {
        if (evt.topicId === activeFeynmanTopic.id) {
            evt.status = 'completed';
        }
    });
    localStorage.setItem('calendarStore', JSON.stringify(window.calendarStore));
    
    // 3. Render lists and close modal
    renderSpacedRepetition();
    closeFeynmanModal();
    alert("Mastery finalized! Spaced review schedules updated.");
}
window.finalizeMastery = finalizeMastery;
