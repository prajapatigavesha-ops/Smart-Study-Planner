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

// --- Logout ---
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}

// Ensure there is a logout button injected into the nav
document.addEventListener("DOMContentLoaded", () => {
    const navDiv = document.getElementById('navButtons') || document.querySelector('nav div');
    if (navDiv && !document.getElementById('logoutBtn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.innerText = 'Log Out';
        logoutBtn.style.cssText = "background:transparent; color:var(--danger-color); border:1px solid var(--danger-color); padding: 8px 16px; cursor:pointer; border-radius:50px; font-family: var(--font-body); font-weight: 600; font-size: 0.85rem; margin-left: 5px;";
        logoutBtn.onclick = logout;
        navDiv.appendChild(logoutBtn);
    }
    checkStreak();
    fetchTasks();
    fetchStats();
    cleanMascotBackgrounds();
    if (typeof renderSpacedRepetition === 'function') {
        renderSpacedRepetition();
    }
});

function getLocalDateString(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

function checkStreak() {
    const todayStr = getLocalDateString(new Date());
    
    // Yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);
    
    let lastVisit = localStorage.getItem('last_visit_date');
    let currentStreak = parseInt(localStorage.getItem('current_streak_count'));
    
    if (isNaN(currentStreak)) {
        currentStreak = 0;
    }
    
    if (!lastVisit) {
        currentStreak = 1;
        lastVisit = todayStr;
    } else if (lastVisit === yesterdayStr) {
        currentStreak += 1;
        lastVisit = todayStr;
    } else if (lastVisit === todayStr) {
        // Maintain existing streak
    } else {
        currentStreak = 1;
        lastVisit = todayStr;
    }
    
    localStorage.setItem('last_visit_date', lastVisit);
    localStorage.setItem('current_streak_count', currentStreak.toString());
    return currentStreak;
}

function editStudyTarget(event) {
    if (event) event.preventDefault();
    const val = prompt("Enter your daily study target in minutes (e.g. 60, 90, 120):", localStorage.getItem('study_target_minutes') || "150");
    if (val !== null) {
        const mins = parseInt(val);
        if (!isNaN(mins) && mins > 0) {
            localStorage.setItem('study_target_minutes', mins.toString());
            updateGoalProgressRing();
            generateAIBriefing();
        } else {
            alert("Please enter a valid number of minutes.");
        }
    }
}
window.editStudyTarget = editStudyTarget;

function getAppStatus() {
    if (timer) {
        return mode === 'study' ? "Focusing" : "On Break";
    }
    return "Planning";
}

let tasks = [];
let subjects = {};

async function fetchTasks() {
    try {
        const res = await fetch('/api/tasks', { headers: getAuthHeaders() });
        if (res.status === 401 || res.status === 403) return logout();
        tasks = await res.json();
        renderTasks();
    } catch(err) { console.error(err); }
}

async function fetchStats() {
    try {
        const res = await fetch('/api/stats', { headers: getAuthHeaders() });
        if (res.ok) {
            const data = await res.json();
            sessionsCompleted = data.sessionsCompleted || 0;
            totalStudyTime = data.totalStudyTime || 0;
            updateTimerStats();
        }
    } catch(err) { console.error(err); }
}

async function saveStats() {
    try {
        await fetch('/api/stats', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ totalStudyTime, sessionsCompleted })
        });
    } catch(err) { console.error(err); }
}

const timelineSlots = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
const taskSlotsMap = JSON.parse(localStorage.getItem('taskSlots') || '{}');

function renderTasks() {
  // Render filters dynamically to stay in sync with tasks and topics
  renderTagFilters();

  const timelineList = document.getElementById("timelineList");
  if (!timelineList) return;
  timelineList.innerHTML = "";
  
  // Ensure every task has a slotIndex
  tasks.forEach((task, index) => {
    if (taskSlotsMap[task.id] === undefined) {
      taskSlotsMap[task.id] = index % timelineSlots.length;
    }
  });
  localStorage.setItem('taskSlots', JSON.stringify(taskSlotsMap));

  // Filter tasks by activeFilter
  const filteredTasks = activeFilter === 'All'
    ? tasks
    : tasks.filter(t => t.tag === activeFilter);

  // Sort tasks chronologically by slotIndex
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    return (taskSlotsMap[a.id] || 0) - (taskSlotsMap[b.id] || 0);
  });

  if (sortedTasks.length === 0) {
    timelineList.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding: 20px; font-style:italic; font-size:0.95rem;">No tasks scheduled under '${activeFilter}'. Add topics above!</div>`;
  } else {
    sortedTasks.forEach((task) => {
      const slotIndex = taskSlotsMap[task.id] !== undefined ? taskSlotsMap[task.id] : 0;
      const slotTime = timelineSlots[slotIndex];
      
      const itemDiv = document.createElement("div");
      itemDiv.className = `timeline-item ${task.completed ? 'completed' : ''}`;
      itemDiv.innerHTML = `
        <div class="timeline-time ${task.completed ? 'completed' : ''}">
          🕒 ${slotTime}
        </div>
        <div class="timeline-card ${task.completed ? 'completed' : ''}">
          <div class="timeline-card-content">
            <div class="timeline-checkbox ${task.completed ? 'checked' : ''}" onclick="toggleTaskById(${task.id})">
              ${task.completed ? '✓' : ''}
            </div>
            <span class="timeline-task-text ${task.completed ? 'completed' : ''}">
              ${task.text}
              ${task.tag ? `<span class="tag-badge">${task.tag}</span>` : ''}
            </span>
          </div>
          <div class="timeline-actions">
            <button class="timeline-btn reschedule-btn" onclick="rescheduleTask(${task.id})" title="Reschedule slot">🔄</button>
            <button class="timeline-btn delete-btn" onclick="deleteTaskById(${task.id})" title="Delete Task">❌</button>
          </div>
        </div>
      `;
      timelineList.appendChild(itemDiv);
    });
  }

  // Update layout and statistics
  if (typeof updateChart === 'function') {
    updateChart();
  }
  updateGoalProgressRing();
  generateHeatmap();
  generateAIBriefing();
}

async function addTask() {
  const input = document.getElementById("taskInput");
  const tagInput = document.getElementById("taskTagInput");
  const taskText = input.value.trim();
  const taskTag = tagInput ? tagInput.value.trim() : "";
  if (taskText === "") return;
  
  try {
      const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ text: taskText, completed: false, tag: taskTag })
      });
      if (res.ok) {
          const newTask = await res.json();
          // Assign next available slot to new task
          const nextSlotIndex = tasks.length % timelineSlots.length;
          taskSlotsMap[newTask.id] = nextSlotIndex;
          localStorage.setItem('taskSlots', JSON.stringify(taskSlotsMap));
          
          tasks.push(newTask);
          renderTasks();
          input.value = "";
          if (tagInput) tagInput.value = "";
      }
  } catch(err) { console.error(err); }
}

async function toggleTaskById(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const newStatus = !task.completed;
  
  // Optimistic update
  task.completed = newStatus;
  renderTasks();
  
  try {
      await fetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ completed: newStatus })
      });
  } catch(err) { console.error(err); }
}

async function deleteTaskById(id) {
  const index = tasks.findIndex(t => t.id === id);
  if (index === -1) return;
  
  // Remove slot mapping
  delete taskSlotsMap[id];
  localStorage.setItem('taskSlots', JSON.stringify(taskSlotsMap));
  
  // Optimistic update
  tasks.splice(index, 1);
  renderTasks();
  
  try {
      await fetch(`/api/tasks/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
      });
  } catch(err) { console.error(err); }
}

function rescheduleTask(id) {
  const currentSlot = taskSlotsMap[id] !== undefined ? taskSlotsMap[id] : 0;
  const nextSlot = (currentSlot + 1) % timelineSlots.length;
  taskSlotsMap[id] = nextSlot;
  localStorage.setItem('taskSlots', JSON.stringify(taskSlotsMap));
  renderTasks();
}

let mode = 'study';
let timeLeft = 1500; // 25 min
let timer;
let sessionsCompleted = 0;
let totalStudyTime = 0; // in seconds

function updateTimerStats() {
  const sessionEl = document.getElementById("sessionCount");
  if (sessionEl) sessionEl.innerText = sessionsCompleted;
  
  const timeStrEl = document.getElementById("totalStudyTimeStr");
  if (timeStrEl) {
      let hours = Math.floor(totalStudyTime / 3600);
      let mins = Math.floor((totalStudyTime % 3600) / 60);
      timeStrEl.innerText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }
  
  const timerModeEl = document.getElementById("timerMode");
  if (timerModeEl) {
      timerModeEl.innerText = mode === 'study' ? "Study Mode" : "Break Mode";
      timerModeEl.style.color = mode === 'study' ? "var(--accent-indigo)" : "var(--accent-mint)";
  }

  updateGoalProgressRing();
  generateHeatmap();
  generateAIBriefing();
}

function playAlarm() {
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
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    if (timeLeft <= 0) {
      playAlarm();
      clearInterval(timer);
      timer = null;
      
      if (mode === 'study') {
        sessionsCompleted++;
        saveStats();
        alert("Study session complete! 5 minute break time.");
        mode = 'break';
        timeLeft = 300; // 5 min
      } else {
        alert("Break is over! Time to study.");
        mode = 'study';
        timeLeft = 1500; // 25 min
      }
      updateTimerStats();
      updateDisplay();
      return;
    }

    timeLeft--;
    if (mode === 'study') {
      totalStudyTime++;
      if (totalStudyTime % 60 === 0) {
          saveStats();
          updateTimerStats();
      }
    }
    updateDisplay();
  }, 1000);
}

function pauseTimer() {
  clearInterval(timer);
  timer = null;
  saveStats(); // save on pause
}

function resetTimer() {
  clearInterval(timer);
  timer = null;
  mode = 'study';
  timeLeft = 1500;
  saveStats();
  updateTimerStats();
  updateDisplay();
}

function updateDisplay() {
  let minutes = Math.floor(timeLeft / 60);
  let seconds = timeLeft % 60;
  const timeEl = document.getElementById("time");
  if (timeEl) timeEl.innerText = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

let weeklyChartInstance;

function updateChart() {
  const totalTasksCount = tasks.length;
  const completedTasksCount = tasks.filter(t => t.completed).length;
  const completionPercent = totalTasksCount === 0 ? 0 : Math.round((completedTasksCount / totalTasksCount) * 100);

  const totalEl = document.getElementById("totalTasks");
  if (totalEl) totalEl.innerText = totalTasksCount;
  
  const compEl = document.getElementById("completionPercent");
  if (compEl) compEl.innerText = completionPercent + "% Complete";

  if (typeof Chart === 'undefined') return;

  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#e2e8f0' : '#0f172a';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
  const pointBg = isDark ? '#020617' : '#ffffff';

  Chart.defaults.color = textColor;
  Chart.defaults.font.family = "'Inter', sans-serif";

  if (weeklyChartInstance) weeklyChartInstance.destroy();

  // --- WEEKLY FOCUS AREA CHART ---
  const weeklyCtxEl = document.getElementById("weeklyOverviewChart");
  if (weeklyCtxEl) {
      const weeklyCtx = weeklyCtxEl.getContext("2d");
      
      const focusGradient = weeklyCtx.createLinearGradient(0, 0, 0, 160);
      focusGradient.addColorStop(0, isDark ? 'rgba(99, 102, 241, 0.4)' : 'rgba(79, 70, 229, 0.35)');
      focusGradient.addColorStop(1, 'rgba(79, 70, 229, 0.0)');

      weeklyChartInstance = new Chart(weeklyCtx, {
          type: 'line',
          data: {
              labels: window.studentMetricsController.getWeeklyLabels(),
              datasets: [
                  {
                      label: 'Focus Time (mins)',
                      data: window.studentMetricsController.getWeeklyFocus(),
                      borderColor: isDark ? '#818cf8' : '#4f46e5',
                      borderWidth: 3,
                      fill: true,
                      backgroundColor: focusGradient,
                      tension: 0.4,
                      pointBackgroundColor: isDark ? '#818cf8' : '#4f46e5',
                      pointBorderColor: pointBg,
                      pointHoverRadius: 7,
                      pointRadius: 5
                  },
                  {
                      label: 'Daily Target (mins)',
                      data: window.studentMetricsController.getWeeklyTarget(),
                      borderColor: isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(71, 85, 105, 0.4)',
                      borderWidth: 2,
                      borderDash: [5, 5],
                      fill: false,
                      tension: 0.1,
                      pointRadius: 0
                  }
              ]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                  legend: {
                      position: 'top',
                      labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'circle', font: { size: 10 } }
                  }
              },
              scales: {
                  x: { grid: { color: gridColor }, ticks: { font: { size: 9 } } },
                  y: { beginAtZero: true, grid: { color: gridColor }, ticks: { font: { size: 9 } } }
              }
          }
      });
  }
}

/* --- SVG GOAL PROGRESS RING ANIMATOR --- */
function updateGoalProgressRing() {
  const targetMinutes = parseInt(localStorage.getItem('study_target_minutes')) || 150;
  const studyMins = Math.floor(totalStudyTime / 60);
  const percent = Math.min(100, Math.round((studyMins / targetMinutes) * 100));
  
  const percentEl = document.getElementById("dailyGoalPercent");
  if (percentEl) percentEl.innerText = percent;
  
  const circle = document.getElementById("goalProgressCircle");
  if (circle) {
      const circumference = 314.16; // 2 * Math.PI * r (r=50)
      const offset = circumference - (percent / 100) * circumference;
      circle.style.strokeDashoffset = offset;
  }
}

/* --- GITHUB STYLE ACTIVITY STREAK HEATMAP --- */
function generateHeatmap() {
  const matrix = document.getElementById("heatmapMatrix");
  if (!matrix) return;
  matrix.innerHTML = "";
  
  // Seed with 34 days of past study levels (0 to 3), current day is index 35.
  const pastLevels = [
      0, 1, 2, 0, 3, 2, 1,
      0, 0, 1, 2, 3, 0, 1,
      2, 1, 0, 2, 3, 2, 1,
      0, 1, 1, 2, 0, 3, 2,
      1, 2, 0, 3, 3, 2
  ];
  
  // Today's streak intensity based on session count completed
  let todayLevel = 0;
  if (sessionsCompleted >= 3) todayLevel = 3;
  else if (sessionsCompleted === 2) todayLevel = 2;
  else if (sessionsCompleted === 1) todayLevel = 1;
  
  const levels = [...pastLevels, todayLevel];
  
  levels.forEach((level, idx) => {
      const cell = document.createElement("div");
      const isToday = idx === levels.length - 1;
      
      cell.className = `heatmap-cell streak-level-${level} ${isToday ? 'today-cell' : ''}`;
      
      let dayLabel;
      if (isToday) {
          dayLabel = "Today";
      } else {
          dayLabel = `Day -${levels.length - 1 - idx}`;
      }
      
      const mins = level === 3 ? "75+ mins" : level === 2 ? "50 mins" : level === 1 ? "25 mins" : "0 mins";
      cell.setAttribute("data-tooltip", `${dayLabel}: Study level ${level} (${mins})`);
      matrix.appendChild(cell);
  });
}

/* --- AI DYNAMIC DAILY BRIEFING GENERATOR --- */
function generateAIBriefing() {
  const briefingText = document.getElementById("briefingText");
  const briefingStatus = document.getElementById("briefingStatus");
  const briefingTarget = document.getElementById("briefingTarget");
  const briefingStreak = document.getElementById("briefingStreak");
  
  if (!briefingText) return;
  
  const pendingTasks = tasks.filter(t => !t.completed).length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const studyMins = Math.floor(totalStudyTime / 60);
  
  const statusStr = getAppStatus();
  let statusColor = "var(--accent-indigo)";
  if (statusStr === "On Break") {
      statusColor = "var(--accent-mint)";
  } else if (statusStr === "Planning") {
      statusColor = "rgba(255, 255, 255, 0.4)";
  }
  
  const targetMinutes = parseInt(localStorage.getItem('study_target_minutes')) || 150;
  let brief = "";
  
  if (pendingTasks === 0 && completedTasks > 0) {
      brief = "Outstanding! You have completed all scheduled tasks on your timeline today. Keep this momentum high to secure your next study streak!";
  } else if (studyMins >= targetMinutes) {
      brief = `Excellent work! You reached your daily study target of ${targetMinutes} mins (Total: ${studyMins}m). You still have ${pendingTasks} task(s) on your timeline. Let's finish strong!`;
  } else if (completedTasks > 0) {
      brief = `Great progress. You completed ${completedTasks} timeline task(s) and logged ${studyMins} minutes of focus. Peak productivity is forecast for your afternoon blocks.`;
  } else if (pendingTasks > 0) {
      brief = `Good morning! Your timeline schedule is optimized. You have ${pendingTasks} topics scheduled today. Begin a Pomodoro timer session to kick off.`;
  } else {
      brief = "Your study timeline is empty! Schedule a topic above (e.g. History Chapter 2 or React Hooks) to compile your daily AI briefing details.";
  }
  
  briefingText.innerText = brief;
  if (briefingStatus) {
      briefingStatus.innerText = statusStr;
      briefingStatus.style.color = statusColor;
  }
  if (briefingTarget) {
      const storedTarget = localStorage.getItem('study_target_minutes');
      if (storedTarget) {
          briefingTarget.innerHTML = `<span onclick="editStudyTarget(event)" style="cursor: pointer; text-decoration: underline;">${storedTarget}m</span>`;
      } else {
          briefingTarget.innerHTML = `<a href="#" onclick="editStudyTarget(event)" style="text-decoration: underline; color: var(--accent-indigo); font-weight: 800;">[Set Goal]</a>`;
      }
  }
  if (briefingStreak) {
      const streakVal = localStorage.getItem('current_streak_count') || "0";
      briefingStreak.innerText = `${streakVal} Days`;
  }
}

// --- AI Chat Logic ---
function toggleChat(e) {
  if (e) e.stopPropagation();
  const dialog = document.getElementById('chatDialog');
  if (dialog) {
    dialog.style.display = dialog.style.display === 'block' ? 'none' : 'block';
  }
}

function handleChatKeyPress(e) {
    if (e.key === 'Enter') {
        sendChat();
    }
}

async function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    
    appendChatMessage(msg, 'user');
    input.value = '';
    
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: getAuthHeaders(),
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

function appendChatMessage(text, sender) {
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg msg-${sender}`;
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * Renders the Spaced Repetition mastery simulator controls and scheduled preview timelines
 */
function renderSpacedRepetition() {
    // Render tag filters synchronously to keep filters in sync
    renderTagFilters();

    const topicsList = document.getElementById("srTopicsList");
    
    // Filter topics by activeFilter
    const filteredTopics = activeFilter === 'All'
        ? window.studyTopics
        : window.studyTopics.filter(t => t.tag === activeFilter);

    if (topicsList) {
        topicsList.innerHTML = "";
        
        if (filteredTopics.length === 0) {
            topicsList.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding: 20px; font-style:italic; font-size:0.95rem;">No topics scheduled under '${activeFilter}'. Add one above!</div>`;
        } else {
            filteredTopics.forEach(topic => {
                const row = document.createElement("div");
                row.className = `topic-mastery-row ${topic.mastered ? 'mastered' : ''}`;
                row.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start; text-align:left;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="step-badge" style="background:rgba(99,102,241,0.1); color:var(--accent-indigo); font-size:0.65rem; padding: 2px 8px; border-radius:6px; border:1px solid rgba(99,102,241,0.2); font-weight:800; text-transform:uppercase;">
                                ${topic.grade}
                            </span>
                            ${topic.tag ? `<span class="tag-badge">${topic.tag}</span>` : ''}
                        </div>
                        <span class="topic-name-label" style="font-size:1.02rem; font-weight:800; margin-top:2px;">
                            ${topic.subject}
                        </span>
                        <span style="font-size:0.82rem; color:var(--text-secondary);">
                            ${topic.topic}
                        </span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        ${topic.mastered 
                          ? `<button class="btn-master completed" onclick="window.toggleTopicMastery('${topic.id}')" style="cursor:pointer;">Mastered ✓</button>`
                          : `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                               <a href="/feynman?topicId=${topic.id}"><button class="btn-master-outline">🎓 Practice Feynman Mode</button></a>
                               <button class="btn-master" onclick="window.toggleTopicMastery('${topic.id}')">Mark Mastered</button>
                             </div>`
                        }
                        <button onclick="window.deleteTopic('${topic.id}')" class="btn-action-delete" title="Delete Topic" style="color: var(--danger-color); background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; border: none;">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                `;
                topicsList.appendChild(row);
            });
        }
    }
    
    const reviewsList = document.getElementById("srReviewsList");
    if (reviewsList) {
        reviewsList.innerHTML = "";
        
        const filteredEvents = window.calendarStore.filter(evt => {
            if (activeFilter === 'All') return true;
            const associatedTopic = window.studyTopics.find(t => t.id === evt.topicId);
            return associatedTopic && associatedTopic.tag === activeFilter;
        });
        
        if (filteredEvents.length === 0) {
            reviewsList.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding: 20px; font-style:italic; font-size:0.88rem;">No reviews scheduled under '${activeFilter}'. Mark a topic as mastered above to trigger spaced schedule intervals!</div>`;
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
                const tagText = associatedTopic && associatedTopic.tag ? associatedTopic.tag : "";
                
                const card = document.createElement("div");
                card.className = "review-schedule-card animate-fade-in-up stagger-1";
                card.innerHTML = `
                    <div class="review-card-info" style="text-align: left;">
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom: 4px;">
                            <span class="step-badge step-badge-${evt.intervalStep}">
                                Step ${evt.intervalStep}
                            </span>
                            ${tagText ? `<span class="tag-badge">${tagText}</span>` : ''}
                        </div>
                        <span class="review-card-title">${evt.title}</span>
                        <span class="review-card-date">📅 ${formattedDate}</span>
                    </div>
                    <div class="review-card-actions" style="display: flex; align-items: center; gap: 8px;">
                        <!-- Practice Feynman Button -->
                        ${evt.status !== 'completed' 
                          ? `<a href="/feynman?topicId=${evt.topicId}" class="btn-action-feynman" title="Practice Feynman Mode" style="color: var(--accent-indigo); background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
                              <i data-lucide="book-open" style="width: 16px; height: 16px;"></i>
                             </a>`
                          : ''
                        }
                        
                        <!-- Complete/Pending Toggle -->
                        <button onclick="window.toggleReviewEvent('${evt.id}')" class="btn-action-complete" title="${evt.status === 'completed' ? 'Mark Pending' : 'Mark Completed'}" style="color: ${evt.status === 'completed' ? 'var(--accent-mint)' : 'var(--text-secondary)'}; background: ${evt.status === 'completed' ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${evt.status === 'completed' ? 'rgba(52,211,153,0.3)' : 'var(--glass-border)'}; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
                            <i data-lucide="${evt.status === 'completed' ? 'check-circle' : 'circle'}" style="width: 16px; height: 16px;"></i>
                        </button>
                        
                        <!-- Delete Event -->
                        <button onclick="window.deleteReviewEvent('${evt.id}')" class="btn-action-delete" title="Delete Review Event" style="color: var(--danger-color); background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                `;
                reviewsList.appendChild(card);
            });
        }
    }
    
    // Trigger Lucide icons generation
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Captures submission on the spaced repetition form, inserts it into state, and resets inputs
 */
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

// --- Tag Filtering System for Authenticated Dashboard ---
let activeFilter = 'All';

function renderTagFilters() {
    const container = document.getElementById("tagFilterContainer");
    if (!container) return;
    
    // Gather all unique tags from tasks and studyTopics
    const tags = new Set();
    tasks.forEach(t => {
        if (t.tag) tags.add(t.tag);
    });
    window.studyTopics.forEach(t => {
        if (t.tag) tags.add(t.tag);
    });
    
    const tagsArray = ['All', ...Array.from(tags)];
    
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
            renderTasks();
            renderSpacedRepetition();
        };
        bar.appendChild(pill);
    });
    
    container.appendChild(bar);
}

window.handleSRAddTopic = handleSRAddTopic;
window.renderSpacedRepetition = renderSpacedRepetition;

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

// --- AI Syllabus Manager Frontend Logic ---

let parsedSyllabusTopics = [];
let currentUploadFile = null;

function openSyllabusManager() {
    const modal = document.getElementById("syllabusManagerModal");
    if (modal) {
        modal.style.display = "flex";
        switchSyllabusTab('history');
        if (window.lucide) {
            window.lucide.createIcons();
        }
        setupSyllabusDropZone();
    }
}
window.openSyllabusManager = openSyllabusManager;

function closeSyllabusManager() {
    const modal = document.getElementById("syllabusManagerModal");
    if (modal) {
        modal.style.display = "none";
    }
}
window.closeSyllabusManager = closeSyllabusManager;

function switchSyllabusTab(tabName) {
    const tabHistory = document.getElementById("tabMySyllabi");
    const tabUpload = document.getElementById("tabUploadSyllabus");
    const viewHistory = document.getElementById("syllabusTabHistory");
    const viewUpload = document.getElementById("syllabusTabUpload");
    
    if (tabName === 'history') {
        tabHistory.style.borderBottomColor = 'var(--accent-indigo)';
        tabHistory.style.color = 'var(--text-primary)';
        tabUpload.style.borderBottomColor = 'transparent';
        tabUpload.style.color = 'var(--text-secondary)';
        viewHistory.style.display = 'flex';
        viewUpload.style.display = 'none';
        fetchSyllabusHistory();
    } else {
        tabUpload.style.borderBottomColor = 'var(--accent-indigo)';
        tabUpload.style.color = 'var(--text-primary)';
        tabHistory.style.borderBottomColor = 'transparent';
        tabHistory.style.color = 'var(--text-secondary)';
        viewHistory.style.display = 'none';
        viewUpload.style.display = 'flex';
        resetUploadForm();
    }
}
window.switchSyllabusTab = switchSyllabusTab;

function resetUploadForm() {
    document.getElementById("syllabusUploadForm").style.display = "flex";
    document.getElementById("syllabusLoadingStep").style.display = "none";
    document.getElementById("syllabusPreviewStep").style.display = "none";
    document.getElementById("syllabusTextPaste").value = "";
    document.getElementById("syllabusFileInput").value = "";
    currentUploadFile = null;
}

// 1. Fetch file history list from backend
async function fetchSyllabusHistory() {
    const tableBody = document.getElementById("syllabusHistoryTableBody");
    const emptyState = document.getElementById("syllabusHistoryEmptyState");
    if (!tableBody) return;
    
    tableBody.innerHTML = "";
    
    try {
        const res = await fetch('/api/syllabi', {
            headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error("Failed to load syllabus history.");
        const files = await res.json();
        
        if (files.length === 0) {
            emptyState.style.display = "block";
            return;
        }
        emptyState.style.display = "none";
        
        files.forEach(file => {
            const row = document.createElement("tr");
            
            // File Name
            const nameTd = document.createElement("td");
            nameTd.style.padding = "12px 16px";
            nameTd.style.fontWeight = "600";
            nameTd.innerText = file.fileName;
            row.appendChild(nameTd);
            
            // Uploaded date
            const dateTd = document.createElement("td");
            dateTd.style.padding = "12px 16px";
            dateTd.style.color = "var(--text-secondary)";
            dateTd.innerText = new Date(file.uploadDate).toLocaleDateString();
            row.appendChild(dateTd);
            
            // File Size
            const sizeTd = document.createElement("td");
            sizeTd.style.padding = "12px 16px";
            sizeTd.style.color = "var(--text-secondary)";
            sizeTd.innerText = formatBytes(file.fileSize);
            row.appendChild(sizeTd);
            
            // Actions
            const actionsTd = document.createElement("td");
            actionsTd.style.padding = "12px 16px";
            actionsTd.style.textAlign = "right";
            actionsTd.style.display = "flex";
            actionsTd.style.gap = "8px";
            actionsTd.style.justifyContent = "flex-end";
            
            // Download button
            const btnDownload = document.createElement("button");
            btnDownload.className = "timeline-btn";
            btnDownload.innerHTML = `<i data-lucide="download" style="width: 16px; height: 16px;"></i>`;
            btnDownload.onclick = () => downloadSyllabus(file.id);
            btnDownload.title = "Download Syllabus File";
            
            // Delete button
            const btnDelete = document.createElement("button");
            btnDelete.className = "timeline-btn delete-btn";
            btnDelete.innerHTML = `<i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>`;
            btnDelete.onclick = () => deleteSyllabus(file.id);
            btnDelete.title = "Delete Syllabus File";
            
            actionsTd.appendChild(btnDownload);
            actionsTd.appendChild(btnDelete);
            row.appendChild(actionsTd);
            
            tableBody.appendChild(row);
        });
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color:var(--danger-color);">Error loading files: ${err.message}</td></tr>`;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 2. Setup file drop listeners
function setupSyllabusDropZone() {
    const dropZone = document.getElementById("syllabusDropZone");
    const fileInput = document.getElementById("syllabusFileInput");
    if (!dropZone || !fileInput) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => e.preventDefault(), false);
        document.body.addEventListener(eventName, e => e.preventDefault(), false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });
    
    dropZone.addEventListener('drop', e => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleSyllabusFileSelection(files[0]);
        }
    });
    
    fileInput.onchange = () => {
        if (fileInput.files.length > 0) {
            handleSyllabusFileSelection(fileInput.files[0]);
        }
    };
}

function handleSyllabusFileSelection(file) {
    const allowedExtensions = ['pdf', 'docx', 'txt', 'md'];
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(extension)) {
        alert("Unsupported file type! Please upload a PDF, DOCX, TXT, or MD syllabus.");
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        alert("File size exceeds 5MB limit. Please upload a smaller file.");
        return;
    }
    
    currentUploadFile = file;
    // Visually show selected file inside drop zone
    const dropZone = document.getElementById("syllabusDropZone");
    if (dropZone) {
        dropZone.innerHTML = `
            <i data-lucide="file-check" style="width: 36px; height: 36px; color: var(--accent-mint);"></i>
            <p style="margin: 10px 0 4px 0; font-weight: 600; font-size: 0.95rem; color: var(--accent-mint);">${file.name}</p>
            <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary);">${formatBytes(file.size)}</p>
            <button class="btn-primary" onclick="resetSelectedSyllabusFile(event)" style="margin-top: 12px; font-size: 0.8rem; padding: 6px 16px; border-radius: 20px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color:#f87171;">Remove File</button>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
}

function resetSelectedSyllabusFile(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    currentUploadFile = null;
    const dropZone = document.getElementById("syllabusDropZone");
    if (dropZone) {
        dropZone.innerHTML = `
            <i data-lucide="upload-cloud" style="width: 36px; height: 36px; color: var(--accent-indigo);"></i>
            <p style="margin: 10px 0 4px 0; font-weight: 600; font-size: 0.95rem;">Drag & drop your syllabus here</p>
            <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary);">Supports PDF, DOCX, TXT, or MD (Max 5MB)</p>
            <input type="file" id="syllabusFileInput" accept=".pdf,.docx,.txt,.md" style="display: none;">
            <button class="btn-primary" onclick="document.getElementById('syllabusFileInput').click()" style="margin-top: 12px; font-size: 0.8rem; padding: 6px 16px; border-radius: 20px;">Browse Files</button>
        `;
        if (window.lucide) window.lucide.createIcons();
        setupSyllabusDropZone();
    }
}
window.resetSelectedSyllabusFile = resetSelectedSyllabusFile;

// 3. Dynamic parsers loaders
function loadPdfJs() {
    return new Promise((resolve, reject) => {
        if (window['pdfjs-dist/build/pdf']) {
            resolve(window['pdfjs-dist/build/pdf']);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
        script.onload = () => resolve(window['pdfjs-dist/build/pdf']);
        script.onerror = () => reject(new Error("Failed to load PDF.js engine"));
        document.head.appendChild(script);
    });
}

function loadMammoth() {
    return new Promise((resolve, reject) => {
        if (window.mammoth) {
            resolve(window.mammoth);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
        script.onload = () => resolve(window.mammoth);
        script.onerror = () => reject(new Error("Failed to load Mammoth docx parsing engine"));
        document.head.appendChild(script);
    });
}

async function extractTextFromPdf(file) {
    const pdfjsLib = await loadPdfJs();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    const maxPages = Math.min(pdf.numPages, 15);
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
    }
    return fullText;
}

async function extractTextFromDocx(file) {
    const mammoth = await loadMammoth();
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

function extractTextFromTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsText(file);
    });
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
}

// 4. Submit form logic
async function submitSyllabusForm() {
    const textPaste = document.getElementById("syllabusTextPaste").value.trim();
    
    if (!currentUploadFile && !textPaste) {
        alert("Please upload a file or paste syllabus text!");
        return;
    }
    
    const uploadForm = document.getElementById("syllabusUploadForm");
    const loader = document.getElementById("syllabusLoadingStep");
    
    uploadForm.style.display = "none";
    loader.style.display = "block";
    
    try {
        let fileName = "PastedSyllabus.txt";
        let fileType = "text/plain";
        let fileSize = textPaste.length;
        let fileData = "data:text/plain;base64," + btoa(unescape(encodeURIComponent(textPaste)));
        let text = textPaste;
        
        if (currentUploadFile) {
            fileName = currentUploadFile.name;
            fileType = currentUploadFile.type || "application/octet-stream";
            fileSize = currentUploadFile.size;
            
            // Read binary to base64 data URL
            fileData = await readFileAsDataURL(currentUploadFile);
            
            const extension = fileName.split('.').pop().toLowerCase();
            document.getElementById("syllabusLoadingTitle").innerText = `Analyzing ${fileName}...`;
            
            if (extension === 'pdf') {
                text = await extractTextFromPdf(currentUploadFile);
            } else if (extension === 'docx') {
                text = await extractTextFromDocx(currentUploadFile);
            } else {
                text = await extractTextFromTextFile(currentUploadFile);
            }
        }
        
        // Post payload to backend
        const res = await fetch('/api/syllabi', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                fileName,
                fileType,
                fileSize,
                fileData,
                extractedText: text
            })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || `Server status ${res.status}`);
        }
        
        const data = await res.json();
        parsedSyllabusTopics = data.parsed ? (data.parsed.topics || []) : [];
        
        // Display parsed results
        document.getElementById("parsedCourseName").innerText = data.parsed ? (data.parsed.course_name || "General Course Syllabus") : "General Course Syllabus";
        document.getElementById("parsedStudyWeeks").innerText = data.parsed ? (data.parsed.estimated_study_weeks || 12) : 12;
        
        renderSyllabusPreview(parsedSyllabusTopics);
        
        loader.style.display = "none";
        document.getElementById("syllabusPreviewStep").style.display = "flex";
        
    } catch (err) {
        alert("Failed to process syllabus: " + err.message);
        loader.style.display = "none";
        uploadForm.style.display = "flex";
    }
}
window.submitSyllabusForm = submitSyllabusForm;

function renderSyllabusPreview(topics) {
    const container = document.getElementById("syllabusChecklistContainer");
    const countTag = document.getElementById("parsedCountTag");
    if (!container) return;
    
    container.innerHTML = "";
    if (countTag) {
        countTag.innerText = `${topics.length} Topic${topics.length === 1 ? '' : 's'}`;
    }
    
    const courseName = document.getElementById("parsedCourseName").innerText;
    
    topics.forEach((topic, index) => {
        const row = document.createElement("div");
        row.className = "syllabus-topic-row";
        
        const leftArea = document.createElement("div");
        leftArea.style.cssText = "display: flex; align-items: flex-start; gap: 10px; flex: 1; text-align: left;";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "syllabus-topic-checkbox";
        checkbox.style.cursor = "pointer";
        checkbox.style.marginTop = "4px";
        checkbox.dataset.index = index;
        checkbox.checked = true;
        
        const textContent = document.createElement("div");
        textContent.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
        
        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.className = "syllabus-topic-input";
        titleInput.value = topic.title;
        titleInput.style.fontWeight = "700";
        titleInput.onchange = (e) => {
            parsedSyllabusTopics[index].title = e.target.value;
        };
        
        const descP = document.createElement("p");
        descP.style.cssText = "margin: 0; font-size: 0.78rem; color: var(--text-secondary); line-height: 1.3;";
        descP.innerText = topic.description || "Review and master this study chapter.";
        
        const categorySpan = document.createElement("span");
        categorySpan.style.cssText = "font-size: 0.72rem; color: var(--accent-indigo); font-weight: 700; margin-top: 2px;";
        categorySpan.innerText = `📂 ${topic.category || courseName}`;
        
        textContent.appendChild(titleInput);
        textContent.appendChild(descP);
        textContent.appendChild(categorySpan);
        
        leftArea.appendChild(checkbox);
        leftArea.appendChild(textContent);
        
        // Right area: Difficulty Badge
        const rightArea = document.createElement("div");
        const diff = (topic.difficulty || "Medium").toLowerCase();
        let badgeClass = "badge-medium";
        if (diff === 'easy') badgeClass = "badge-easy";
        else if (diff === 'hard') badgeClass = "badge-hard";
        
        rightArea.innerHTML = `<span class="difficulty-badge ${badgeClass}">${topic.difficulty || 'Medium'}</span>`;
        
        row.appendChild(leftArea);
        row.appendChild(rightArea);
        container.appendChild(row);
    });
}

function selectAllSyllabus(checked) {
    const checkboxes = document.querySelectorAll(".syllabus-topic-checkbox");
    checkboxes.forEach(c => c.checked = checked);
}
window.selectAllSyllabus = selectAllSyllabus;

function importSelectedSyllabusTopics() {
    const checkboxes = document.querySelectorAll(".syllabus-topic-checkbox");
    const courseName = document.getElementById("parsedCourseName").innerText;
    let importCount = 0;
    
    checkboxes.forEach(c => {
        if (c.checked) {
            const index = parseInt(c.dataset.index);
            const topic = parsedSyllabusTopics[index];
            if (topic && topic.title) {
                if (typeof window.addNewTopic === 'function') {
                    // Map: subject = category, topic = title, grade = courseName, tag = difficulty
                    window.addNewTopic(topic.category || courseName, topic.title, courseName, topic.difficulty || "Medium");
                    importCount++;
                }
            }
        }
    });
    
    if (importCount > 0) {
        if (typeof renderTagFilters === 'function') {
            renderTagFilters();
        }
        alert(`Imported ${importCount} topics directly into your spaced repetition scheduler!`);
        closeSyllabusManager();
    } else {
        alert("Please check at least one topic to import.");
    }
}
window.importSelectedSyllabusTopics = importSelectedSyllabusTopics;

// 5. Download syllabus file
async function downloadSyllabus(id) {
    try {
        const res = await fetch(`/api/syllabi/${id}`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error("Failed to load file from storage.");
        const file = await res.json();
        
        const downloadLink = document.createElement("a");
        downloadLink.href = file.fileData;
        downloadLink.download = file.fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    } catch (err) {
        alert("Download failed: " + err.message);
    }
}
window.downloadSyllabus = downloadSyllabus;

// 6. Delete syllabus file
async function deleteSyllabus(id) {
    if (!confirm("Are you sure you want to delete this syllabus from your history?")) return;
    
    try {
        const res = await fetch(`/api/syllabi/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error("Failed to delete record.");
        alert("Syllabus deleted successfully.");
        fetchSyllabusHistory();
    } catch (err) {
        alert("Deletion failed: " + err.message);
    }
}
window.deleteSyllabus = deleteSyllabus;