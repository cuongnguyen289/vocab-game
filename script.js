// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD-a5McTnf2Dd0niPKgPg9xb0UVTLh41b0",
  authDomain: "voca-game.firebaseapp.com",
  projectId: "voca-game",
  storageBucket: "voca-game.firebasestorage.app",
  messagingSenderId: "1045354806669",
  appId: "1:1045354806669:web:c779d6307ec8fa5f4391c4",
  measurementId: "G-L1S872LQPF"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

const SHEET_ID = "13JmgXrxeuBzmBWadW9qAjtTzxObl1c5x6dk3pNr9f7w";
const TARGET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const SENTENCE_GID = "1961448550";
const SENTENCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SENTENCE_GID}`;

// Mở khóa định dạng Web Speech API và Audio trên Mobile (iOS/Android) ngay ở lần chạm màn hình đầu tiên
document.addEventListener('click', function unlockAudio() {
    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
    }
    document.removeEventListener('click', unlockAudio);
}, { once: true });

const FETCH_URLS = [
    TARGET_URL, 
    `https://api.allorigins.win/raw?url=${encodeURIComponent(TARGET_URL)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(TARGET_URL)}`,
    `https://corsproxy.io/?${encodeURIComponent(TARGET_URL)}`
];

let vocabulary = [];
let sentencePool = [];
let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let gameMode = 'han-viet';
let currentQuestionMode = 'han-viet';
let timerInterval;
let timeRemaining = 10;
let maxTimeLimit = 5; // For Time Attack
let correctStreak = 0;

// User variables
let currentUser = "guest";
let wordStats = {}; // SRS Data: { "hanTu": { level, lastReview, nextReview, interval } }
let learnedWords = []; // For backward compatibility / display
let wrongWords = [];   // For backward compatibility / display
let globalCharMap = {}; // Map of { "char": "pinyin" } for fallbacks
let vocabHistory = {}; // Daily Level Stats: { "YYYY-MM-DD": { 1, 2, 3, 4, 5 } }
let activityHistory = {}; // Daily Correct Count: { "YYYY-MM-DD": count }
let recognition; // SpeechRecognition instance
let isRecording = false;
let globalAudio = null; // To manage and stop overlapping sounds
let audioTimeout = null; // To manage automatic playback timers
let currentAudioId = 0; // To track the latest audio request and prevent race conditions

const screens = {
    mainMenu: document.getElementById('main-menu-screen'),
    vocabStart: document.getElementById('vocab-start-screen'),
    sentenceStart: document.getElementById('sentence-start-screen'),
    builderStart: document.getElementById('builder-start-screen'),
    loading: document.getElementById('loading-screen'),
    quiz: document.getElementById('quiz-screen'),
    history: document.getElementById('history-screen'),
    result: document.getElementById('result-screen')
};

const questionEl = document.getElementById('question-text');
const pinyinEl = document.getElementById('pinyin-text');
const optionsContainer = document.getElementById('options-container');
const explanationContainer = document.getElementById('explanation-container');
const explanationText = document.getElementById('explanation-text');
const exampleContainer = document.getElementById('example-container');
const exampleSentence = document.getElementById('example-sentence');
const examplePinyin = document.getElementById('example-pinyin');
const exampleMeaning = document.getElementById('example-meaning');
const scoreEl = document.getElementById('score-display');
const playAudioBtn = document.getElementById('play-audio-btn');
const playAudioSlowBtn = document.getElementById('play-audio-slow-btn');
const playExAudioBtn = document.getElementById('play-ex-audio-btn');
const playExAudioSlowBtn = document.getElementById('play-ex-audio-slow-btn');

// Nguồn âm thanh TTS với đa dạng dự phòng (Youdao -> Google -> Web Speech API)
window.playAudio = function(text, lang, rate = 1.0) {
    if (!text || text === '-' || lang !== 'zh-CN') return;
    
    const requestId = ++currentAudioId;

    // Clean text: remove placeholders like (___), ___, or brackets that might confuse the API
    let cleanText = text.replace(/（___）/g, '')
                        .replace(/（/g, '(')
                        .replace(/）/g, ')')
                        .replace(/___/g, '')
                        .replace(/\(.*?\)/g, '') // Remove (pinyin) or other bracketed info
                        .replace(/['"]/g, '')
                        .trim();

    if (!cleanText || cleanText.length === 0) {
        console.warn("Skipping audio: clean text is empty.");
        return;
    }
    
    // Stop overlapping sounds and clear pending timers
    if (audioTimeout) {
        clearTimeout(audioTimeout);
        audioTimeout = null;
    }
    if (globalAudio) {
        globalAudio.pause();
        globalAudio = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    console.groupCollapsed(`🔊 Audio [${requestId}]: "${cleanText.substring(0, 20)}${cleanText.length > 20 ? '...' : ''}"`);
    console.log("Original Text:", text);
    console.log("Language:", lang);
    console.log("Rate:", rate);

    const tryWebSpeech = () => {
        if (requestId !== currentAudioId) return; // Obsolete request
        if (!('speechSynthesis' in window)) return;
        
        console.log("Using Web Speech API fallback...");
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'zh-CN';
        utterance.rate = rate;
        
        // Find a Chinese voice
        const voices = window.speechSynthesis.getVoices();
        const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
        if (zhVoice) utterance.voice = zhVoice;
        
        window.speechSynthesis.speak(utterance);
    };

    const tryGoogleTranslate = () => {
        if (requestId !== currentAudioId) return; // Obsolete request
        
        console.log("Using Google Translate TTS fallback...");
        const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=zh-CN&client=tw-ob&ttsspeed=${rate < 1 ? 0.5 : 1}`;
        const gAudio = new Audio(gUrl);
        gAudio.playbackRate = 1.0; 
        globalAudio = gAudio;
        gAudio.play().catch(e => {
            if (requestId === currentAudioId) {
                console.error("Google TTS failed:", e);
                tryWebSpeech();
            }
        });
    };

    // Primary: Youdao
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanText)}&le=zh`;
    const audio = new Audio(url);
    audio.playbackRate = rate;
    globalAudio = audio;

    audio.play().then(() => {
        if (requestId === currentAudioId) {
            console.log("Played via Youdao API");
        }
        console.groupEnd();
    }).catch(error => {
        if (requestId === currentAudioId) {
            console.warn("Youdao API failed:", error.message);
            tryGoogleTranslate();
        } else {
            // This is likely an AbortError from a newer request calling .pause()
            console.log("Youdao request aborted by newer request.");
        }
        console.groupEnd();
    });
};

const counterEl = document.getElementById('question-counter');
const nextBtn = document.getElementById('next-btn');

// Sentence Builder elements
const sentenceBuilderContainer = document.getElementById('sentence-builder-container');
const sentenceAnswerZone = document.getElementById('sentence-answer-zone');
const sentenceWordBank = document.getElementById('sentence-word-bank');
const checkSentenceBtn = document.getElementById('check-sentence-btn');

function updateProgressUI() {
    const totalCountEl = document.getElementById('total-count');
    const reviewBtn = document.getElementById('review-btn');
    
    if(totalCountEl) totalCountEl.textContent = vocabulary.length;
    
    // Calculate Level Stats (0-5)
    const stats = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    Object.values(wordStats).forEach(s => {
        let lvl = Math.floor(s.level || 0);
        if (lvl < 0) lvl = 0;
        if (lvl > 5) lvl = 5;
        stats[lvl]++;
    });

    // Words not yet studied are considered Level 0
    const studiedCount = Object.keys(wordStats).length;
    const unstudiedCount = Math.max(0, vocabulary.length - studiedCount);
    stats[0] += unstudiedCount;

    // Update Top Level Stats
    const topEls = {
        1: document.getElementById('top-lvl-1-count'),
        2: document.getElementById('top-lvl-2-count'),
        3: document.getElementById('top-lvl-3-count'),
        4: document.getElementById('top-lvl-4-count'),
        5: document.getElementById('top-lvl-5-count')
    };
    for (let l = 1; l <= 5; l++) {
        if (topEls[l]) topEls[l].textContent = stats[l];
    }
    
    // Disable Review button if no words need review, otherwise wait for vocabulary load
    const now = Date.now();
    const reviewReady = Object.keys(wordStats).filter(hanTu => {
        const s = wordStats[hanTu];
        // Now: ONLY words with Level > 0 that are due for review
        return s.level > 0 && s.nextReview <= now;
    });

    if (reviewBtn && vocabulary.length > 0) {
        if (reviewReady.length === 0) {
            reviewBtn.disabled = true;
            reviewBtn.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">⏳</span><span>Đã ôn hết</span></div>';
        } else {
            reviewBtn.disabled = false;
            reviewBtn.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🔥</span><span>Ôn Ngay (' + reviewReady.length + ')</span></div>';
        }
    }

    // Update Sentence Stats
    const sentenceTotalEl = document.getElementById('sentence-total-count');
    if (sentenceTotalEl) {
        sentenceTotalEl.textContent = sentencePool.length;
    }
    
    // Update Builder Stats
    const builderTotalEl = document.getElementById('builder-total-count');
    if (builderTotalEl) {
        builderTotalEl.textContent = sentencePool.length;
    }

    // Update Level Stats Container (the bottom one)
    const levelStatsContainer = document.getElementById('level-stats-container');
    if (levelStatsContainer && Object.keys(wordStats).length >= 0) {
        levelStatsContainer.style.display = 'block';
        // Update the sub-stats (L0, L1-2, L3-4, L5)
        const lvl0 = stats[0];
        const lvl12 = stats[1] + stats[2];
        const lvl34 = stats[3] + stats[4];
        const lvl5 = stats[5];

        const lvl0El = document.getElementById('lvl-0-count');
        const lvl12El = document.getElementById('lvl-1-2-count');
        const lvl34El = document.getElementById('lvl-3-4-count');
        const lvl5El = document.getElementById('lvl-5-count');

        if (lvl0El) lvl0El.textContent = lvl0;
        if (lvl12El) lvl12El.textContent = lvl12;
        if (lvl34El) lvl34El.textContent = lvl34;
        if (lvl5El) lvl5El.textContent = lvl5;

        // Show/Hide Level 5 suggestions
        const lvl5Sugg = document.getElementById('level-5-suggestions');
        if (lvl5Sugg) {
            lvl5Sugg.style.display = (lvl5 > 0) ? 'block' : 'none';
        }

        // Update Time Attack Button State & Text
        const timeAttackBtn = document.getElementById('time-attack-btn');
        const reqMsg = document.getElementById('time-attack-req-msg');
        const level3PlusCount = stats['3-4'] + stats['5'];
        if (timeAttackBtn) {
            if (level3PlusCount < 5) {
                timeAttackBtn.disabled = true;
                timeAttackBtn.title = "Cần ít nhất 5 từ đã qua 5 lần ôn tập (Level 3+)";
                timeAttackBtn.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🔒</span><span>Phản xạ (${level3PlusCount}/5)</span></div>`;
                if (reqMsg) {
                    reqMsg.innerHTML = `<i>Bạn cần hoàn thành ít nhất 5 từ Level 1-2 (mỗi từ đúng 5 lần) để mở khóa Phản xạ nhanh. Hiện tại: ${level3PlusCount}/5</i>`;
                    reqMsg.style.display = 'block';
                }
            } else {
                timeAttackBtn.disabled = false;
                timeAttackBtn.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">⚡</span><span>Phản Xạ Nhanh</span></div>`;
                if (reqMsg) reqMsg.style.display = 'none';
            }
        }

        // Update Speech Challenge Button
        const speechBtn = document.getElementById('speech-challenge-btn');
        if (speechBtn) {
            if (stats[5] > 0) {
                speechBtn.disabled = false;
                speechBtn.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🎙️</span><span>Luyện Phát Âm (${stats[5]})</span></div>`;
            } else {
                speechBtn.disabled = true;
                speechBtn.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🔒</span><span>Luyện Phát Âm (Cần Lvl 5)</span></div>`;
            }
        }

        const typePinyinBtn = document.getElementById('type-pinyin-btn');
        if (typePinyinBtn) {
            const level3Plus = (stats[3] || 0) + (stats[4] || 0) + (stats[5] || 0);
            if (level3Plus > 0) {
                typePinyinBtn.disabled = false;
                typePinyinBtn.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">⌨️</span><span>Gõ Pinyin (${level3Plus})</span></div>`;
            } else {
                typePinyinBtn.disabled = true;
                typePinyinBtn.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🔒</span><span>Gõ Pinyin (Cần Lvl 3)</span></div>`;
            }
        }

        const typeHanziBtn = document.getElementById('type-hanzi-btn');
        if (typeHanziBtn) {
            const level4Plus = (stats[4] || 0) + (stats[5] || 0);
            if (level4Plus > 0) {
                typeHanziBtn.disabled = false;
                typeHanziBtn.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">✍️</span><span>Gõ Mặt Chữ (${level4Plus})</span></div>`;
            } else {
                typeHanziBtn.disabled = true;
                typeHanziBtn.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🔒</span><span>Gõ Mặt Chữ (Cần Lvl 4)</span></div>`;
            }
        }
    }

    // Update Grammar Topics Dropdown in Builder Screen
    const topicSelect = document.getElementById('grammar-topic-select');
    if (topicSelect && vocabulary.length > 0) {
        const currentVal = topicSelect.value;
        topicSelect.innerHTML = '<option value="all">--- Tất cả chuyên đề ---</option>';
        
        const topics = [...new Set(sentencePool.filter(v => v.topic).map(v => v.topic))].sort();
        topics.forEach(topic => {
            const opt = document.createElement('option');
            opt.value = topic;
            opt.textContent = topic;
            topicSelect.appendChild(opt);
        });
        
        if (currentVal) topicSelect.value = currentVal;
    }

    // Save Current Stats to Daily History
    const today = getTodayDate();
    vocabHistory[today] = { 1: stats[1], 2: stats[2], 3: stats[3], 4: stats[4], 5: stats[5] };
    saveHistoryData();
}

function resetProgress() {
    if(confirm(`Bạn có chắc chắn muốn xóa tiến độ để học lại từ đầu không?`)) {
        learnedWords = [];
        wrongWords = [];
        wordStats = {};
        localStorage.removeItem(`${currentUser}_vocab_learned`);
        localStorage.removeItem(`${currentUser}_vocab_wrong`);
        localStorage.removeItem(`${currentUser}_vocab_stats`);
        updateProgressUI();
    }
}

function migrateToSRS() {
    // Migrate from old learnedWords to SRS
    let modified = false;
    learnedWords.forEach(hanTu => {
        if (!wordStats[hanTu]) {
            wordStats[hanTu] = {
                level: 3, 
                lastReview: Date.now(),
                nextReview: Date.now() + (3 * 24 * 60 * 60 * 1000), // Default 3 days
                interval: 3,
                repCount: 5 // Mastery
            };
            modified = true;
        }
    });
    // Migrate from wrongWords
    wrongWords.forEach(hanTu => {
        if (!wordStats[hanTu]) {
            wordStats[hanTu] = {
                level: 1,
                lastReview: Date.now(),
                nextReview: Date.now(), // Review now
                interval: 1,
                repCount: 0
            };
            modified = true;
        }
    });

    if (modified) {
        saveSRSData();
    }
}

function saveSRSData() {
    localStorage.setItem(`${currentUser}_vocab_stats`, JSON.stringify(wordStats));
    // Also update legacy arrays for UI consistency
    learnedWords = Object.keys(wordStats).filter(k => wordStats[k].level >= 3);
    localStorage.setItem(`${currentUser}_vocab_learned`, JSON.stringify(learnedWords));
    const now = Date.now();
    wrongWords = Object.keys(wordStats).filter(k => wordStats[k].level > 0 && wordStats[k].nextReview <= now);
    localStorage.setItem(`${currentUser}_vocab_wrong`, JSON.stringify(wrongWords));
    
    saveProgressToCloud();
}

/**
 * Unified SRS (Spaced Repetition System) Update Logic
 */
function updateSRSProgress(hanTu, isCorrect, mode = "") {
    if (!hanTu) return;
    
    if (!wordStats[hanTu]) {
        wordStats[hanTu] = {
            level: 1,
            lastReview: Date.now(),
            nextReview: Date.now() + (1 * 60 * 60 * 1000),
            interval: 1,
            repCount: 0
        };
    }
    
    const stats = wordStats[hanTu];
    const now = Date.now();
    
    if (isCorrect) {
        // Calculate boost based on mode difficulty
        let boost = 1.0; 
        if (mode === 'mcq' || mode === 'review' || mode === 'han-viet' || mode === 'viet-han') {
            boost = 0.5; // Multiple choice is easy, needs more reps
        } else if (mode.includes('type')) {
            boost = 1.0; // Typing is medium difficulty
        } else if (mode.includes('sentence') || mode.includes('cloze')) {
            boost = 1.5; // Contextual usage is hard
        } else if (mode === 'time-attack') {
            boost = 0.8; // Fast but still MCQ
        }

        if (stats.level <= 2) {
            stats.repCount = (stats.repCount || 0) + boost;
            
            if (stats.repCount >= 3) {
                stats.level = 3;
                stats.interval = 1;
                stats.repCount = 0;
                stats.nextReview = now + (1 * 24 * 60 * 60 * 1000);
            } else {
                // Not yet leveled up, review again soon
                stats.nextReview = now + (2 * 60 * 60 * 1000); 
            }
        } else {
            // Progression for Level 3-5 (Mastery)
            // Harder modes give a full level, easier modes give a fractional level
            const levelJump = (boost >= 1.0) ? 1 : 0.4;
            
            if (stats.level + levelJump >= Math.floor(stats.level) + 1) {
                // Transition to next full level
                stats.level = Math.min(Math.floor(stats.level) + 1, 5);
                stats.interval = (stats.interval || 1) * 2;
                stats.nextReview = now + (stats.interval * 24 * 60 * 60 * 1000);
            } else {
                // Fractional progress within current level
                stats.level = Math.min(stats.level + levelJump, 5);
            }
        }
    } else {
        // Penalty for wrong answer
        stats.level = 1;
        stats.repCount = 0;
        stats.interval = 1;
        stats.nextReview = now;
    }
    
    stats.lastReview = now;
    wordStats[hanTu] = stats;
    saveSRSData();
    updateProgressUI();
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    fetchVocabulary();
    
    // Listen for Auth State Changes
    auth.onAuthStateChanged((user) => {
        const userNameDisplay = document.getElementById('user-name-display');
        const loginBtnTop = document.getElementById('login-btn-top');
        const logoutBtnTop = document.getElementById('logout-btn-top');

        if (user) {
            currentUser = user.uid;
            if (userNameDisplay) {
                userNameDisplay.textContent = `👋 Chào, ${user.displayName || user.email.split('@')[0]}`;
                userNameDisplay.style.display = 'inline-block';
            }
            if (loginBtnTop) loginBtnTop.style.display = 'none';
            if (logoutBtnTop) logoutBtnTop.style.display = 'inline-block';
            
            loadProgressFromCloud(user.uid);
        } else {
            currentUser = "guest";
            if (userNameDisplay) userNameDisplay.style.display = 'none';
            if (loginBtnTop) loginBtnTop.style.display = 'inline-block';
            if (logoutBtnTop) logoutBtnTop.style.display = 'none';
            
            loadProgressFromLocal();
        }
    });
});

function loadProgressFromLocal() {
    try {
        learnedWords = JSON.parse(localStorage.getItem(`${currentUser}_vocab_learned`)) || [];
        wrongWords = JSON.parse(localStorage.getItem(`${currentUser}_vocab_wrong`)) || [];
        wordStats = JSON.parse(localStorage.getItem(`${currentUser}_vocab_stats`)) || {};
        vocabHistory = JSON.parse(localStorage.getItem(`${currentUser}_vocab_history`)) || {};
        activityHistory = JSON.parse(localStorage.getItem(`${currentUser}_activity_history`)) || {};
        migrateToSRS();
        updateProgressUI();
    } catch(e) {
        console.warn("Error loading progress", e);
    }
}

function showScreen(screenName) {
    if(screenName === 'vocabStart' || screenName === 'sentenceStart' || screenName === 'main-menu') {
        updateProgressUI();
    }
    Object.values(screens).forEach(s => {
        if(s) s.classList.remove('active');
    });
    
    // Handle specific screen logic mapping to IDs
    if(screenName === 'main-menu') screens.mainMenu.classList.add('active');
    else if(screenName === 'vocab') screens.vocabStart.classList.add('active');
    else if(screenName === 'sentence') screens.sentenceStart.classList.add('active');
    else if(screenName === 'builder') screens.builderStart.classList.add('active');
    else if(screenName === 'history-screen') screens.history.classList.add('active');
    else if(screens[screenName]) screens[screenName].classList.add('active');
}

function goToStartScreen(mode) {
    if(mode === 'vocab') {
        showScreen('vocab');
    } else if (mode === 'sentence') {
        showScreen('sentence');
    } else if (mode === 'builder') {
        showScreen('builder');
    }
}

async function fetchVocabulary() {
    let successCount = 0;
    
    // Fetch Main Vocab (gid=0)
    for (const url of FETCH_URLS) {
        try {
            console.log("Đang tải Vocab:", url);
            const response = await fetch(url);
            if (response.ok) {
                const csvText = await response.text();
                parseCSV(csvText);
                successCount++;
                break;
            }
        } catch (error) {
            console.warn(`Lỗi Vocab ${url}:`, error);
        }
    }

    // Fetch Sentence Sheet (gid=1961448550)
    const sentenceUrls = [
        SENTENCE_URL,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(SENTENCE_URL)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(SENTENCE_URL)}`,
        `https://corsproxy.io/?${encodeURIComponent(SENTENCE_URL)}`
    ];

    for (const url of sentenceUrls) {
        try {
            console.log("Đang tải Câu:", url);
            const response = await fetch(url);
            if (response.ok) {
                const csvText = await response.text();
                parseSentenceCSV(csvText);
                successCount++;
                break;
            }
        } catch (error) {
            console.warn(`Lỗi Câu ${url}:`, error);
        }
    }
    
    updateProgressUI();
    
    if (successCount === 0) {
        alert("Lỗi kết nối mạng: Không tải được dữ liệu. Mời thử lại!");
        showScreen('main-menu');
    }
}

function splitCSVLine(line) {
    const parts = [];
    let currentPart = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            parts.push(currentPart.trim());
            currentPart = "";
        } else {
            currentPart += char;
        }
    }
    parts.push(currentPart.trim());
    
    // Clean each part: remove bounding quotes and unescape double-quotes
    return parts.map(p => {
        let s = p.trim();
        if (s.startsWith('"') && s.endsWith('"')) {
            s = s.substring(1, s.length - 1);
        }
        return s.replace(/""/g, '"').trim();
    });
}

function parseSentenceCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    let addedCount = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = splitCSVLine(line);
        if (parts.length >= 4) {
            const cau = parts[1] ? parts[1].trim().replace(/['"]/g, '') : "";
            const phienam = parts[2] ? parts[2].trim().replace(/['"]/g, '') : "";
            const nghia = parts[3] ? parts[3].trim().replace(/['"]/g, '') : "";
            const topic = parts[4] ? parts[4].trim().replace(/['"]/g, '') : "";

            if (cau && nghia) {
                const exists = sentencePool.some(s => s.cau === cau);
                if (!exists) {
                    sentencePool.push({
                        cau: cau,
                        cauPinyin: phienam,
                        cauNghia: nghia,
                        topic: topic
                    });
                    addedCount++;
                }
                updateGlobalCharMap(cau, phienam);
            }
        }
    }
    console.log(`Đã nạp ${addedCount} câu từ sheet Câu.`);
}

function splitPinyinIntoSyllables(pinyin) {
    if (!pinyin) return [];
    // 1. Initial cleanup and splitting by non-letters
    const rawTokens = pinyin.toLowerCase().trim().split(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+/);
    const result = [];
    
    // 2. Sub-segment each token (e.g., "gongchengshi" -> ["gong", "cheng", "shi"])
    // Strategy: Split after every vowel group + optional nasal/r
    // But be careful not to split "ng" from its vowel.
    const syllableRegex = /[^aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]*[aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+(?:ng?|r)?/gi;

    rawTokens.forEach(t => {
        const matches = t.match(syllableRegex);
        if (matches) {
            result.push(...matches);
        } else if (t.trim()) {
            result.push(t.trim());
        }
    });
    return result;
}

function updateGlobalCharMap(text, pinyin) {
    if (!text || !pinyin) return;
    const cleanText = text.replace(/[，。？！.,?!、\s]/g, '');
    const syllables = splitPinyinIntoSyllables(pinyin);
    
    // If exact match by length, map characters to syllables
    if (cleanText.length === syllables.length) {
        for (let i = 0; i < cleanText.length; i++) {
            const char = cleanText[i];
            const syl = syllables[i];
            // Only update if not exists or if we find a new character
            if (!globalCharMap[char]) {
                globalCharMap[char] = syl;
            }
        }
    }
}

function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    vocabulary = [];
    sentencePool = []; // Refresh pool
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = splitCSVLine(line);
        if (parts.length >= 4) {
            const hantu = parts[1] || "";
            const phienam = parts[2] || "";
            const nghia = parts[3] || "";
            
            const cau = parts[6] || "";
            const cauPinyin = parts[7] || "";
            const cauNghia = parts[8] || "";

            if (hantu && nghia) {
                vocabulary.push({
                    hanTu: hantu,
                    pinyin: phienam,
                    tiengViet: nghia,
                    cau: cau,
                    cauPinyin: cauPinyin,
                    cauNghia: cauNghia
                });
                updateGlobalCharMap(hantu, phienam);
                
                // Add example sentence to pool if valid
                if (cau && cau !== '-' && cauNghia && cauNghia !== '-') {
                    sentencePool.push({
                        cau: cau,
                        cauPinyin: (cauPinyin === '-') ? "" : cauPinyin,
                        cauNghia: cauNghia,
                        topic: ""
                    });
                    if (cauPinyin && cauPinyin !== '-') updateGlobalCharMap(cau, cauPinyin);
                }
            }
        }
    }
    console.log(`Đã nạp ${vocabulary.length} từ từ sheet Từ vựng.`);
    updateProgressUI();
    
    if (vocabulary.length < 4) {
        alert("Danh sách từ vựng quá ngắn (cần ít nhất 4 từ có đủ Hán Tự và Nghĩa để tạo 4 đáp án).");
        showScreen('main-menu');
    } else {
        // Enable buttons
        const modeButtons = document.getElementById('main-mode-buttons');
        if(modeButtons) {
            const btns = modeButtons.querySelectorAll('button');
            btns[0].disabled = false;
            btns[0].innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🇨🇳</span><span>Hán ➡️ Việt</span></div>';
            
            btns[1].disabled = false;
            btns[1].innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🇻🇳</span><span>Việt ➡️ Hán</span></div>';
            
            const timeAttackBtn = document.getElementById('time-attack-btn');
            if (timeAttackBtn) {
                // Initial update based on loaded stats
                updateProgressUI();
            }

            // Type typing buttons are handled dynamically by updateProgressUI
        }

        const sentenceButtons = document.getElementById('sentence-mode-buttons');
        if(sentenceButtons) {
            const btns = sentenceButtons.querySelectorAll('button');
            if(sentencePool.length >= 4) {
                btns[0].disabled = false;
                btns[0].innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🇨🇳</span><span>Trung ➡️ Việt</span></div>';
                
                btns[1].disabled = false;
                btns[1].innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🇻🇳</span><span>Việt ➡️ Trung</span></div>';
            } else {
                btns[0].innerHTML = '<span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">❌</span><span>Không có DL</span>';
                btns[1].innerHTML = '<span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">❌</span><span>Không có DL</span>';
            }
        }
        
        const builderButtons = document.getElementById('builder-mode-buttons');
        if(builderButtons) {
            const btns = builderButtons.querySelectorAll('button');
            if(sentencePool.length >= 2) {
                btns[0].disabled = false;
                btns[0].innerHTML = '<span class="btn-icon">🧩</span> Ghép câu (➡️ Ngoại ngữ)';
                btns[1].disabled = false;
                btns[1].innerHTML = '<span class="btn-icon">🧩</span> Ghép câu (➡️ Tiếng Việt)';
                
                const clozeBtn = document.getElementById('cloze-btn');
                if(clozeBtn) {
                    clozeBtn.disabled = false;
                    clozeBtn.innerHTML = '<span class="btn-icon">📝</span> Điền khuyết (Cloze)';
                }
            } else {
                btns[0].innerHTML = '<span class="btn-icon">❌</span> Không đủ câu ví dụ';
                btns[1].innerHTML = '<span class="btn-icon">❌</span> Không đủ câu ví dụ';
                const clozeBtn = document.getElementById('cloze-btn');
                if(clozeBtn) clozeBtn.innerHTML = '<span class="btn-icon">❌</span> Không đủ câu ví dụ';
            }
        }
    }
}

async function startGame(mode) {
    gameMode = mode;
    
    if (vocabulary.length >= 4) {
        setupQuiz();
    } else {
        alert("Danh sách từ vựng chưa tải xong hoặc quá ngắn!");
    }
}

function setupQuiz() {
    score = 0;
    currentQuestionIndex = 0;
    
    let availableWords = [];
    
    if (gameMode === 'review') {
        const now = Date.now();
        availableWords = vocabulary.filter(v => {
            const s = wordStats[v.hanTu];
            // Mode Ôn ngay: ONLY words that have been studied (lvl > 0) AND are due
            return s && s.level > 0 && s.nextReview <= now;
        });
        
        // Sort: Lvl 1-2 first, then others by proximity to review time
        availableWords.sort((a, b) => {
            const sa = wordStats[a.hanTu];
            const sb = wordStats[b.hanTu];
            if (sa.level <= 2 && sb.level > 2) return -1;
            if (sb.level <= 2 && sa.level > 2) return 1;
            return sa.nextReview - sb.nextReview;
        });

        if (availableWords.length === 0) {
            alert("Tuyệt vời! Bạn không có từ vựng nào cần ôn tập hôm nay. Quay lại học bài mới nhé!");
            showScreen('vocab');
            return;
        }
    } else if (gameMode === 'sentence-trung-viet' || gameMode === 'sentence-viet-trung') {
        availableWords = sentencePool;
        if (availableWords.length < 4) {
             alert("Danh sách của bạn cần ít nhất 4 câu ví dụ để chơi chế độ này!");
             showScreen('sentence');
             return;
        }
    } else if (gameMode === 'sentence-cloze') {
        availableWords = vocabulary.filter(v => v.hanTu && v.pinyin && v.cau && v.cau !== '-' && v.cauNghia && v.cauNghia !== '-' && v.cau.includes(v.hanTu));
        if (availableWords.length < 4) {
             alert("Danh sách của bạn cần ít nhất 4 từ có câu ví dụ chứa từ đó để chơi chế độ này!");
             showScreen('builder');
             return;
        }
    } else if (gameMode === 'sentence-target' || gameMode === 'sentence-viet') {
        availableWords = sentencePool;
        if (availableWords.length < 2) {
            alert("Cần ít nhất 2 câu để vào chế độ này.");
            showScreen('builder');
            return;
        }
    } else if (gameMode === 'time-attack') {
        // Only use words that are well-learned (level >= 3)
        availableWords = vocabulary.filter(v => wordStats[v.hanTu] && wordStats[v.hanTu].level >= 3);
        if (availableWords.length < 5) {
            alert("Bạn cần thuộc ít nhất 5 từ (Level 3+) để mở khóa thử thách Phản Xạ Nhanh!");
            showScreen('vocab');
            return;
        }
        maxTimeLimit = 5;
        correctStreak = 0;
    } else if (gameMode === 'speech-challenge') {
        availableWords = vocabulary.filter(v => wordStats[v.hanTu] && wordStats[v.hanTu].level >= 5);
        if (availableWords.length === 0) {
            alert("Bạn chưa có từ vựng nào đạt Level 5 để luyện phát âm!");
            showScreen('vocab');
            return;
        }
    } else if (gameMode === 'type-pinyin') {
        availableWords = vocabulary.filter(v => wordStats[v.hanTu] && wordStats[v.hanTu].level >= 3);
        if (availableWords.length === 0) {
            alert("Bạn cần có ít nhất 1 từ đạt Level 3 để mở khóa chế độ Gõ Pinyin!");
            showScreen('vocab');
            return;
        }
    } else if (gameMode === 'type-hanzi') {
        availableWords = vocabulary.filter(v => wordStats[v.hanTu] && wordStats[v.hanTu].level >= 4);
        if (availableWords.length === 0) {
            alert("Bạn cần có ít nhất 1 từ đạt Level 4 để mở khóa chế độ Gõ Mặt Chữ Hán!");
            showScreen('vocab');
            return;
        }
    } else {
        // Normal Learning Mode (Hán->Việt, Việt->Hán) ONLY covers Level 0 (New Words)
        availableWords = vocabulary.filter(v => !wordStats[v.hanTu]);
        if (availableWords.length === 0) {
            alert("Tuyệt vời! Bạn đã vượt qua đợt 1 (làm quen) với tất cả từ vựng trong danh sách hiện tại. Hãy chuyển sang chế độ [Ôn Ngay] để củng cố trí nhớ nhé!");
            showScreen('vocab');
            return;
        }
    }

    // Apply Grammar Topic Filter if in Builder Screen modes
    if (gameMode.includes('sentence-target') || gameMode === 'sentence-cloze') {
        const topicSelect = document.getElementById('grammar-topic-select');
        const selectedTopic = topicSelect ? topicSelect.value : 'all';
        if (selectedTopic !== 'all') {
            const filtered = availableWords.filter(v => v.topic === selectedTopic);
            if (filtered.length > 0) {
                availableWords = filtered;
            } else {
                console.warn(`Không tìm thấy câu nào của chuyên đề "${selectedTopic}". Sử dụng chế độ mặc định.`);
            }
        }
    }
    
    let shuffled = [...availableWords].sort(() => 0.5 - Math.random());
    
    let inputId = 'num-questions';
    if (gameMode.includes('sentence-trung') || gameMode.includes('sentence-viet-trung')) inputId = 'sentence-num-questions';
    else if (gameMode.includes('sentence-target') || gameMode.includes('sentence-viet') || gameMode === 'sentence-cloze' || gameMode === 'time-attack') inputId = 'builder-num-questions';
    
    const inputQ = document.getElementById(inputId);
    let desiredCount = inputQ ? parseInt(inputQ.value) : 30;
    if (isNaN(desiredCount) || desiredCount < 1) desiredCount = 30;
    
    const TOTAL_QUESTIONS = Math.min(desiredCount, availableWords.length);
    currentQuestions = shuffled.slice(0, TOTAL_QUESTIONS);
    
    scoreEl.textContent = score;
    showScreen('quiz');
    loadQuestion();
}

function loadQuestion() {
    if (audioTimeout) {
        clearTimeout(audioTimeout);
        audioTimeout = null;
    }
    nextBtn.classList.add('hidden');
    explanationContainer.classList.add('hidden');
    exampleContainer.classList.add('hidden');
    optionsContainer.innerHTML = '';
    
    // Hide pinyin input container by default
    document.getElementById('pinyin-input-container').classList.add('hidden');
    document.getElementById('pinyin-input').value = '';
    
    // Reset Speech UI
    document.getElementById('speech-feedback-container').classList.add('hidden');
    document.getElementById('voice-input-container').classList.add('hidden');
    document.getElementById('skip-speech-btn').classList.add('hidden');
    document.getElementById('speech-result-display').innerHTML = '';
    document.getElementById('speech-score-display').textContent = 'Độ chính xác: 0%';
    
    const h = currentQuestionIndex;
    const qData = currentQuestions[h];
    counterEl.textContent = `${h + 1}/${currentQuestions.length}`;
    
    let correctAnswerText, questionTextMain, questionTextSub;

    currentQuestionMode = gameMode;
    if (gameMode === 'review' || gameMode === 'test' || gameMode === 'time-attack') {
        currentQuestionMode = (Math.random() > 0.5) ? 'han-viet' : 'viet-han';
    }
    
    // Safety check for empty data
    if (!qData) {
        console.error("No question data found for index", h);
        showScreen('main-menu');
        return;
    }

    if (currentQuestionMode === 'han-viet') {
        questionTextMain = qData.hanTu;
        questionTextSub = qData.pinyin;
        correctAnswerText = qData.tiengViet;
        questionEl.style.fontSize = '3.2rem'; 
    } else if (currentQuestionMode === 'viet-han') {
        questionTextMain = qData.tiengViet;
        questionTextSub = ""; 
        correctAnswerText = `${qData.hanTu} (${qData.pinyin})`;
        questionEl.style.fontSize = '1.8rem'; 
    } else if (currentQuestionMode === 'sentence-trung-viet') {
        questionTextMain = qData.cau;
        questionTextSub = qData.cauPinyin;
        correctAnswerText = qData.cauNghia;
        questionEl.style.fontSize = '2rem'; 
    } else if (currentQuestionMode === 'sentence-viet-trung') {
        questionTextMain = qData.cauNghia;
        questionTextSub = "";
        correctAnswerText = `${qData.cau} (${qData.cauPinyin})`;
        questionEl.style.fontSize = '1.5rem'; 
    } else if (currentQuestionMode === 'sentence-cloze') {
        const blank = "（___）";
        questionTextMain = qData.cau.replace(qData.hanTu, blank);
        
        let pinyinBlanked = qData.cauPinyin || "";
        if (pinyinBlanked && qData.pinyin) {
            // Try direct replacement first (handles most cases)
            const escapedPinyin = qData.pinyin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const replaced = pinyinBlanked.replace(new RegExp(escapedPinyin, 'gi'), "___");
            // Only use replacement if something changed, otherwise leave as-is
            pinyinBlanked = replaced;
        }
        
        questionTextSub = `<div class="pinyin-q">${pinyinBlanked}</div><div class="meaning-q">${qData.cauNghia}</div>`; 
        correctAnswerText = `${qData.hanTu} (${qData.pinyin})`;
        questionEl.style.fontSize = '2rem';
    } else if (currentQuestionMode === 'sentence-target') {
        questionTextMain = qData.cauNghia;
        questionTextSub = ""; // Hide by default, revealed by Hint
        correctAnswerText = qData.cau;
        questionEl.style.fontSize = '1.8rem';
    } else if (currentQuestionMode === 'sentence-viet') {
        questionTextMain = qData.cau;
        questionTextSub = qData.cauPinyin;
        correctAnswerText = qData.cauNghia;
        questionEl.style.fontSize = '2.5rem';
    } else if (currentQuestionMode === 'type-pinyin') {
        questionTextMain = qData.hanTu;
        questionTextSub = qData.tiengViet; // Show meaning as subtitle
        correctAnswerText = qData.pinyin;
        questionEl.style.fontSize = '3.2rem';
    } else if (currentQuestionMode === 'type-hanzi') {
        questionTextMain = qData.tiengViet;
        questionTextSub = qData.pinyin; // Show pinyin as subtitle
        correctAnswerText = qData.hanTu;
        questionEl.style.fontSize = '2rem';
    } else {
        // Default fallbacks: if currentQuestionMode is somehow invalid (e.g. 'time-attack' wasn't randomized)
        questionTextMain = qData.hanTu || "";
        questionTextSub = qData.pinyin || "";
        correctAnswerText = qData.tiengViet || "";
        questionEl.style.fontSize = '3.2rem';
    }
    
    questionEl.textContent = questionTextMain;
    if (currentQuestionMode === 'sentence-cloze') {
        pinyinEl.innerHTML = questionTextSub;
    } else {
        pinyinEl.textContent = questionTextSub;
    }
    if(!questionTextSub) {
        pinyinEl.style.display = 'none';
        questionEl.style.marginBottom = '0';
    } else {
        pinyinEl.style.display = 'block';
        questionEl.style.marginBottom = '0.2rem';
        if (currentQuestionMode === 'sentence-cloze') {
            pinyinEl.style.display = 'block';
            pinyinEl.style.marginBottom = '0.5rem';
        } else {
            pinyinEl.style.fontSize = '1.4rem';
            pinyinEl.style.color = 'var(--primary-color)';
            pinyinEl.style.fontStyle = 'normal';
        }
    }
    
    if (questionTextMain) {
        let isVietnamese = (currentQuestionMode === 'viet-han' || currentQuestionMode === 'sentence-viet-trung' || currentQuestionMode === 'sentence-target');
        
        if (isVietnamese || gameMode === 'type-pinyin' || gameMode === 'type-hanzi' || gameMode === 'sentence-cloze') {
            playAudioBtn.classList.add('hidden');
            playAudioSlowBtn.classList.add('hidden');
        } else {
            playAudioBtn.classList.remove('hidden');
            playAudioSlowBtn.classList.remove('hidden');
            let langCode = 'zh-CN';
            const triggerAudio = () => playAudio(questionTextMain, langCode);
            const triggerAudioSlow = () => playAudio(questionTextMain, langCode, 0.65);
            playAudioBtn.onclick = triggerAudio;
            playAudioSlowBtn.onclick = triggerAudioSlow;
            audioTimeout = setTimeout(triggerAudio, 100);
        }
    } else {
        playAudioBtn.classList.add('hidden');
        playAudioSlowBtn.classList.add('hidden');
    }

    if (gameMode === 'speech-challenge') {
        const voiceInputContainer = document.getElementById('voice-input-container');
        voiceInputContainer.classList.remove('hidden');
        document.getElementById('skip-speech-btn').classList.remove('hidden');
        optionsContainer.classList.add('hidden'); // Hide multiple choice options
        
        // Use Hán Tự as the target for comparison
        correctAnswerText = qData.hanTu;
    } else if (gameMode === 'type-pinyin' || gameMode === 'type-hanzi') {
        optionsContainer.classList.add('hidden');
        sentenceBuilderContainer.classList.add('hidden');
        document.getElementById('pinyin-input-container').classList.remove('hidden');
        
        const inputEl = document.getElementById('pinyin-input');
        if (inputEl) {
            inputEl.value = '';
            inputEl.placeholder = gameMode === 'type-pinyin' ? "Gõ pinyin (không dấu)..." : "Gõ chữ Hán...";
            setTimeout(() => inputEl.focus(), 100);
        }
    } else if (gameMode === 'sentence-target' || gameMode === 'sentence-viet') {
        optionsContainer.classList.add('hidden');
        sentenceBuilderContainer.classList.remove('hidden');
        loadSentenceBuilder(qData);
    } else {
        optionsContainer.classList.remove('hidden');
        sentenceBuilderContainer.classList.add('hidden');
        
        let options = [correctAnswerText];
        let distractors = new Set();
        
        // Function to get the correct text representation for a distractor based on mode
        const getModeText = (item) => {
            if (currentQuestionMode === 'han-viet') return item.tiengViet;
            if (currentQuestionMode === 'viet-han' || currentQuestionMode === 'sentence-cloze') {
                return (item.hanTu && item.pinyin) ? `${item.hanTu} (${item.pinyin})` : null;
            }
            if (currentQuestionMode === 'sentence-trung-viet') return item.cauNghia;
            if (currentQuestionMode === 'sentence-viet-trung') {
                return (item.cau && item.cauPinyin) ? `${item.cau} (${item.cauPinyin})` : null;
            }
            return null;
        };

        // Determine the correct pool for distractors
        const isSentenceMode = currentQuestionMode.includes('sentence');
        const primaryPool = isSentenceMode ? sentencePool : vocabulary;

        // Filter all potential candidates that have the required data for this mode
        let candidates = primaryPool.filter(v => {
            const txt = getModeText(v);
            return txt && txt.trim() !== "" && txt.trim() !== correctAnswerText.trim();
        });

        // Shuffle candidates
        candidates.sort(() => 0.5 - Math.random());

        // --- 1. Distractor Collection ---
        // Pick unique distractors from candidates
        for (const cand of candidates) {
            const txt = getModeText(cand);
            if (txt && txt.trim() !== "" && txt.trim() !== correctAnswerText.trim() && !distractors.has(txt.trim())) {
                distractors.add(txt.trim());
                if (distractors.size >= 3) break;
            }
        }

        // --- 2. Fallback if insufficient (using exhaustive search across all pools) ---
        if (distractors.size < 3) {
            console.warn("Insufficient unique distractors! Attempting exhaustive fallback...");
            const allItems = [...vocabulary, ...sentencePool];
            for (const item of allItems) {
                const potentialFields = [
                    item.tiengViet, 
                    (item.hanTu && item.pinyin) ? `${item.hanTu} (${item.pinyin})` : item.hanTu,
                    item.cauNghia,
                    item.cau
                ];
                for (let f of potentialFields) {
                    if (f && typeof f === 'string' && f.trim() !== "" && f.trim() !== correctAnswerText.trim() && !distractors.has(f.trim())) {
                        distractors.add(f.trim());
                        if (distractors.size >= 3) break;
                    }
                }
                if (distractors.size >= 3) break;
            }
        }

        // --- 3. Emergency Placeholder Fallback (Ensures UI never breaks) ---
        const placeholders = ["Học tập", "Công việc", "Cuộc sống", "Gia đình", "Bạn bè"];
        for (let p of placeholders) {
            if (distractors.size >= 3) break;
            if (p !== correctAnswerText && !distractors.has(p)) {
                distractors.add(p);
            }
        }

        // --- 4. Final Mix & Unique Guarantee ---
        let finalOptions = [correctAnswerText, ...Array.from(distractors).slice(0, 3)];
        
        // Shuffle
        finalOptions.sort(() => 0.5 - Math.random());

        // --- 5. Render Buttons ---
        finalOptions.forEach(opt => {
            if (!opt) return; // Should not happen with placeholders
            const btn = document.createElement('button');
            btn.className = 'btn option-btn';
            btn.textContent = opt;
            btn.onclick = () => checkAnswer(opt, correctAnswerText, btn);
            optionsContainer.appendChild(btn);
        });
    }
    
    // Explicitly show containers
    const qParent = questionEl.closest('.question-container');
    if (qParent) qParent.classList.remove('hidden');
    optionsContainer.classList.remove('hidden');

    startTimer();
}

function startTimer() {
    const timerContainer = document.getElementById('timer-bar-container');
    const timerBar = document.getElementById('timer-bar');
    
    if (gameMode !== 'time-attack') {
        timerContainer.classList.add('hidden');
        return;
    }
    
    timerContainer.classList.remove('hidden');
    timeRemaining = gameMode === 'time-attack' ? maxTimeLimit : 10;
    timerBar.style.width = '100%';
    timerBar.style.backgroundColor = 'var(--secondary-color)';
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeRemaining -= 0.1;
        const limit = gameMode === 'time-attack' ? maxTimeLimit : 10;
        const percentage = (timeRemaining / limit) * 100;
        timerBar.style.width = `${percentage}%`;
        
        if (timeRemaining <= (limit * 0.3)) {
            timerBar.style.backgroundColor = 'var(--error-color)';
            if (gameMode === 'time-attack') timerBar.classList.add('shake');
        } else if (timeRemaining <= (limit * 0.6)) {
            timerBar.style.backgroundColor = '#F59E0B';
            timerBar.classList.remove('shake');
        } else {
            timerBar.style.backgroundColor = 'var(--secondary-color)';
            timerBar.classList.remove('shake');
        }
        
        if (timeRemaining <= 0) {
            handleTimeOut();
        }
    }, 100);
}

function stopTimer() {
    clearInterval(timerInterval);
}

function handleTimeOut() {
    stopTimer();
    const timerBar = document.getElementById('timer-bar');
    timerBar.style.width = '0%';
    
    const qData = currentQuestions[currentQuestionIndex];
    const buttons = optionsContainer.querySelectorAll('.option-btn');
    
    if (gameMode === 'sentence-cloze') {
        explanationText.innerHTML = `⏳ <b>Hết giờ!</b><br>Đáp án đúng là: <b>${qData.hanTu}</b> (${qData.pinyin})<br>Câu đầy đủ: <b>${qData.cau}</b>`;
    } else if (gameMode.includes('sentence')) {
        explanationText.innerHTML = `⏳ <b>Hết giờ!</b><br>Câu <b>${qData.cau}</b> (${qData.cauPinyin}) có nghĩa là: <br> "<b>${qData.cauNghia}</b>"`;
    } else {
        explanationText.innerHTML = `⏳ <b>Hết giờ!</b><br>Từ <b>${qData.hanTu}</b> (${qData.pinyin}) có nghĩa là: <br> "<b>${qData.tiengViet}</b>"`;
    }
    explanationContainer.classList.remove('hidden');
    
    buttons.forEach(btn => btn.disabled = true);
    
    if (gameMode === 'time-attack') {
        correctStreak = 0;
        // penalty: reset streak, reduce level
        const stats = wordStats[qData.hanTu] || { level: 3 };
        stats.level = Math.max(stats.level - 1, 1);
        saveSRSData();
    } else if (!gameMode.includes('sentence')) {
        const index = learnedWords.indexOf(qData.hanTu);
        if(index > -1) {
            learnedWords.splice(index, 1);
            localStorage.setItem(`${currentUser}_vocab_learned`, JSON.stringify(learnedWords));
        }
        if (!wrongWords.includes(qData.hanTu)) {
            wrongWords.push(qData.hanTu);
            localStorage.setItem(`${currentUser}_vocab_wrong`, JSON.stringify(wrongWords));
        }
    }
    nextBtn.classList.remove('hidden');
}

function normalizeSentence(text) {
    return text.replace(/[，。？！.,?!、\s]/g, '').toLowerCase();
}

function splitSentence(text) {
    if (/[a-zA-Z]/.test(text) || /[\u00C0-\u1EF9]/.test(text)) {
        return text.trim().split(/\s+/);
    }
    return segmentChineseSentence(text);
}

function segmentChineseSentence(text) {
    const cleanText = text.replace(/[，。？！.,?!、\s]/g, '');
    const result = [];
    let i = 0;
    
    // Sort vocabulary by HanTu length (longest first) to improve matching accuracy
    const dict = [...vocabulary].sort((a, b) => b.hanTu.length - a.hanTu.length);
    
    while (i < cleanText.length) {
        let matched = false;
        for (const entry of dict) {
            const word = entry.hanTu;
            if (word && cleanText.startsWith(word, i)) {
                result.push(word);
                i += word.length;
                matched = true;
                break;
            }
        }
        
        if (!matched) {
            result.push(cleanText[i]);
            i++;
        }
    }
    return result;
}

function getCharPinyin(char) {
    if (!char) return "";
    // Priority 1: Exact match in vocabulary
    const found = vocabulary.find(v => v.hanTu === char);
    if (found) return found.pinyin;
    
    // Priority 2: Global Character Map (built from all examples)
    if (globalCharMap[char]) return globalCharMap[char];

    // Priority 3: Fallback searching for words containing the character
    const partial = vocabulary.find(v => v.hanTu.includes(char));
    if (partial) {
        if (partial.hanTu.length === 1) return partial.pinyin;
        
        // Smarter extraction from multi-char words
        const syllables = splitPinyinIntoSyllables(partial.pinyin || partial.cauPinyin);
        const cleanHan = (partial.hanTu || partial.cau).replace(/[，。？！.,?!、\s]/g, '');
        if (syllables.length === cleanHan.length) {
            const charIdx = cleanHan.indexOf(char);
            if (charIdx > -1) return syllables[charIdx];
        }
    }
    return "";
}

function showHint() {
    const qData = currentQuestions[currentQuestionIndex];
    const hintArea = document.getElementById('sentence-hint-area');
    if (!hintArea) return;

    hintArea.innerHTML = `
        <div class="hint-content">
            <div class="hint-pinyin">${qData.cauPinyin}</div>
            <div class="hint-han">${qData.cau}</div>
        </div>
    `;
    hintArea.classList.remove('hidden');
    
    setTimeout(() => {
        hintArea.classList.add('hidden');
    }, 5000);
}

function loadSentenceBuilder(qData) {
    sentenceAnswerZone.innerHTML = '';
    sentenceWordBank.innerHTML = '';
    sentenceAnswerZone.classList.remove('correct', 'wrong');
    checkSentenceBtn.disabled = false;
    
    const hintBtnContainer = document.getElementById('sentence-hint-btn-container');
    if (hintBtnContainer) hintBtnContainer.innerHTML = '';

    const isTargetMode = (gameMode === 'sentence-target');
    const targetIsViet = (gameMode === 'sentence-viet');
    const rawSentence = isTargetMode ? qData.cau : qData.cauNghia;
    const fullPinyin = isTargetMode ? qData.cauPinyin : "";
    
    if (isTargetMode) {
        questionEl.textContent = qData.cauNghia;
        pinyinEl.textContent = "";
        pinyinEl.style.display = 'none';
        questionEl.style.fontSize = '1.8rem';
    } else {
        questionEl.textContent = qData.cau;
        pinyinEl.textContent = qData.cauPinyin || "";
        pinyinEl.style.display = qData.cauPinyin ? 'block' : 'none';
        questionEl.style.fontSize = '2.5rem';
    }

    const pieces = splitSentence(rawSentence);
    const cleanSentenceString = rawSentence.replace(/[，。？！.,?!、\s]/g, '');
    
    // Build a CHARACTER-level alignment for THIS specific question
    const localCharPinyinMap = {};
    if (fullPinyin && !targetIsViet) {
        const syllables = splitPinyinIntoSyllables(fullPinyin);
        if (syllables.length === cleanSentenceString.length) {
            for (let i = 0; i < cleanSentenceString.length; i++) {
                localCharPinyinMap[cleanSentenceString[i]] = syllables[i];
            }
        }
    }

    const piecesWithPinyin = pieces.map((txt) => {
        let p = "";
        if (!targetIsViet) {
            const chars = txt.split('');
            
            // Priority 1: Build from Local Alignment Map (Highest accuracy for context)
            const localPinyins = chars.map(c => localCharPinyinMap[c] || "");
            if (localPinyins.every(lp => lp !== "")) {
                p = localPinyins.join('');
            }
            
            // Priority 2: Exact match in vocabulary
            if (!p) p = getCharPinyin(txt);
            
            // Priority 3: Build from characters using Global Map
            if (!p) {
                const globalPinyins = chars.map(c => getCharPinyin(c));
                if (globalPinyins.every(gp => gp !== "")) {
                    p = globalPinyins.join('');
                }
            }
        }
        return { text: txt, pinyin: p };
    });

    const shuffledPieces = [...piecesWithPinyin].sort(() => 0.5 - Math.random());
    
    shuffledPieces.forEach(item => {
        const block = document.createElement('div');
        block.className = 'word-block';
        
        if (!targetIsViet) {
            block.innerHTML = `
                <span class="word-pinyin">${item.pinyin || ""}</span>
                <span class="word-char">${item.text}</span>
            `;
        } else {
            block.textContent = item.text;
        }
        
        block.onclick = () => moveWord(block, sentenceWordBank, sentenceAnswerZone);
        sentenceWordBank.appendChild(block);
    });
    
    // Add Hint button if target is Chinese - FIXED LOCATION
    if (!targetIsViet && hintBtnContainer) {
        const hintBtn = document.createElement('button');
        hintBtn.className = 'btn warning-btn hint-btn';
        hintBtn.style.width = '100%';
        hintBtn.style.margin = '0';
        hintBtn.innerHTML = '💡 Xem Gợi ý (5s)';
        hintBtn.onclick = showHint;
        hintBtnContainer.appendChild(hintBtn);
        
        // Ensure hint area exists
        if (!document.getElementById('sentence-hint-area')) {
            const area = document.createElement('div');
            area.id = 'sentence-hint-area';
            area.className = 'hint-box hidden';
            sentenceBuilderContainer.insertBefore(area, sentenceAnswerZone);
        }
    }
}

function moveWord(element, fromZone, toZone) {
    if (nextBtn.classList.contains('hidden') === false) return; 
    
    if (element.parentElement === fromZone) {
        toZone.appendChild(element);
    } else {
        fromZone.appendChild(element);
    }
    
    // Clear feedback when words are moved
    sentenceAnswerZone.classList.remove('correct', 'wrong');
    element.classList.remove('correct-block', 'wrong-block');
}

function checkSentenceAnswer() {
    const qData = currentQuestions[currentQuestionIndex];
    const targetIsViet = (gameMode === 'sentence-viet');
    const originalSentence = targetIsViet ? qData.cauNghia : qData.cau;
    
    const userPieces = Array.from(sentenceAnswerZone.children)
        .filter(el => el.classList.contains('word-block'))
        .map(el => {
            const charEl = el.querySelector('.word-char');
            return charEl ? charEl.textContent : el.textContent;
        });
    
    const userSentence = userPieces.join(targetIsViet || /[a-zA-Z]/.test(originalSentence) ? ' ' : '');
    
    const normalizedUser = normalizeSentence(userSentence);
    const normalizedTarget = normalizeSentence(originalSentence);
    
    // Individual block validation
    const targetPieces = splitSentence(originalSentence);
    Array.from(sentenceAnswerZone.children).forEach((el, idx) => {
        if (!el.classList.contains('word-block')) return;
        const char = el.querySelector('.word-char') ? el.querySelector('.word-char').textContent : el.textContent;
        if (idx < targetPieces.length && char === targetPieces[idx]) {
            el.classList.add('correct-block');
            el.classList.remove('wrong-block');
        } else {
            el.classList.add('wrong-block');
            el.classList.remove('correct-block');
        }
    });

    if (normalizedUser === normalizedTarget) {
        // Track activity
        const today = getTodayDate();
        activityHistory[today] = (activityHistory[today] || 0) + 1;
        saveActivityData();

        sentenceAnswerZone.classList.add('correct');
        score += 40;
        scoreEl.textContent = score;
        
        if (gameMode === 'sentence-target') {
            pinyinEl.textContent = qData.cauPinyin || "";
            pinyinEl.style.display = qData.cauPinyin ? 'block' : 'none';
        }
        
        // Unhide and update audio buttons for replay
        if (playAudioBtn) {
            playAudioBtn.classList.remove('hidden');
            playAudioBtn.onclick = () => playAudio(qData.cau, 'zh-CN');
        }
        if (playAudioSlowBtn) {
            playAudioSlowBtn.classList.remove('hidden');
            playAudioSlowBtn.onclick = () => playAudio(qData.cau, 'zh-CN', 0.65);
        }
        
        playAudio(qData.cau, 'zh-CN');

        checkSentenceBtn.disabled = true;
        nextBtn.classList.remove('hidden');
        
        if (qData.hanTu && !learnedWords.includes(qData.hanTu)) {
            learnedWords.push(qData.hanTu);
            localStorage.setItem(`${currentUser}_vocab_learned`, JSON.stringify(learnedWords));
        }
    } else {
        sentenceAnswerZone.classList.add('wrong', 'shake');
        setTimeout(() => {
            sentenceAnswerZone.classList.remove('shake');
        }, 500);
    }
}

function checkAnswer(selected, correct, selectedBtn) {
    stopTimer();
    const buttons = optionsContainer.querySelectorAll('.option-btn');
    buttons.forEach(btn => btn.disabled = true);
    
    const qData = currentQuestions[currentQuestionIndex];
    let requireCloze = false;
    
    if (selected === correct) {
        // Track activity
        const today = getTodayDate();
        activityHistory[today] = (activityHistory[today] || 0) + 1;
        saveActivityData();

        selectedBtn.classList.add('correct');
        score += (gameMode === 'time-attack') ? (50 + Math.round(timeRemaining * 5)) : 10;
        scoreEl.textContent = score;

        if (currentQuestionMode === 'viet-han') {
            const audioText = qData.hanTu || qData.cau;
            if (audioText) {
                playAudio(audioText, 'zh-CN');
                playAudioBtn.classList.remove('hidden');
                playAudioSlowBtn.classList.remove('hidden');
                playAudioBtn.onclick = () => playAudio(audioText, 'zh-CN');
                playAudioSlowBtn.onclick = () => playAudio(audioText, 'zh-CN', 0.65);
            }
        }

        if (gameMode === 'time-attack') {
            correctStreak++;
            // Reward: add time (cap at initial max)
            timeRemaining = Math.min(timeRemaining + 1.5, maxTimeLimit);
            // Higher difficulty: Every 5 correct, reduce max time by 0.5s (min 1.5s)
            if (correctStreak % 5 === 0) {
                maxTimeLimit = Math.max(maxTimeLimit - 0.5, 1.5);
            }
        }
        
        // Correct Answer
        if (gameMode === 'review') {
            updateSRSProgress(qData.hanTu, true);
        } else if (gameMode === 'time-attack') {
            updateSRSProgress(qData.hanTu, true, 'time-attack');
        } else if (gameMode.includes('sentence')) {
            // Auto-play and show buttons for replay in sentence modes
            if (qData.cau) {
                if (playAudioBtn) {
                    playAudioBtn.classList.remove('hidden');
                    playAudioBtn.onclick = () => playAudio(qData.cau, 'zh-CN');
                }
                if (playAudioSlowBtn) {
                    playAudioSlowBtn.classList.remove('hidden');
                    playAudioSlowBtn.onclick = () => playAudio(qData.cau, 'zh-CN', 0.65);
                }
                playAudio(qData.cau, 'zh-CN');
            }
        } else {
            // Normal mode correct (Level 0 -> 1)
            updateSRSProgress(qData.hanTu, true);
        }
        
        if(qData.cau && qData.cau !== '-' && !gameMode.includes('sentence')) {
            const hasWord = qData.cau.includes(qData.hanTu);
            const clozeContainer = document.getElementById('example-cloze-container');
            
            if (hasWord) {
                requireCloze = true;
                exampleSentence.innerHTML = qData.cau.replace(qData.hanTu, "（___）");
                examplePinyin.style.display = 'none'; // Hide pinyin until solved
                exampleMeaning.textContent = qData.cauNghia !== '-' ? qData.cauNghia : "";
                exampleMeaning.style.display = (qData.cauNghia !== '-') ? 'block' : 'none';
                
                if (clozeContainer) {
                    clozeContainer.classList.remove('hidden');
                    const clozeInput = document.getElementById('example-cloze-input');
                    if (clozeInput) {
                        clozeInput.value = '';
                        clozeInput.disabled = false;
                        clozeInput.style.backgroundColor = '';
                        clozeInput.style.borderColor = 'var(--primary-color)';
                        setTimeout(() => clozeInput.focus(), 100);
                    }
                }
            } else {
                exampleSentence.textContent = qData.cau;
                examplePinyin.textContent = qData.cauPinyin !== '-' ? qData.cauPinyin : "";
                exampleMeaning.textContent = qData.cauNghia !== '-' ? qData.cauNghia : "";
                examplePinyin.style.display = (qData.cauPinyin !== '-') ? 'block' : 'none';
                exampleMeaning.style.display = (qData.cauNghia !== '-') ? 'block' : 'none';
                if (clozeContainer) clozeContainer.classList.add('hidden');
            }
            
            if (playExAudioBtn) {
                playExAudioBtn.onclick = () => playAudio(qData.cau, 'zh-CN');
                if (requireCloze) {
                    playExAudioBtn.classList.add('hidden');
                    if (playExAudioSlowBtn) playExAudioSlowBtn.classList.add('hidden');
                } else {
                    playExAudioBtn.classList.remove('hidden');
                    if (playExAudioSlowBtn) {
                        playExAudioSlowBtn.onclick = () => playAudio(qData.cau, 'zh-CN', 0.65);
                        playExAudioSlowBtn.classList.remove('hidden');
                    }
                }
            }
            exampleContainer.classList.remove('hidden');
            
            // Auto-play example sentence immediately when it appears (only if no cloze is required)
            if (!requireCloze) {
                if (audioTimeout) clearTimeout(audioTimeout);
                audioTimeout = setTimeout(() => {
                    playAudio(qData.cau, 'zh-CN');
                    audioTimeout = null;
                }, 600); // Small delay to allow the word audio to be heard first
            }
        } else {
            const clozeContainer = document.getElementById('example-cloze-container');
            if (clozeContainer) clozeContainer.classList.add('hidden');
        }
    } else {
        selectedBtn.classList.add('wrong');
        
        if (gameMode === 'time-attack') {
            correctStreak = 0;
            // Penalty: reduce time and level
            timeRemaining = Math.max(timeRemaining - 2, 0);
            updateSRSProgress(qData.hanTu, false, 'time-attack');
            
            if (timeRemaining <= 0) {
                handleTimeOut();
                return;
            }
        } else if (!gameMode.includes('sentence')) {
            updateSRSProgress(qData.hanTu, false);
            
            // Loop wrong words in review mode until correctly answered
            if (gameMode === 'review') {
                currentQuestions.push(qData);
            }
        }

        let explanation = "";
        if (gameMode.includes('sentence')) {
            if (currentQuestionMode === 'sentence-trung-viet') {
                const found = vocabulary.find(v => v.cauNghia === selected) || sentencePool.find(v => v.cauNghia === selected);
                explanation = `Sai rồi. Đáp án đúng là: <br>"<b>${correct}</b>"<br>`;
                if(found) explanation += `<i>("<b>${selected}</b>" là nghĩa của câu: <b>${found.cau}</b> - ${found.cauPinyin})</i>`;
            } else {
                const cauOnly = selected.split('(')[0].trim();
                const found = vocabulary.find(v => v.cau === cauOnly) || sentencePool.find(v => v.cau === cauOnly);
                explanation = `Sai rồi. Đáp án đúng là: <br><b>${correct}</b><br>`;
                if(found) explanation += `<i>(Câu <b>${found.cau}</b> có nghĩa là: "<b>${found.cauNghia}</b>")</i>`;
            }
        } else {
            let answeredVietnamese = !selected.includes('(');
            if (answeredVietnamese) {
                const found = vocabulary.find(v => v.tiengViet === selected) || sentencePool.find(v => v.cauNghia === selected);
                explanation = `Sai rồi. Đáp án đúng là: <br>"<b>${correct}</b>"<br>`;
                if(found) explanation += `<i>("<b>${selected}</b>" là nghĩa của từ: <b>${found.hanTu || found.cau}</b> - ${found.pinyin || found.cauPinyin})</i>`;
            } else {
                const hantuOnly = selected.split('(')[0].trim();
                const found = vocabulary.find(v => v.hanTu === hantuOnly) || sentencePool.find(v => v.cau === hantuOnly);
                explanation = `Sai rồi. Đáp án đúng là: <br><b>${correct}</b><br>`;
                if(found) explanation += `<i>(Từ <b>${found.hanTu || found.cau}</b> có nghĩa là: "<b>${found.tiengViet || found.cauNghia}</b>")</i>`;
            }
        }
        
        if (gameMode === 'sentence-cloze') {
            explanationText.innerHTML = `Sai rồi. Đáp án đúng là: <b>${qData.hanTu}</b> (${qData.pinyin})<br>Câu đầy đủ: <b>${qData.cau}</b>`;
        } else {
            explanationText.innerHTML = explanation;
        }
        explanationContainer.classList.remove('hidden');

        buttons.forEach(btn => {
            if (btn.textContent.trim() === correct.trim()) {
                btn.classList.add('correct');
            }
        });
    }
    
    if (!requireCloze) {
        nextBtn.classList.remove('hidden');
    }
}

nextBtn.onclick = () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < currentQuestions.length) {
        loadQuestion();
    } else {
        endGame();
    }
};

function endGame() {
    stopTimer();
    showScreen('result');
    const finalScoreEl = document.getElementById('final-score-display');
    const feedbackEl = document.getElementById('feedback-text');
    
    finalScoreEl.textContent = score;
    // Basic feedback
    if (score >= currentQuestions.length * 15) {
        feedbackEl.textContent = "Tuyệt đỉnh! Tinh hoa hội tụ! 🎉";
        feedbackEl.style.color = "var(--secondary-color)";
    } else if (score >= currentQuestions.length * 10) {
        feedbackEl.textContent = "Rất tốt! Trí nhớ tuyệt vời 👏";
        feedbackEl.style.color = "var(--primary-color)";
    } else {
        feedbackEl.textContent = "Cố lên nhé! Luyện tập nhiều lên nào 💪";
        feedbackEl.style.color = "var(--text-muted)";
    }
}

function returnToMenu() {
    stopTimer();
    showScreen('main-menu');
}

// Daily History Functions
function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function saveHistoryData() {
    localStorage.setItem(`${currentUser}_vocab_history`, JSON.stringify(vocabHistory));
    saveProgressToCloud();
}

function saveActivityData() {
    localStorage.setItem(`${currentUser}_activity_history`, JSON.stringify(activityHistory));
    saveProgressToCloud();
}

function showHistoryScreen() {
    renderHistory();
    showScreen('history-screen');
}

function renderHistory() {
    const container = document.getElementById('history-container');
    if (!container) return;
    
    const dates = Object.keys(vocabHistory).sort().reverse(); // Newest first
    if (dates.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">Chưa có dữ liệu lịch sử. Hãy bắt đầu học ngay!</p>';
        return;
    }
    
    container.innerHTML = '';
    dates.forEach(date => {
        const data = vocabHistory[date];
        const dataValues = [data[1]||0, data[2]||0, data[3]||0, data[4]||0, data[5]||0];
        const total = dataValues.reduce((a, b) => a + b, 0);
        
        const item = document.createElement('div');
        item.className = 'history-item';
        item.style.cssText = 'background: #fff; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 1rem;';
        
        let barsHtml = '';
        const colors = { 1: '#94a3b8', 2: '#6366f1', 3: '#10b981', 4: '#f59e0b', 5: '#ec4899' };
        
        for (let l = 1; l <= 5; l++) {
            const count = data[l] || 0;
            const pct = total > 0 ? (count / total * 100) : 0;
            if (pct > 0) {
                barsHtml += `<div style="width: ${pct}%; background: ${colors[l]}; height: 8px;" title="Level ${l}: ${count}"></div>`;
            }
        }
        
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.6rem; font-size: 0.9rem;">
                <span style="font-weight: bold; color: var(--text-main);">${date}</span>
                <span style="color: var(--text-muted);">Tổng: ${total} từ</span>
            </div>
            <div style="display: flex; border-radius: 4px; overflow: hidden; height: 8px; background: #f1f5f9; margin-bottom: 0.6rem;">
                ${barsHtml}
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.75rem; font-weight: 600;">
                <span style="color: ${colors[1]};">L1: ${data[1] || 0}</span>
                <span style="color: ${colors[2]};">L2: ${data[2] || 0}</span>
                <span style="color: ${colors[3]};">L3: ${data[3] || 0}</span>
                <span style="color: ${colors[4]};">L4: ${data[4] || 0}</span>
                <span style="color: ${colors[5]};">L5: ${data[5] || 0}</span>
            </div>
        `;
        container.appendChild(item);
    });
}

/**
 * SPEECH RECOGNITION & PHONETIC ANALYSIS
 */

function startVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Trình duyệt của bạn không hỗ trợ nhận diện giọng nói. Vui lòng dùng Chrome hoặc Edge.");
        return;
    }

    if (isRecording) return;

    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const voiceBtn = document.getElementById('voice-input-btn');
    const statusEl = document.getElementById('speech-status');
    const feedbackContainer = document.getElementById('speech-feedback-container');

    recognition.onstart = () => {
        isRecording = true;
        voiceBtn.classList.add('recording');
        const micText = voiceBtn.querySelector('.mic-text');
        if (micText) micText.textContent = "Đang nghe...";
        statusEl.textContent = "Đang lắng nghe... 🎙️";
        feedbackContainer.classList.remove('hidden');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("Transcript:", transcript);
        processSpeechResult(transcript);
    };

    recognition.onerror = (event) => {
        console.error("Speech Error:", event.error);
        statusEl.textContent = "Lỗi: " + event.error;
        stopRecording();
    };

    recognition.onend = () => {
        stopRecording();
    };

    recognition.start();
}

function stopRecording() {
    isRecording = false;
    const voiceBtn = document.getElementById('voice-input-btn');
    if (voiceBtn) {
        voiceBtn.classList.remove('recording');
        const micText = voiceBtn.querySelector('.mic-text');
        if (micText) micText.textContent = "Nhấn để nói lại";
    }
}

function processSpeechResult(recognizedText) {
    const qData = currentQuestions[currentQuestionIndex];
    if (!qData) return;
    
    const targetText = qData.hanTu;
    const { score: accuracyScore, html } = compareAndHighlight(targetText, recognizedText);
    
    const resultDisplay = document.getElementById('speech-result-display');
    const scoreDisplay = document.getElementById('speech-score-display');
    const statusEl = document.getElementById('speech-status');

    if (resultDisplay) resultDisplay.innerHTML = html;
    if (scoreDisplay) scoreDisplay.textContent = `Độ chính xác: ${Math.round(accuracyScore)}%`;
    if (statusEl) statusEl.textContent = accuracyScore >= 80 ? "Tuyệt vời! Phát âm rất chuẩn. ✅" : "Bạn thử lại nhé! 🔄";

    if (accuracyScore >= 80) {
        // Update activity history
        const today = getTodayDate();
        activityHistory[today] = (activityHistory[today] || 0) + 1;
        saveActivityData();
        
        // Show next button
        nextBtn.classList.remove('hidden');
        nextBtn.onclick = () => {
             currentQuestionIndex++;
             if (currentQuestionIndex < currentQuestions.length) {
                 loadQuestion();
             } else {
                 showResult();
             }
        };
        
        // Success visual feedback
        const quizScreen = document.getElementById('quiz-screen');
        if (quizScreen) {
            quizScreen.style.backgroundColor = '#ecfdf5';
            setTimeout(() => quizScreen.style.backgroundColor = '', 500);
        }
    } else {
        // Shake feedback
        const feedbackBox = document.querySelector('.speech-feedback-box');
        if (feedbackBox) {
            feedbackBox.classList.add('shake');
            setTimeout(() => feedbackBox.classList.remove('shake'), 500);
        }
    }
}

function compareAndHighlight(target, recognized) {
    const targetArr = target.split('');
    const recognizedArr = recognized.split('');
    
    let correctCount = 0;
    let html = '';

    targetArr.forEach((char, index) => {
        const recChar = recognizedArr[index] || '';
        let status = 'missing';
        let displayPinyin = globalCharMap[char] || '?';

        if (char === recChar) {
            status = 'correct';
            correctCount++;
        } else if (recChar !== '') {
            status = 'wrong';
            displayPinyin = globalCharMap[recChar] || `[${recChar}]`;
        }

        html += `
            <div class="char-result ${status}">
                <span class="char-pinyin">${displayPinyin}</span>
                <span class="char-han">${char}</span>
            </div>
        `;
    });

    const accuracyScore = (correctCount / targetArr.length) * 100;
    return { score: accuracyScore, html };
}

function skipSpeechQuestion() {
    if (recognition && isRecording) {
        recognition.stop();
    }
    
    const qData = currentQuestions[currentQuestionIndex];
    if (!qData) return;
    
    const statusEl = document.getElementById('speech-status');
    const feedbackContainer = document.getElementById('speech-feedback-container');
    const resultDisplay = document.getElementById('speech-result-display');
    const skipBtn = document.getElementById('skip-speech-btn');

    if (statusEl) statusEl.textContent = "Đã bỏ qua. Hãy xem đáp án bên dưới! ⏩";
    if (feedbackContainer) feedbackContainer.classList.remove('hidden');
    if (skipBtn) skipBtn.classList.add('hidden');

    // Show correct characters in neutral color or highlight them
    const { html } = compareAndHighlight(qData.hanTu, "");
    if (resultDisplay) resultDisplay.innerHTML = html;

    // Reveal Next Button
    nextBtn.classList.remove('hidden');
    nextBtn.onclick = () => {
        currentQuestionIndex++;
        if (currentQuestionIndex < currentQuestions.length) {
            loadQuestion();
        } else {
            showResult();
        }
    };
}

const RADICAL_DICTIONARY = {
    '爪': { name: 'Trảo', meaning: 'Móng vuốt' },
    '爫': { name: 'Trảo', meaning: 'Móng vuốt' },
    '冖': { name: 'Mịch', meaning: 'Khăn trùm' },
    '友': { name: 'Hữu', meaning: 'Bạn bè' },
    '又': { name: 'Hựu', meaning: 'Lặp lại' },
    '用': { name: 'Dụng', meaning: 'Sử dụng' },
    '儿': { name: 'Nhi', meaning: 'Trẻ con' },
    '冂': { name: 'Quynh', meaning: 'Vùng biên giới' },
    '口': { name: 'Khẩu', meaning: 'Cái miệng' },
    '月': { name: 'Nguyệt', meaning: 'Mặt trăng' },
    '刂': { name: 'Đao', meaning: 'Con dao' },
    '丷': { name: 'Bát', meaning: 'Số 8' },
    '一': { name: 'Nhất', meaning: 'Số 1' },
    '土': { name: 'Thổ', meaning: 'Đất' },
    '心': { name: 'Tâm', meaning: 'Quả tim' },
    '忄': { name: 'Tâm', meaning: 'Quả tim (đứng)' },
    '子': { name: 'Tử', meaning: 'Con cái' },
    '宀': { name: 'Miên', meaning: 'Mái nhà' },
    '门': { name: 'Môn', meaning: 'Cửa' },
    '人': { name: 'Nhân', meaning: 'Người' },
    '亻': { name: 'Nhân', meaning: 'Người (đứng)' },
    '扌': { name: 'Thủ', meaning: 'Tay' },
    '辶': { name: 'Sước', meaning: 'Bước đi' },
    '讠': { name: 'Ngôn', meaning: 'Lời nói' },
    '饣': { name: 'Thực', meaning: 'Ăn' },
    '纟': { name: 'Mịch', meaning: 'Sợi tơ' },
    '钅': { name: 'Kim', meaning: 'Kim loại' },
    '氵': { name: 'Thủy', meaning: 'Nước' },
    '火': { name: 'Hỏa', meaning: 'Lửa' },
    '灬': { name: 'Hỏa', meaning: 'Lửa (nằm)' },
    '木': { name: 'Mộc', meaning: 'Cây' },
    '艹': { name: 'Thảo', meaning: 'Cỏ' },
    '女': { name: 'Nữ', meaning: 'Phụ nữ' },
    '日': { name: 'Nhật', meaning: 'Mặt trời' },
    '目': { name: 'Mục', meaning: 'Mắt' },
    '犭': { name: 'Khuyển', meaning: 'Con chó' },
    '马': { name: 'Mã', meaning: 'Con ngựa' },
    '鸟': { name: 'Điểu', meaning: 'Con chim' },
    '虫': { name: 'Trùng', meaning: 'Sâu bọ' },
    '疒': { name: 'Nạch', meaning: 'Bệnh tật' },
    '走': { name: 'Tẩu', meaning: 'Chạy' },
    '车': { name: 'Xa', meaning: 'Xe' },
    '舟': { name: 'Chu', meaning: 'Thuyền' },
    '衣': { name: 'Y', meaning: 'Áo' },
    '衤': { name: 'Y', meaning: 'Áo (đứng)' },
    '礻': { name: 'Thị', meaning: 'Thần đất' },
    '卩': { name: 'Tiết', meaning: 'Đốt tre' },
    '阝': { name: 'Phụ/Ấp', meaning: 'Gò đất/Thành' },
    '隹': { name: 'Chuy', meaning: 'Chim đuôi ngắn' },
    '夂': { name: 'Truy', meaning: 'Đến sau' },
    '田': { name: 'Điền', meaning: 'Ruộng' },
    '工': { name: 'Công', meaning: 'Công việc' },
    '乍': { name: 'Sạ', meaning: 'Bỗng nhiên' },
    '⺌': { name: 'Tiểu', meaning: 'Nhỏ (biến thể)' },
    '小': { name: 'Tiểu', meaning: 'Nhỏ' },
    '乙': { name: 'Ất', meaning: 'Thứ hai' },
    '丶': { name: 'Chủ', meaning: 'Dấu chấm' },
    '生': { name: 'Sinh', meaning: 'Sống/Đẻ' },
    '舌': { name: 'Thiệt', meaning: 'Cái lưỡi' },
    '匕': { name: 'Chủy', meaning: 'Cái thìa' },
    '丿': { name: 'Phiệt', meaning: 'Nét phẩy' },
    '巾': { name: 'Cân', meaning: 'Khăn mặt' },
    '贝': { name: 'Bối', meaning: 'Vỏ sò/Tiền' },
    '力': { name: 'Lực', meaning: 'Sức mạnh' },
    '尸': { name: 'Thi', meaning: 'Xác chết/Mái' },
    '歹': { name: 'Ngạt', meaning: 'Xấu/Chết' },
    '也': { name: 'Dã', meaning: 'Cũng' },
    '大': { name: 'Đại', meaning: 'Lớn' },
    '夫': { name: 'Phu', meaning: 'Chồng/Người đàn ông' },
    '见': { name: 'Kiến', meaning: 'Nhìn thấy' },
    '斤': { name: 'Cân', meaning: 'Cái búa/Rìu' },
    '方': { name: 'Phương', meaning: 'Hình vuông/Hướng' },
    '反': { name: 'Phản', meaning: 'Ngược lại' },
    '寸': { name: 'Thốn', meaning: 'Đơn vị đo/Ít' },
    '占': { name: 'Chiêm', meaning: 'Chiếm lấy/Xem bói' },
    '免': { name: 'Miễn', meaning: 'Tránh khỏi/Miễn' },
    '自': { name: 'Tự', meaning: 'Bản thân/Từ đâu' },
    '丂': { name: 'Khảo', meaning: 'Vật cản' },
    '其': { name: 'Kỳ', meaning: 'Cái đó/Của nó' },
    '吉': { name: 'Cát', meaning: 'Tốt lành' },
    '氐': { name: 'Đê', meaning: 'Cội gốc/Tên bộ tộc' },
    '止': { name: 'Chỉ', meaning: 'Dừng lại' },
    '夬': { name: 'Quái', meaning: 'Quyết định' },
    '圣': { name: 'Thánh', meaning: 'Linh thiêng/Thánh' },
    '且': { name: 'Thả', meaning: 'Hơn nữa/Sắp' },
    '卖': { name: 'Mại', meaning: 'Bán' },
    '罒': { name: 'Võng', meaning: 'Cái lưới' },
    '直': { name: 'Trực', meaning: 'Thẳng' },
    '卜': { name: 'Bốc', meaning: 'Xem bói' },
    '与': { name: 'Dữ', meaning: 'Cho/Với' },
    '兑': { name: 'Đoái', meaning: 'Trao đổi/Quẻ Đoái' },
    '糸': { name: 'Mịch', meaning: 'Sợi tơ nhỏ' },
    '我': { name: 'Ngã', meaning: 'Tôi/Ta' },
    '舍': { name: 'Xá', meaning: 'Nhà ở/Bỏ đi' },
    '予': { name: 'Dư', meaning: 'Cho/Ban cho' },
    '冬': { name: 'Đông', meaning: 'Mùa đông' },
    '咸': { name: 'Hàm', meaning: 'Tất cả/Mặn' },
    '曰': { name: 'Viết', meaning: 'Rằng/Nói' },
    '癶': { name: 'Bát', meaning: 'Gạt ra/Đạp' },
    '乂': { name: 'Nghệ', meaning: 'Cắt cỏ/Trị' },
    '尧': { name: 'Nghiêu', meaning: 'Cao/Vua Nghiêu' },
    '约': { name: 'Ước', meaning: 'Hẹn ước/Khoảng' },
    '尔': { name: 'Nhĩ', meaning: 'Mày/Ngươi' },
    '戈': { name: 'Qua', meaning: 'Cây mác' },
    '疋': { name: 'Sơ', meaning: 'Cái chân' },
    '𠂇': { name: 'Tả', meaning: 'Tay trái' },
    '殳': { name: 'Thù', meaning: 'Binh khí dài' },
    '禾': { name: 'Hòa', meaning: 'Cây lúa' },
    '夕': { name: 'Tịch', meaning: 'Buổi tối' },
    '彳': { name: 'Xích', meaning: 'Bước chân trái' },
    '艮': { name: 'Cấn', meaning: 'Bền cứng/Quẻ Cấn' },
    '乚': { name: 'Ẩn', meaning: 'Nét cong' },
    '文': { name: 'Văn', meaning: 'Văn chương/Chữ' },
    '彐': { name: 'Ký', meaning: 'Đầu con heo' },
    '豕': { name: 'Thệ', meaning: 'Con heo' },
    '广': { name: 'Quảng', meaning: 'Mái nhà rộng' },
    '五': { name: 'Ngũ', meaning: 'Số 5' },
    '厶': { name: 'Khứ/Tư', meaning: 'Riêng tư' },
    '召': { name: 'Triệu', meaning: 'Triệu tập' },
    '头': { name: 'Đầu', meaning: 'Cái đầu' },
    '反': { name: 'Phản', meaning: 'Ngược lại' }
};

const CHAR_DECOMPOSITION = {
    '爱': ['爫', '冖', '友'],
    '用': ['用'],
    '先': ['土', '儿'],
    '再': ['一', '冂', '土'],
    '后': ['口'],
    '前': ['丷', '一', '月', '刂'],
    '准': ['氵', '隹'],
    '备': ['夂', '田'],
    '工': ['工'],
    '作': ['亻', '乍'],
    '学': ['⺌', '冖', '子'],
    '习': ['乙', '丶'],
    '生': ['生'],
    '活': ['氵', '舌'],
    '朋': ['月', '月'],
    '友': ['又', '丶'],
    '老': ['土', '丿', '匕'],
    '师': ['刂', '一', '巾'],
    '家': ['宀', '豕'],
    '里': ['日', '土'],
    '睡': ['目', '垂'],
    '觉': ['⺌', '冖', '见'],
    '起': ['走', '己'],
    '床': ['广', '木'],
    '吃': ['口', '乞'],
    '饭': ['饣', '反'],
    '喝': ['口', '曷'],
    '水': ['水'],
    '运': ['辶', '云'],
    '动': ['云', '力'],
    '看': ['手', '目'],
    '书': ['乙', '丨'],
    '听': ['口', '斤'],
    '音': ['立', '日'],
    '乐': ['丿', '木'],
    '写': ['冖', '与'],
    '字': ['宀', '子'],
    '说': ['讠', '兑'],
    '汉': ['氵', '又'],
    '语': ['讠', '五', '口'],
    '去': ['土', '厶'],
    '超': ['走', '召'],
    '市': ['亠', '巾'],
    '买': ['乛', '头'],
    '东': ['一', ' middle'],
    '西': ['西'],
    '坐': ['人', '人', '土'],
    '公': ['八', '厶'],
    '交': ['亠', '父'],
    '车': ['车'],
    '打': ['扌', '丁'],
    '路': ['足', '各'],
    '旅': ['方', '人'],
    '游': ['氵', '方', '子'],
    '高': ['亠', '口', '冂', '口'],
    '兴': ['丷', '一', '八'],
    '难': ['又', '隹'],
    '过': ['辶', '寸'],
    '累': ['田', '糸'],
    '饿': ['饣', '我'],
    '渴': ['氵', '曷'],
    '舒': ['舍', '予'],
    '服': ['月', '卩', '又'],
    '疼': ['疒', '冬'],
    '感': ['咸', '心'],
    '冒': ['曰', '目'],
    '发': ['癶', '乂'],
    '烧': ['火', '尧'],
    '药': ['艹', '约'],
    '你': ['亻', '尔'],
    '我': ['丿', '手', '戈'],
    '他': ['亻', '也'],
    '她': ['女', '也'],
    '们': ['亻', '门'],
    '好': ['女', '子'],
    '吗': ['口', '马'],
    '不': ['一', '撇', '竖', '点'],
    '是': ['日', '疋'],
    '有': ['𠂇', '月'],
    '没': ['氵', '殳'],
    '在': ['𠂇', '土'],
    '和': ['禾', '口'],
    '大': ['大'],
    '小': ['小'],
    '多': ['夕', '夕'],
    '少': ['小', '丿'],
    '太': ['大', '丶'],
    '很': ['彳', '艮'],
    '真': ['十', '目', '乚'],
    '这': ['辶', '文'],
    '那': ['彐', '阝'],
    '哪': ['口', '那'],
    '时': ['日', '寸'],
    '间': ['门', '日'],
    '分': ['八', '刀'],
    '钟': ['钅', '中'],
    '秒': ['禾', '少'],
    '点': ['占', '灬'],
    '早': ['日', '十'],
    '午': ['午'],
    '中': ['中'],
    '下': ['下'],
    '晚': ['日', '免'],
    '白': ['白'],
    '天': ['天'],
    '夜': ['亠', '亻', '夕', '夂'],
    '上': ['上'],
    '班': ['王', '刂', '王'],
    '加': ['力', '口'],
    '休': ['亻', '木'],
    '息': ['自', '心'],
    '号': ['口', '丂'],
    '昨': ['日', '乍'],
    '今': ['人', '一', '乛'],
    '明': ['日', '月'],
    '每': ['𠂉', '母'],
    '星': ['日', '生'],
    '期': ['其', '月'],
    '周': ['冂', '吉'],
    '末': ['一', '木'],
    '月': ['月'],
    '初': ['衤', '刀'],
    '底': ['广', '氐'],
    '年': ['午', '一'],
    '现': ['王', '见'],
    '刚': ['冈', '刂'],
    '正': ['一', '止'],
    '快': ['忄', '夬'],
    '要': ['西', '女'],
    '已': ['已'],
    '经': ['纟', '圣'],
    '具': ['且', '八'],
    '体': ['亻', '本'],
    '连': ['辶', '车'],
    '续': ['纟', '卖'],
    '同': ['冂', '一', '口'],
    '步': ['止', '少'],
    '位': ['亻', '立'],
    '置': ['罒', '直'],
    '面': ['面'],
    '左': ['𠂇', '工'],
    '右': ['𠂇', '口'],
    '边': ['辶', '力'],
    '旁': ['亠', '丷', '冖', '方'],
    '外': ['夕', '卜'],
    '对': ['又', '寸']
};

function showFullscreenReveal(char, pinyin, callback) {
    console.log("Showing fullscreen reveal for:", char, pinyin); // Debug log
    const overlay = document.getElementById('character-reveal-overlay');
    const display = document.getElementById('large-char-display');
    const pinyinDisplay = document.getElementById('large-pinyin-display');
    const analysis = document.getElementById('radical-analysis');
    
    if (!overlay || !display) return callback ? callback() : null;

    display.textContent = char;
    if (pinyinDisplay) pinyinDisplay.textContent = pinyin || "";

    // Dynamic Font Scaling for long text
    if (char.length > 3) {
        display.style.fontSize = `min(${35 / (char.length/2)}vw, ${15 / (char.length/2)}rem)`;
    } else {
        display.style.fontSize = ""; // Reset to CSS default
    }

    if (pinyin && pinyin.length > 10) {
        pinyinDisplay.style.fontSize = `min(${12 / (pinyin.length/10)}vw, ${6 / (pinyin.length/10)}rem)`;
    } else {
        pinyinDisplay.style.fontSize = ""; // Reset to CSS default
    }
    
    // Radical Analysis Logic
    if (analysis) {
        analysis.innerHTML = '';
        // Split multi-character words (e.g., '工人' -> ['工', '人'])
        const characters = char.split('');
        
        characters.forEach(singleChar => {
            const components = CHAR_DECOMPOSITION[singleChar] || [singleChar];
            
            components.forEach(comp => {
                const data = RADICAL_DICTIONARY[comp];
                const item = document.createElement('div');
                item.className = 'radical-item';
                
                if (data) {
                    item.innerHTML = `
                        <span class="radical-char">${comp}</span>
                        <span class="radical-name">${data.name}</span>
                        <span class="radical-meaning">${data.meaning}</span>
                    `;
                } else {
                    item.innerHTML = `<span class="radical-char">${comp}</span><span class="radical-name">Hán tự</span>`;
                }
                analysis.appendChild(item);
            });
        });
    }

    overlay.classList.remove('shrinking');
    overlay.classList.add('active');
    
    // Play audio immediately
    // Play audio immediately (unless we're about to play a sentence in the callback)
    if (!callback) {
        playAudio(char, 'zh-CN');
    }

    // Sau 1.2 giây, bắt đầu thu nhỏ và gọi callback ngay để phát âm thanh câu (tránh bị trình duyệt chặn)
    setTimeout(() => {
        overlay.classList.add('shrinking');
        if (callback) callback();
        
        // Dọn dẹp sau khi hoạt ảnh kết thúc
        setTimeout(() => {
            overlay.classList.remove('active');
        }, 400); 
    }, 1200);
}
function stripPinyinTones(pinyin) {
    if (!pinyin) return "";
    return pinyin.normalize("NFD")
                 .replace(/[\u0300-\u036f]/g, "")
                 .replace(/ü/g, "v")
                 .replace(/ū/g, "u")
                 .replace(/[^a-z]/gi, "")
                 .toLowerCase();
}

function checkTypingAnswer() {
    if (gameMode !== 'type-pinyin' && gameMode !== 'type-hanzi') return;
    
    const inputEl = document.getElementById('pinyin-input');
    const qData = currentQuestions[currentQuestionIndex];
    const userInput = inputEl.value.trim();
    
    let normalizedUser = userInput;
    let normalizedTarget = "";
    
    if (gameMode === 'type-pinyin') {
        normalizedUser = stripPinyinTones(userInput);
        normalizedTarget = stripPinyinTones(qData.pinyin);
    } else {
        // type-hanzi
        normalizedUser = userInput.replace(/\s+/g, '');
        normalizedTarget = qData.hanTu;
    }
    
    if (normalizedUser === "") return; // Empty input, do nothing
    
    // Disable input while showing result
    inputEl.disabled = true;
    document.getElementById('check-pinyin-btn').disabled = true;
    
    if (normalizedUser === normalizedTarget) {
        // Track activity
        const today = getTodayDate();
        activityHistory[today] = (activityHistory[today] || 0) + 1;
        saveActivityData();

        inputEl.style.backgroundColor = '#dcfce7';
        inputEl.style.borderColor = '#10b981';
        score += 30;
        scoreEl.textContent = score;
        
        // Progress update (similar to normal learning)
        if (!wordStats[qData.hanTu]) {
            wordStats[qData.hanTu] = {
                level: 1,
                lastReview: Date.now(),
                nextReview: Date.now() + (1 * 60 * 60 * 1000),
                interval: 1,
                repCount: 1
            };
            saveSRSData();
        } else {
             // For Pinyin mode, maybe just increase repCount slightly
             const stats = wordStats[qData.hanTu];
             stats.repCount = (stats.repCount || 0) + 0.5;
             saveSRSData();
        }

        // Show example if exists
        if(qData.cau && qData.cau !== '-') {
            exampleSentence.textContent = qData.cau;
            examplePinyin.textContent = qData.cauPinyin !== '-' ? qData.cauPinyin : "";
            exampleMeaning.textContent = qData.cauNghia !== '-' ? qData.cauNghia : "";
            examplePinyin.style.display = (qData.cauPinyin !== '-') ? 'block' : 'none';
            exampleMeaning.style.display = (qData.cauNghia !== '-') ? 'block' : 'none';
            const playExAudioBtn = document.getElementById('play-ex-audio-btn');
            const playExAudioSlowBtn = document.getElementById('play-ex-audio-slow-btn');
            if (playExAudioBtn) {
                playExAudioBtn.onclick = () => playAudio(qData.cau, 'zh-CN');
                playExAudioBtn.classList.remove('hidden');
                if (playExAudioSlowBtn) {
                    playExAudioSlowBtn.onclick = () => playAudio(qData.cau, 'zh-CN', 0.65);
                    playExAudioSlowBtn.classList.remove('hidden');
                }
            }
            exampleContainer.classList.remove('hidden');
        }
        
        // Show Fullscreen Reveal
        showFullscreenReveal(qData.hanTu, qData.pinyin);
    } else {
        inputEl.style.backgroundColor = '#fee2e2';
        inputEl.style.borderColor = '#ef4444';
        
        // Handle Wrong Answer Progress
        const stats = wordStats[qData.hanTu] || { level: 1, interval: 1, repCount: 0 };
        stats.level = 1;
        stats.repCount = 0;
        stats.interval = 1;
        stats.nextReview = Date.now();
        wordStats[qData.hanTu] = stats;
        saveSRSData();
        
        const index = learnedWords.indexOf(qData.hanTu);
        if(index > -1) {
            learnedWords.splice(index, 1);
            localStorage.setItem(`${currentUser}_vocab_learned`, JSON.stringify(learnedWords));
        }
        if (!wrongWords.includes(qData.hanTu)) {
            wrongWords.push(qData.hanTu);
            localStorage.setItem(`${currentUser}_vocab_wrong`, JSON.stringify(wrongWords));
        }
        
        if (gameMode === 'type-pinyin') {
            explanationText.innerHTML = `❌ <b>Sai rồi!</b><br>Từ <b>${qData.hanTu}</b> có Pinyin là: <b>${qData.pinyin}</b><br>Bạn nhập: <b>${userInput}</b>`;
        } else {
            explanationText.innerHTML = `❌ <b>Sai rồi!</b><br>Nghĩa <b>${qData.tiengViet}</b> là từ: <b>${qData.hanTu}</b> (${qData.pinyin})<br>Bạn nhập: <b>${userInput}</b>`;
        }
        explanationContainer.classList.remove('hidden');
    }
    
    nextBtn.classList.remove('hidden');
    
    // Auto proceed if correct
    if (normalizedUser === normalizedTarget) {
         setTimeout(() => {
             if (!nextBtn.classList.contains('hidden')) {
                 nextBtn.click();
             }
         }, 1500);
    }
    
    // Reset styles for next question
    setTimeout(() => {
        inputEl.style.backgroundColor = '';
        inputEl.style.borderColor = 'var(--primary-color)';
        inputEl.disabled = false;
        document.getElementById('check-pinyin-btn').disabled = false;
    }, 1500); // Will be reset on loadQuestion anyway, but just in case
}

// Add global keydown for Enter in Pinyin mode
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const inputContainer = document.getElementById('pinyin-input-container');
        const nextBtn = document.getElementById('next-btn');
        
        if (inputContainer && !inputContainer.classList.contains('hidden')) {
            // If next button is visible, it means the question is answered, go to next
            if (nextBtn && !nextBtn.classList.contains('hidden')) {
                nextBtn.click();
            } else {
                const inputEl = document.getElementById('pinyin-input');
                if (document.activeElement === inputEl || inputEl.value !== "") {
                    checkTypingAnswer();
                }
            }
        }
    }
});
// Event listener for Example Cloze Input
const exampleClozeInputEl = document.getElementById('example-cloze-input');
if (exampleClozeInputEl) {
    exampleClozeInputEl.addEventListener('input', function() {
        const qData = currentQuestions[currentQuestionIndex];
        if (!qData) return;
        
        const userInput = stripPinyinTones(this.value.trim());
        const targetPinyin = stripPinyinTones(qData.pinyin);
        
        if (userInput === targetPinyin && userInput !== "") {
            this.disabled = true;
            this.style.backgroundColor = '#dcfce7';
            this.style.borderColor = '#10b981';
            
            const today = getTodayDate();
            activityHistory[today] = (activityHistory[today] || 0) + 1;
            saveActivityData();

            showFullscreenReveal(qData.hanTu, qData.pinyin, () => {
                const exampleSentence = document.getElementById('example-sentence');
                const examplePinyin = document.getElementById('example-pinyin');
                
                if (exampleSentence) {
                    const highlighted = qData.cau.replace(qData.hanTu, `<span class="completed-word" style="color: var(--secondary-color); font-weight: 800;">${qData.hanTu}</span>`);
                    exampleSentence.innerHTML = highlighted;
                    
                    // Hiện nút loa sau khi đã hoàn thành và gán sự kiện
                    const playExAudioBtn = document.getElementById('play-ex-audio-btn');
                    const playExAudioSlowBtn = document.getElementById('play-ex-audio-slow-btn');
                    if (playExAudioBtn) {
                        playExAudioBtn.classList.remove('hidden');
                        playExAudioBtn.onclick = () => playAudio(qData.cau, 'zh-CN');
                    }
                    if (playExAudioSlowBtn) {
                        playExAudioSlowBtn.classList.remove('hidden');
                        playExAudioSlowBtn.onclick = () => playAudio(qData.cau, 'zh-CN', 0.65);
                    }
                    
                    // Phát âm toàn bộ câu sau khi đã hoàn thiện
                    console.log("Auto-playing example sentence after cloze completion...");
                    playAudio(qData.cau, 'zh-CN');
                }
                
                if (examplePinyin) {
                    examplePinyin.textContent = qData.cauPinyin !== '-' ? qData.cauPinyin : "";
                    examplePinyin.style.display = (qData.cauPinyin !== '-') ? 'block' : 'none';
                }

                const nextBtn = document.getElementById('next-btn');
                if (nextBtn) {
                    nextBtn.classList.remove('hidden');
                    if (window.innerWidth < 600) {
                        nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            });
        }
    });
}

// ==========================================
// FIREBASE AUTH & SYNC LOGIC
// ==========================================

function showAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
}

function hideAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function switchAuthTab(tab) {
    if (tab === 'login') {
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('tab-register').classList.remove('active');
        document.getElementById('form-login').classList.remove('hidden');
        document.getElementById('form-register').classList.add('hidden');
    } else {
        document.getElementById('tab-register').classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
        document.getElementById('form-register').classList.remove('hidden');
        document.getElementById('form-login').classList.add('hidden');
    }
}

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            hideAuthModal();
            console.log("Đăng nhập Google thành công:", result.user.email);
        })
        .catch((error) => {
            alert("Lỗi đăng nhập Google: " + error.message);
        });
}

function loginWithEmail() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    if (!email || !pass) return alert("Vui lòng nhập đầy đủ thông tin");
    auth.signInWithEmailAndPassword(email, pass)
        .then(() => hideAuthModal())
        .catch((error) => alert("Lỗi đăng nhập: " + error.message));
}

function registerWithEmail() {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    if (!email || !pass) return alert("Vui lòng nhập đầy đủ thông tin");
    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => {
            hideAuthModal();
            alert("Đăng ký thành công!");
        })
        .catch((error) => alert("Lỗi đăng ký: " + error.message));
}

function logoutUser() {
    if(confirm("Bạn có chắc muốn đăng xuất?")) {
        auth.signOut().then(() => {
            // UI sẽ được reset bởi onAuthStateChanged
        });
    }
}

let syncTimeout = null;
function saveProgressToCloud() {
    if (currentUser === "guest") return;
    
    // Debounce to prevent exceeding Firebase quota
    if (syncTimeout) clearTimeout(syncTimeout);
    
    syncTimeout = setTimeout(() => {
        db.collection("users").doc(currentUser).set({
            wordStats: wordStats,
            vocabHistory: vocabHistory,
            activityHistory: activityHistory,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true })
        .then(() => console.log("Đã lưu dữ liệu lên Cloud."))
        .catch(err => console.error("Lỗi lưu Cloud:", err));
    }, 2000);
}

function loadProgressFromCloud(uid) {
    const loadingScreen = document.getElementById('loading-screen');
    if(loadingScreen) {
        loadingScreen.querySelector('p').textContent = "Đang đồng bộ dữ liệu Cloud...";
        loadingScreen.classList.add('active');
    }

    db.collection("users").doc(uid).get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            if (data.wordStats) wordStats = data.wordStats;
            if (data.vocabHistory) vocabHistory = data.vocabHistory;
            if (data.activityHistory) activityHistory = data.activityHistory;
            
            // Rebuild legacy arrays
            learnedWords = Object.keys(wordStats).filter(k => wordStats[k].level >= 3);
            const now = Date.now();
            wrongWords = Object.keys(wordStats).filter(k => wordStats[k].level > 0 && wordStats[k].nextReview <= now);
            
            // Backup to local
            localStorage.setItem(`${uid}_vocab_stats`, JSON.stringify(wordStats));
            localStorage.setItem(`${uid}_vocab_history`, JSON.stringify(vocabHistory));
            localStorage.setItem(`${uid}_activity_history`, JSON.stringify(activityHistory));
            localStorage.setItem(`${uid}_vocab_learned`, JSON.stringify(learnedWords));
            localStorage.setItem(`${uid}_vocab_wrong`, JSON.stringify(wrongWords));
            
            updateProgressUI();
            console.log("Đã tải dữ liệu từ Cloud.");
        } else {
            console.log("User chưa có dữ liệu trên Cloud. Đẩy dữ liệu hiện tại lên.");
            saveProgressToCloud();
        }
    }).catch((error) => {
        console.error("Lỗi tải dữ liệu từ Cloud:", error);
        loadProgressFromLocal();
    }).finally(() => {
        if(loadingScreen) loadingScreen.classList.remove('active');
    });
}
