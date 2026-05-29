/**
 * Modular Mock Data File & State Controller representing a student's study metrics.
 */
const studentMetrics = {
    weeklyStudyTrends: [
        { day: 'Mon', focusMinutes: 120, targetMinutes: 150, breaks: 3 },
        { day: 'Tue', focusMinutes: 180, targetMinutes: 150, breaks: 4 },
        { day: 'Wed', focusMinutes: 90, targetMinutes: 150, breaks: 2 },
        { day: 'Thu', focusMinutes: 210, targetMinutes: 150, breaks: 5 },
        { day: 'Fri', focusMinutes: 150, targetMinutes: 150, breaks: 3 },
        { day: 'Sat', focusMinutes: 240, targetMinutes: 180, breaks: 6 },
        { day: 'Sun', focusMinutes: 180, targetMinutes: 180, breaks: 4 }
    ],
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
        return this.data.weeklyStudyTrends.map(t => t.day);
    },
    getWeeklyFocus() {
        return this.data.weeklyStudyTrends.map(t => t.focusMinutes);
    },
    getWeeklyTarget() {
        return this.data.weeklyStudyTrends.map(t => t.targetMinutes);
    },
    getWeeklyBreaks() {
        return this.data.weeklyStudyTrends.map(t => t.breaks);
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
