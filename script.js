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
let learnedWords = JSON.parse(localStorage.getItem('vocab_learned_words')) || [];
let wrongWords = JSON.parse(localStorage.getItem('vocab_wrong_words')) || [];

const screens = {
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
            reviewBtn.textContent = '✅ Chưa có từ sai';
        } else {
            reviewBtn.disabled = false;
            reviewBtn.innerHTML = '<span class="btn-icon">📝</span> Ôn tập (' + wrongWords.length + ' từ đã sai)';
        }
    }
}

function resetProgress() {
    if(confirm("Bạn có chắc chắn muốn xóa toàn bộ tiến độ (bao gồm từ Đã Thuộc và Đã Sai) để học lại từ đầu không?")) {
        learnedWords = [];
        wrongWords = [];
        localStorage.removeItem('vocab_learned_words');
        localStorage.removeItem('vocab_wrong_words');
        updateProgressUI();
    }
}

// Initial UI update
updateProgressUI();

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
            btns[0].innerHTML = '<span class="btn-icon">🇨🇳</span> Luyện Mới (Hán Tự ➡️ Tiếng Việt)';
            
            btns[1].disabled = false;
            btns[1].innerHTML = '<span class="btn-icon">🇻🇳</span> Luyện Mới (Tiếng Việt ➡️ Hán Tự)';
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

// Fetch data as soon as the script loads
window.addEventListener('DOMContentLoaded', fetchVocabulary);

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

    // Trong Review mode, random giua han-viet và viet-han để kiểm tra mọi mặt
    let currentQMode = gameMode;
    if (gameMode === 'review') {
        currentQMode = Math.random() > 0.5 ? 'han-viet' : 'viet-han';
    }

    if (currentQMode === 'han-viet') {
        questionTextMain = qData.hanTu;
        questionTextSub = qData.pinyin;
        correctAnswerText = qData.tiengViet;
        questionEl.style.fontSize = '4rem'; 
    } else {
        questionTextMain = qData.tiengViet;
        questionTextSub = ""; 
        correctAnswerText = `${qData.hanTu} (${qData.pinyin})`;
        questionEl.style.fontSize = '2rem'; 
    }
    
    questionEl.textContent = questionTextMain;
    pinyinEl.textContent = questionTextSub;
    if(!questionTextSub) {
        pinyinEl.style.display = 'none';
        questionEl.style.marginBottom = '0';
    } else {
        pinyinEl.style.display = 'block';
        questionEl.style.marginBottom = '0.5rem';
    }
    
    // Tao ds Options (1 dúng, 3 sai)
    let options = [correctAnswerText];
    let pool = vocabulary.filter(v => v.hanTu !== qData.hanTu);
    pool = pool.sort(() => 0.5 - Math.random());
    
    for (let i = 0; i < 3 && i < pool.length; i++) {
        if (currentQMode === 'han-viet') {
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
}

function checkAnswer(selected, correct, selectedBtn) {
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
                localStorage.setItem('vocab_wrong_words', JSON.stringify(wrongWords));
            }
        } else {
            // Save to learnedWords in normal mode
            if (!learnedWords.includes(qData.hanTu)) {
                learnedWords.push(qData.hanTu);
                localStorage.setItem('vocab_learned_words', JSON.stringify(learnedWords));
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
            localStorage.setItem('vocab_wrong_words', JSON.stringify(wrongWords));
            // Remove from learnedWords just in case they forgot
            const index = learnedWords.indexOf(qData.hanTu);
            if(index > -1) {
                learnedWords.splice(index, 1);
                localStorage.setItem('vocab_learned_words', JSON.stringify(learnedWords));
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
    showScreen('start');
}
