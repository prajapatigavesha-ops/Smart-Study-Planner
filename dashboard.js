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
    const navDiv = document.querySelector('nav div');
    if (navDiv && !document.getElementById('logoutBtn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.innerText = 'Log Out';
        logoutBtn.style.cssText = "background:transparent; color:#fff; border:1px solid #ff4444; margin-left:15px; cursor:pointer;";
        logoutBtn.onclick = logout;
        navDiv.appendChild(logoutBtn);
    }
    fetchTasks();
    fetchStats();
});

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

function renderTasks() {
  const taskList = document.getElementById("taskList");
  if (!taskList) return;
  taskList.innerHTML = "";
  
  // Reset analytics data
  subjects = {};

  tasks.forEach((task, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span onclick="toggleTask(${index})" class="${task.completed ? 'completed' : ''}">${task.text}</span>
      <button onclick="deleteTask(${index})">❌</button>
    `;
    taskList.appendChild(li);

    // Calculate analytics for completed tasks
    if (task.completed) {
      if (!subjects[task.text]) subjects[task.text] = 0;
      subjects[task.text]++;
    }
  });

  if (typeof updateChart === 'function') {
    updateChart();
  }
}

async function addTask() {
  const input = document.getElementById("taskInput");
  const taskText = input.value.trim();
  if (taskText === "") return;
  
  try {
      const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ text: taskText, completed: false })
      });
      if (res.ok) {
          const newTask = await res.json();
          tasks.push(newTask);
          renderTasks();
          input.value = "";
      }
  } catch(err) { console.error(err); }
}

async function toggleTask(index) {
  const task = tasks[index];
  const newStatus = !task.completed;
  
  // Optimistic UI update
  task.completed = newStatus;
  renderTasks();
  
  try {
      await fetch(`/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ completed: newStatus })
      });
  } catch(err) { console.error(err); }
}

async function deleteTask(index) {
  const task = tasks[index];
  // Optimistic UI update
  tasks.splice(index, 1);
  renderTasks();
  
  try {
      await fetch(`/api/tasks/${task.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
      });
  } catch(err) { console.error(err); }
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
      timerModeEl.style.color = mode === 'study' ? "#1976d2" : "#4caf50";
  }
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

let barChartInstance;
let pieChartInstance;

function updateChart() {
  const totalTasksCount = tasks.length;
  const completedTasksCount = tasks.filter(t => t.completed).length;
  const pendingTasksCount = totalTasksCount - completedTasksCount;
  
  const completionPercent = totalTasksCount === 0 ? 0 : Math.round((completedTasksCount / totalTasksCount) * 100);

  const totalEl = document.getElementById("totalTasks");
  if (totalEl) totalEl.innerText = totalTasksCount;
  
  const compEl = document.getElementById("completionPercent");
  if (compEl) compEl.innerText = completionPercent + "%";

  const barCtxEl = document.getElementById("barChart");
  if (!barCtxEl) return;
  const barCtx = barCtxEl.getContext("2d");
  
  const pieCtxEl = document.getElementById("pieChart");
  if (!pieCtxEl) return;
  const pieCtx = pieCtxEl.getContext("2d");

  if (barChartInstance) barChartInstance.destroy();
  if (pieChartInstance) pieChartInstance.destroy();

  const isDark = document.documentElement.classList.contains('dark');
  if (typeof Chart !== 'undefined') {
      Chart.defaults.color = isDark ? '#e0e0e0' : '#666';

      barChartInstance = new Chart(barCtx, {
        type: "bar",
        data: {
          labels: Object.keys(subjects),
          datasets: [{
            label: "Tasks Completed",
            data: Object.values(subjects),
            backgroundColor: "#1976d2",
            borderWidth: 1
          }]
        },
        options: {
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } }
          }
        }
      });

      pieChartInstance = new Chart(pieCtx, {
        type: "pie",
        data: {
          labels: ["Completed", "Pending"],
          datasets: [{
            data: [completedTasksCount, pendingTasksCount],
            backgroundColor: ["#4caf50", "#f44336"],
            borderWidth: 1
          }]
        }
      });
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