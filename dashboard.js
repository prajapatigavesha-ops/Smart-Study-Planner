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