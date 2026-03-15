const SHEET_ID = "13JmgXrxeuBzmBWadW9qAjtTzxObl1c5x6dk3pNr9f7w";
const TARGET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

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
    start: document.getElementById('start-screen'),
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
    
    document.getElementById('display-username').textContent = input;
    
    // Keep user logged in across page reloads
    localStorage.setItem('vocab_last_user', input);
    
    showScreen('start');
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
    if(screenName === 'start') updateProgressUI();
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
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
        showScreen('start');
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
        showScreen('start');
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
            showScreen('start');
            return;
        }
    } else if (gameMode === 'test') {
        // Trong chế độ Test, lấy danh sách từ trong learnedWords
        availableWords = vocabulary.filter(v => learnedWords.includes(v.hanTu));
        
        if (availableWords.length < 4) {
            alert("Bạn cần thuộc ít nhất 4 từ để có thể chơi chế độ kiểm tra!");
            showScreen('start');
            return;
        }
    } else {
        // Lọc ra những từ chưa thuộc cho các chế độ luyện Mới
        availableWords = vocabulary.filter(v => !learnedWords.includes(v.hanTu));
        
        if (availableWords.length === 0) {
            alert("Tuyệt vời! Bạn đã thuộc hết tất cả từ vựng trong danh sách hiện tại. Hãy thêm từ mới hoặc nhấn [Học lại từ đầu] nhé!");
            showScreen('start');
            return;
        }
    }
    
    // Trộn từ
    let shuffled = [...availableWords].sort(() => 0.5 - Math.random());
    
    const inputQ = document.getElementById('num-questions');
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
    } else {
        questionTextMain = qData.tiengViet;
        questionTextSub = ""; 
        correctAnswerText = `${qData.hanTu} (${qData.pinyin})`;
        questionEl.style.fontSize = '1.8rem'; 
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
    
    // Tao ds Options (1 dúng, 3 sai)
    let options = [correctAnswerText];
    let pool = vocabulary.filter(v => v.hanTu !== qData.hanTu);
    pool = pool.sort(() => 0.5 - Math.random());
    
    for (let i = 0; i < 3 && i < pool.length; i++) {
        if (currentQuestionMode === 'han-viet') {
            options.push(pool[i].tiengViet);
        } else {
            options.push(`${pool[i].hanTu} (${pool[i].pinyin})`);
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
    } else {
        correctAnswerText = `${qData.hanTu} (${qData.pinyin})`;
    }
    
    const buttons = optionsContainer.querySelectorAll('.option-btn');
    
    explanationText.innerHTML = `⏳ <b>Hết giờ!</b><br>Từ <b>${qData.hanTu}</b> (${qData.pinyin}) có nghĩa là: <br> "<b>${qData.tiengViet}</b>"`;
    explanationContainer.classList.remove('hidden');
    
    buttons.forEach(btn => btn.disabled = true);
    
    if (!wrongWords.includes(qData.hanTu)) {
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
        } else if (gameMode === 'test') {
            // Test mode: correct answer doesn't need to be pushed since it's already in learnedWords
        } else {
            // Save to learnedWords in normal mode
            if (!learnedWords.includes(qData.hanTu)) {
                learnedWords.push(qData.hanTu);
                localStorage.setItem(`${currentUser}_vocab_learned`, JSON.stringify(learnedWords));
            }
        }
        
        // Show Example if available
        if(qData.cau) {
            exampleSentence.textContent = qData.cau;
            examplePinyin.textContent = qData.cauPinyin || "";
            exampleMeaning.textContent = qData.cauNghia || "";
            
            examplePinyin.style.display = qData.cauPinyin ? 'block' : 'none';
            exampleMeaning.style.display = qData.cauNghia ? 'block' : 'none';
            
            exampleContainer.classList.remove('hidden');
        }
        
    } else {
        selectedBtn.classList.add('wrong');
        
        // Add to wrongWords if we got it wrong and it's not already tracked there
        if (!wrongWords.includes(qData.hanTu)) {
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
        
        // Cần kiểm tra theo current mode của câu hỏi hiện tại, vì Review mode mix cả 2
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
    showScreen('start');
}
