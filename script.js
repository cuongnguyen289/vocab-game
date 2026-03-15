const SHEET_ID = "13JmgXrxeuBzmBWadW9qAjtTzxObl1c5x6dk3pNr9f7w";
const TARGET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

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

// User variables
let currentUser = null;
let learnedWords = [];
let wrongWords = [];

const screens = {
    login: document.getElementById('login-screen'),
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

function updateProgressUI() {
    const totalCountEl = document.getElementById('total-count');
    const countEl = document.getElementById('learned-count');
    const wrongCountEl = document.getElementById('wrong-count');
    const reviewBtn = document.getElementById('review-btn');
    
    if(totalCountEl) totalCountEl.textContent = vocabulary.length;
    if(countEl) countEl.textContent = learnedWords.length;
    if(wrongCountEl) wrongCountEl.textContent = wrongWords.length;
    
    // Disable Review button if no wrong words saved, otherwise wait for vocabulary load
    if(reviewBtn && vocabulary.length > 0) {
        if(wrongWords.length === 0) {
            reviewBtn.disabled = true;
            reviewBtn.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">✅</span><span>Chưa có lỗi</span></div>';
        } else {
            reviewBtn.disabled = false;
            reviewBtn.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">📝</span><span>Ôn Tập (' + wrongWords.length + ')</span></div>';
        }
    }

    const testBtn = document.getElementById('test-btn');
    if(testBtn && vocabulary.length > 0) {
        if(learnedWords.length < 4) {
            testBtn.disabled = true;
            testBtn.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🔒</span><span>Kiểm Tra (≥4)</span></div>';
        } else {
            testBtn.disabled = false;
            testBtn.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🎯</span><span>Kiểm Tra (' + learnedWords.length + ')</span></div>';
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
}

function resetProgress() {
    if(!currentUser) return;
    if(confirm(`Bạn có chắc chắn muốn xóa tiến độ của tài khoản [${currentUser}] để học lại từ đầu không?`)) {
        learnedWords = [];
        wrongWords = [];
        localStorage.removeItem(`${currentUser}_vocab_learned`);
        localStorage.removeItem(`${currentUser}_vocab_wrong`);
        updateProgressUI();
    }
}

// User Authentication
function handleLoginKeyPress(e) {
    if(e.key === 'Enter') loginUser();
}

function loginUser() {
    const input = document.getElementById('username-input').value.trim();
    if (input.length < 2) {
        alert("Vui lòng nhập tên của bạn (ít nhất 2 ký tự)!");
        return;
    }
    
    // Set user and load their specific progress
    currentUser = input.toLowerCase();
    
    try {
        learnedWords = JSON.parse(localStorage.getItem(`${currentUser}_vocab_learned`)) || [];
    } catch(e) {
        learnedWords = [];
        console.warn("Corrupted learnedWords data", e);
    }
    
    try {
        wrongWords = JSON.parse(localStorage.getItem(`${currentUser}_vocab_wrong`)) || [];
    } catch(e) {
        wrongWords = [];
        console.warn("Corrupted wrongWords data", e);
    }
    
    const mainDisplay = document.getElementById('main-display-username');
    if(mainDisplay) mainDisplay.textContent = input;
    
    // Keep user logged in across page reloads
    localStorage.setItem('vocab_last_user', input);
    
    showScreen('main-menu');
}

function logoutUser() {
    currentUser = null;
    learnedWords = [];
    wrongWords = [];
    localStorage.removeItem('vocab_last_user');
    document.getElementById('username-input').value = '';
    showScreen('login');
}

// Auto-login if previously saved
window.addEventListener('DOMContentLoaded', () => {
    fetchVocabulary();
    const lastUser = localStorage.getItem('vocab_last_user');
    if(lastUser) {
        document.getElementById('username-input').value = lastUser;
        loginUser();
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
    let success = false;
    for (const url of FETCH_URLS) {
        try {
            console.log("Đang thử kết nối:", url);
            const response = await fetch(url);
            if (response.ok) {
                const csvText = await response.text();
                parseCSV(csvText);
                success = true;
                break;
            }
        } catch (error) {
            console.warn(`Lỗi khi tải từ ${url}:`, error);
        }
    }
    
    // Update the UI since we just populated vocabulary
    updateProgressUI();
    
    if (!success) {
        alert("Lỗi kết nối mạng: Không tải được danh sách từ vựng do bị chặn bởi trình duyệt (CORS) hoặc không có mạng. Mời thử lại!");
        if (currentUser) {
            showScreen('main-menu');
        } else {
            showScreen('login');
        }
    }
}

function parseCSV(csvText) {
    const lines = csvText.split('\n');
    vocabulary = [];
    
    // Header is assumed to be at row 0 (index 0)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Cột: STT, Hán Tự, Pinyin, Tiếng Việt, Check, Luyện Tập, Câu, Pinyin(câu), Nghĩa
        const parts = line.split(',');
        if (parts.length >= 4) {
            const hantu = parts[1] ? parts[1].trim() : "";
            const phienam = parts[2] ? parts[2].trim() : "";
            const nghia = parts[3] ? parts[3].trim() : "";
            
            // Lấy thêm ví dụ nếu có (thường nằm ở cột 6, 7, 8 theo CSV dump đã xem)
            const cau = parts[6] ? parts[6].trim().replace(/['"]/g, '') : "";
            const cauPinyin = parts[7] ? parts[7].trim().replace(/['"]/g, '') : "";
            const cauNghia = parts[8] ? parts[8].trim().replace(/['"]/g, '') : "";

            if (hantu && nghia) {
                vocabulary.push({
                    hanTu: hantu,
                    pinyin: phienam,
                    tiengViet: nghia,
                    cau: cau,
                    cauPinyin: cauPinyin,
                    cauNghia: cauNghia
                });
            }
        }
    }
    
    // Update the UI since we just populated vocabulary
    updateProgressUI();
    
    if (vocabulary.length < 4) {
        alert("Danh sách từ vựng quá ngắn (cần ít nhất 4 từ có đủ Hán Tự và Nghĩa để tạo 4 đáp án).");
        if(currentUser) showScreen('main-menu');
    } else {
        // Enable buttons
        const modeButtons = document.getElementById('main-mode-buttons');
        if(modeButtons) {
            const btns = modeButtons.querySelectorAll('button');
            btns[0].disabled = false;
            btns[0].innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🇨🇳</span><span>Hán ➡️ Việt</span></div>';
            
            btns[1].disabled = false;
            btns[1].innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🇻🇳</span><span>Việt ➡️ Hán</span></div>';
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
                
                const buildBtn = document.getElementById('sentence-builder-btn');
                if (buildBtn) {
                    buildBtn.disabled = false;
                    buildBtn.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🧩</span><span>Ghép Câu</span></div>';
                }
            } else {
                btns[0].innerHTML = '<span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">❌</span><span>Không có DL</span>';
                btns[1].innerHTML = '<span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">❌</span><span>Không có DL</span>';
                const buildBtn = document.getElementById('sentence-builder-btn');
                if (buildBtn) buildBtn.innerHTML = '<span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">❌</span><span>Không có DL</span>';
            }
        }
        
        const builderButtons = document.getElementById('builder-mode-buttons');
        if(builderButtons) {
            const btns = builderButtons.querySelectorAll('button');
            const hasSentences = vocabulary.some(v => v.cau && v.cau !== '-' && v.cauNghia && v.cauNghia !== '-');
            if(hasSentences) {
                btns[0].disabled = false;
                btns[0].innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🇻🇳</span><span>Việt ➡️ Trung</span></div>';
                
                btns[1].disabled = false;
                btns[1].innerHTML = '<div style="display: flex; flex-direction: column; align-items: center;"><span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">🇨🇳</span><span>Trung ➡️ Việt</span></div>';
            } else {
                btns[0].innerHTML = '<span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">❌</span><span>Không có DL</span>';
                btns[1].innerHTML = '<span class="btn-icon" style="font-size: 1.5rem; margin-bottom: 0.2rem;">❌</span><span>Không có DL</span>';
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

// Setup triggered on page load moved to line 103 (DOMContentLoaded)

function setupQuiz() {
    score = 0;
    currentQuestionIndex = 0;
    
    let availableWords = [];
    
    if (gameMode === 'review') {
        // Trong chế độ Review, chỉ lấy danh sách từ trong wrongWords
        availableWords = vocabulary.filter(v => wrongWords.includes(v.hanTu));
        
        if (availableWords.length === 0) {
            alert("Tuyệt vời! Bạn không có từ vựng nào sai để ôn tập. Quay lại học bài mới nhé!");
            showScreen('vocab');
            return;
        }
    } else if (gameMode === 'test') {
        // Trong chế độ Test, lấy danh sách từ trong learnedWords
        availableWords = vocabulary.filter(v => learnedWords.includes(v.hanTu));
        
        if (availableWords.length < 4) {
             alert("Danh sách của bạn cần ít nhất 4 từ để chơi chế độ kiểm tra!");
             showScreen('vocab');
             return;
        }
    } else if (gameMode === 'sentence-trung-viet' || gameMode === 'sentence-viet-trung' || gameMode === 'builder-viet-trung' || gameMode === 'builder-trung-viet') {
        // Lọc ra các dòng có chứa thông tin câu (bỏ qua khoảng trống và dấu gạch ngang)
        availableWords = vocabulary.filter(v => v.cau && v.cau !== '-' && v.cauNghia && v.cauNghia !== '-');
        
        if (availableWords.length < 4) {
             alert("Danh sách của bạn cần ít nhất 4 câu ví dụ để chơi chế độ này!");
             if (gameMode.includes('builder')) showScreen('builder');
             else showScreen('sentence');
             return;
        }
    } else {
        // Lọc ra những từ chưa thuộc cho các chế độ luyện Mới
        availableWords = vocabulary.filter(v => !learnedWords.includes(v.hanTu));
        
        if (availableWords.length === 0) {
            alert("Tuyệt vời! Bạn đã thuộc hết tất cả từ vựng trong danh sách hiện tại. Hãy thêm từ mới hoặc nhấn [Học lại từ đầu] nhé!");
            showScreen('vocab');
            return;
        }
    }
    
    // Trộn từ
    let shuffled = [...availableWords].sort(() => 0.5 - Math.random());
    
    const inputQ = document.getElementById(gameMode.includes('sentence') ? 'sentence-num-questions' : 'num-questions');
    let desiredCount = inputQ ? parseInt(inputQ.value) : 10;
    if (isNaN(desiredCount) || desiredCount < 1) desiredCount = 10;
    
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

    // Trong Review mode hoặc Test mode, random giua han-viet và viet-han để kiểm tra mọi mặt
    currentQuestionMode = gameMode;
    if (gameMode === 'review' || gameMode === 'test') {
        currentQuestionMode = Math.random() > 0.5 ? 'han-viet' : 'viet-han';
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
    }
    
    questionEl.textContent = questionTextMain;
    pinyinEl.textContent = questionTextSub;
    if(!questionTextSub) {
        pinyinEl.style.display = 'none';
        questionEl.style.marginBottom = '0';
    } else {
        pinyinEl.style.display = 'block';
        questionEl.style.marginBottom = '0.2rem';
    }
    
    // Cập nhật nút loa cho câu hỏi
    if (questionTextMain) {
        playAudioBtn.classList.remove('hidden');
        let langCode = 'zh-CN';
        if (currentQuestionMode === 'viet-han' || currentQuestionMode === 'sentence-viet-trung' || currentQuestionMode === 'sentence-builder') {
            langCode = 'vi';
        }
        
        const triggerAudio = () => playAudio(questionTextMain, langCode);
        playAudioBtn.onclick = triggerAudio;
        
        // Tự động phát âm thanh ở lần chuyển từ mới
        // Delay 300ms để hoạt cảnh/giao diện render xong
        setTimeout(triggerAudio, 300);
        
    } else {
        playAudioBtn.classList.add('hidden');
    }

    const builderContainer = document.getElementById('builder-container');
    const builderTarget = document.getElementById('builder-target');
    const builderSource = document.getElementById('builder-source');
    const checkBuilderBtn = document.getElementById('check-builder-btn');
    
    if (gameMode === 'builder-viet-trung' || gameMode === 'builder-trung-viet') {
        // --- Builder Logic ---
        optionsContainer.classList.add('hidden');
        builderContainer.classList.remove('hidden');
        builderTarget.innerHTML = '';
        builderSource.innerHTML = '';
        checkBuilderBtn.disabled = false;
        
        // Disable regular Pinyin text in builder mode (it's inside the blocks now, or hidden depending on direction)
        pinyinEl.style.display = 'none';
        
        let targetBlocks = [];
        
        if (gameMode === 'builder-viet-trung') {
            // Việt -> Trung: Người dùng nhìn tiếng Việt, xếp tiếng Trung
            // Phân tích câu tiếng Trung để cắt thành khối (có pinyin)
            questionEl.textContent = qData.cauNghia;
            playAudioBtn.classList.remove('hidden');
            const triggerAudio = () => playAudio(qData.cauNghia, 'vi');
            playAudioBtn.onclick = triggerAudio;
            setTimeout(triggerAudio, 300);
            
            // Tìm các cụm từ trong từ điển theo thứ tự dài nhất đến ngắn nhất để cắt câu thông minh
            let remainingText = qData.cau;
            let vocabList = [...vocabulary].sort((a,b) => b.hanTu.length - a.hanTu.length);
            let chunksHtml = [];
            
            // Một thuật toán tìm kiếm đơn giản: Cắt câu theo cụm từ. 
            // Do cần giữ thứ tự nên cách đơn giản nhất là duyệt từng ký tự
            let i = 0;
            while(i < remainingText.length) {
                let matchFound = false;
                for(let v of vocabList) {
                    if (remainingText.substring(i).startsWith(v.hanTu)) {
                        chunksHtml.push({ hanTu: v.hanTu, pinyin: v.pinyin });
                        i += v.hanTu.length;
                        matchFound = true;
                        break;
                    }
                }
                if(!matchFound) {
                    // Ký tự lẻ (không có trong từ điển vd: chấm, phẩy, de...)
                    chunksHtml.push({ hanTu: remainingText[i], pinyin: "" });
                    i++;
                }
            }
            
            targetBlocks = chunksHtml;
            
        } else if (gameMode === 'builder-trung-viet') {
            // Trung -> Việt: Người dùng nhìn tiếng Trung, xếp tiếng Việt (xếp theo từ)
            questionEl.textContent = qData.cau;
            playAudioBtn.classList.remove('hidden');
            const triggerAudio = () => playAudio(qData.cau, 'zh-CN');
            playAudioBtn.onclick = triggerAudio;
            setTimeout(triggerAudio, 300);
            pinyinEl.textContent = qData.cauPinyin;
            pinyinEl.style.display = 'block';
            
            // Tiếng việt thì tách bằng khoảng trắng
            let words = qData.cauNghia.split(' ').filter(w => w.trim() !== '');
            targetBlocks = words.map(w => ({ hanTu: w, pinyin: "" }));
        }
        
        // Shuffle the identified blocks
        const scrambledBlocks = [...targetBlocks].sort(() => 0.5 - Math.random());
        
        scrambledBlocks.forEach((chunk, idx) => {
            const block = document.createElement('div');
            block.className = 'word-block';
            block.dataset.id = `wb-${idx}`;
            
            if (chunk.pinyin && chunk.pinyin.trim() !== "") {
                block.innerHTML = `<span class="block-top">${chunk.hanTu}</span><span class="block-bot">${chunk.pinyin}</span>`;
            } else {
                block.textContent = chunk.hanTu;
            }
            
            // Xóa dấu / ký tự trắng thừa nếu nối chuỗi
            block.dataset.raw = chunk.hanTu;
            
            block.onclick = () => {
                if (block.parentElement === builderSource) {
                    builderTarget.appendChild(block);
                } else if (block.parentElement === builderTarget) {
                    builderSource.appendChild(block);
                }
            };
            builderSource.appendChild(block);
        });
    } else {
        // --- Multiple choice logic ---
        builderContainer.classList.add('hidden');
        optionsContainer.classList.remove('hidden');
        
        // Tao ds Options (1 dúng, 3 sai)
        let options = [correctAnswerText];
        let pool = [];
        
        if (gameMode.includes('sentence')) {
            pool = vocabulary.filter(v => v.cau && v.cau !== '-' && v.cau !== qData.cau && v.cauNghia && v.cauNghia !== '-');
        } else {
            pool = vocabulary.filter(v => v.hanTu !== qData.hanTu);
        }
        
        pool = pool.sort(() => 0.5 - Math.random());
        
        for (let i = 0; i < 3 && i < pool.length; i++) {
            if (currentQuestionMode === 'han-viet') {
                options.push(pool[i].tiengViet);
            } else if (currentQuestionMode === 'viet-han') {
                options.push(`${pool[i].hanTu} (${pool[i].pinyin})`);
            } else if (currentQuestionMode === 'sentence-trung-viet') {
                options.push(pool[i].cauNghia);
            } else if (currentQuestionMode === 'sentence-viet-trung') {
                options.push(`${pool[i].cau} (${pool[i].cauPinyin})`);
            }
        }
        
        // Shuffle options array
        options = options.sort(() => 0.5 - Math.random());
        
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn option-btn';
            btn.textContent = opt;
            btn.onclick = () => checkAnswer(opt, correctAnswerText, btn);
            optionsContainer.appendChild(btn);
        });
    }

    startTimer();
}

function startTimer() {
    const timerContainer = document.getElementById('timer-bar-container');
    const timerBar = document.getElementById('timer-bar');
    
    if (gameMode !== 'test') {
        timerContainer.classList.add('hidden');
        return;
    }
    
    timerContainer.classList.remove('hidden');
    timeRemaining = 10;
    timerBar.style.width = '100%';
    timerBar.style.backgroundColor = 'var(--secondary-color)';
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeRemaining -= 0.1;
        const percentage = (timeRemaining / 10) * 100;
        timerBar.style.width = `${percentage}%`;
        
        if (timeRemaining <= 3) {
            timerBar.style.backgroundColor = 'var(--error-color)';
        } else if (timeRemaining <= 6) {
            timerBar.style.backgroundColor = '#F59E0B';
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
    
    const h = currentQuestionIndex;
    const qData = currentQuestions[h];
    
    let correctAnswerText;
    if (currentQuestionMode === 'han-viet') {
        correctAnswerText = qData.tiengViet;
    } else if (currentQuestionMode === 'viet-han') {
        correctAnswerText = `${qData.hanTu} (${qData.pinyin})`;
    } else if (currentQuestionMode === 'sentence-trung-viet') {
        correctAnswerText = qData.cauNghia;
    } else if (currentQuestionMode === 'sentence-viet-trung') {
        correctAnswerText = `${qData.cau} (${qData.cauPinyin})`;
    }
    
    const buttons = optionsContainer.querySelectorAll('.option-btn');
    
    if (gameMode.includes('sentence')) {
        explanationText.innerHTML = `⏳ <b>Hết giờ!</b><br>Câu <b>${qData.cau}</b> (${qData.cauPinyin}) có nghĩa là: <br> "<b>${qData.cauNghia}</b>"`;
    } else {
        explanationText.innerHTML = `⏳ <b>Hết giờ!</b><br>Từ <b>${qData.hanTu}</b> (${qData.pinyin}) có nghĩa là: <br> "<b>${qData.tiengViet}</b>"`;
    }
    explanationContainer.classList.remove('hidden');
    
    buttons.forEach(btn => btn.disabled = true);
    
    if (!gameMode.includes('sentence') && !wrongWords.includes(qData.hanTu)) {
        wrongWords.push(qData.hanTu);
        localStorage.setItem(`${currentUser}_vocab_wrong`, JSON.stringify(wrongWords));
        const index = learnedWords.indexOf(qData.hanTu);
        if(index > -1) {
            learnedWords.splice(index, 1);
            localStorage.setItem(`${currentUser}_vocab_learned`, JSON.stringify(learnedWords));
        }
    }
    
    buttons.forEach(btn => {
        if (btn.textContent === correctAnswerText) {
            btn.classList.add('correct');
        }
    });
    
    nextBtn.classList.remove('hidden');
}

function checkAnswer(selected, correct, selectedBtn) {
    stopTimer();
    const buttons = optionsContainer.querySelectorAll('.option-btn');
    buttons.forEach(btn => btn.disabled = true); // Disable click on others
    
    const qData = currentQuestions[currentQuestionIndex];
    
    if (selected === correct) {
        selectedBtn.classList.add('correct');
        score += 10;
        scoreEl.textContent = score;
        
        // Remove from wrongWords if it exists, since they got it right now (if they are in review mode)
        if (gameMode === 'review') {
            const index = wrongWords.indexOf(qData.hanTu);
            if(index > -1) {
                wrongWords.splice(index, 1);
                localStorage.setItem(`${currentUser}_vocab_wrong`, JSON.stringify(wrongWords));
            }
        } else if (gameMode === 'test' || gameMode.includes('sentence')) {
            // Test mode or sentence mode: correct answer doesn't need to be pushed since it's already in learnedWords / not tracked yet
        } else {
            // Save to learnedWords in normal mode
            if (!learnedWords.includes(qData.hanTu)) {
                learnedWords.push(qData.hanTu);
                localStorage.setItem(`${currentUser}_vocab_learned`, JSON.stringify(learnedWords));
            }
        }
        
        // Show Example if available (only in non-sentence mode and if it's not a dash)
        if(qData.cau && qData.cau !== '-' && !gameMode.includes('sentence')) {
            exampleSentence.textContent = qData.cau;
            examplePinyin.textContent = qData.cauPinyin && qData.cauPinyin !== '-' ? qData.cauPinyin : "";
            exampleMeaning.textContent = qData.cauNghia && qData.cauNghia !== '-' ? qData.cauNghia : "";
            
            examplePinyin.style.display = (qData.cauPinyin && qData.cauPinyin !== '-') ? 'block' : 'none';
            exampleMeaning.style.display = (qData.cauNghia && qData.cauNghia !== '-') ? 'block' : 'none';
            
            if (playExAudioBtn) {
                playExAudioBtn.onclick = () => playAudio(qData.cau, 'zh-CN');
                playExAudioBtn.classList.remove('hidden');
            }
            
            exampleContainer.classList.remove('hidden');
        }
        
    } else {
        selectedBtn.classList.add('wrong');
        
        // Add to wrongWords if we got it wrong and it's not already tracked there
        if (!gameMode.includes('sentence') && !wrongWords.includes(qData.hanTu)) {
            wrongWords.push(qData.hanTu);
            localStorage.setItem(`${currentUser}_vocab_wrong`, JSON.stringify(wrongWords));
            // Remove from learnedWords just in case they forgot
            const index = learnedWords.indexOf(qData.hanTu);
            if(index > -1) {
                learnedWords.splice(index, 1);
                localStorage.setItem(`${currentUser}_vocab_learned`, JSON.stringify(learnedWords));
            }
        }

        // Find what they actually clicked to explain it
        let wrongItemText = selected;
        let explanation = "";
        
        if (gameMode.includes('sentence')) {
            if (currentQuestionMode === 'sentence-trung-viet') {
                // They chose wrong Vietnamse meaning for sentence
                const vocabFound = vocabulary.find(v => v.cauNghia === selected);
                if(vocabFound) {
                    explanation = `Sai rồi. "<b>${selected}</b>" là nghĩa của câu: <br> <b>${vocabFound.cau}</b> (${vocabFound.cauPinyin})`;
                }
            } else {
                // selected string format is "Câu (pinyin)"
                const cauOnly = selected.split('(')[0].trim();
                const vocabFound = vocabulary.find(v => v.cau === cauOnly);
                if(vocabFound) {
                    explanation = `Sai rồi. Câu <b>${vocabFound.cau}</b> (${vocabFound.cauPinyin}) có nghĩa là: <br> "<b>${vocabFound.cauNghia}</b>"`;
                }
            }
        } else {
            // Từ vựng logic
            let answeredVietnamese = true; // flag to determine structure
            // If the selected answer doesn't contain a parenthesis, they probably chose Vietnamese
            if (selected.includes('(')) answeredVietnamese = false; 

            if (answeredVietnamese) {
                // They chose a wrong Vietnamese meaning. Let's find what Han Tu it belongs to.
                const vocabFound = vocabulary.find(v => v.tiengViet === selected);
                if(vocabFound) {
                    explanation = `Sai rồi. "<b>${selected}</b>" là nghĩa của từ: <br> <b>${vocabFound.hanTu}</b> (${vocabFound.pinyin})`;
                }
            } else {
                // They chose a wrong Han Tu. Let's find its meaning.
                // selected string format is "Hán Tự (pinyin)"
                const hantuOnly = selected.split('(')[0].trim();
                const vocabFound = vocabulary.find(v => v.hanTu === hantuOnly);
                if(vocabFound) {
                    explanation = `Sai rồi. Từ <b>${vocabFound.hanTu}</b> (${vocabFound.pinyin}) có nghĩa là: <br> "<b>${vocabFound.tiengViet}</b>"`;
                }
            }
        }
        
        if(explanation) {
            explanationText.innerHTML = explanation;
            explanationContainer.classList.remove('hidden');
        }

        // Highlight correct
        buttons.forEach(btn => {
            if (btn.textContent === correct) {
                btn.classList.add('correct');
            }
        });
    }
    
    nextBtn.classList.remove('hidden');
}

function resetBuilder() {
    const builderTarget = document.getElementById('builder-target');
    const builderSource = document.getElementById('builder-source');
    
    // Move all blocks back to source
    const blocks = Array.from(builderTarget.children);
    blocks.forEach(block => {
        builderSource.appendChild(block);
    });
}

function checkBuilderAnswer() {
    stopTimer();
    const builderTarget = document.getElementById('builder-target');
    const builderSource = document.getElementById('builder-source');
    const checkBuilderBtn = document.getElementById('check-builder-btn');
    
    if (builderSource.children.length > 0) {
        alert("Bạn phải xếp đầy đủ tất cả các chữ!");
        return;
    }
    
    checkBuilderBtn.disabled = true;
    
    // Disable clicking on blocks
    const allBlocks = document.querySelectorAll('.word-block');
    allBlocks.forEach(b => {
        b.onclick = null; // Remove standard onclick
        b.style.cursor = 'default';
    });
    
    const qData = currentQuestions[currentQuestionIndex];
    
    // Nối các khối người dùng đã chọn (lấy theo thuộc tính data-raw để tránh Pinyin lẫn vào)
    let userSentence = "";
    if (gameMode === 'builder-trung-viet') {
        // Xếp tiếng Việt thì ghép lại bằng dấu cách
        userSentence = Array.from(builderTarget.children).map(b => b.dataset.raw).join(' ');
    } else {
        // Xếp tiếng Trung thì ghép nối liền
        userSentence = Array.from(builderTarget.children).map(b => b.dataset.raw).join('');
    }
    
    let correctSentence = (gameMode === 'builder-viet-trung') ? qData.cau : qData.cauNghia;
    
    // Nếu xếp tiếng Việt, ta cũng chuẩn hóa chuỗi người dùng và chuỗi đúng để tránh lỗi dấu cách thừa
    if (gameMode === 'builder-trung-viet') {
        userSentence = userSentence.replace(/\s+/g, ' ').trim();
        correctSentence = correctSentence.replace(/\s+/g, ' ').trim();
    }
    
    if (userSentence === correctSentence) {
        // Correct
        Array.from(builderTarget.children).forEach(b => b.classList.add('correct'));
        score += 10;
        scoreEl.textContent = score;
        
        // Show audio for the whole sentence if they want
        playAudio(qData.cau, 'zh-CN');
    } else {
        // Wrong
        Array.from(builderTarget.children).forEach(b => b.classList.add('wrong'));
        
        if (gameMode === 'builder-viet-trung') {
            explanationText.innerHTML = `Sai rồi. Câu tiếng Trung đúng phải là: <br> <b>${qData.cau}</b> (${qData.cauPinyin})`;
            playAudio(qData.cau, 'zh-CN');
        } else {
            explanationText.innerHTML = `Sai rồi. Câu tiếng Việt đúng phải là: <br> <b>${qData.cauNghia}</b>`;
            playAudio(qData.cauNghia, 'vi');
        }
        
        explanationContainer.classList.remove('hidden');
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
    
    const maxScore = currentQuestions.length * 10;
    finalScoreEl.textContent = score;
    
    const percentage = score / maxScore;
    if (percentage === 1) {
        feedbackEl.textContent = "Tuyệt đỉnh! Tinh hoa hội tụ! 🎉";
        feedbackEl.style.color = "var(--secondary-color)";
    } else if (percentage >= 0.7) {
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
