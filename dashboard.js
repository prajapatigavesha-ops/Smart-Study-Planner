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

// --- Dynamic Study Scheduler Engine ---
class StudyScheduler {
    constructor(config = {}) {
        this.priorityWeights = config.priorityWeights || { "High": 3.0, "Medium": 2.0, "Low": 1.0 };
        this.missedBoostFactors = config.missedBoostFactors || { "High": 1.5, "Medium": 1.0, "Low": 0.5 };
        this.epsilon = config.epsilon || 0.1;
    }

    calculateUrgencyScore(topic, referenceDate = new Date()) {
        const priority = topic.priority || "Medium";
        const baseWeight = this.priorityWeights[priority] || 2.0;
        const missedCount = topic.missedCount || 0;
        const boostFactor = this.missedBoostFactors[priority] || 1.0;
        const effectiveWeight = baseWeight + (missedCount * boostFactor);
        
        const daysRemaining = Math.max(0, (new Date(topic.deadline) - referenceDate) / (1000 * 60 * 60 * 24));
        const urgencyScore = effectiveWeight * (1 + (1 / (daysRemaining + this.epsilon)));
        
        return { urgencyScore, effectiveWeight, daysRemaining };
    }

    generateSchedule(topics, dailyHours = 4, referenceDate = new Date()) {
        const scored = topics.map(t => ({ ...t, ...this.calculateUrgencyScore(t, referenceDate) }));
        scored.sort((a, b) => b.urgencyScore - a.urgencyScore);

        const dailyBlocks = [];
        let currentDayIdx = 0, currentDayHoursLeft = dailyHours, currentDayTasks = [];

        const formatDate = (date) => {
            const d = new Date(date);
            const month = '' + (d.getMonth() + 1);
            const day = '' + d.getDate();
            const year = d.getFullYear();
            return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
        };

        const flushDay = () => {
            if (currentDayTasks.length > 0) {
                const date = new Date(referenceDate);
                date.setDate(date.getDate() + currentDayIdx);
                dailyBlocks.push({
                    day: currentDayIdx + 1,
                    date: formatDate(date),
                    hoursScheduled: Number((dailyHours - currentDayHoursLeft).toFixed(2)),
                    tasks: currentDayTasks
                });
            }
        };

        const queue = scored.map(t => ({ topic: t, hoursRemaining: t.duration_hours }));
        while (queue.length > 0) {
            const current = queue.shift();
            const { topic, hoursRemaining } = current;
            if (hoursRemaining <= 0) continue;

            const roundedHours = Number(hoursRemaining.toFixed(2));
            const roundedDayLeft = Number(currentDayHoursLeft.toFixed(2));

            if (roundedHours <= roundedDayLeft) {
                currentDayTasks.push({
                    id: topic.id,
                    title: topic.text,
                    priority: topic.priority,
                    deadline: topic.deadline,
                    urgencyScore: Number(topic.urgencyScore.toFixed(3)),
                    hoursScheduled: roundedHours,
                    isSplit: false,
                    completed: topic.completed,
                    tag: topic.tag,
                    missedCount: topic.missedCount
                });
                currentDayHoursLeft -= roundedHours;
            } else {
                const allocated = roundedDayLeft;
                if (allocated > 0) {
                    currentDayTasks.push({
                        id: topic.id,
                        title: topic.text,
                        priority: topic.priority,
                        deadline: topic.deadline,
                        urgencyScore: Number(topic.urgencyScore.toFixed(3)),
                        hoursScheduled: allocated,
                        isSplit: true,
                        segment: "Part 1",
                        completed: topic.completed,
                        tag: topic.tag,
                        missedCount: topic.missedCount
                    });
                }
                queue.unshift({ topic, hoursRemaining: roundedHours - allocated });
                flushDay();
                currentDayIdx++;
                currentDayHoursLeft = dailyHours;
                currentDayTasks = [];
            }
        }
        flushDay();
        return dailyBlocks;
    }
}
const scheduler = new StudyScheduler();

// Daily Hours Budget management
let dailyHoursBudget = Number(localStorage.getItem('study_hours_budget')) || 4;

function changeStudyBudget(value) {
    dailyHoursBudget = Number(value);
    localStorage.setItem('study_hours_budget', value);
    renderTasks();
}
window.changeStudyBudget = changeStudyBudget;

// --- Logout ---
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}

// Helper to decode username from JWT token
function getUsernameFromToken() {
    const t = localStorage.getItem('token');
    if (!t) return 'Guest';
    try {
        const base64Url = t.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload).username || 'John Doe';
    } catch (e) {
        return 'John Doe';
    }
}

// Toggle profile dropdown card
function toggleProfileDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}
window.toggleProfileDropdown = toggleProfileDropdown;

// Close profile dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profileDropdown');
    const btn = document.querySelector('.profile-avatar-btn');
    if (dropdown && dropdown.classList.contains('active')) {
        if (!dropdown.contains(e.target) && (!btn || !btn.contains(e.target))) {
            dropdown.classList.remove('active');
        }
    }
});

// Toggle profile editing mode
function toggleProfileEdit(editState) {
    const viewMode = document.getElementById('profileViewMode');
    const editMode = document.getElementById('profileEditMode');
    if (viewMode && editMode) {
        if (editState) {
            const username = getUsernameFromToken();
            const prefix = username + '_';
            document.getElementById('editProfileName').value = localStorage.getItem(prefix + 'profile_name') || username;
            document.getElementById('editProfileEducation').value = localStorage.getItem(prefix + 'profile_education') || '';
            document.getElementById('editProfileInterests').value = localStorage.getItem(prefix + 'profile_interests') || '';
            
            viewMode.style.display = 'none';
            editMode.style.display = 'block';
        } else {
            viewMode.style.display = 'block';
            editMode.style.display = 'none';
        }
    }
}
window.toggleProfileEdit = toggleProfileEdit;

// Save profile data to localStorage
function saveProfileData() {
    const nameVal = document.getElementById('editProfileName').value.trim();
    const eduVal = document.getElementById('editProfileEducation').value.trim();
    const intVal = document.getElementById('editProfileInterests').value.trim();
    
    const username = getUsernameFromToken();
    const prefix = username + '_';
    
    localStorage.setItem(prefix + 'profile_name', nameVal);
    localStorage.setItem(prefix + 'profile_education', eduVal);
    localStorage.setItem(prefix + 'profile_interests', intVal);
    
    const nameDisp = document.getElementById('profileNameDisplay');
    const eduDisp = document.getElementById('profileEducationDisplay');
    const intDisp = document.getElementById('profileInterestsDisplay');
    
    const finalName = nameVal || username;
    
    if (nameDisp) nameDisp.innerText = finalName;
    if (eduDisp) eduDisp.innerHTML = eduVal || '<span style="color:rgba(255,255,255,0.3); font-style:italic;">Not set</span>';
    if (intDisp) intDisp.innerHTML = intVal || '<span style="color:rgba(255,255,255,0.3); font-style:italic;">Not set</span>';
    
    const initialsImg = document.querySelector('.profile-avatar-img');
    if (initialsImg) {
        initialsImg.innerText = finalName.substring(0, 2).toUpperCase();
    }
    
    toggleProfileEdit(false);
}
window.saveProfileData = saveProfileData;

// Ensure there is a profile dropdown injected into the nav
document.addEventListener("DOMContentLoaded", () => {
    const navDiv = document.getElementById('navButtons') || document.querySelector('nav div');
    if (navDiv && !document.getElementById('profileDropdown')) {
        const username = getUsernameFromToken();
        const prefix = username + '_';
        
        const storedName = localStorage.getItem(prefix + 'profile_name');
        const storedEducation = localStorage.getItem(prefix + 'profile_education');
        const storedInterests = localStorage.getItem(prefix + 'profile_interests');
        
        const profileName = storedName !== null && storedName !== "" ? storedName : username;
        const profileEducation = storedEducation !== null ? storedEducation : '';
        const profileInterests = storedInterests !== null ? storedInterests : '';
        
        const initials = profileName.substring(0, 2).toUpperCase();
        
        const profileContainer = document.createElement('div');
        profileContainer.className = 'profile-container';
        profileContainer.innerHTML = `
            <button onclick="toggleProfileDropdown(event)" class="profile-avatar-btn">
                <div class="profile-avatar-img">${initials}</div>
            </button>
            <div id="profileDropdown" class="profile-dropdown-card">
                <!-- View Mode -->
                <div id="profileViewMode">
                    <div class="profile-dropdown-header">
                        <p class="profile-dropdown-name" id="profileNameDisplay">${profileName}</p>
                        <p class="profile-dropdown-username">@${username}</p>
                    </div>
                    <div class="profile-dropdown-info">
                        <div class="profile-dropdown-info-item">
                            <span class="profile-dropdown-info-label">Degree/Major</span>
                            <span class="profile-dropdown-info-val" id="profileEducationDisplay">${profileEducation || '<span style="color:rgba(255,255,255,0.3); font-style:italic;">Not set</span>'}</span>
                        </div>
                        <div class="profile-dropdown-info-item">
                            <span class="profile-dropdown-info-label">Institution</span>
                            <span class="profile-dropdown-info-val" id="profileInterestsDisplay">${profileInterests || '<span style="color:rgba(255,255,255,0.3); font-style:italic;">Not set</span>'}</span>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
                        <button onclick="toggleProfileEdit(true)" style="width: 100%; padding: 8px; font-size: 0.8rem; border-radius: 20px; font-weight: 600; cursor: pointer; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); color: var(--text-primary); transition: all 0.3s ease;">✏️ Edit Profile</button>
                        <button onclick="logout()" id="logoutBtn" style="background:transparent; color:var(--danger-color); border:1px solid var(--danger-color); padding: 8px 16px; cursor:pointer; border-radius:50px; font-family: var(--font-body); font-weight: 600; font-size: 0.85rem; width: 100%;">Log Out</button>
                    </div>
                </div>
                
                <!-- Edit Mode -->
                <div id="profileEditMode" style="display: none;">
                    <div class="profile-dropdown-header">
                        <h4 style="margin: 0; font-size: 1.1rem; color: var(--text-primary); font-family: var(--font-body); font-weight: 700;">Edit Profile</h4>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; margin-top: 10px;">
                        <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
                            <label style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: var(--accent-indigo); letter-spacing: 0.05em;">Full Name</label>
                            <input type="text" id="editProfileName" value="${profileName}">
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
                            <label style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: var(--accent-indigo); letter-spacing: 0.05em;">Degree/Major</label>
                            <input type="text" id="editProfileEducation" value="${profileEducation}">
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
                            <label style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: var(--accent-indigo); letter-spacing: 0.05em;">Institution</label>
                            <input type="text" id="editProfileInterests" value="${profileInterests}">
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--glass-border); padding-top: 12px;">
                        <button onclick="toggleProfileEdit(false)" style="padding: 8px 16px; font-size: 0.8rem; border-radius: 20px; font-weight: 600; cursor: pointer; background: transparent; border: 1px solid var(--glass-border); color: var(--text-secondary); transition: all 0.3s ease;">Cancel</button>
                        <button onclick="saveProfileData()" class="btn-primary" style="padding: 8px 16px; font-size: 0.8rem; border-radius: 20px; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">Save</button>
                    </div>
                </div>
            </div>
        `;
        navDiv.appendChild(profileContainer);
    }
    const budgetSelect = document.getElementById("studyBudgetSelect");
    if (budgetSelect) {
        budgetSelect.value = dailyHoursBudget.toString();
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

function getDynamicTimelineSlots() {
    const now = new Date();
    let startHour = now.getHours();
    if (now.getMinutes() > 0) {
        startHour = (startHour + 1) % 24;
    }
    
    const slots = [];
    for (let i = 0; i < 7; i++) {
        const h = (startHour + i * 2) % 24;
        const ampm = h >= 12 ? 'PM' : 'AM';
        let displayHour = h % 12;
        if (displayHour === 0) displayHour = 12;
        slots.push(`${displayHour}:00 ${ampm}`);
    }
    return slots;
}
const timelineSlots = getDynamicTimelineSlots();
const taskSlotsMap = JSON.parse(localStorage.getItem('taskSlots') || '{}');

function renderTasks() {
  // Render filters dynamically to stay in sync with tasks and topics
  renderTagFilters();

  const timelineList = document.getElementById("timelineList");
  if (!timelineList) return;
  timelineList.innerHTML = "";

  // Filter tasks by activeFilter
  const filteredTasks = activeFilter === 'All'
    ? tasks
    : tasks.filter(t => t.tag === activeFilter);

  const incompleteTasks = filteredTasks.filter(t => !t.completed);
  const completedTasks = filteredTasks.filter(t => t.completed);

  // Run the scheduler algorithm on incomplete tasks
  const dailyBlocks = scheduler.generateSchedule(incompleteTasks, dailyHoursBudget, new Date());

  if (dailyBlocks.length === 0 && completedTasks.length === 0) {
    timelineList.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding: 20px; font-style:italic; font-size:0.95rem;">No tasks scheduled under '${activeFilter}'. Add topics above!</div>`;
    updateVisuals();
    return;
  }

  // Helper to get relative day label
  const getDayLabel = (block) => {
    if (block.day === 1) return "Day 1 (Today)";
    if (block.day === 2) return "Day 2 (Tomorrow)";
    return `Day ${block.day}`;
  };

  // Render Daily Blocks
  dailyBlocks.forEach(block => {
    const dayHeader = document.createElement("div");
    dayHeader.className = "day-header";
    dayHeader.style = "margin-top: 15px; margin-bottom: 10px; font-weight: 800; font-size: 0.95rem; color: var(--accent-indigo); text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 4px;";
    dayHeader.innerHTML = `
      <span>📅 ${getDayLabel(block)} — ${block.date}</span>
      <span style="color: var(--text-secondary); font-size: 0.8rem;">${block.hoursScheduled} / ${dailyHoursBudget} hrs</span>
    `;
    timelineList.appendChild(dayHeader);

    block.tasks.forEach(task => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "timeline-item";
      itemDiv.style = "margin-bottom: 12px;";

      // Determine priority badge styles
      let prioBg = "rgba(148, 163, 184, 0.1)";
      let prioBorder = "rgba(148, 163, 184, 0.25)";
      let prioColor = "#94a3b8";
      if (task.priority === "High") {
        prioBg = "rgba(239, 68, 68, 0.15)";
        prioBorder = "rgba(239, 68, 68, 0.35)";
        prioColor = "#f87171";
      } else if (task.priority === "Medium") {
        prioBg = "rgba(245, 158, 11, 0.15)";
        prioBorder = "rgba(245, 158, 11, 0.35)";
        prioColor = "#fbbf24";
      }

      // Check if task is overdue
      const isOverdue = new Date(task.deadline) < new Date(new Date().setHours(0,0,0,0));
      const overdueBadge = isOverdue ? `<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; padding: 1px 6px; font-size: 0.72rem; font-weight: 700; margin-left: 6px; display: inline-flex; align-items: center; gap: 3px;">⚠️ Overdue</span>` : '';

      // Check if task is split
      const splitBadge = task.isSplit ? `<span style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 4px; padding: 1px 6px; font-size: 0.72rem; font-weight: 700; margin-left: 6px;">Split: ${task.segment || 'Part 1'}</span>` : '';

      // Missed count alert
      const missedBadge = task.missedCount > 0 ? `<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px dashed rgba(239, 68, 68, 0.35); border-radius: 4px; padding: 1px 6px; font-size: 0.72rem; font-weight: 700; margin-left: 6px;">⚠️ Missed x${task.missedCount}</span>` : '';

      itemDiv.innerHTML = `
        <div class="timeline-card" style="display:flex; flex-direction:column; padding: 14px; gap: 8px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; width: 100%;">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
              <div class="timeline-checkbox" onclick="toggleTaskById(${task.id})" style="flex-shrink:0; cursor:pointer;"></div>
              <span class="timeline-task-text" style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary);">
                ${task.title}
                ${task.tag ? `<span class="tag-badge" style="margin-left: 6px;">${task.tag}</span>` : ''}
                ${splitBadge}
                ${overdueBadge}
                ${missedBadge}
              </span>
            </div>
            
            <div class="timeline-actions" style="display: flex; gap: 6px; align-items: center;">
              <button class="timeline-btn reschedule-btn" onclick="markTaskMissed(${task.id})" title="Mark as Missed" style="font-size: 0.82rem; padding: 4px 8px; border-radius: 6px; background: rgba(255,255,255,0.04); border: 1px solid var(--glass-border); color: #fbbf24; cursor:pointer;">⚠️ Missed</button>
              <button class="timeline-btn delete-btn" onclick="deleteTaskById(${task.id})" title="Delete Task" style="font-size: 0.82rem; padding: 4px 6px; border-radius: 6px; background: rgba(255,255,255,0.04); border: 1px solid var(--glass-border); color: var(--danger-color); cursor:pointer;">❌</button>
            </div>
          </div>

          <!-- Metadata Row -->
          <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); border-top: 1px solid rgba(255,255,255,0.03); padding-top: 8px; align-items: center;">
            <span style="background: ${prioBg}; border: 1px solid ${prioBorder}; color: ${prioColor}; border-radius: 6px; padding: 2px 8px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 800;">${task.priority}</span>
            <span>⏳ ${task.hoursScheduled} ${task.hoursScheduled === 1 ? 'hr' : 'hrs'}</span>
            <span>📅 Due: ${task.deadline}</span>
            <span style="color: var(--accent-mint);">🔥 Urgency: ${task.urgencyScore}</span>
          </div>
        </div>
      `;
      timelineList.appendChild(itemDiv);
    });
  });

  // Render Completed Tasks Section
  if (completedTasks.length > 0) {
    const completedHeader = document.createElement("div");
    completedHeader.className = "day-header";
    completedHeader.style = "margin-top: 30px; margin-bottom: 10px; font-weight: 800; font-size: 0.95rem; color: var(--accent-mint); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 4px;";
    completedHeader.innerText = `✅ Completed Topics (${completedTasks.length})`;
    timelineList.appendChild(completedHeader);

    completedTasks.forEach(task => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "timeline-item completed";
      itemDiv.style = "margin-bottom: 12px; opacity: 0.65;";
      itemDiv.innerHTML = `
        <div class="timeline-card completed" style="display:flex; align-items: center; justify-content: space-between; padding: 12px 14px;">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
            <div class="timeline-checkbox checked" onclick="toggleTaskById(${task.id})" style="flex-shrink:0; cursor:pointer;">✓</div>
            <span class="timeline-task-text completed" style="text-decoration: line-through; color: var(--text-secondary); font-size: 0.95rem;">
              ${task.text}
              ${task.tag ? `<span class="tag-badge" style="opacity: 0.5;">${task.tag}</span>` : ''}
            </span>
          </div>
          <div class="timeline-actions">
            <button class="timeline-btn delete-btn" onclick="deleteTaskById(${task.id})" title="Delete Task" style="font-size: 0.82rem; padding: 4px 6px; border-radius: 6px; background: rgba(255,255,255,0.04); border: 1px solid var(--glass-border); color: var(--danger-color); cursor:pointer;">❌</button>
          </div>
        </div>
      `;
      timelineList.appendChild(itemDiv);
    });
  }

  updateVisuals();
}

function updateVisuals() {
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
  const priorityInput = document.getElementById("taskPriorityInput");
  const durationInput = document.getElementById("taskDurationInput");
  const deadlineInput = document.getElementById("taskDeadlineInput");

  const taskText = input.value.trim();
  const taskTag = tagInput ? tagInput.value.trim() : "";
  const taskPriority = priorityInput ? priorityInput.value : "Medium";
  const taskDuration = durationInput ? parseFloat(durationInput.value) : 1.0;
  
  let taskDeadline = deadlineInput ? deadlineInput.value : "";
  if (!taskDeadline) {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      taskDeadline = d.toISOString().split('T')[0];
  }

  if (taskText === "") return;
  
  try {
      const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ 
              text: taskText, 
              completed: false, 
              tag: taskTag,
              priority: taskPriority,
              deadline: taskDeadline,
              duration_hours: taskDuration
          })
      });
      if (res.ok) {
          const newTask = await res.json();
          tasks.push(newTask);
          renderTasks();
          
          input.value = "";
          if (tagInput) tagInput.value = "";
          if (priorityInput) priorityInput.value = "Medium";
          if (durationInput) durationInput.value = "1.0";
          if (deadlineInput) deadlineInput.value = "";
      }
  } catch(err) { console.error(err); }
}

async function markTaskMissed(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const currentMissedCount = task.missedCount || 0;
  const newMissedCount = currentMissedCount + 1;
  
  task.missedCount = newMissedCount;
  renderTasks();
  
  try {
      await fetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ missedCount: newMissedCount })
      });
  } catch(err) { console.error(err); }
}
window.markTaskMissed = markTaskMissed;
window.addTask = addTask;

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
      incrementDailyStudySeconds(1);
      if (totalStudyTime % 60 === 0) {
          saveStats();
          updateTimerStats();
          updateChart();
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
function incrementDailyStudySeconds(seconds) {
  const username = getUsernameFromToken();
  if (!username || username === 'Guest' || username === 'John Doe') return;
  const prefix = username + '_';
  const history = JSON.parse(localStorage.getItem(prefix + 'study_history') || '{}');
  const todayStr = getLocalDateString(new Date());
  history[todayStr] = (history[todayStr] || 0) + seconds;
  localStorage.setItem(prefix + 'study_history', JSON.stringify(history));
}

function initializeStreakGrid(username) {
  const prefix = username + '_';
  let grid = localStorage.getItem(prefix + 'streakGrid');
  if (!grid) {
      const streakGrid = {};
      const today = new Date();
      // Initialize the past 34 days to 0 for a fresh start for new users
      for (let i = 0; i < 34; i++) {
          const d = new Date();
          d.setDate(today.getDate() - (34 - i));
          streakGrid[getLocalDateString(d)] = 0;
      }
      streakGrid[getLocalDateString(today)] = 0;
      localStorage.setItem(prefix + 'streakGrid', JSON.stringify(streakGrid));
  }
}

function generateHeatmap() {
  const matrix = document.getElementById("heatmapMatrix");
  if (!matrix) return;
  matrix.innerHTML = "";
  
  const username = getUsernameFromToken();
  const prefix = username + '_';
  initializeStreakGrid(username);
  
  const grid = JSON.parse(localStorage.getItem(prefix + 'streakGrid')) || {};
  const today = new Date();
  
  // Sync today's sessionsCompleted with the grid
  const todayStr = getLocalDateString(today);
  grid[todayStr] = sessionsCompleted;
  localStorage.setItem(prefix + 'streakGrid', JSON.stringify(grid));
  
  const levels = [];
  const dates = [];
  
  for (let i = 0; i < 35; i++) {
      const d = new Date();
      d.setDate(today.getDate() - (34 - i));
      const dStr = getLocalDateString(d);
      const count = grid[dStr] || 0;
      levels.push(Math.min(3, count));
      dates.push({ dateStr: dStr, isToday: i === 34 });
  }
  
  levels.forEach((level, idx) => {
      const cell = document.createElement("div");
      const dateInfo = dates[idx];
      
      cell.className = `heatmap-cell streak-level-${level} ${dateInfo.isToday ? 'today-cell' : ''}`;
      
      const dayLabel = dateInfo.isToday ? "Today" : `Day -${levels.length - 1 - idx}`;
      const mins = level === 3 ? "75+ mins" : level === 2 ? "50 mins" : level === 1 ? "25 mins" : "0 mins";
      cell.setAttribute("data-tooltip", `${dayLabel}: Study level ${level} (${mins})`);
      matrix.appendChild(cell);
  });
}

function getDynamicGreeting() {
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 4) {
      return "Hello, Night Owl! Ready for a late session?";
  } else if (hour >= 4 && hour < 12) {
      return "Good morning!";
  } else if (hour >= 12 && hour < 17) {
      return "Good afternoon!";
  } else {
      return "Good evening!";
  }
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
      brief = `${getDynamicGreeting()} Your timeline schedule is optimized. You have ${pendingTasks} topics scheduled today. Begin a Pomodoro timer session to kick off.`;
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
    
    // Gather user study state for context-aware chatbot response
    const userState = {
        streak: parseInt(localStorage.getItem('current_streak_count') || '0'),
        overdueCount: 0,
        overdueList: [],
        totalTopics: window.studyTopics ? window.studyTopics.length : 0,
        masteredTopics: window.studyTopics ? window.studyTopics.filter(t => t.mastered).length : 0
    };
    
    if (window.calendarStore && window.studyTopics) {
        const now = new Date();
        const overdueEvents = window.calendarStore.filter(e => e.status === 'pending' && new Date(e.startDateTime) < now);
        userState.overdueCount = overdueEvents.length;
        
        const uniqueOverdue = new Set();
        overdueEvents.forEach(evt => {
            const topic = window.studyTopics.find(t => t.id === evt.topicId);
            if (topic) {
                uniqueOverdue.add(`${topic.subject} - ${topic.topic}`);
            }
        });
        userState.overdueList = Array.from(uniqueOverdue);
    }
    
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                message: msg,
                userState: userState
            })
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
}// --- Tag Filtering System for Authenticated Dashboard ---
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
        pill.style.display = "inline-flex";
        pill.style.alignItems = "center";
        
        if (tag === 'All') {
            pill.innerText = tag;
            pill.onclick = () => {
                activeFilter = tag;
                renderTagFilters();
                renderTasks();
                renderSpacedRepetition();
            };
        } else {
            pill.innerHTML = `
                <span>${tag}</span>
                <span class="delete-tag-btn" onclick="deleteTagCategory('${tag}', event)" title="Delete entire category">&times;</span>
            `;
            pill.onclick = () => {
                activeFilter = tag;
                renderTagFilters();
                renderTasks();
                renderSpacedRepetition();
            };
        }
        bar.appendChild(pill);
    });
    
    container.appendChild(bar);
}

async function deleteTagCategory(tag, event) {
    if (event) event.stopPropagation();
    if (!confirm(`Are you sure you want to delete the topic "${tag}" and all its tasks/reviews?`)) {
        return;
    }
    
    // 1. Delete tasks with this tag
    const tasksToDelete = tasks.filter(t => t.tag === tag);
    for (const task of tasksToDelete) {
        // Delete from local array
        const index = tasks.findIndex(t => t.id === task.id);
        if (index !== -1) tasks.splice(index, 1);
        
        // Remove slot mapping
        if (typeof taskSlotsMap !== 'undefined') {
            delete taskSlotsMap[task.id];
        }
        
        // Delete from server
        try {
            await fetch(`/api/tasks/${task.id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
        } catch (err) {
            console.error(err);
        }
    }
    if (typeof taskSlotsMap !== 'undefined') {
        localStorage.setItem('taskSlots', JSON.stringify(taskSlotsMap));
    }
    
    // 2. Delete study topics with this tag or subject
    if (window.studyTopics) {
        window.studyTopics = window.studyTopics.filter(t => t.tag !== tag && t.subject !== tag);
        localStorage.setItem('studyTopics', JSON.stringify(window.studyTopics));
    }
    
    // 3. Clear reviews from calendarStore
    if (window.calendarStore) {
        const remainingTopics = window.studyTopics || [];
        const remainingTopicIds = new Set(remainingTopics.map(t => t.id));
        window.calendarStore = window.calendarStore.filter(evt => remainingTopicIds.has(evt.topicId));
        localStorage.setItem('calendarStore', JSON.stringify(window.calendarStore));
    }
    
    // 4. Reset active filter if deleted
    if (activeFilter === tag) {
        activeFilter = 'All';
    }
    
    // 5. Re-render
    renderTagFilters();
    renderTasks();
    renderSpacedRepetition();
}
window.deleteTagCategory = deleteTagCategory;

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
        
        const dateInput = document.getElementById("syllabusStartDate");
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
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
    const startDateVal = document.getElementById("syllabusStartDate").value;
    const examDateVal = document.getElementById("syllabusExamDate").value;
    
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
        
        // Post payload to schedule generator endpoint
        const res = await fetch('/api/schedule/generate', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                syllabusText: text,
                startDate: startDateVal,
                targetExamDate: examDateVal
            })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || `Server status ${res.status}`);
        }
        
        const data = await res.json();
        const schedule = data.schedule || {};
        
        // Map schedule topics to parsedSyllabusTopics format
        parsedSyllabusTopics = (schedule.topics || []).map(t => ({
            title: t.topic_title,
            description: `Study and master this unit (Estimated: ${t.estimated_minutes} min). Module: ${t.unit_or_module}.`,
            category: t.unit_or_module,
            difficulty: t.difficulty,
            initial_study_date: t.initial_study_date,
            spaced_review_dates: t.spaced_review_dates
        }));
        
        // Display parsed results
        document.getElementById("parsedCourseName").innerText = schedule.course_summary || "Course Syllabus Study Outline";
        document.getElementById("parsedStudyWeeks").innerText = Math.ceil((schedule.total_topics || 3) / 2) || 12;
        
        renderSyllabusPreview(parsedSyllabusTopics);
        
        // Save file to database history in the background if a file was uploaded
        if (currentUploadFile) {
            fetch('/api/syllabi', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    fileName,
                    fileType,
                    fileSize,
                    fileData
                })
            }).catch(err => console.error("Failed to save syllabus to database history:", err));
        }
        
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
    
    const userPrefixKey = typeof window.getPrefixedKey === 'function' ? window.getPrefixedKey('') : '';

    checkboxes.forEach(c => {
        if (c.checked) {
            const index = parseInt(c.dataset.index);
            const topic = parsedSyllabusTopics[index];
            if (topic && topic.title) {
                const topicId = 'topic-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
                
                // Add topic to active lists
                const newTopic = {
                    id: topicId,
                    subject: topic.category || courseName,
                    topic: topic.title,
                    grade: courseName,
                    tag: topic.difficulty || "Medium",
                    mastered: true // Auto-mastered since review schedule is established
                };
                
                if (window.studyTopics) {
                    window.studyTopics.push(newTopic);
                }
                
                // Add pre-calculated review dates to calendarStore
                if (topic.spaced_review_dates && topic.spaced_review_dates.length > 0 && window.calendarStore) {
                    topic.spaced_review_dates.forEach((dateStr, rIndex) => {
                        const reviewDate = new Date(dateStr);
                        reviewDate.setHours(9, 0, 0, 0); // Standardize to 9:00 AM
                        
                        const endDateTime = new Date(reviewDate.getTime());
                        endDateTime.setMinutes(endDateTime.getMinutes() + 30);
                        
                        window.calendarStore.unshift({
                            id: 'evt-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36),
                            topicId: topicId,
                            title: `Review ${rIndex + 1}: ${newTopic.subject} - ${newTopic.topic} (${courseName})`,
                            startDateTime: reviewDate.toISOString(),
                            endDateTime: endDateTime.toISOString(),
                            status: 'pending',
                            intervalStep: rIndex + 1
                        });
                    });
                }
                importCount++;
            }
        }
    });
    
    if (importCount > 0) {
        if (window.studyTopics) {
            localStorage.setItem(userPrefixKey + 'studyTopics', JSON.stringify(window.studyTopics));
        }
        if (window.calendarStore) {
            localStorage.setItem(userPrefixKey + 'calendarStore', JSON.stringify(window.calendarStore));
        }
        
        // Re-render spaced repetition container
        if (typeof renderSpacedRepetition === 'function') {
            renderSpacedRepetition();
        }
        if (typeof renderTagFilters === 'function') {
            renderTagFilters();
        }
        
        alert(`Imported ${importCount} topics with spaced repetition schedules into your planner!`);
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