/**
 * Spaced Repetition Scheduling Engine (1-3-7-30 Day Matrix)
 * Generalized for any Subject, Topic, or Grade level.
 */

// Helper to get prefixed key name to prevent data leakage between users
function getPrefixedKey(key) {
    const token = localStorage.getItem('token');
    if (!token) return key; // Local guest fallback
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const username = JSON.parse(jsonPayload).username || 'John Doe';
        return username + '_' + key;
    } catch (e) {
        return 'John Doe_' + key;
    }
}

// Load state from localStorage, defaulting to empty arrays
let studyTopics = JSON.parse(localStorage.getItem(getPrefixedKey('studyTopics'))) || [];
let calendarStore = JSON.parse(localStorage.getItem(getPrefixedKey('calendarStore'))) || [];

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
function addNewTopic(subject, topic, grade, tag) {
    const newTopic = {
        id: 'topic-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36),
        subject: subject,
        topic: topic,
        grade: grade,
        tag: tag || subject,
        mastered: false
    };
    studyTopics.push(newTopic);
    localStorage.setItem(getPrefixedKey('studyTopics'), JSON.stringify(studyTopics));
    
    // Re-render spaced repetition container
    if (typeof renderSpacedRepetition === 'function') {
        renderSpacedRepetition();
    }
}

/**
 * Simulates marking a topic as mastered, generating its spaced repetition schedule,
 * updating the calendar store, and re-rendering views.
 */
function toggleTopicMastery(topicId) {
    const topic = studyTopics.find(t => t.id === topicId);
    if (!topic) return;
    
    if (!topic.mastered) {
        topic.mastered = true;
        const titleText = `${topic.subject} - ${topic.topic} (${topic.grade})`;
        const newEvents = generateSpacedRepetitionSchedule(topic.id, titleText);
        calendarStore.unshift(...newEvents);
    } else {
        topic.mastered = false;
        calendarStore = calendarStore.filter(e => e.topicId !== topicId);
    }
    
    localStorage.setItem(getPrefixedKey('studyTopics'), JSON.stringify(studyTopics));
    localStorage.setItem(getPrefixedKey('calendarStore'), JSON.stringify(calendarStore));
    
    window.studyTopics = studyTopics;
    window.calendarStore = calendarStore;
    
    if (typeof renderSpacedRepetition === 'function') {
        renderSpacedRepetition();
    }
}

function toggleReviewEvent(eventId) {
    const event = calendarStore.find(e => e.id === eventId);
    if (!event) return;
    
    event.status = event.status === 'completed' ? 'pending' : 'completed';
    localStorage.setItem(getPrefixedKey('calendarStore'), JSON.stringify(calendarStore));
    
    window.calendarStore = calendarStore;
    
    if (typeof renderSpacedRepetition === 'function') {
        renderSpacedRepetition();
    }
}

function deleteReviewEvent(eventId) {
    if (confirm("Are you sure you want to delete this review event?")) {
        calendarStore = calendarStore.filter(e => e.id !== eventId);
        localStorage.setItem(getPrefixedKey('calendarStore'), JSON.stringify(calendarStore));
        
        window.calendarStore = calendarStore;
        
        if (typeof renderSpacedRepetition === 'function') {
            renderSpacedRepetition();
        }
    }
}

function deleteTopic(topicId) {
    if (confirm("Are you sure you want to delete this topic? This will also remove all scheduled review events for this topic.")) {
        studyTopics = studyTopics.filter(t => t.id !== topicId);
        calendarStore = calendarStore.filter(e => e.topicId !== topicId);
        
        localStorage.setItem(getPrefixedKey( 'studyTopics'), JSON.stringify(studyTopics));
        localStorage.setItem(getPrefixedKey('calendarStore'), JSON.stringify(calendarStore));
        
        window.studyTopics = studyTopics;
        window.calendarStore = calendarStore;
        
        if (typeof renderSpacedRepetition === 'function') {
            renderSpacedRepetition();
        }
    }
}

// Global hooks to keep window reference in sync
window.studyTopics = studyTopics;
window.calendarStore = calendarStore;
window.addNewTopic = addNewTopic;
window.generateSpacedRepetitionSchedule = generateSpacedRepetitionSchedule;
window.markTopicAsMastered = toggleTopicMastery; // For compatibility
window.toggleTopicMastery = toggleTopicMastery;
window.toggleReviewEvent = toggleReviewEvent;
window.deleteReviewEvent = deleteReviewEvent;
window.deleteTopic = deleteTopic;
window.getPrefixedKey = getPrefixedKey;
