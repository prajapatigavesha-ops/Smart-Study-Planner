/**
 * Spaced Repetition Scheduling Engine (1-3-7-30 Day Matrix)
 * Generalized for any Subject, Topic, or Grade level.
 */

// Load state from localStorage, defaulting to empty arrays
let studyTopics = JSON.parse(localStorage.getItem('studyTopics')) || [];
let calendarStore = JSON.parse(localStorage.getItem('calendarStore')) || [];

/**
 * Generates 4 CalendarEvents at +1, +3, +7, and +30 day intervals.
 * Standardizes time to 9:00 AM local time to avoid midnight rollover bugs.
 */
function generateSpacedRepetitionSchedule(topicId, personalizedTitle, baseDate = new Date()) {
    const intervals = [1, 3, 7, 30];
    const events = [];
    
    intervals.forEach((days, index) => {
        const reviewDate = new Date(baseDate.getTime());
        reviewDate.setDate(reviewDate.getDate() + days);
        
        // Strict study window set to 9:00 AM local time to prevent midnight-shifting bugs
        reviewDate.setHours(9, 0, 0, 0);
        
        // 30-minute default duration
        const startDateTime = new Date(reviewDate.getTime());
        const endDateTime = new Date(reviewDate.getTime());
        endDateTime.setMinutes(endDateTime.getMinutes() + 30);
        
        const eventId = 'evt-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
        
        events.push({
            id: eventId,
            topicId: topicId,
            title: `Review ${index + 1}: ${personalizedTitle}`,
            startDateTime: startDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
            status: 'pending',
            intervalStep: index + 1
        });
    });
    
    return events;
}

/**
 * Appends a new customized study topic to the active state array.
 */
function addNewTopic(subject, topic, grade) {
    const newTopic = {
        id: 'topic-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36),
        subject: subject,
        topic: topic,
        grade: grade,
        mastered: false
    };
    studyTopics.push(newTopic);
    localStorage.setItem('studyTopics', JSON.stringify(studyTopics));
    
    // Re-render spaced repetition container
    if (typeof renderSpacedRepetition === 'function') {
        renderSpacedRepetition();
    }
}

/**
 * Simulates marking a topic as mastered, generating its spaced repetition schedule,
 * updating the calendar store, and re-rendering views.
 */
function markTopicAsMastered(topicId) {
    const topic = studyTopics.find(t => t.id === topicId);
    if (!topic) return;
    
    // Set status to mastered
    topic.mastered = true;
    
    // Construct personalized event title format
    const titleText = `${topic.subject} - ${topic.topic} (${topic.grade})`;
    
    // Generate the 4 spaced repetition events
    const newEvents = generateSpacedRepetitionSchedule(topic.id, titleText);
    
    // Append to calendar store
    calendarStore.unshift(...newEvents);
    
    // Save to localStorage
    localStorage.setItem('studyTopics', JSON.stringify(studyTopics));
    localStorage.setItem('calendarStore', JSON.stringify(calendarStore));
    
    // Console log the updated timeline state
    console.log("=== SPACED REPETITION TIMELINE UPDATED ===");
    console.log("Mastered Topic details:", titleText);
    console.log("Generated Events Payload:", newEvents);
    console.log("Full Calendar Store State:", calendarStore);
    console.log("==========================================");
    
    // Trigger UI updates
    if (typeof renderSpacedRepetition === 'function') {
        renderSpacedRepetition();
    }
}

// Global hooks
// Global hooks to keep windows reference in sync
window.studyTopics = studyTopics;
window.calendarStore = calendarStore;
window.addNewTopic = addNewTopic;
window.generateSpacedRepetitionSchedule = generateSpacedRepetitionSchedule;
window.markTopicAsMastered = markTopicAsMastered;
