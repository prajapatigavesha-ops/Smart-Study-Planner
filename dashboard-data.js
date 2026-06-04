/**
 * Modular Mock Data File & State Controller representing a student's study metrics.
 */

// Helper to get local YYYY-MM-DD date string
function getLocalDateString(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}
window.getLocalDateString = getLocalDateString;

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
window.getUsernameFromToken = getUsernameFromToken;

// Helper to calculate current week's dates (Monday to Sunday)
function getDatesForCurrentWeek() {
    const today = new Date();
    const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday, etc.
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    
    const dates = [];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(today.getDate() + distanceToMonday + i);
        dates.push({
            dayLabel: days[i],
            dateStr: getLocalDateString(d)
        });
    }
    return dates;
}

const studentMetrics = {
    subjectMastery: [
        { subject: 'Math', mastery: 85 },
        { subject: 'History', mastery: 65 },
        { subject: 'Coding', mastery: 95 },
        { subject: 'Science', mastery: 78 },
        { subject: 'Literature', mastery: 70 }
    ],
    hourlyProductivity: [
        { hour: '08:00', focusScore: 60, tasks: ['Read Academic Paper', 'Completed Morning Quiz'] },
        { hour: '10:00', focusScore: 85, tasks: ['Math practice exercises', 'Refactored code structure'] },
        { hour: '12:00', focusScore: 40, tasks: ['Quick sync with peer group'] },
        { hour: '14:00', focusScore: 70, tasks: ['History chapter 3 summary', 'Vocabulary drill'] },
        { hour: '16:00', focusScore: 95, tasks: ['Wrote full-stack DB migrations', 'Integrated JWT auth'] },
        { hour: '18:00', focusScore: 55, tasks: ['Drafted lab research notes'] },
        { hour: '20:00', focusScore: 30, tasks: ['Organized tomorrow\'s agenda'] }
    ]
};

const studentMetricsController = {
    data: studentMetrics,
    
    getWeeklyLabels() {
        return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    },
    getWeeklyFocus() {
        const username = getUsernameFromToken();
        const prefix = username + '_';
        const history = JSON.parse(localStorage.getItem(prefix + 'study_history') || '{}');
        const weekDates = getDatesForCurrentWeek();
        
        return weekDates.map(wd => {
            const seconds = history[wd.dateStr] || 0;
            return Math.round(seconds / 60); // convert to minutes
        });
    },
    getWeeklyTarget() {
        const targetMinutes = parseInt(localStorage.getItem('study_target_minutes')) || 150;
        return [targetMinutes, targetMinutes, targetMinutes, targetMinutes, targetMinutes, targetMinutes, targetMinutes];
    },
    getWeeklyBreaks() {
        return [0, 0, 0, 0, 0, 0, 0];
    },
    getSubjectLabels() {
        return this.data.subjectMastery.map(s => s.subject);
    },
    getSubjectMasteryValues() {
        return this.data.subjectMastery.map(s => s.mastery);
    },
    getHourlyLabels() {
        return this.data.hourlyProductivity.map(h => h.hour);
    },
    getHourlyScores() {
        return this.data.hourlyProductivity.map(h => h.focusScore);
    },
    getHourlyTasks(index) {
        if (index >= 0 && index < this.data.hourlyProductivity.length) {
            return this.data.hourlyProductivity[index].tasks;
        }
        return [];
    }
};
window.studentMetricsController = studentMetricsController;
