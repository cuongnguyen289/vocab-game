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

const screens = {
    mainMenu: document.getElementById('main-menu-screen'),
    vocabStart: document.getElementById('vocab-start-screen'),
    sentenceStart: document.getElementById('sentence-start-screen'),
    builderStart: document.getElementById('builder-start-screen'),
    loading: document.getElementById('loading-screen'),
    quiz: document.getElementById('quiz-screen'),
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
const playExAudioBtn = document.getElementById('play-ex-audio-btn');

// Nguồn âm thanh Google Dịch và Dự phòng bằng trình duyệt
window.playAudio = function(text, lang) {
    if (!text) return;

    // Kích hoạt load giọng đọc trước (đối với một số trình duyệt)
    if ('speechSynthesis' in window && window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.getVoices();
    }

    // Tiếng Trung: Ưu tiên API của từ điển Youdao cực kỳ nhanh và không bị CORS block trên điện thoại
    // Tiếng Việt: Giữ nguyên truy xuất qua Google Translate
    let url = "";
    if (lang === 'zh-CN') {
        url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&le=zh`;
    } else {
        url = `https://translate.googleapis.com/translate_tts?client=dict-chrome-ex&ie=UTF-8&tl=vi&q=${encodeURIComponent(text)}`;
    }
    
    const audio = new Audio(url);
    
    // Thử phát qua URL, nếu lỗi mạng/CORS/Block thì tự động dùng giọng của trình duyệt
    audio.play().catch(e => {
        console.warn("Lỗi tải Audio, tự động chuyển sang giọng mặc định của máy:", e);
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Hủy các âm trước đó chưa đọc xong
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang;
            utterance.rate = 0.9;
            
            // Tìm giọng đọc sát nhất với ngôn ngữ
            const voices = window.speechSynthesis.getVoices();
            let targetVoice = voices.find(v => v.lang === lang || v.lang.replace('_', '-') === lang);
            if (!targetVoice && lang === 'zh-CN') {
                targetVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
            } else if (!targetVoice && lang === 'vi') {
                targetVoice = voices.find(v => v.lang.toLowerCase().includes('vi'));
            }
            if (targetVoice) utterance.voice = targetVoice;
            
            window.speechSynthesis.speak(utterance);
        }
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
    const countEl = document.getElementById('learned-count');
    const wrongCountEl = document.getElementById('wrong-count');
    const reviewBtn = document.getElementById('review-btn');
    
    if(totalCountEl) totalCountEl.textContent = vocabulary.length;
    if(countEl) countEl.textContent = learnedWords.length;
    if(wrongCountEl) wrongCountEl.textContent = wrongWords.length;
    
    // Disable Review button if no wrong words saved, otherwise wait for vocabulary load
    // Update SRS Review Button
    const now = Date.now();
    const reviewReady = Object.keys(wordStats).filter(hanTu => {
        const s = wordStats[hanTu];
        // Now: Include all Lvl 1-2, AND any other words where nextReview <= now
        return s.level <= 2 || s.nextReview <= now;
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
        const sentencesWithData = vocabulary.filter(v => v.cau && v.cau !== '-' && v.cauNghia && v.cauNghia !== '-');
        sentenceTotalEl.textContent = sentencesWithData.length;
    }
    
    // Update Builder Stats
    const builderTotalEl = document.getElementById('builder-total-count');
    if (builderTotalEl) {
        const sentencesWithData = vocabulary.filter(v => v.cau && v.cau !== '-' && v.cauNghia && v.cauNghia !== '-');
        builderTotalEl.textContent = sentencesWithData.length;
    }

    // Update Level Stats
    const levelStatsContainer = document.getElementById('level-stats-container');
    if (levelStatsContainer && Object.keys(wordStats).length > 0) {
        levelStatsContainer.style.display = 'block';
        const stats = { '1-2': 0, '3-4': 0, '5': 0 };
        Object.values(wordStats).forEach(s => {
            if (s.level <= 2) stats['1-2']++;
            else if (s.level <= 4) stats['3-4']++;
            else stats['5']++;
        });
        document.getElementById('lvl-1-2-count').textContent = stats['1-2'];
        document.getElementById('lvl-3-4-count').textContent = stats['3-4'];
        document.getElementById('lvl-5-count').textContent = stats['5'];

        // Show/Hide Level 5 suggestions
        const lvl5Sugg = document.getElementById('level-5-suggestions');
        if (lvl5Sugg) {
            lvl5Sugg.style.display = (stats['5'] > 0) ? 'block' : 'none';
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
    }

    // Update Grammar Topics Dropdown in Builder Screen
    const topicSelect = document.getElementById('grammar-topic-select');
    if (topicSelect && vocabulary.length > 0) {
        const currentVal = topicSelect.value;
        topicSelect.innerHTML = '<option value="all">--- Tất cả chuyên đề ---</option>';
        
        const topics = [...new Set(vocabulary.filter(v => v.topic).map(v => v.topic))].sort();
        topics.forEach(topic => {
            const opt = document.createElement('option');
            opt.value = topic;
            opt.textContent = topic;
            topicSelect.appendChild(opt);
        });
        
        if (currentVal) topicSelect.value = currentVal;
    }
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
    wrongWords = Object.keys(wordStats).filter(k => wordStats[k].nextReview <= Date.now());
    localStorage.setItem(`${currentUser}_vocab_wrong`, JSON.stringify(wrongWords));
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    fetchVocabulary();
    
    // Load progress
    try {
        learnedWords = JSON.parse(localStorage.getItem(`${currentUser}_vocab_learned`)) || [];
        wrongWords = JSON.parse(localStorage.getItem(`${currentUser}_vocab_wrong`)) || [];
        wordStats = JSON.parse(localStorage.getItem(`${currentUser}_vocab_stats`)) || {};
        migrateToSRS();
    } catch(e) {
        console.warn("Error loading progress", e);
    }
});

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
    const lines = csvText.split('\n');
    let addedCount = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Structure: STT(0), Câu(1), Pinyin(2), Nghĩa(3), Chuyên đề(4)
        const parts = splitCSVLine(line);
        if (parts.length >= 4) {
            const cau = parts[1] ? parts[1].trim().replace(/['"]/g, '') : "";
            const phienam = parts[2] ? parts[2].trim().replace(/['"]/g, '') : "";
            const nghia = parts[3] ? parts[3].trim().replace(/['"]/g, '') : "";
            const topic = parts[4] ? parts[4].trim().replace(/['"]/g, '') : "";

            if (cau && nghia) {
                // Check if this sentence already exists to avoid duplicates
                const exists = vocabulary.some(v => v.cau === cau);
                if (!exists) {
                    vocabulary.push({
                        hanTu: "", // Not a single word entry
                        pinyin: "",
                        tiengViet: "",
                        cau: cau,
                        cauPinyin: phienam,
                        cauNghia: nghia,
                        topic: topic
                    });
                    addedCount++;
                } else {
                    // Update topic if it exists
                    const idx = vocabulary.findIndex(v => v.cau === cau);
                    if (idx > -1 && topic) vocabulary[idx].topic = topic;
                }
                updateGlobalCharMap(cau, phienam);
            }
        }
    }
    console.log(`Đã nạp thêm ${addedCount} câu từ sheet Câu.`);
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
    const lines = csvText.split('\n');
    vocabulary = [];
    
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
                const entry = {
                    hanTu: hantu,
                    pinyin: phienam,
                    tiengViet: nghia,
                    cau: cau,
                    cauPinyin: cauPinyin,
                    cauNghia: cauNghia
                };
                vocabulary.push(entry);
                updateGlobalCharMap(hantu, phienam);
                if (cau && cauPinyin) updateGlobalCharMap(cau, cauPinyin);
            }
        }
    }
    
    // Update the UI since we just populated vocabulary
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
        }

        const sentenceButtons = document.getElementById('sentence-mode-buttons');
        if(sentenceButtons) {
            const btns = sentenceButtons.querySelectorAll('button');
            const hasSentences = vocabulary.some(v => v.cau && v.cau !== '-' && v.cauNghia && v.cauNghia !== '-');
            if(hasSentences) {
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
            const wordsWithSentences = vocabulary.filter(v => v.cau && v.cau !== '-' && v.cauNghia && v.cauNghia !== '-');
            if(wordsWithSentences.length >= 2) {
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
            if (!s) return false;
            // Mode Ôn ngay: Lvl 1-2 words ALWAYS, or others that are due
            return s.level <= 2 || s.nextReview <= now;
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
        availableWords = vocabulary.filter(v => v.cau && v.cau !== '-' && v.cauNghia && v.cauNghia !== '-');
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
    } else {
        availableWords = vocabulary.filter(v => !learnedWords.includes(v.hanTu));
        if (availableWords.length === 0) {
            alert("Tuyệt vời! Bạn đã thuộc hết tất cả từ vựng trong danh sách hiện tại. Hãy thêm từ mới hoặc nhấn [Học lại từ đầu] nhé!");
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
    nextBtn.classList.add('hidden');
    explanationContainer.classList.add('hidden');
    exampleContainer.classList.add('hidden');
    optionsContainer.innerHTML = '';
    
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
        playAudioBtn.classList.remove('hidden');
        let langCode = 'zh-CN';
        if (currentQuestionMode === 'viet-han' || currentQuestionMode === 'sentence-viet-trung') {
            langCode = 'vi';
        }
        
        const triggerAudio = () => playAudio(questionTextMain, langCode);
        playAudioBtn.onclick = triggerAudio;
        setTimeout(triggerAudio, 300);
    } else {
        playAudioBtn.classList.add('hidden');
    }

    if (gameMode === 'sentence-target' || gameMode === 'sentence-viet') {
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

        // Filter all potential candidates that have the required data for this mode
        let candidates = vocabulary.filter(v => {
            const txt = getModeText(v);
            return txt && txt !== correctAnswerText;
        });

        // Shuffle candidates
        candidates.sort(() => 0.5 - Math.random());

        // --- 1. Distractor Collection ---
        // Pick unique distractors from candidates
        for (const cand of candidates) {
            const txt = getModeText(cand);
            if (txt && txt.trim() !== "" && txt !== correctAnswerText && !distractors.has(txt)) {
                distractors.add(txt);
                if (distractors.size >= 3) break;
            }
        }

        // --- 2. Fallback if insufficient ---
        if (distractors.size < 3) {
            console.warn("Insufficient unique distractors! Attempting exhaustive fallback...");
            for (const item of vocabulary) {
                const potentialFields = [
                    item.tiengViet, 
                    item.hanTu ? `${item.hanTu} (${item.pinyin || ''})` : null,
                    item.cauNghia,
                    item.cau
                ];
                for (let f of potentialFields) {
                    if (f && typeof f === 'string' && f.trim() !== "" && f !== correctAnswerText && !distractors.has(f)) {
                        distractors.add(f);
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
        sentenceAnswerZone.classList.add('correct');
        score += 20;
        scoreEl.textContent = score;
        
        if (gameMode === 'sentence-target') {
            pinyinEl.textContent = qData.cauPinyin || "";
            pinyinEl.style.display = qData.cauPinyin ? 'block' : 'none';
            playAudio(qData.cau, 'zh-CN');
        } else {
            playAudio(qData.cauNghia, 'vi');
        }

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
    
    if (selected === correct) {
        selectedBtn.classList.add('correct');
        score += (gameMode === 'time-attack') ? Math.round(timeRemaining * 5) : 10;
        scoreEl.textContent = score;

        if (gameMode === 'time-attack') {
            correctStreak++;
            // Reward: add time (cap at initial max)
            timeRemaining = Math.min(timeRemaining + 1.5, maxTimeLimit);
            // Higher difficulty: Every 5 correct, reduce max time by 0.5s (min 1.5s)
            if (correctStreak % 5 === 0) {
                maxTimeLimit = Math.max(maxTimeLimit - 0.5, 1.5);
            }
        }
        
        if (gameMode === 'review') {
            // SRS Update for Correct answer
            const stats = wordStats[qData.hanTu] || { level: 1, interval: 1, repCount: 0 };
            
            if (stats.level <= 2) {
                // Use repCount for level 1-2
                stats.repCount = (stats.repCount || 0) + 1;
                if (stats.repCount >= 5) {
                    stats.level = 3;
                    stats.interval = 1;
                    stats.nextReview = Date.now() + (1 * 24 * 60 * 60 * 1000);
                } else {
                    // Level stays 1-2, review again soon
                    stats.nextReview = Date.now() + (1 * 60 * 60 * 1000); // 1 hour for rep logic or just immediate? 
                    // Let's keep it in "Ôn ngay" (Lvl 1-2 always in reviewReady)
                }
            } else {
                // Classic SRS for level 3-5
                stats.level = Math.min(stats.level + 1, 5);
                stats.interval = (stats.interval || 1) * 2;
                stats.lastReview = Date.now();
                stats.nextReview = Date.now() + (stats.interval * 24 * 60 * 60 * 1000);
            }
            
            wordStats[qData.hanTu] = stats;
            saveSRSData();
        } else if (gameMode === 'time-attack') {
            // Time attack correct: smaller level boost or no boost?
            // Let's give a small boost to level if it's below 5
            const stats = wordStats[qData.hanTu] || { level: 3, interval: 7 };
            if (stats.level < 5) stats.level += 0.2; // slow progress in time attack
            wordStats[qData.hanTu] = stats;
            saveSRSData();
        } else if (gameMode.includes('sentence')) {
            // No progress change for sentence mcq
        } else {
            // New word learned starting from Level 2
            if (!wordStats[qData.hanTu]) {
                wordStats[qData.hanTu] = {
                    level: 1,
                    lastReview: Date.now(),
                    nextReview: Date.now(), 
                    interval: 1,
                    repCount: 0
                };
                saveSRSData();
            }
        }
        
        if(qData.cau && qData.cau !== '-' && !gameMode.includes('sentence')) {
            exampleSentence.textContent = qData.cau;
            examplePinyin.textContent = qData.cauPinyin !== '-' ? qData.cauPinyin : "";
            exampleMeaning.textContent = qData.cauNghia !== '-' ? qData.cauNghia : "";
            examplePinyin.style.display = (qData.cauPinyin !== '-') ? 'block' : 'none';
            exampleMeaning.style.display = (qData.cauNghia !== '-') ? 'block' : 'none';
            if (playExAudioBtn) {
                playExAudioBtn.onclick = () => playAudio(qData.cau, 'zh-CN');
                playExAudioBtn.classList.remove('hidden');
            }
            exampleContainer.classList.remove('hidden');
        }
    } else {
        selectedBtn.classList.add('wrong');
        
        if (gameMode === 'time-attack') {
            correctStreak = 0;
            // Penalty: reduce time and level
            timeRemaining = Math.max(timeRemaining - 2, 0);
            const stats = wordStats[qData.hanTu] || { level: 3 };
            stats.level = Math.max(stats.level - 1, 1); 
            wordStats[qData.hanTu] = stats;
            saveSRSData();
            
            if (timeRemaining <= 0) {
                handleTimeOut();
                return;
            }
        } else if (!gameMode.includes('sentence')) {
            // SRS Update for Wrong answer in Review/Normal mode
            const stats = wordStats[qData.hanTu] || { level: 1, interval: 1, repCount: 0 };
            stats.level = 1;
            stats.repCount = 0; // Reset repetition count
            stats.interval = 1;
            stats.lastReview = Date.now();
            stats.nextReview = Date.now(); 
            wordStats[qData.hanTu] = stats;
            saveSRSData();
        }

        let explanation = "";
        if (gameMode.includes('sentence')) {
            if (currentQuestionMode === 'sentence-trung-viet') {
                const found = vocabulary.find(v => v.cauNghia === selected);
                if(found) explanation = `Sai rồi. "<b>${selected}</b>" là nghĩa của câu: <br> <b>${found.cau}</b> (${found.cauPinyin})`;
            } else {
                const cauOnly = selected.split('(')[0].trim();
                const found = vocabulary.find(v => v.cau === cauOnly);
                if(found) explanation = `Sai rồi. Câu <b>${found.cau}</b> (${found.cauPinyin}) có nghĩa là: <br> "<b>${found.cauNghia}</b>"`;
            }
        } else {
            let answeredVietnamese = !selected.includes('(');
            if (answeredVietnamese) {
                const found = vocabulary.find(v => v.tiengViet === selected);
                if(found) explanation = `Sai rồi. "<b>${selected}</b>" là nghĩa của từ: <br> <b>${found.hanTu}</b> (${found.pinyin})`;
            } else {
                const hantuOnly = selected.split('(')[0].trim();
                const found = vocabulary.find(v => v.hanTu === hantuOnly);
                if(found) explanation = `Sai rồi. Từ <b>${found.hanTu}</b> (${found.pinyin}) có nghĩa là: <br> "<b>${found.tiengViet}</b>"`;
            }
        }
        
        if(explanation) {
            explanationText.innerHTML = explanation;
            explanationContainer.classList.remove('hidden');
        } else if (gameMode === 'sentence-cloze') {
            explanationText.innerHTML = `Sai rồi. Đáp án đúng là: <b>${qData.hanTu}</b> (${qData.pinyin})<br>Câu đầy đủ: <b>${qData.cau}</b>`;
            explanationContainer.classList.remove('hidden');
        }

        buttons.forEach(btn => {
            if (btn.textContent.trim() === correct.trim()) {
                btn.classList.add('correct');
            }
        });
    }
    nextBtn.classList.remove('hidden');
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
