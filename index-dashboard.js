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
    initializeStreakGrid();
    initializeChatTokens();
    await loadTimerStats();
    generateStreakTracker();
    renderSpacedRepetition();
    setupTextareaListener();
    cleanMascotBackgrounds();
    
    // Auto show speech bubble after 2 seconds for guest
    setTimeout(() => {
        const bubble = document.getElementById('speechBubble');
        const dialog = document.getElementById('chatDialog');
        if (bubble && dialog && dialog.style.display !== 'block' && !isAuthenticated) {
            bubble.style.display = 'block';
        }
    }, 2000);
    
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
        if (localBanner) {
            localBanner.style.display = 'flex';
            localBanner.innerHTML = `<span>☁️ Playing in Local Mode. Don't lose your streak—<a href="signup.html">Create an account</a> to save your grid permanently!</span>`;
        }
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
                
                // Update local streak grid immediately
                if (!isAuthenticated) {
                    const todayStr = getLocalDateString(new Date());
                    let grid = JSON.parse(localStorage.getItem('streakGrid')) || {};
                    grid[todayStr] = sessionsCompleted;
                    localStorage.setItem('streakGrid', JSON.stringify(grid));
                }
                
                // Trigger confetti celebration
                triggerCelebration();
                
                alert("Study session complete! Take a 5-minute break.");
                timerMode = 'break';
                timeLeft = 300; // 5 mins
            } else {
                alert("Break finished! Get ready to study.");
                timerMode = 'study';
                timeLeft = 1500; // 25 mins
            }
            updateTimerStatsDisplay();
            generateStreakTracker(true); // highlight today's cell
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

// --- Date helper for local grid ---
function getLocalDateString(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

// --- Initialize streak grid with seed values ---
function initializeStreakGrid() {
    let grid = localStorage.getItem('streakGrid');
    if (!grid) {
        const streakGrid = {};
        const today = new Date();
        const seedValues = [
            0, 1, 2, 0, 3, 2, 1,
            0, 0, 1, 2, 3, 0, 1,
            2, 1, 0, 2, 3, 2, 1,
            0, 1, 1, 2, 0, 3, 2,
            1, 2, 0, 3, 3, 2
        ];
        for (let i = 0; i < 34; i++) {
            const d = new Date();
            d.setDate(today.getDate() - (34 - i));
            streakGrid[getLocalDateString(d)] = seedValues[i];
        }
        streakGrid[getLocalDateString(today)] = 0;
        localStorage.setItem('streakGrid', JSON.stringify(streakGrid));
    }
}

// --- Study Streak Tracker Heatmap ---
function generateStreakTracker(highlightToday = false) {
    const matrix = document.getElementById("heatmapMatrix");
    if (!matrix) return;
    matrix.innerHTML = "";
    
    initializeStreakGrid();
    const grid = JSON.parse(localStorage.getItem('streakGrid')) || {};
    const today = new Date();
    
    // Sync today's sessionsCompleted with the grid
    const todayStr = getLocalDateString(today);
    grid[todayStr] = sessionsCompleted;
    localStorage.setItem('streakGrid', JSON.stringify(grid));
    
    const levels = [];
    const dates = [];
    
    for (let i = 0; i < 35; i++) {
        const d = new Date();
        d.setDate(today.getDate() - (34 - i));
        const dStr = getLocalDateString(d);
        const count = grid[dStr] || 0;
        levels.push(Math.min(3, count));
        dates.push({ dateStr: dStr, isToday: i === 34, index: i });
    }
    
    levels.forEach((level, idx) => {
        const cell = document.createElement("div");
        const dateInfo = dates[idx];
        
        cell.className = `heatmap-cell streak-level-${level} ${dateInfo.isToday ? 'today-cell' : ''}`;
        cell.style.width = "12px";
        cell.style.height = "12px";
        cell.style.borderRadius = "2px";
        
        // Colors matching zinc theme
        let bg = "rgba(255,255,255,0.05)";
        if (level === 1) bg = "rgba(99, 102, 241, 0.3)";
        else if (level === 2) bg = "rgba(99, 102, 241, 0.6)";
        else if (level === 3) bg = "rgba(99, 102, 241, 1)";
        cell.style.background = bg;
        
        if (dateInfo.isToday && highlightToday) {
            cell.classList.add('pulse-highlight');
        }
        
        const dayLabel = dateInfo.isToday ? "Today" : `Day -${levels.length - 1 - idx}`;
        const mins = level === 3 ? "75+ mins" : level === 2 ? "50 mins" : level === 1 ? "25 mins" : "0 mins";
        cell.setAttribute("title", `${dayLabel}: Study level ${level} (${mins})`);
        
        matrix.appendChild(cell);
    });
}

// --- Dynamic Tag Filters ---
let activeFilter = 'All';

function renderTagFilters() {
    const container = document.getElementById("tagFilterContainer");
    if (!container) return;
    
    // Gather all unique tags from window.studyTopics
    const tags = new Set();
    window.studyTopics.forEach(t => {
        if (t.tag) tags.add(t.tag);
    });
    
    const tagsArray = ['All', ...Array.from(tags)];
    
    // If no topics/tags exist, empty the filter container
    if (tagsArray.length <= 1) {
        container.innerHTML = "";
        return;
    }
    
    container.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "tag-filter-bar animate-fade-in-up stagger-1";
    
    const label = document.createElement("span");
    label.innerText = "🔍 Filter Dashboard:";
    label.style.cssText = "font-weight: 700; font-size: 0.88rem; color: var(--text-secondary); margin-right: 10px;";
    bar.appendChild(label);
    
    tagsArray.forEach(tag => {
        const pill = document.createElement("button");
        pill.className = `filter-pill ${tag === activeFilter ? 'active' : ''}`;
        pill.innerText = tag;
        pill.onclick = () => {
            activeFilter = tag;
            renderTagFilters();
            renderSpacedRepetition();
        };
        bar.appendChild(pill);
    });
    
    container.appendChild(bar);
}

// --- Spaced Repetition Simulator Rendering ---
function renderSpacedRepetition() {
    // Render tag filters synchronously to keep filters in sync with added topics
    renderTagFilters();

    const topicsList = document.getElementById("srTopicsList");
    const reviewsList = document.getElementById("srReviewsList");
    
    // Filtered topics
    const filteredTopics = activeFilter === 'All'
        ? window.studyTopics
        : window.studyTopics.filter(t => t.tag === activeFilter);
        
    // 1. Render Topics List
    if (topicsList) {
        topicsList.innerHTML = "";
        
        if (filteredTopics.length === 0) {
            topicsList.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding: 20px; font-style:italic; font-size:0.85rem;">No topics scheduled under '${activeFilter}'. Add one above!</div>`;
        } else {
            filteredTopics.forEach(topic => {
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
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="step-badge" style="background:rgba(99,102,241,0.1); color:var(--accent-indigo); font-size:0.6rem; padding: 1px 6px; border-radius:4px; font-weight:800; width:fit-content;">
                                ${topic.grade}
                            </span>
                            ${topic.tag ? `<span class="tag-badge">${topic.tag}</span>` : ''}
                        </div>
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
    if (reviewsList) {
        reviewsList.innerHTML = "";
        
        const filteredEvents = window.calendarStore.filter(evt => {
            if (activeFilter === 'All') return true;
            const associatedTopic = window.studyTopics.find(t => t.id === evt.topicId);
            return associatedTopic && associatedTopic.tag === activeFilter;
        });
        
        if (filteredEvents.length === 0) {
            reviewsList.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding: 30px 20px; font-style:italic; font-size:0.9rem; border:1px dashed var(--glass-border); border-radius:16px;">No upcoming reviews for '${activeFilter}'. Click Master next to a topic to generate a spaced review schedule!</div>`;
        } else {
            const sortedEvents = [...filteredEvents].sort((a, b) => {
                return new Date(a.startDateTime) - new Date(b.startDateTime);
            });
            
            sortedEvents.forEach(evt => {
                const dateObj = new Date(evt.startDateTime);
                const formattedDate = dateObj.toLocaleDateString(undefined, { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                }) + ` at 9:00 AM`;
                
                const associatedTopic = window.studyTopics.find(t => t.id === evt.topicId);
                const gradeText = associatedTopic ? associatedTopic.grade : "General";
                const tagText = associatedTopic && associatedTopic.tag ? associatedTopic.tag : "";
                
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
                            ${tagText ? `<span class="tag-badge">${tagText}</span>` : ''}
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
window.renderSpacedRepetition = renderSpacedRepetition;

// --- Form submission handler ---
function handleSRAddTopic(e) {
    e.preventDefault();
    const subjectInput = document.getElementById("srSubject");
    const topicInput = document.getElementById("srTopic");
    const gradeInput = document.getElementById("srGrade");
    const tagInput = document.getElementById("srTag");
    
    if (!subjectInput || !topicInput || !gradeInput) return;
    
    const subject = subjectInput.value.trim();
    const topic = topicInput.value.trim();
    const grade = gradeInput.value.trim();
    const tag = tagInput ? tagInput.value.trim() : "";
    
    if (!subject || !topic || !grade) return;
    
    window.addNewTopic(subject, topic, grade, tag);
    
    // Reset form fields
    subjectInput.value = "";
    topicInput.value = "";
    gradeInput.value = "";
    if (tagInput) tagInput.value = "";
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
                ${activeFeynmanTopic.tag ? `<span class="tag-badge">${activeFeynmanTopic.tag}</span>` : ''}
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

// --- Gated AI Chatbot Experience ---
let chatTokens = 3;

function initializeChatTokens() {
    if (localStorage.getItem('chatTokens') === null) {
        localStorage.setItem('chatTokens', '3');
    }
    chatTokens = parseInt(localStorage.getItem('chatTokens'));
    updateTokenDisplay();
}

function updateTokenDisplay() {
    const counter = document.getElementById("tokenCounter");
    const overlay = document.getElementById("chatLockoutOverlay");
    
    if (isAuthenticated) {
        if (counter) counter.innerText = "Unlimited";
        if (overlay) overlay.style.display = "none";
    } else {
        if (counter) counter.innerText = `${chatTokens} left`;
        if (chatTokens <= 0) {
            if (overlay) overlay.style.display = "flex";
        } else {
            if (overlay) overlay.style.display = "none";
        }
    }
}

function toggleChat(e) {
    if (e) e.stopPropagation();
    const dialog = document.getElementById('chatDialog');
    if (dialog) {
        const isOpen = dialog.style.display === 'block';
        dialog.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) {
            initializeChatTokens();
            const bubble = document.getElementById('speechBubble');
            if (bubble) bubble.style.display = 'none';
        }
    }
}
window.toggleChat = toggleChat;

function handleChatKeyPress(e) {
    if (e.key === 'Enter') {
        sendChat();
    }
}
window.handleChatKeyPress = handleChatKeyPress;

async function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    
    if (!isAuthenticated) {
        if (chatTokens <= 0) {
            updateTokenDisplay();
            return;
        }
        chatTokens--;
        localStorage.setItem('chatTokens', chatTokens.toString());
        updateTokenDisplay();
    }
    
    appendChatMessage(msg, 'user');
    input.value = '';
    
    try {
        const headers = isAuthenticated ? getAuthHeaders() : { 'Content-Type': 'application/json' };
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ message: msg })
        });
        
        if (res.ok) {
            const data = await res.json();
            appendChatMessage(data.reply, 'ai');
        } else {
            try {
                const data = await res.json();
                appendChatMessage(`Error: ${data.details || data.error || 'Failed to communicate with AI.'}`, 'ai');
            } catch(e) {
                appendChatMessage('Error communicating with AI.', 'ai');
            }
        }
    } catch (err) {
        appendChatMessage('Connection error.', 'ai');
    }
}
window.sendChat = sendChat;

function appendChatMessage(text, sender) {
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg msg-${sender}`;
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- Confetti particle generator ---
function triggerCelebration() {
    const container = document.body;
    const colors = ['#818cf8', '#34d399', '#f472b6', '#fbbf24', '#38bdf8'];
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-particle';
        p.style.left = '50%';
        p.style.top = '50%';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = 5 + Math.random() * 12;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity - 3;
        
        p.style.setProperty('--vx', `${vx * 15}px`);
        p.style.setProperty('--vy', `${vy * 15}px`);
        p.style.setProperty('--rotation', `${Math.random() * 360}deg`);
        
        container.appendChild(p);
        
        setTimeout(() => p.remove(), 2000);
    }
}

// --- Dynamic Client-Side Background Removal ---
function removeMascotBackground(img) {
    if (!img) return;
    
    const processImage = () => {
        try {
            if (img.dataset.bgRemoved === 'true') return;
            if (img.src.startsWith('data:image/')) return;
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            
            if (width === 0 || height === 0) return;
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0);
            
            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;
            
            // Seed background color from top-left pixel
            const bgR = data[0];
            const bgG = data[1];
            const bgB = data[2];
            
            const queue = [];
            const visited = new Uint8Array(width * height);
            
            // Add all border pixels to queue
            for (let x = 0; x < width; x++) {
                queue.push(x, 0);
                visited[0 * width + x] = 1;
                queue.push(x, height - 1);
                visited[(height - 1) * width + x] = 1;
            }
            for (let y = 1; y < height - 1; y++) {
                queue.push(0, y);
                visited[y * width + 0] = 1;
                queue.push(width - 1, y);
                visited[y * width + (width - 1)] = 1;
            }
            
            // Flood fill tolerance to cover starry aura/clouds
            const tolerance = 80;
            let head = 0;
            
            while (head < queue.length) {
                const cx = queue[head++];
                const cy = queue[head++];
                const idx = (cy * width + cx) * 4;
                
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                
                const diff = Math.sqrt(
                    (r - bgR) * (r - bgR) +
                    (g - bgG) * (g - bgG) +
                    (b - bgB) * (b - bgB)
                );
                
                if (diff <= tolerance) {
                    data[idx + 3] = 0; // Transparent
                    
                    const neighbors = [
                        cx - 1, cy,
                        cx + 1, cy,
                        cx, cy - 1,
                        cx, cy + 1
                    ];
                    
                    for (let i = 0; i < neighbors.length; i += 2) {
                        const nx = neighbors[i];
                        const ny = neighbors[i + 1];
                        
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const vIdx = ny * width + nx;
                            if (visited[vIdx] === 0) {
                                visited[vIdx] = 1;
                                queue.push(nx, ny);
                            }
                        }
                    }
                }
            }
            
            ctx.putImageData(imgData, 0, 0);
            img.src = canvas.toDataURL('image/png');
            img.dataset.bgRemoved = 'true';
        } catch (e) {
            console.error('Failed to remove mascot background client-side:', e);
        }
    };
    
    if (img.complete) {
        processImage();
    } else {
        img.onload = processImage;
    }
}

function cleanMascotBackgrounds() {
    const images = document.querySelectorAll('img[src*="robot_mascot.png"], img.ai-mascot');
    images.forEach(removeMascotBackground);
}
window.cleanMascotBackgrounds = cleanMascotBackgrounds;
