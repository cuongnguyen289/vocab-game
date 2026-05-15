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

const LESSON_GID = "1457813627";
const LESSON_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${LESSON_GID}`;

let lessonVocabulary = []; // Lưu từ vựng theo bài học
let lessonsGrouped = {}; // Lưu danh sách bài học { "Bài 1": [word1, word2], ... }
let isLessonMode = false;
let currentSelectedLesson = "";

// --- HỆ THỐNG ÂM THANH INDEXED DB CACHING (v4.1) ---
const DB_NAME = 'VocabGameAudioDB';
const STORE_NAME = 'audio_cache';
let dbInstance = null;
let prefetchedUrls = {}; // Lưu trữ sẵn Blob URL để phát ngay lập tức

async function updateCacheCountDisplay() {
    if (!dbInstance) await initAudioDB();
    if (!dbInstance) return;
    const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const countRequest = store.count();
    countRequest.onsuccess = () => {
        const display = document.getElementById('cache-count-display');
        if (display) display.textContent = `(${countRequest.result})`;
    };
}

function initAudioDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => {
            dbInstance = e.target.result;
            updateCacheCountDisplay(); // Update display on success
            resolve(dbInstance);
        };
        request.onerror = (e) => {
            console.error("IndexedDB error:", e.target.error);
            resolve(null);
        };
    });
}

async function getCachedAudio(key) {
    if (!dbInstance) await initAudioDB();
    if (!dbInstance) return null;
    return new Promise((resolve) => {
        const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

async function saveAudioToCache(key, blob) {
    if (!dbInstance) await initAudioDB();
    if (!dbInstance) return;
    const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(blob, key);
}

async function fetchAudioBlob(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Fetch failed");
        return await response.blob();
    } catch (e) {
        console.error("Error fetching audio blob:", e);
        return null;
    }
}

window.clearAudioCache = async function() {
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ bộ nhớ đệm âm thanh? Bạn sẽ cần internet để nghe lại.")) return;
    if (!dbInstance) await initAudioDB();
    if (!dbInstance) return;
    const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    updateCacheCountDisplay(); // Reset display
    alert("Đã xóa sạch bộ nhớ đệm âm thanh.");
};

let globalAudio = new Audio();
let currentAudioId = 0;
let audioTimeout = null;

function cleanTTSText(text) {
    if (!text) return "";
    return text.replace(/（___）|（|）|___|\(.*?\)|\[.*?\]|<.*?>|['"]/g, '')
               .replace(/[^\u4e00-\u9fa5a-zA-Z0-9，。！？,.!? ]/g, '')
               .trim();
}

window.playAudio = async function(text, lang, rate = 1.0) {
    if (!text || text === '-' || lang !== 'zh-CN') return;
    
    // Immediately cancel any pending Web Speech to prevent overlap
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    
    const requestId = ++currentAudioId;
    const cleanText = cleanTTSText(text);
    if (!cleanText) return;

    if (audioTimeout) { clearTimeout(audioTimeout); audioTimeout = null; }
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // 0. KIỂM TRA TRONG BỘ NHỚ TẠM (DÀNH CHO MOBILE - PHÁT ĐỒNG BỘ)
    if (prefetchedUrls[cleanText] && requestId === currentAudioId) {
        console.log("Playing from prefetch memory:", cleanText);
        try {
            globalAudio.pause();
            globalAudio.src = prefetchedUrls[cleanText];
            globalAudio.playbackRate = rate;
            await globalAudio.play();
            return;
        } catch (e) {
            console.warn("Prefetch play failed, falling back...");
        }
    }

    globalAudio.pause();

    const playWebSpeech = () => {
        if ('speechSynthesis' in window && requestId === currentAudioId) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = 'zh-CN';
            utterance.rate = rate;
            window.speechSynthesis.speak(utterance);
        }
    };

    const tryPlay = async (url) => {
        return new Promise((resolve) => {
            if (requestId !== currentAudioId) return resolve(false);
            
            globalAudio.src = url;
            globalAudio.playbackRate = rate;
            if (isMobile) globalAudio.load();

            const onPlay = () => {
                globalAudio.removeEventListener('error', onError);
                resolve(true);
            };
            const onError = () => {
                globalAudio.removeEventListener('canplaythrough', onPlay);
                resolve(false);
            };
            
            globalAudio.addEventListener('canplaythrough', onPlay, { once: true });
            globalAudio.addEventListener('error', onError, { once: true });
            
            globalAudio.play().catch(err => {
                console.warn("Play blocked:", err);
                resolve(false);
            });
        });
    };

    // 1. Kiểm tra Cache thông thường
    const cachedBlob = await getCachedAudio(cleanText);
    if (cachedBlob && requestId === currentAudioId) {
        const blobUrl = URL.createObjectURL(cachedBlob);
        if (await tryPlay(blobUrl)) return;
    }

    // CHỌN NGUỒN PHÁT: Ưu tiên tuyệt đối Youdao vì chất lượng cao và ổn định
    const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanText)}&le=zh`;
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=zh-CN&client=gtx&ttsspeed=${rate < 1 ? 0.5 : 1}`;
    
    // Luôn ưu tiên Youdao trước, Google sau
    const sources = [youdaoUrl, googleUrl];

    let played = false;
    for (const url of sources) {
        if (await tryPlay(url)) {
            played = true;
            fetchAudioBlob(url).then(blob => { if (blob) saveAudioToCache(cleanText, blob); });
            break;
        }
    }

    if (!played && requestId === currentAudioId) playWebSpeech();
};

// Mở khóa âm thanh
// Mở khóa âm thanh ngay lần chạm đầu tiên
document.addEventListener('click', function unlock() {
    globalAudio.play().then(() => { globalAudio.pause(); document.removeEventListener('click', unlock); }).catch(()=>{});
}, { once: true });

// Hàm tải trước âm thanh cho các câu hỏi tiếp theo để tránh lag (Đặc biệt quan trọng cho mobile)
async function prefetchNextAudio(index) {
    if (index + 1 < currentQuestions.length) {
        const nextQ = currentQuestions[index + 1];
        const text = nextQ.hanTu || nextQ.cau;
        if (!text) return;
        
        const cleanText = cleanTTSText(text);
        if (prefetchedUrls[cleanText]) return; // Đã có rồi
        
        const blob = await getCachedAudio(cleanText);
        if (blob) {
            // Giải phóng bộ nhớ cũ nếu quá nhiều (tối đa giữ 10 tệp)
            const keys = Object.keys(prefetchedUrls);
            if (keys.length > 10) {
                URL.revokeObjectURL(prefetchedUrls[keys[0]]);
                delete prefetchedUrls[keys[0]];
            }
            prefetchedUrls[cleanText] = URL.createObjectURL(blob);
            console.log("Prefetched for mobile sync:", cleanText);
        }
    }
}

const FETCH_URLS = [
    TARGET_URL, 
    `https://api.allorigins.win/raw?url=${encodeURIComponent(TARGET_URL)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(TARGET_URL)}`,
    `https://corsproxy.io/?${encodeURIComponent(TARGET_URL)}`
];

let vocabulary = [];
let radicalMap = {}; // Group words by radical: { '氵': [idx1, idx2, ...], ... }

function getModeTitle(mode) {
    const titles = {
        'vocab-mcq': '📚 Trắc Nghiệm Tổng Hợp',
        'vocab-writing': '✍️ Luyện Viết & Gõ',
        'type-pinyin': '⌨️ Luyện Gõ Pinyin',
        'type-hanzi': '✍️ Luyện Gõ Chữ Hán',
        'draw-hanzi': '🖌️ Tập Viết Chữ Hán',
        'speech-challenge': '🎙️ Luyện Phát Âm',
        'vocab-challenge': '⚡ Thử Thách Từ Vựng',
        'sentence-trung-viet': '🗣️ Dịch Câu Trung - Việt',
        'sentence-target': '🧩 Ghép Câu Tiếng Trung',
        'sentence-cloze': '📝 Điền Từ Vào Câu',
        'radical-mcq': '🧬 Trắc Nghiệm Bộ Thủ',
        'radical-writing': '✍️ Luyện Viết Bộ Thủ',
        'survival': '❤️ Thử Thách Sinh Tồn',
        'han-viet': '📚 Trắc Nghiệm Hán - Việt',
        'viet-han': '📚 Trắc Nghiệm Việt - Hán'
    };
    return titles[mode] || '🎮 Đang Chơi';
}
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
let globalCharMap = {}; // Map of { "char": "pinyin" } for fallbacks
let vocabHistory = {}; // Daily Level Stats: { "YYYY-MM-DD": { 1, 2, 3, 4, 5 } }
let activityHistory = {}; // Daily Correct Count: { "YYYY-MM-DD": count }
let recognition; // SpeechRecognition instance
let isRecording = false;

// Sync protection flags
let isCloudSyncing = false;
let isCloudLoaded = false;

const screens = {
    mainMenu: document.getElementById('main-menu-screen'),
    gameSetup: document.getElementById('game-setup-screen'),
    loading: document.getElementById('loading-screen'),
    quiz: document.getElementById('quiz-screen'),
    history: document.getElementById('history-screen'),
    result: document.getElementById('result-screen'),
    lessonSelection: document.getElementById('lesson-selection-screen'),
    matching: document.getElementById('matching-screen')
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
const downloadAudioBtn = document.getElementById('download-audio-btn');
const playExAudioBtn = document.getElementById('play-ex-audio-btn');
const playExAudioSlowBtn = document.getElementById('play-ex-audio-slow-btn');

let currentLevelFilter = null;
let lives = 3;
let survivalScore = 0;

// Nguồn âm thanh TTS với đa dạng dự phòng (Youdao -> Google -> Web Speech API)
// Matching Game State
let matchingSelectedTiles = [];
let matchingMatchedCount = 0;
let currentMatchingWords = [];
let matchingLessonPool = [];
let matchingPoolIndex = 0;
let selectedLessonsForMatching = [];

// playAudio replaced by the Promise-based version above

// --- HỆ THỐNG BATCH CACHING AUDIO (v4.1) ---
window.downloadAllSentenceAudio = async function() {
    const uniqueItems = new Set();
    
    // Thu thập từ vựng (chỉ từ ngắn < 15 ký tự)
    vocabulary.forEach(v => {
        if (v.hanTu && v.hanTu.length < 15) uniqueItems.add(v.hanTu);
    });

    // Thu thập câu từ từ vựng chính
    vocabulary.forEach(v => {
        if (v.cau && v.cau !== '-') uniqueItems.add(v.cau);
    });
    
    // Thu thập câu từ pool câu
    sentencePool.forEach(s => {
        if (s.cau) uniqueItems.add(s.cau);
    });
    
    const itemList = Array.from(uniqueItems);
    if (itemList.length === 0) return alert("Không tìm thấy dữ liệu âm thanh nào để lưu.");
    
    if (!confirm(`Hệ thống sẽ tải và lưu trữ ${itemList.length} mục âm thanh vào trình duyệt để bạn có thể học Offline. Tiếp tục?`)) return;

    const progressContainer = document.getElementById('audio-progress-container');
    const progressBar = document.getElementById('audio-progress-bar');
    const progressStatus = document.getElementById('audio-progress-status');
    const progressPercent = document.getElementById('audio-progress-percent');
    
    progressContainer.classList.remove('hidden');
    let processedCount = 0;
    
    for (const text of itemList) {
        processedCount++;
        const percent = Math.round((processedCount / itemList.length) * 100);
        
        progressStatus.textContent = `Đang xử lý ${processedCount}/${itemList.length}`;
        progressPercent.textContent = `${percent}%`;
        progressBar.style.width = `${percent}%`;
        
        const cleanText = cleanTTSText(text);
        if (!cleanText) continue;

        // Kiểm tra xem đã có trong cache chưa
        const exists = await getCachedAudio(cleanText);
        if (!exists) {
            const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanText)}&le=zh`;
            const blob = await fetchAudioBlob(url);
            if (blob) {
                await saveAudioToCache(cleanText, blob);
            }
            await new Promise(r => setTimeout(r, 100));
        }
    }
    
    alert(`Đã hoàn tất lưu ${processedCount} mục vào bộ nhớ đệm! Bây giờ bạn có thể học Offline.`);
    updateCacheCountDisplay(); // Update final count
    setTimeout(() => progressContainer.classList.add('hidden'), 3000);
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
    const setupTotalCountEl = document.getElementById('setup-total-count');
    
    if(totalCountEl) totalCountEl.textContent = vocabulary.length;
    if(setupTotalCountEl) setupTotalCountEl.textContent = vocabulary.length;
    
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
    const setupEls = {
        1: document.getElementById('setup-lvl-1-count'),
        2: document.getElementById('setup-lvl-2-count'),
        3: document.getElementById('setup-lvl-3-count'),
        4: document.getElementById('setup-lvl-4-count'),
        5: document.getElementById('setup-lvl-5-count')
    };

    for (let l = 1; l <= 5; l++) {
        if (topEls[l]) topEls[l].textContent = stats[l];
        if (setupEls[l]) setupEls[l].textContent = stats[l];
    }
    
    // Render các nút chức năng động
    renderDynamicButtons(stats);

    // Update Level Select Dropdown with counts and SRS option
    const levelSelect = document.getElementById('level-select');
    if (levelSelect) {
        const now = Date.now();
        const reviewReady = Object.keys(wordStats).filter(hanTu => {
            const s = wordStats[hanTu];
            return s.level > 0 && s.nextReview <= now;
        }).length;

        const currentVal = levelSelect.value;
        levelSelect.innerHTML = '';
        
        // SRS Option
        const srsOpt = document.createElement('option');
        srsOpt.value = 'srs';
        srsOpt.textContent = `🎯 Ôn tập SRS (${reviewReady} từ đến hạn)`;
        levelSelect.appendChild(srsOpt);

        // Level Options
        for (let l = 1; l <= 5; l++) {
            const opt = document.createElement('option');
            opt.value = l;
            opt.textContent = `Cấp độ ${l} (${stats[l]} từ)`;
            levelSelect.appendChild(opt);
        }
        
        // Auto-select SRS if words are ready, else keep previous or default to L1
        if (currentVal && levelSelect.querySelector(`option[value="${currentVal}"]`)) {
            levelSelect.value = currentVal;
        } else if (reviewReady > 0) {
            levelSelect.value = 'srs';
        } else {
            levelSelect.value = '1';
        }

        // Re-render buttons when level changes to update the start handlers
        if (!levelSelect.dataset.listenerAdded) {
            levelSelect.addEventListener('change', () => renderDynamicButtons());
            levelSelect.dataset.listenerAdded = "true";
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

    // Update Radical Selector if current mode is radical grouping
    if (currentSetupMode === 'radical-grouping') {
        renderRadicalSelector();
    }
}

function buildRadicalMap() {
    radicalMap = {};
    vocabulary.forEach((word, index) => {
        if (!word.hanTu) return;
        // Split multi-char words and find radicals for each character
        const chars = [...word.hanTu].filter(c => /\p{Script=Han}/u.test(c));
        chars.forEach(char => {
            const components = CHAR_DECOMPOSITION[char] || [char];
            components.forEach(comp => {
                // Only consider it a radical if it's in our RADICAL_DICTIONARY
                if (RADICAL_DICTIONARY[comp]) {
                    if (!radicalMap[comp]) radicalMap[comp] = [];
                    if (!radicalMap[comp].includes(index)) {
                        radicalMap[comp].push(index);
                    }
                }
            });
        });
    });
}

function renderRadicalSelector() {
    const container = document.getElementById('radical-list');
    const selectedInput = document.getElementById('selected-radical');
    if (!container) return;

    if (Object.keys(radicalMap).length === 0) {
        buildRadicalMap();
    }

    // Sort radicals by number of words (descending)
    const sortedRadicals = Object.keys(radicalMap).sort((a, b) => radicalMap[b].length - radicalMap[a].length);
    
    container.innerHTML = '';
    sortedRadicals.forEach(rad => {
        const data = RADICAL_DICTIONARY[rad];
        const count = radicalMap[rad].length;
        
        const pill = document.createElement('div');
        pill.className = 'radical-pill' + (selectedInput.value === rad ? ' active' : '');
        pill.innerHTML = `
            <span class="rp-char">${rad}</span>
            <span class="rp-name">${data.name}</span>
            <span class="rp-count">${count} từ</span>
        `;
        
        pill.onclick = () => {
            document.querySelectorAll('.radical-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            selectedInput.value = rad;
            renderDynamicButtons(); // Re-render buttons to enable them
        };
        
        container.appendChild(pill);
    });

    if (sortedRadicals.length === 0) {
        container.innerHTML = '<p style="font-size: 0.9rem; color: var(--text-muted);">Không tìm thấy bộ thủ nào trong kho từ vựng hiện tại.</p>';
    }
}

function resetProgress() {
    if(confirm(`Bạn có chắc chắn muốn xóa tiến độ để học lại từ đầu không?`)) {
        wordStats = {};
        localStorage.removeItem(`${currentUser}_vocab_stats`);
        localStorage.removeItem(`${currentUser}_vocab_learned`);
        localStorage.removeItem(`${currentUser}_vocab_wrong`);
        updateProgressUI();
    }
}

function migrateToSRS(legacyLearned, legacyWrong) {
    let modified = false;
    if (legacyLearned) {
        legacyLearned.forEach(hanTu => {
            if (!wordStats[hanTu]) {
                wordStats[hanTu] = { level: 3, lastReview: Date.now(), nextReview: Date.now() + (3 * 24 * 60 * 60 * 1000), interval: 3, repCount: 5 };
                modified = true;
            }
        });
    }
    if (legacyWrong) {
        legacyWrong.forEach(hanTu => {
            if (!wordStats[hanTu]) {
                wordStats[hanTu] = { level: 1, lastReview: Date.now(), nextReview: Date.now(), interval: 1, repCount: 0 };
                modified = true;
            }
        });
    }
    if (modified) saveSRSData();
}

function saveSRSData() {
    localStorage.setItem(`${currentUser}_vocab_stats`, JSON.stringify(wordStats));
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
            nextReview: Date.now(),
            interval: 0,
            repCount: 0
        };
    }
    
    const stats = wordStats[hanTu];
    const now = Date.now();
    
    // Simplified +1/-1 Scoring
    if (isCorrect) {
        stats.level = Math.min(Math.floor(stats.level || 1) + 1, 5);
    } else {
        stats.level = Math.max(Math.floor(stats.level || 1) - 1, 1);
    }
    
    // Update interval and next review based on level
    const intervals = {
        1: 0, // Review immediately if wrong
        2: 1 * 24 * 60 * 60 * 1000, // 1 day
        3: 3 * 24 * 60 * 60 * 1000, // 3 days
        4: 7 * 24 * 60 * 60 * 1000, // 7 days
        5: 30 * 24 * 60 * 60 * 1000 // 30 days
    };
    
    stats.interval = intervals[stats.level] || 0;
    stats.nextReview = now + stats.interval;
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
        let legacyLearned = JSON.parse(localStorage.getItem(`${currentUser}_vocab_learned`));
        let legacyWrong = JSON.parse(localStorage.getItem(`${currentUser}_vocab_wrong`));
        wordStats = JSON.parse(localStorage.getItem(`${currentUser}_vocab_stats`)) || {};
        vocabHistory = JSON.parse(localStorage.getItem(`${currentUser}_vocab_history`)) || {};
        activityHistory = JSON.parse(localStorage.getItem(`${currentUser}_activity_history`)) || {};
        migrateToSRS(legacyLearned, legacyWrong);
        
        if (legacyLearned || legacyWrong) {
            localStorage.removeItem(`${currentUser}_vocab_learned`);
            localStorage.removeItem(`${currentUser}_vocab_wrong`);
        }
        updateProgressUI();
    } catch(e) {
        console.warn("Error loading progress", e);
    }
}

let currentSetupMode = 'vocab';

function showScreen(screenName) {
    if(screenName === 'gameSetup' || screenName === 'main-menu' || screenName === 'vocab') {
        updateProgressUI();
    }
    Object.values(screens).forEach(s => {
        if(s) s.classList.remove('active');
    });
    
    if(screenName === 'main-menu') screens.mainMenu.classList.add('active');
    else if(screenName === 'gameSetup' || screenName === 'vocab') screens.gameSetup.classList.add('active');
    else if(screenName === 'history-screen') screens.history.classList.add('active');
    else if(screenName === 'lesson-selection-screen') screens.lessonSelection.classList.add('active');
    else if(screenName === 'matching-screen') screens.matching.classList.add('active');
    else if(screens[screenName]) screens[screenName].classList.add('active');
}

function goToLessonSelection() {
    const container = document.getElementById('lesson-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    // Sort lessons naturally (Bài 1, Bài 2, ..., Bài 10)
    const sortedLessons = Object.keys(lessonsGrouped).sort((a, b) => {
        return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
    });
    
    sortedLessons.forEach(lessonName => {
        const words = lessonsGrouped[lessonName];
        const total = words.length;
        
        // Calculate stats
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unstudied: 0 };
        words.forEach(w => {
            const s = wordStats[w.hanTu];
            if (s && s.level >= 1) {
                counts[Math.floor(s.level)]++;
            } else {
                counts.unstudied++;
            }
        });
        
        const inProgress = counts[1] + counts[2] + counts[3] + counts[4];
        
        const isSelected = selectedLessonsForMatching.includes(lessonName);
        const card = document.createElement('div');
        card.className = `lesson-card${isSelected ? ' selected' : ''}`;
        
        // Generate progress segments
        let progressHtml = '';
        const colors = { 1: '#94a3b8', 2: '#6366f1', 3: '#10b981', 4: '#f59e0b', 5: '#ec4899' };
        [1, 2, 3, 4, 5].forEach(l => {
            const pct = (counts[l] / total) * 100;
            if (pct > 0) {
                progressHtml += `<div class="progress-segment" style="width: ${pct}%; background: ${colors[l]};"></div>`;
            }
        });

        card.innerHTML = `
            <div class="selection-indicator"><i class="fas fa-check"></i></div>
            <div class="lesson-info" style="width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <span class="lesson-name" style="font-weight: 700; font-size: 1.1rem;">${lessonName}</span>
                    <span class="in-progress-badge">${inProgress}/${total} từ</span>
                </div>
                
                <div class="lesson-progress-container">
                    ${progressHtml || '<div class="progress-segment" style="width: 100%; background: #e2e8f0;"></div>'}
                </div>
                
                <div class="level-stats-grid">
                    <span style="color: ${colors[1]}">L1: ${counts[1]}</span>
                    <span style="color: ${colors[2]}">L2: ${counts[2]}</span>
                    <span style="color: ${colors[3]}">L3: ${counts[3]}</span>
                    <span style="color: ${colors[4]}">L4: ${counts[4]}</span>
                    <span style="color: ${colors[5]}">⭐ L5: ${counts[5]}</span>
                </div>
            </div>
            <div class="lesson-action" style="margin-top: 10px; justify-content: space-between; width: 100%;">
                <button class="lesson-btn matching-btn" style="flex: 1; margin-right: 8px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; border: none; padding: 5px 10px; border-radius: 8px; cursor: pointer; font-size: 0.85rem;" onclick="event.stopPropagation(); startMatchingGame('${lessonName}')">Nối Chữ 🧩</button>
                <button class="btn primary-btn" style="flex: 1; margin-bottom: 0; padding: 0.5rem; font-size: 0.9rem;" onclick="event.stopPropagation(); startLessonSetup('${lessonName}')">Học Ngay ➡️</button>
            </div>
        `;
        card.onclick = () => toggleLessonSelection(lessonName, card);
        container.appendChild(card);
    });
    
    updateMultiMatchingUI();
    showScreen('lesson-selection-screen');
}

function toggleLessonSelection(lessonName, cardEl) {
    const index = selectedLessonsForMatching.indexOf(lessonName);
    if (index > -1) {
        selectedLessonsForMatching.splice(index, 1);
        cardEl.classList.remove('selected');
    } else {
        selectedLessonsForMatching.push(lessonName);
        cardEl.classList.add('selected');
    }
    updateMultiMatchingUI();
}

function updateMultiMatchingUI() {
    const controls = document.getElementById('multi-matching-controls');
    const countEl = document.getElementById('selected-lessons-count');
    if (controls && countEl) {
        if (selectedLessonsForMatching.length > 0) {
            controls.classList.remove('hidden');
            countEl.textContent = selectedLessonsForMatching.length;
        } else {
            controls.classList.add('hidden');
        }
    }
}

function startMultiMatchingGame() {
    if (selectedLessonsForMatching.length === 0) return;
    
    // Combine all words from selected lessons
    let combinedPool = [];
    selectedLessonsForMatching.forEach(name => {
        combinedPool = combinedPool.concat(lessonsGrouped[name] || []);
    });
    
    // Filter if learned only is checked
    const learnedOnly = document.getElementById('matching-learned-only')?.checked;
    if (learnedOnly) {
        combinedPool = combinedPool.filter(word => {
            const stats = wordStats[word.hanTu];
            return stats && stats.level >= 1;
        });
    }
    
    if (combinedPool.length < 4) {
        if (learnedOnly) {
            alert("Bạn chưa có đủ 4 từ 'đã học' trong các bài này. Hãy học thêm hoặc bỏ tích chọn 'Chỉ chơi từ đã học'.");
        } else {
            alert("Tổng số từ vựng không đủ để chơi nối chữ!");
        }
        return;
    }
    
    matchingLessonPool = combinedPool;
    matchingMatchedCount = 0;
    matchingPoolIndex = 0;
    shuffleArray(matchingLessonPool);
    
    document.getElementById('matching-title').textContent = `Nối Chữ: ${selectedLessonsForMatching.length} bài${learnedOnly ? ' (Từ đã học)' : ''}`;
    console.log("Starting Multi-Matching with pool size:", matchingLessonPool.length);
    initMatchingRound();
    showScreen('matching-screen');
}

function startLessonSetup(lessonName) {
    currentSelectedLesson = lessonName;
    isLessonMode = true;
    goToStartScreen('lesson-review');
}

function goToStartScreen(mode) {
    currentSetupMode = mode;
    if (mode !== 'lesson-review') {
        isLessonMode = false;
        currentSelectedLesson = "";
    }
    const headerIcon = document.getElementById('setup-header-icon');
    const headerTitle = document.getElementById('setup-header-title');
    const headerDesc = document.getElementById('setup-header-desc');
    const sentenceStats = document.getElementById('sentence-stats-container');
    const grammarGroup = document.getElementById('grammar-selection-group');
    const levelGroup = document.getElementById('level-selection-group');
    const radicalGroup = document.getElementById('radical-selection-group');
    
    if(mode === 'vocab') {
        headerIcon.textContent = '🐼';
        headerTitle.textContent = 'Học Từ Vựng';
        headerDesc.textContent = 'Nâng cao vốn từ vựng mỗi ngày!';
        sentenceStats.style.display = 'none';
        grammarGroup.classList.add('hidden');
        levelGroup.classList.remove('hidden');
        radicalGroup.classList.add('hidden');
        document.getElementById('setup-progress-stats').classList.remove('hidden');
    } else if (mode === 'sentence') {
        headerIcon.textContent = '🗣️';
        headerTitle.textContent = 'Luyện Câu';
        headerDesc.textContent = 'Luyện phản xạ giao tiếp!';
        sentenceStats.style.display = 'block';
        grammarGroup.classList.add('hidden');
        levelGroup.classList.add('hidden');
        radicalGroup.classList.add('hidden');
        document.getElementById('setup-progress-stats').classList.add('hidden');
    } else if (mode === 'builder') {
        headerIcon.textContent = '🧩';
        headerTitle.textContent = 'Ghép Câu';
        headerDesc.textContent = 'Luyện ngữ pháp và cấu trúc câu!';
        sentenceStats.style.display = 'block';
        grammarGroup.classList.remove('hidden');
        levelGroup.classList.add('hidden');
        radicalGroup.classList.add('hidden');
        document.getElementById('setup-progress-stats').classList.add('hidden');
    } else if (mode === 'radical-grouping') {
        headerIcon.textContent = '🧬';
        headerTitle.textContent = 'Học theo Bộ Thủ';
        headerDesc.textContent = 'Nắm vững cội nguồn và ý nghĩa chữ Hán!';
        sentenceStats.style.display = 'none';
        grammarGroup.classList.add('hidden');
        levelGroup.classList.add('hidden');
        radicalGroup.classList.remove('hidden');
        document.getElementById('setup-progress-stats').classList.remove('hidden');
        renderRadicalSelector();
    } else if (mode === 'lesson-review') {
        headerIcon.textContent = '📖';
        headerTitle.textContent = `Ôn tập: ${currentSelectedLesson}`;
        headerDesc.textContent = 'Luyện tập các từ trong bài học đã chọn';
        sentenceStats.style.display = 'none';
        grammarGroup.classList.add('hidden');
        levelGroup.classList.add('hidden');
        radicalGroup.classList.add('hidden');
        document.getElementById('setup-progress-stats').classList.add('hidden');
    }
    
    renderDynamicButtons();
    showScreen('gameSetup');
}

function renderDynamicButtons(stats) {
    const container = document.getElementById('dynamic-mode-buttons');
    if (!container) return;
    container.innerHTML = '';
    
    if (!stats) {
        stats = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        Object.values(wordStats).forEach(s => {
            let lvl = Math.floor(s.level || 0);
            if (lvl < 0) lvl = 0; if (lvl > 5) lvl = 5;
            stats[lvl]++;
        });
        const studiedCount = Object.keys(wordStats).length;
        stats[0] += Math.max(0, vocabulary.length - studiedCount);
    }

    const now = Date.now();
    const reviewReady = Object.keys(wordStats).filter(hanTu => {
        const s = wordStats[hanTu];
        return s.level > 0 && s.nextReview <= now;
    });

    const dataLoaded = vocabulary.length >= 4;
    const sentenceLoaded = sentencePool.length >= 2;

    if (currentSetupMode === 'vocab') {
        const levelSelect = document.getElementById('level-select');
        const getLevel = () => {
            if (!levelSelect) return 1;
            const val = levelSelect.value;
            return val === 'srs' ? null : parseInt(val);
        };

        // 1. Trắc Nghiệm
        container.appendChild(createBtn('primary-btn', '📚', 'Trắc Nghiệm', () => startGame('vocab-mcq', getLevel()), !dataLoaded));
        
        // 2. Gõ Pinyin
        container.appendChild(createBtn('secondary-btn', '⌨️', 'Gõ Pinyin', () => startGame('type-pinyin', getLevel()), !dataLoaded));

        // 3. Tập Viết
        container.appendChild(createBtn('primary-btn', '🖌️', 'Tập Viết', () => startGame('draw-hanzi', getLevel()), !dataLoaded));

        // 4. Thử Thách
        const chalBtn = createBtn('warning-btn', '⚡', 'Thử Thách', () => startGame('vocab-challenge', getLevel()), !dataLoaded);
        chalBtn.style.background = 'linear-gradient(135deg, #f59e0b, #ef4444)';
        container.appendChild(chalBtn);
    } else if (currentSetupMode === 'lesson-review') {
        // 1. Trắc Nghiệm
        container.appendChild(createBtn('primary-btn', '📚', 'Trắc Nghiệm', () => startGame('vocab-mcq')));
        
        // 2. Gõ Pinyin
        container.appendChild(createBtn('secondary-btn', '⌨️', 'Gõ Pinyin', () => startGame('type-pinyin')));

        // 3. Tập Viết
        container.appendChild(createBtn('primary-btn', '🖌️', 'Tập Viết', () => startGame('draw-hanzi')));
    } else if (currentSetupMode === 'sentence') {
        container.appendChild(createBtn('primary-btn', '🇨🇳', 'Trung ➡️ Việt', () => startGame('sentence-trung-viet'), !sentenceLoaded));
    } else if (currentSetupMode === 'builder') {
        const b1 = createBtn('primary-btn', '🧩', 'Ghép câu (➡️ Ngoại ngữ)', () => startGame('sentence-target'), !sentenceLoaded);
        b1.style.backgroundColor = '#6366f1';
        container.appendChild(b1);
        
        const b2 = createBtn('primary-btn', '📝', 'Điền khuyết (Cloze)', () => startGame('sentence-cloze'), !sentenceLoaded);
        b2.style.backgroundColor = '#f59e0b';
        container.appendChild(b2);
    } else if (currentSetupMode === 'radical-grouping') {
        const selectedRad = document.getElementById('selected-radical').value;
        const isDisabled = !dataLoaded || !selectedRad;
        
        container.appendChild(createBtn('primary-btn', '📚', 'Trắc Nghiệm', () => startGame('radical-mcq'), isDisabled));
        container.appendChild(createBtn('secondary-btn', '✍️', 'Luyện Viết', () => startGame('radical-writing'), isDisabled));
    }
}

function createBtn(className, icon, text, onClick, disabled) {
    const btn = document.createElement('button');
    btn.className = `btn ${className}`;
    btn.disabled = disabled;
    btn.onclick = onClick;
    btn.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">${icon}</span><span>${text}</span></div>`;
    return btn;
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

    // Fetch Lesson Sheet (gid=1457813627)
    const lessonUrls = [
        LESSON_URL,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(LESSON_URL)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(LESSON_URL)}`,
        `https://corsproxy.io/?${encodeURIComponent(LESSON_URL)}`
    ];

    for (const url of lessonUrls) {
        try {
            console.log("Đang tải Bài học:", url);
            const response = await fetch(url);
            if (response.ok) {
                const csvText = await response.text();
                parseLessonCSV(csvText);
                successCount++;
                break;
            }
        } catch (error) {
            console.warn(`Lỗi Bài học ${url}:`, error);
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

function parseLessonCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    lessonVocabulary = [];
    lessonsGrouped = {};
    
    let skippedCount = 0;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let parts = splitCSVLine(line);
        // Remove trailing empty parts that often come from Excel/Sheets export
        while (parts.length > 0 && parts[parts.length - 1] === "") {
            parts.pop();
        }

        if (parts.length >= 4) { // Reduced requirement from 9 to 4 to be more flexible
            const hantu = parts[1] || "";
            const phienam = parts[2] || "";
            const nghia = parts[3] || "";
            
            // Skip if it looks like a header row
            if (hantu === "Hán Tự" || hantu === "STT" || hantu.includes("Nguồn tài liệu")) continue;

            // Flexibly find fields relative to the end
            const lessonName = parts[parts.length - 1] || "Khác";
            const cauNghia = parts.length >= 6 ? parts[parts.length - 2] : "";
            const cauPinyin = parts.length >= 7 ? parts[parts.length - 3] : "";
            const cau = parts.length >= 8 ? parts[parts.length - 4] : "";

            if (hantu && nghia) {
                const wordObj = {
                    hanTu: hantu,
                    pinyin: phienam,
                    tiengViet: nghia,
                    cau: cau,
                    cauPinyin: cauPinyin,
                    cauNghia: cauNghia,
                    lesson: lessonName
                };
                
                lessonVocabulary.push(wordObj);
                
                if (!lessonsGrouped[lessonName]) {
                    lessonsGrouped[lessonName] = [];
                }
                lessonsGrouped[lessonName].push(wordObj);
                
                updateGlobalCharMap(hantu, phienam);
            } else {
                skippedCount++;
            }
        } else {
            skippedCount++;
        }
    }
    console.log(`Đã nạp ${lessonVocabulary.length} từ theo bài. (Bỏ qua ${skippedCount} dòng không hợp lệ)`);
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
                // Fix duplicate words: check if this hanTu already exists
                const existingIdx = vocabulary.findIndex(v => v.hanTu === hantu);
                if (existingIdx === -1) {
                    vocabulary.push({
                        hanTu: hantu,
                        pinyin: phienam,
                        tiengViet: nghia,
                        cau: cau,
                        cauPinyin: cauPinyin,
                        cauNghia: cauNghia
                    });
                } else {
                    // Optional: If the existing entry doesn't have a sentence but the new one does, update it
                    if ((!vocabulary[existingIdx].cau || vocabulary[existingIdx].cau === '-') && (cau && cau !== '-')) {
                        vocabulary[existingIdx].cau = cau;
                        vocabulary[existingIdx].cauPinyin = cauPinyin;
                        vocabulary[existingIdx].cauNghia = cauNghia;
                    }
                }
                
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
        buildRadicalMap();
        renderDynamicButtons();
    }
}

// startLevelReview removed

async function startGame(mode, levelFilter = null) {
    gameMode = mode;
    currentLevelFilter = levelFilter;
    score = 0;
    currentQuestionIndex = 0;
    lives = 3;
    
    // Update Mode Title Banner
    const titleEl = document.getElementById('mode-title-text');
    if (titleEl) titleEl.textContent = getModeTitle(mode);

    // Handle vocab-writing sub-mode selection
    if (mode === 'vocab-writing') {
        // Logic will be handled in loadQuestion for each item
    }
    
    let availableWords = [];
    
    if (isLessonMode) {
        availableWords = lessonsGrouped[currentSelectedLesson] || [];
        if (mode === 'vocab-mcq' && availableWords.length < 4) {
            alert("Bài học này cần ít nhất 4 từ để chơi trắc nghiệm.");
            showScreen('gameSetup');
            return;
        }
        if (availableWords.length === 0) {
            alert("Không tìm thấy từ vựng trong bài học này.");
            showScreen('gameSetup');
            return;
        }
    } else if (mode === 'vocab-mcq') {
        const now = Date.now();
        availableWords = vocabulary.filter(v => {
            const s = wordStats[v.hanTu];
            if (levelFilter !== null) return (s ? Math.floor(s.level) : 0) === levelFilter;
            return s && s.level > 0 && s.nextReview <= now; // SRS mode
        });
        if (availableWords.length < 4) { alert("Cần ít nhất 4 từ để chơi."); showScreen('vocab'); return; }
    } else if (mode === 'radical-mcq' || mode === 'radical-writing') {
        const selectedRad = document.getElementById('selected-radical').value;
        if (!selectedRad || !radicalMap[selectedRad]) {
            alert("Vui lòng chọn một bộ thủ!");
            return;
        }
        // Map word indices back to word objects
        availableWords = radicalMap[selectedRad].map(idx => vocabulary[idx]);
        if (availableWords.length === 0) {
            alert("Không tìm thấy từ vựng nào thuộc bộ thủ này.");
            return;
        }
        if (mode === 'radical-mcq' && availableWords.length < 4) {
            alert("Cần ít nhất 4 từ thuộc bộ thủ này để chơi trắc nghiệm.");
            return;
        }
    } else if (mode === 'type-pinyin') {
        const now = Date.now();
        availableWords = vocabulary.filter(v => {
            const s = wordStats[v.hanTu];
            if (levelFilter !== null) return (s ? Math.floor(s.level) : 0) === levelFilter;
            return s && s.level > 0 && s.nextReview <= now; // SRS
        });
        if (availableWords.length === 0) { 
            alert(levelFilter !== null ? `Chưa có từ nào ở Level ${levelFilter} để luyện gõ!` : "Chưa có từ nào đến hạn ôn tập!"); 
            showScreen('gameSetup'); return; 
        }
    } else if (mode === 'type-hanzi') {
        const now = Date.now();
        availableWords = vocabulary.filter(v => {
            const s = wordStats[v.hanTu];
            if (levelFilter !== null) return (s ? Math.floor(s.level) : 0) === levelFilter;
            return s && s.level > 0 && s.nextReview <= now; // SRS
        });
        if (availableWords.length === 0) { showScreen('gameSetup'); return; }
    } else if (mode === 'draw-hanzi') {
        const now = Date.now();
        availableWords = vocabulary.filter(v => {
            const s = wordStats[v.hanTu];
            if (levelFilter !== null) return (s ? Math.floor(s.level) : 0) === levelFilter;
            return s && s.level > 0 && s.nextReview <= now; // SRS
        });
        if (availableWords.length === 0) { 
            alert(levelFilter !== null ? `Chưa có từ nào ở Level ${levelFilter} để tập viết!` : "Chưa có từ nào đến hạn ôn tập!"); 
            showScreen('gameSetup'); return; 
        }
    } else if (mode === 'vocab-challenge') {
        const now = Date.now();
        availableWords = vocabulary.filter(v => {
            const s = wordStats[v.hanTu];
            if (levelFilter !== null) return (s ? Math.floor(s.level) : 0) === levelFilter;
            return s && s.level > 0 && s.nextReview <= now; // SRS
        });
        if (availableWords.length < 4) { 
            alert("Cần ít nhất 4 từ trong nhóm này để chơi Thử Thách!"); 
            showScreen('gameSetup'); return; 
        }
    } else if (gameMode === 'review') {
        const now = Date.now();
        availableWords = vocabulary.filter(v => {
            const s = wordStats[v.hanTu];
            if (currentLevelFilter !== null) {
                const lvl = s ? Math.floor(s.level) : 0;
                return lvl === currentLevelFilter;
            }
            return s && s.level > 0 && s.nextReview <= now;
        });
        
        if (availableWords.length === 0) {
            alert(currentLevelFilter !== null ? `Chưa có từ nào ở Level ${currentLevelFilter}!` : "Chưa đến lúc ôn tập!");
            showScreen('vocab');
            return;
        }
    } else if (gameMode === 'sentence-trung-viet') {
        availableWords = sentencePool;
    } else if (gameMode === 'sentence-cloze') {
        availableWords = vocabulary.filter(v => v.hanTu && v.cau && v.cau !== '-' && v.cau.includes(v.hanTu));
    } else if (gameMode === 'sentence-target' || gameMode === 'sentence-viet') {
        availableWords = sentencePool;
    } else if (gameMode === 'speech-challenge') {
        availableWords = vocabulary.filter(v => wordStats[v.hanTu] && wordStats[v.hanTu].level >= 5);
    } else if (gameMode === 'survival') {
        availableWords = vocabulary;
        lives = 3;
        updateHeartsUI();
        document.getElementById('hearts-container').classList.remove('hidden');
    } else {
        // Default new words
        availableWords = vocabulary.filter(v => !wordStats[v.hanTu]);
    }

    if (availableWords.length === 0) {
        alert("Không còn từ nào để học trong chế độ này!");
        showScreen('vocab');
        return;
    }

    let inputQ = document.getElementById('game-num-questions');
    let desiredCount = inputQ ? parseInt(inputQ.value) : 30;
    let shuffled = [...availableWords].sort(() => 0.5 - Math.random());
    currentQuestions = shuffled.slice(0, Math.min(desiredCount, availableWords.length));
    
    scoreEl.textContent = score;
    showScreen('quiz');
    loadQuestion();
    prefetchNextAudio(0);
}

let writingQuizInstance = null;

function loadWritingQuiz(hanziWord) {
    const container = document.getElementById('writing-quiz-container');
    const canvas = document.getElementById('hanzi-quiz-canvas');
    const hintBtn = document.getElementById('writing-hint-btn');
    const resetBtn = document.getElementById('writing-reset-btn');
    const questionTextContainer = document.querySelector('.question-container');
    
    const skipBtn = document.getElementById('writing-skip-btn');
    
    // Switch to writing mode UI
    document.getElementById('quiz-screen').classList.add('writing-mode-active');
    container.classList.remove('hidden');
    container.style.display = 'flex';
    canvas.innerHTML = '';
    
    if (skipBtn) {
        skipBtn.onclick = () => {
            document.getElementById('quiz-screen').classList.remove('writing-mode-active');
            container.classList.add('hidden');
            container.style.display = 'none';
            handleCorrectAnswer(hanziWord);
        };
    }

    // Filter only Hanzi characters
    const chars = hanziWord.split('').filter(c => /\p{Script=Han}/u.test(c));
    let charIndex = 0;

    function startQuizForChar() {
        if (charIndex >= chars.length) {
            // Completed the whole word
            setTimeout(() => {
                document.getElementById('quiz-screen').classList.remove('writing-mode-active');
                container.classList.add('hidden');
                container.style.display = 'none';
                handleCorrectAnswer(hanziWord);
            }, 600);
            return;
        }

        canvas.innerHTML = '';
        const charDiv = document.createElement('div');
        charDiv.id = 'current-hanzi-target';
        canvas.appendChild(charDiv);

        writingQuizInstance = HanziWriter.create('current-hanzi-target', chars[charIndex], {
            width: 300,
            height: 300,
            showCharacter: false,
            showOutline: true,
            padding: 15,
            strokeColor: '#6366f1',
            radicalColor: '#10b981',
            outlineColor: '#e2e8f0',
            strokeAnimationSpeed: 1.5
        });

        writingQuizInstance.quiz({
            onComplete: () => {
                canvas.style.borderColor = '#10b981';
                setTimeout(() => {
                    canvas.style.borderColor = 'var(--primary-color)';
                    charIndex++;
                    startQuizForChar();
                }, 400);
            }
        });
    }

    hintBtn.onclick = () => {
        if (writingQuizInstance) {
            writingQuizInstance.revealFeedback();
        }
    };

    resetBtn.onclick = () => {
        startQuizForChar();
    };

    startQuizForChar();
}

function handleCorrectAnswer(answer) {
    // Shared logic for correct answers across different modes
    const correctBtn = Array.from(document.querySelectorAll('.option-btn'))
                            .find(b => b.textContent === answer);
    checkAnswer(answer, answer, correctBtn);
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

    // Reset Writing UI
    document.getElementById('writing-quiz-container').classList.add('hidden');
    document.getElementById('writing-quiz-container').style.display = 'none';
    document.getElementById('quiz-screen').classList.remove('writing-mode-active');
    
    const qData = currentQuestions[currentQuestionIndex];
    counterEl.textContent = `${currentQuestionIndex + 1}/${currentQuestions.length}`;
    prefetchNextAudio(currentQuestionIndex);
    
    let correctAnswerText = ""; 
    let questionTextMain = "";
    let questionTextSub = "";
    
    // Radical Info Display Reset
    const radicalInfo = document.getElementById('radical-info-display');
    if (radicalInfo) radicalInfo.classList.add('hidden');

    currentQuestionMode = gameMode;
    if (gameMode === 'review' || gameMode === 'test' || gameMode === 'time-attack' || gameMode === 'survival' || gameMode === 'vocab-mcq' || gameMode === 'radical-mcq') {
        currentQuestionMode = (Math.random() > 0.5) ? 'han-viet' : 'viet-han';
    } else if (gameMode === 'vocab-writing') {
        const rand = Math.random();
        if (rand < 0.4) {
            currentQuestionMode = 'draw-hanzi';
        } else if (rand < 0.7) {
            currentQuestionMode = 'type-pinyin';
        } else {
            currentQuestionMode = 'type-hanzi';
        }
    } else if (gameMode === 'radical-writing') {
        currentQuestionMode = 'draw-hanzi';
    }
    
    // Update banner title based on the final currentQuestionMode
    const titleEl = document.getElementById('mode-title-text');
    if (titleEl) titleEl.textContent = getModeTitle(currentQuestionMode);
    
    // Safety check for empty data
    if (!qData) {
        console.error("No question data found!");
        alert("Có lỗi xảy ra khi tải câu hỏi. Quay lại màn hình chính.");
        showScreen('main-menu');
        return;
    }

    if (currentQuestionMode === 'han-viet') {
        questionTextMain = qData.hanTu;
        questionTextSub = qData.pinyin;
        correctAnswerText = qData.tiengViet || qData.nghia || "";
        questionEl.style.fontSize = '3.2rem'; 
    } else if (currentQuestionMode === 'viet-han') {
        questionTextMain = qData.tiengViet;
        questionTextSub = ""; 
        correctAnswerText = (qData.hanTu && qData.pinyin) ? `${qData.hanTu} (${qData.pinyin})` : (qData.hanTu || "");
        questionEl.style.fontSize = '1.8rem'; 
    } else if (currentQuestionMode === 'sentence-trung-viet') {
        questionTextMain = qData.cau;
        questionTextSub = qData.cauPinyin;
        correctAnswerText = qData.cauNghia;
        questionEl.style.fontSize = '1.8rem';
    } else if (currentQuestionMode === 'sentence-cloze') {
        let displayCau = qData.cau.replace(qData.hanTu, `<span class="cloze-gap">（ ___ ）</span>`);
        questionTextMain = displayCau;
        questionTextSub = qData.cauNghia;
        correctAnswerText = (qData.hanTu && qData.pinyin) ? `${qData.hanTu} (${qData.pinyin})` : qData.hanTu;
        questionEl.style.fontSize = '1.8rem';
    } else if (currentQuestionMode === 'sentence-target') {
        questionTextMain = qData.cauNghia;
        questionTextSub = ""; 
        correctAnswerText = qData.cau;
        questionEl.style.fontSize = '1.8rem';
    } else if (currentQuestionMode === 'sentence-viet') {
        questionTextMain = qData.cau;
        questionTextSub = qData.cauPinyin;
        correctAnswerText = qData.cauNghia;
        questionEl.style.fontSize = '2.5rem';
    } else if (currentQuestionMode === 'type-pinyin') {
        questionTextMain = qData.hanTu;
        questionTextSub = qData.tiengViet; 
        correctAnswerText = qData.pinyin;
        questionEl.style.fontSize = '3.2rem';
    } else if (currentQuestionMode === 'type-hanzi') {
        questionTextMain = qData.tiengViet;
        questionTextSub = qData.pinyin; 
        correctAnswerText = qData.hanTu;
        questionEl.style.fontSize = '2rem';
    } else {
        questionTextMain = qData.hanTu || "";
        questionTextSub = qData.pinyin || "";
        correctAnswerText = qData.tiengViet || qData.nghia || "";
        questionEl.style.fontSize = '3.2rem';
    }
    
    // Use innerHTML to support formatted questions (like cloze gaps)
    if (currentQuestionMode === 'sentence-cloze') {
        questionEl.innerHTML = questionTextMain;
    } else {
        questionEl.textContent = questionTextMain;
    }
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
        pinyinEl.style.fontSize = '1.4rem';
        pinyinEl.style.color = 'var(--primary-color)';
        pinyinEl.style.fontStyle = 'normal';
    }
    
    if (questionTextMain) {
        let isVietnamese = (currentQuestionMode === 'viet-han' || currentQuestionMode === 'sentence-target');
        if (isVietnamese || currentQuestionMode === 'type-pinyin' || currentQuestionMode === 'type-hanzi') {
            playAudioBtn.classList.add('hidden');
            playAudioSlowBtn.classList.add('hidden');
        } else {
            playAudioBtn.classList.remove('hidden');
            playAudioSlowBtn.classList.remove('hidden');
            playAudio(questionTextMain, 'zh-CN');
            playAudioBtn.onclick = () => playAudio(questionTextMain, 'zh-CN');
            playAudioSlowBtn.onclick = () => playAudio(questionTextMain, 'zh-CN', 0.65);
        }
    }

    // Handle Radical Info Display for Radical Modes
    if (gameMode.startsWith('radical-')) {
        const selectedRad = document.getElementById('selected-radical').value;
        const radData = RADICAL_DICTIONARY[selectedRad];
        if (selectedRad && radData && radicalInfo) {
            document.getElementById('ri-char').textContent = selectedRad;
            document.getElementById('ri-name').textContent = `Bộ ${radData.name} (${radData.meaning})`;
            radicalInfo.classList.remove('hidden');
        }
    }

    if (gameMode === 'speech-challenge') {
        document.getElementById('voice-input-container').classList.remove('hidden');
        document.getElementById('skip-speech-btn').classList.remove('hidden');
        optionsContainer.classList.add('hidden');
        correctAnswerText = qData.hanTu;
    } else if (currentQuestionMode === 'draw-hanzi') {
        optionsContainer.classList.add('hidden');
        sentenceBuilderContainer.classList.add('hidden');
        loadWritingQuiz(qData.hanTu);
    } else if (currentQuestionMode === 'type-pinyin' || currentQuestionMode === 'type-hanzi') {
        optionsContainer.classList.add('hidden');
        sentenceBuilderContainer.classList.add('hidden');
        document.getElementById('pinyin-input-container').classList.remove('hidden');
        const inputEl = document.getElementById('pinyin-input');
        if (inputEl) {
            inputEl.value = '';
            inputEl.placeholder = currentQuestionMode === 'type-pinyin' ? "Gõ pinyin (không dấu)..." : "Gõ chữ Hán...";
            setTimeout(() => inputEl.focus(), 100);
        }
    } else if (gameMode === 'sentence-target' || gameMode === 'sentence-viet') {
        optionsContainer.classList.add('hidden');
        sentenceBuilderContainer.classList.remove('hidden');
        loadSentenceBuilder(qData);
    } else {
        optionsContainer.classList.remove('hidden');
        sentenceBuilderContainer.classList.add('hidden');
        optionsContainer.innerHTML = '';
        
        const cleanCorrect = (correctAnswerText || "").trim();
        let distractors = new Set();
        
        const getModeText = (item) => {
            if (currentQuestionMode === 'han-viet') return item.tiengViet || item.nghia;
            if (currentQuestionMode === 'viet-han' || currentQuestionMode === 'sentence-cloze') {
                return (item.hanTu && item.pinyin) ? `${item.hanTu} (${item.pinyin})` : item.hanTu;
            }
            if (currentQuestionMode === 'sentence-trung-viet') return item.cauNghia;
            return null;
        };

        const primaryPool = (currentQuestionMode === 'sentence-trung-viet' || currentQuestionMode === 'sentence-target' || currentQuestionMode === 'sentence-viet') ? sentencePool : vocabulary;
        let candidates = primaryPool.filter(v => {
            const txt = getModeText(v);
            return txt && txt.trim() !== "" && txt.trim() !== cleanCorrect;
        }).sort(() => 0.5 - Math.random());

        for (const cand of candidates) {
            const txt = getModeText(cand);
            if (txt && txt.trim() !== "" && txt.trim() !== cleanCorrect && !distractors.has(txt.trim())) {
                distractors.add(txt.trim());
                if (distractors.size >= 3) break;
            }
        }

        // --- 4. Final Mix & Unique Guarantee ---
        let finalOptions = [correctAnswerText, ...Array.from(distractors)].sort(() => 0.5 - Math.random());
        
        // --- 5. Render Buttons ---
        finalOptions.forEach(opt => {
            if (!opt) return;
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
    
    if (gameMode !== 'time-attack' && gameMode !== 'survival') {
        timerContainer.classList.add('hidden');
        return;
    }
    
    timerContainer.classList.remove('hidden');
    // For survival, we start with 10s if it's the first question, otherwise keep current timeRemaining
    if (currentQuestionIndex === 0) {
        timeRemaining = gameMode === 'time-attack' ? maxTimeLimit : 10;
    }
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
    
    if (gameMode === 'time-attack' || gameMode === 'survival') {
        correctStreak = 0;
        if (gameMode === 'survival') {
            lives--;
            updateHeartsUI();
            document.body.classList.add('shake');
            setTimeout(() => document.body.classList.remove('shake'), 500);
            if (lives <= 0) {
                alert("Hết thời gian và hết mạng! Trò chơi kết thúc.");
                endGame();
                return;
            }
        } else {
            const stats = wordStats[qData.hanTu] || { level: 3 };
            stats.level = Math.max(stats.level - 1, 1);
            saveSRSData();
        }
    } else if (!gameMode.includes('sentence')) {
        updateSRSProgress(qData.hanTu, false, gameMode);
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
        
        if (qData.hanTu) {
            updateSRSProgress(qData.hanTu, true, gameMode);
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

        if (selectedBtn) selectedBtn.classList.add('correct');
        score += (gameMode === 'time-attack') ? (50 + Math.round(timeRemaining * 5)) : 10;
        scoreEl.textContent = score;

        if (gameMode === 'time-attack' || gameMode === 'survival') {
            correctStreak++;
            // Reward: add time
            let bonus = gameMode === 'survival' ? 1.0 : 1.5;
            timeRemaining = Math.min(timeRemaining + bonus, maxTimeLimit);
            
            if (correctStreak % 5 === 0) {
                maxTimeLimit = Math.max(maxTimeLimit - 0.4, 1.5);
            }
        }

        if (currentQuestionMode === 'viet-han') {
            const audioText = qData.hanTu || qData.cau;
            if (audioText) {
                playAudio(audioText, 'zh-CN');
                playAudioBtn.classList.remove('hidden');
                playAudioSlowBtn.classList.remove('hidden');
                if(downloadAudioBtn) downloadAudioBtn.classList.remove('hidden');
                
                playAudioBtn.onclick = () => playAudio(audioText, 'zh-CN');
                playAudioSlowBtn.onclick = () => playAudio(audioText, 'zh-CN', 0.65);
                // downloadAudioBtn removed
            }
        }

        // Progress Tracking
        if (!gameMode.includes('sentence')) {
            updateSRSProgress(qData.hanTu, true, gameMode);
        } else if (gameMode === 'sentence-cloze') {
            explanationText.innerHTML = `Chính xác! <br><b>${qData.cau}</b>`;
            explanationContainer.classList.remove('hidden');
        }

        // Show Example Sentence if available
        if(qData.cau && qData.cau !== '-' && !gameMode.includes('sentence')) {
            const hasWord = qData.cau.includes(qData.hanTu);
            const clozeContainer = document.getElementById('example-cloze-container');
            
            if (hasWord) {
                requireCloze = true;
                exampleSentence.innerHTML = qData.cau.replace(qData.hanTu, "（___）");
                examplePinyin.style.display = 'none'; 
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
            
            if (!requireCloze) {
                if (audioTimeout) clearTimeout(audioTimeout);
                audioTimeout = setTimeout(() => {
                    playAudio(qData.cau, 'zh-CN');
                    audioTimeout = null;
                }, 600); 
            }
        }
        if (selectedBtn) selectedBtn.classList.add('correct');
    } else {
        if (selectedBtn) selectedBtn.classList.add('wrong');
        
        if (gameMode === 'time-attack') {
            correctStreak = 0;
            timeRemaining = Math.max(timeRemaining - 2, 0);
            updateSRSProgress(qData.hanTu, false, 'time-attack');
            if (timeRemaining <= 0) {
                handleTimeOut();
                return;
            }
        } else if (!gameMode.includes('sentence')) {
            updateSRSProgress(qData.hanTu, false, gameMode);
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
    
    // Always show next button
    nextBtn.classList.remove('hidden');
}

function updateHeartsUI() {
    const container = document.getElementById('hearts-container');
    if (!container) return;
    let heartHtml = '';
    for (let i = 0; i < 3; i++) {
        heartHtml += i < lives ? '❤️' : '🖤';
    }
    container.innerHTML = heartHtml;
}

nextBtn.onclick = () => {
    // Mobile fix: 'Pre-warm' or play the pre-fetched audio IMMEDIATELY on the same tick as the click
    const nextQ = currentQuestions[currentQuestionIndex + 1];
    if (nextQ) {
        const text = cleanTTSText(nextQ.hanTu || nextQ.cau);
        if (prefetchedUrls[text]) {
             // We can't call playAudio directly here because it might do other things, 
             // but we can prepare the globalAudio object.
             globalAudio.pause();
             globalAudio.src = prefetchedUrls[text];
             // Don't play yet, loadQuestion will handle it, but the src is now set 
             // in a synchronous user-triggered callback.
        }
    }

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
    isLessonMode = false;
    currentSelectedLesson = "";
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
        container.innerHTML = '<div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-bottom: 20px;">' +
                    '<a href="#" onclick="showHistoryScreen()" style="color: #8b5cf6; text-decoration: none; font-weight: 700; font-size: 0.85rem;">[📊 Lịch sử]</a>' +
                    '<a href="#" id="batch-download-btn" onclick="downloadAllSentenceAudio()" style="color: #10b981; text-decoration: none; font-weight: 700; font-size: 0.85rem;">[📥 Tải âm thanh câu]</a>' +
                    '<a href="#" onclick="resetProgress()" style="color: var(--error-color); text-decoration: none; font-weight: 600; font-size: 0.85rem; opacity: 0.8;">[🔄 Học lại]</a>' +
                '</div><p style="text-align: center; color: var(--text-muted); padding: 2rem;">Chưa có dữ liệu lịch sử. Hãy bắt đầu học ngay!</p>';
        return;
    }
    
    container.innerHTML = '<div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-bottom: 20px;">' +
                    '<a href="#" onclick="showHistoryScreen()" style="color: #8b5cf6; text-decoration: none; font-weight: 700; font-size: 0.85rem;">[📊 Lịch sử]</a>' +
                    '<a href="#" id="batch-cache-btn" onclick="downloadAllSentenceAudio()" style="color: #10b981; text-decoration: none; font-weight: 700; font-size: 0.85rem;">[📥 Lưu Cache Audio]</a>' +
                    '<a href="#" onclick="clearAudioCache()" style="color: #f59e0b; text-decoration: none; font-weight: 700; font-size: 0.85rem;">[🧹 Xóa Cache]</a>' +
                    '<a href="#" onclick="resetProgress()" style="color: var(--error-color); text-decoration: none; font-weight: 600; font-size: 0.85rem; opacity: 0.8;">[🔄 Học lại]</a>' +
                '</div>';
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

let writerInstance = null;
let currentRevealCallback = null;
let revealTimeout = null;

function closeRevealOverlay() {
    const overlay = document.getElementById('character-reveal-overlay');
    if (!overlay) return;
    
    if (revealTimeout) {
        clearTimeout(revealTimeout);
        revealTimeout = null;
    }
    
    overlay.classList.add('shrinking');
    setTimeout(() => {
        overlay.classList.remove('active');
        if (currentRevealCallback) {
            currentRevealCallback();
            currentRevealCallback = null;
        }
    }, 500);
}

function showFullscreenReveal(char, pinyin, callback) {
    const overlay = document.getElementById('character-reveal-overlay');
    const container = document.getElementById('hanzi-writer-container');
    const pinyinDisplay = document.getElementById('large-pinyin-display');
    const analysis = document.getElementById('radical-analysis');
    const speedSlider = document.getElementById('stroke-speed-slider');
    const replayBtn = document.getElementById('replay-stroke-btn');

    if (!overlay || !container) return callback ? callback() : null;

    currentRevealCallback = callback;
    if (revealTimeout) clearTimeout(revealTimeout);

    // Reset container and pinyin
    container.innerHTML = '';
    if (pinyinDisplay) pinyinDisplay.textContent = pinyin || "";
    
    // Hanzi Writer Logic
    // Use spread operator to correctly handle surrogate pairs and filter for Han characters
    const characters = [...char].filter(c => /\p{Script=Han}/u.test(c));
    let writerInstances = [];
    let charIndex = 0;

    // Create containers for all characters upfront
    characters.forEach(currentChar => {
        const charDiv = document.createElement('div');
        charDiv.className = 'hanzi-char-box';
        container.appendChild(charDiv);
        
        // Calculate dynamic size based on character count
        const boxSize = characters.length > 3 ? 120 : (characters.length > 1 ? 180 : 250);
        
        const writer = HanziWriter.create(charDiv, currentChar, {
            width: boxSize,
            height: boxSize,
            padding: 5,
            strokeAnimationSpeed: parseFloat(speedSlider.value || 1),
            delayBetweenStrokes: 150,
            strokeColor: '#6366f1',
            radicalColor: '#10b981'
        });
        writerInstances.push(writer);
    });

    function animateSequence() {
        if (charIndex >= writerInstances.length) {
            revealTimeout = setTimeout(closeRevealOverlay, 4000);
            return;
        }

        writerInstances[charIndex].animateCharacter({
            onComplete: () => {
                charIndex++;
                setTimeout(animateSequence, 500);
            }
        });
    }

    // Speed Slider Logic
    speedSlider.oninput = (e) => {
        writerInstances.forEach(writer => {
            writer._options.strokeAnimationSpeed = parseFloat(e.target.value);
        });
    };

    // Replay Logic
    replayBtn.onclick = () => {
        if (revealTimeout) {
            clearTimeout(revealTimeout);
            revealTimeout = null;
        }
        charIndex = 0;
        // Reset all characters before replaying
        const resetPromises = writerInstances.map(w => {
            return new Promise(resolve => w.hideCharacter({ onComplete: resolve }));
        });
        Promise.all(resetPromises).then(() => {
            animateSequence();
        });
    };

    // Start Animation
    if (writerInstances.length > 0) {
        animateSequence();
    } else {
        // Fallback for non-Han characters
        container.textContent = char;
        container.style.fontSize = "5rem";
        revealTimeout = setTimeout(closeRevealOverlay, 3000);
    }
    
    // Radical Analysis Logic
    if (analysis) {
        analysis.innerHTML = '';
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
    
    // GIẢI PHÁP TRIỆT ĐỂ: Sử dụng chuỗi Promise để phát âm thanh từ vựng trước, sau đó mới đến câu
    playAudio(char, 'zh-CN');
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
        
        // Progress update
        updateSRSProgress(qData.hanTu, true, gameMode);

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
        
        // Show Fullscreen Reveal and play example sentence after it
        showFullscreenReveal(qData.hanTu, qData.pinyin, () => {
            if (qData.cau && qData.cau !== '-') {
                console.log("Auto-playing sentence after typing success reveal...");
                playAudio(qData.cau, 'zh-CN');
            }
        });
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
        
        updateSRSProgress(qData.hanTu, false, gameMode);
        
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
    
    // CRITICAL: Prevent overwriting cloud data if we haven't finished loading it yet
    if (isCloudSyncing || !isCloudLoaded) {
        console.warn("Skip Cloud Save: Syncing or not yet loaded.");
        return;
    }
    
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
    if (isCloudSyncing) return;
    isCloudSyncing = true;
    isCloudLoaded = false;

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
            
            // Backup to local
            localStorage.setItem(`${uid}_vocab_stats`, JSON.stringify(wordStats));
            localStorage.setItem(`${uid}_vocab_history`, JSON.stringify(vocabHistory));
            localStorage.setItem(`${uid}_activity_history`, JSON.stringify(activityHistory));
            
            isCloudLoaded = true;
            updateProgressUI();
            console.log("Đã tải dữ liệu từ Cloud.");
        } else {
            console.log("User chưa có dữ liệu trên Cloud. Sẵn sàng đồng bộ mới.");
            isCloudLoaded = true; // Mark as loaded even if empty so we can start saving
            saveProgressToCloud();
        }
    }).catch((error) => {
        console.error("Lỗi tải dữ liệu từ Cloud:", error);
        loadProgressFromLocal();
        // Even if failed, we mark as loaded so we can function locally and try saving later
        isCloudLoaded = true; 
    }).finally(() => {
        isCloudSyncing = false;
        if(loadingScreen) loadingScreen.classList.remove('active');
    });
}

// Matching Game Logic
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function startMatchingGame(lessonName) {
    matchingLessonPool = lessonsGrouped[lessonName] || [];
    if (matchingLessonPool.length < 4) {
        alert("Bài học này không đủ từ để chơi nối chữ (cần tối thiểu 4 từ)!");
        return;
    }
    matchingMatchedCount = 0;
    matchingPoolIndex = 0;
    shuffleArray(matchingLessonPool);
    
    
    const title = document.getElementById('matching-title');
    if (title) title.textContent = `Nối Chữ: ${lessonName}`;
    
    console.log(`Starting Matching Game for lesson: ${lessonName}, words: ${matchingLessonPool.length}`);
    
    initMatchingRound();
    showScreen('matching-screen');
}

function initMatchingRound() {
    // Pick next 4 words from pool
    currentMatchingWords = matchingLessonPool.slice(matchingPoolIndex, matchingPoolIndex + 4);
    
    // If we reach the end, reshuffle or loop
    if (currentMatchingWords.length < 4) {
        matchingPoolIndex = 0;
        shuffleArray(matchingLessonPool);
        currentMatchingWords = matchingLessonPool.slice(0, 4);
    }
    
    matchingMatchedCount = 0;
    matchingSelectedTiles = [];
    
    // Create 12 tiles
    const tiles = [];
    currentMatchingWords.forEach(word => {
        tiles.push({ text: word.hanTu, type: 'hantu', id: word.hanTu, wordRef: word });
        tiles.push({ text: word.pinyin, type: 'pinyin', id: word.hanTu, wordRef: word });
        tiles.push({ text: word.tiengViet, type: 'meaning', id: word.hanTu, wordRef: word });
    });
    
    shuffleArray(tiles);
    renderMatchingGrid(tiles);
    updateMatchingProgress();
}

function renderMatchingGrid(tiles) {
    const grid = document.getElementById('matching-grid');
    if (!grid) {
        console.error("Critical Error: matching-grid element not found!");
        return;
    }
    grid.innerHTML = '';
    
    if (!tiles || tiles.length === 0) {
        console.warn("No tiles to render in matching grid.");
        return;
    }
    
    tiles.forEach(tile => {
        const el = document.createElement('div');
        el.className = 'matching-tile';
        el.textContent = tile.text;
        el.dataset.id = tile.id;
        el.dataset.type = tile.type;
        el.onclick = () => handleTileClick(el, tile.wordRef);
        grid.appendChild(el);
    });
}

function handleTileClick(el, wordRef) {
    if (el.classList.contains('correct') || el.classList.contains('selected')) return;
    
    // If same type is already selected, replace it
    const sameTypeIndex = matchingSelectedTiles.findIndex(t => t.el.dataset.type === el.dataset.type);
    if (sameTypeIndex > -1) {
        matchingSelectedTiles[sameTypeIndex].el.classList.remove('selected');
        matchingSelectedTiles.splice(sameTypeIndex, 1);
    }
    
    el.classList.add('selected');
    matchingSelectedTiles.push({ el, wordRef });
    
    if (matchingSelectedTiles.length === 3) {
        checkMatchingSet();
    }
}

function checkMatchingSet() {
    const firstId = matchingSelectedTiles[0].el.dataset.id;
    const isMatch = matchingSelectedTiles.every(t => t.el.dataset.id === firstId);
    
    if (isMatch) {
        const word = matchingSelectedTiles[0].wordRef;
        matchingSelectedTiles.forEach(t => {
            t.el.classList.remove('selected');
            t.el.classList.add('correct');
        });
        
        // Play Audio
        if (typeof playAudio === 'function') playAudio(word.hanTu, 'zh-CN');
        
        matchingMatchedCount++;
        matchingSelectedTiles = [];
        updateMatchingProgress();
        
        if (matchingMatchedCount === 4) {
            matchingPoolIndex += 4;
            setTimeout(() => {
                initMatchingRound();
            }, 800);
        }
    } else {
        // Wrong
        matchingSelectedTiles.forEach(t => {
            t.el.classList.add('wrong');
        });
        
        if (navigator.vibrate) navigator.vibrate(200);
        
        setTimeout(() => {
            matchingSelectedTiles.forEach(t => {
                t.el.classList.remove('selected', 'wrong');
            });
            matchingSelectedTiles = [];
        }, 500);
    }
}

function updateMatchingProgress() {
    const progressEl = document.getElementById('matching-progress');
    if (progressEl) {
        progressEl.textContent = `${matchingMatchedCount}/4`;
    }
}

// Console Utility for Data Recovery
window.recoverVocabData = function() {
    console.log('--- ??? T�m ki?m d? li?u t? v?ng trong LocalStorage ---');
    const keys = Object.keys(localStorage);
    const statsKeys = keys.filter(k => k.endsWith('_vocab_stats'));
    
    if (statsKeys.length === 0) {
        console.log('? Kh�ng t�m th?y d? li?u cu n�o.');
        return;
    }
    
    statsKeys.forEach(k => {
        const data = JSON.parse(localStorage.getItem(k));
        const count = Object.keys(data || {}).length;
        console.log('- Key: ' + k + ' | S? t? d� h?c: ' + count);
    });
    
    console.log('�? kh�i ph?c, h�y g�: localStorage.setItem(currentUser + \'_vocab_stats\', localStorage.getItem(\'KEY_MUON_KHOI_PHUC\')) v� F5.');
};
