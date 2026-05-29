// --- Authentication Check ---
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = 'login.html';
}

/**
 * Feynman Technique Module Simulator Controller
 */

let activeTopic = null;

// Mock database of tailored Feynman critiques to make the simulation feel authentic
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

document.addEventListener("DOMContentLoaded", () => {
    initializeFeynmanView();
    setupTextareaListener();
});

/**
 * Initializes the view based on URL query parameter or fallback dropdown
 */
function initializeFeynmanView() {
    const urlParams = new URLSearchParams(window.location.search);
    const topicId = urlParams.get('topicId');
    
    const activeInfo = document.getElementById("activeTopicInfo");
    const selectorContainer = document.getElementById("topicSelectorContainer");
    
    if (topicId) {
        // Load specific topic
        activeTopic = window.studyTopics.find(t => t.id === topicId);
    }
    
    if (activeTopic) {
        // Topic loaded successfully
        selectorContainer.style.display = "none";
        activeInfo.style.display = "block";
        renderTopicBadge(activeTopic);
    } else {
        // Fallback: Populate dropdown list of unmastered topics
        activeInfo.style.display = "none";
        selectorContainer.style.display = "flex";
        populateTopicDropdown();
    }
}

/**
 * Renders the topic metadata badge
 */
function renderTopicBadge(topic) {
    const activeInfo = document.getElementById("activeTopicInfo");
    if (!activeInfo) return;
    
    activeInfo.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center;">
            <span class="step-badge" style="background:rgba(99,102,241,0.15); color:var(--accent-indigo); border:1px solid rgba(99,102,241,0.25);">${topic.grade}</span>
            <h2 style="margin: 0; font-size: 1.3rem; font-weight: 800;">${topic.subject}</h2>
        </div>
        <p style="margin: 4px 0 0 0; color: var(--text-secondary); font-size: 0.95rem; font-weight: 600;">Chapter: ${topic.topic}</p>
    `;
}

/**
 * Populates dropdown with pending topics
 */
function populateTopicDropdown() {
    const select = document.getElementById("topicSelect");
    if (!select) return;
    select.innerHTML = "";
    
    const pending = window.studyTopics.filter(t => !t.mastered);
    
    if (pending.length === 0) {
        const opt = document.createElement("option");
        opt.text = "No pending topics - Add some on Dashboard!";
        opt.value = "";
        select.appendChild(opt);
        select.disabled = true;
        return;
    }
    
    select.disabled = false;
    // Add default select prompt
    const defaultOpt = document.createElement("option");
    defaultOpt.text = "-- Select a Topic --";
    defaultOpt.value = "";
    select.appendChild(defaultOpt);
    
    pending.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.text = `${t.subject}: ${t.topic} (${t.grade})`;
        select.appendChild(opt);
    });
}

/**
 * Handles selection change in the fallback dropdown
 */
function handleTopicSelectChange(val) {
    if (!val) {
        activeTopic = null;
        return;
    }
    activeTopic = window.studyTopics.find(t => t.id === val);
}

/**
 * Tracks character/word inputs
 */
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

/**
 * Simulates AI evaluation loading and triggers results rendering
 */
function evaluateExplanation() {
    const textarea = document.getElementById("explanationDraft");
    if (!textarea) return;
    
    const text = textarea.value.trim();
    if (!text) {
        alert("Please write an explanation first!");
        return;
    }
    
    const words = text.split(/\s+/).length;
    if (words < 10) {
        alert("Your explanation is a bit too short (under 10 words). Try adding a few details before evaluating!");
        return;
    }
    
    // Hide panels and show loading spinner
    document.getElementById("blankStateCard").style.display = "none";
    document.getElementById("resultsStateCard").style.display = "none";
    document.getElementById("loadingStateCard").style.display = "flex";
    
    // Simulate AI computing timeout (1.5 seconds)
    setTimeout(() => {
        // Hide loader
        document.getElementById("loadingStateCard").style.display = "none";
        
        // Calculate comprehension score (random baseline 70-85, influenced by word length)
        let score = Math.floor(Math.random() * 15) + 70;
        if (words > 40) score += 10;
        if (words > 80) score += 5;
        score = Math.min(98, score); // cap at 98 for realism
        
        // Load tailored critiques
        let key = "default";
        if (activeTopic) {
            const sub = activeTopic.subject.toLowerCase();
            const top = activeTopic.topic.toLowerCase();
            if (sub.includes("biol") || top.includes("photo") || top.includes("cell")) {
                key = "biology";
            } else if (sub.includes("hist") || sub.includes("soc") || top.includes("revol")) {
                key = "history";
            }
        }
        
        const critique = critiqueDatabase[key];
        
        // Inject feedback texts
        document.getElementById("jargonFeedback").innerText = critique.jargon;
        document.getElementById("gapFeedback").innerText = critique.gaps;
        document.getElementById("analogyFeedback").innerText = critique.analogy;
        
        // Render progress ring & percentage text
        document.getElementById("clarityScorePercent").innerText = score;
        const circle = document.getElementById("clarityScoreCircle");
        if (circle) {
            const circumference = 314.16;
            const offset = circumference - (score / 100) * circumference;
            circle.style.strokeDashoffset = offset;
        }
        
        // Display results block
        document.getElementById("resultsStateCard").style.display = "flex";
    }, 1500);
}

/**
 * Marks topic as mastered in Spaced Repetition engine and returns to dashboard
 */
function finalizeMastery() {
    let targetId = activeTopic ? activeTopic.id : document.getElementById("topicSelect").value;
    
    if (!targetId) {
        alert("Please select a topic to master!");
        return;
    }
    
    // Call spacing rep engine global master function
    if (typeof window.markTopicAsMastered === 'function') {
        window.markTopicAsMastered(targetId);
    }
    
    alert("Mastery locked! Spaced repetition schedules created. Redirecting to Dashboard.");
    window.location.href = "dashboard.html";
}

// Global hooks
window.handleTopicSelectChange = handleTopicSelectChange;
window.evaluateExplanation = evaluateExplanation;
window.finalizeMastery = finalizeMastery;
