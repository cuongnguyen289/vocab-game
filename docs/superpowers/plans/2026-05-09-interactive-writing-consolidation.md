# Interactive Writing & Mode Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate vocabulary game modes into 4 logical groups and implement an interactive Hanzi writing feature using Hanzi Writer's quiz mode.

**Architecture:** Update `renderDynamicButtons` to group modes. Add a drawing canvas to the quiz screen. Implement sequential writing logic in `loadQuestion`.

**Tech Stack:** JavaScript, HTML, CSS, Hanzi Writer library.

---

### Task 1: HTML and CSS Setup

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Add Writing Container and Controls to index.html**

```html
<!-- index.html around line 221 -->
<div id="writing-quiz-container" class="hidden" style="flex-direction: column; align-items: center; gap: 1rem; width: 100%;">
    <div id="hanzi-quiz-canvas" style="width: 300px; height: 300px; background: white; border: 2px solid var(--primary-color); border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); cursor: crosshair; position: relative;">
        <!-- Drawing grid background can be added via CSS -->
    </div>
    <div class="writing-controls" style="display: flex; gap: 10px;">
        <button id="writing-hint-btn" class="btn secondary-btn" style="width: auto; padding: 0.6rem 1.2rem;">Gợi ý 💡</button>
        <button id="writing-reset-btn" class="btn warning-btn" style="width: auto; padding: 0.6rem 1.2rem;">Viết lại 🔄</button>
    </div>
</div>
```

- [ ] **Step 2: Add Writing Styles to style.css**

```css
/* style.css */
#hanzi-quiz-canvas {
    background-image: 
        linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px),
        linear-gradient(rgba(99, 102, 241, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 102, 241, 0.05) 1px, transparent 1px);
    background-size: 100% 100%, 100% 100%, 50% 50%, 50% 50%;
    background-position: center;
}

.writing-mode-active #options-container,
.writing-mode-active #pinyin-input-container,
.writing-mode-active #voice-input-container {
    display: none !important;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html style.css
git commit -m "feat: setup UI for interactive writing mode"
```

---

### Task 2: Reorganize Main Menu Buttons

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Update `renderDynamicButtons` to the 4-group layout**

```javascript
// script.js - Replace existing renderDynamicButtons logic for 'vocab' mode
if (currentSetupMode === 'vocab') {
    // 1. Trắc Nghiệm Tổng Hợp
    container.appendChild(createBtn('primary-btn', '📚', 'Trắc Nghiệm', () => startGame('vocab-mcq'), !dataLoaded));
    
    // 2. Luyện Viết & Gõ
    const level3Plus = (stats[3] || 0) + (stats[4] || 0) + (stats[5] || 0);
    const writeBtn = createBtn('secondary-btn', '✍️', 'Luyện Viết & Gõ', () => startGame('vocab-writing'), !dataLoaded || level3Plus === 0);
    writeBtn.style.backgroundColor = level3Plus > 0 ? '#0ea5e9' : '';
    container.appendChild(writeBtn);

    // 3. Luyện Phát Âm
    const spBtn = createBtn('primary-btn', stats[5] > 0 ? '🎙️' : '🔒', 'Phát Âm', () => startGame('speech-challenge'), !dataLoaded || stats[5] === 0);
    spBtn.style.backgroundColor = stats[5] > 0 ? '#8b5cf6' : '';
    container.appendChild(spBtn);

    // 4. Thử Thách
    const chalBtn = createBtn('warning-btn', '⚡', 'Thử Thách', () => startGame('vocab-challenge'), !dataLoaded);
    chalBtn.style.background = 'linear-gradient(135deg, #f59e0b, #ef4444)';
    container.appendChild(chalBtn);
}
```

- [ ] **Step 2: Update `startGame` to handle the new grouped IDs**

```javascript
// script.js - Update startGame function
function startGame(mode) {
    gameMode = mode;
    score = 0;
    currentQuestionIndex = 0;
    lives = 3;
    
    // Logic to select questions based on group
    if (mode === 'vocab-mcq') {
        // Mix of han-viet, viet-han
        currentQuestions = prepareMixedVocabQuestions(30); 
    } else if (mode === 'vocab-writing') {
        // Mix of type-pinyin, type-hanzi, draw-hanzi
        currentQuestions = prepareWritingQuestions(20);
    } else if (mode === 'vocab-challenge') {
        // survival or time-attack
        currentQuestions = prepareChallengeQuestions(50);
    }
    // ... existing initialization ...
    showScreen('quiz');
    loadQuestion();
}
```

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat: consolidate vocab game modes into 4 groups"
```

---

### Task 3: Implement Interactive Writing Logic

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Implement `loadWritingQuiz` function**

```javascript
// script.js
let writingQuizInstance = null;

function loadWritingQuiz(hanziWord) {
    const container = document.getElementById('writing-quiz-container');
    const canvas = document.getElementById('hanzi-quiz-canvas');
    const hintBtn = document.getElementById('writing-hint-btn');
    const resetBtn = document.getElementById('writing-reset-btn');
    
    container.classList.remove('hidden');
    container.style.display = 'flex';
    canvas.innerHTML = '';
    
    const chars = hanziWord.split('').filter(c => /\p{Script=Han}/u.test(c));
    let charIndex = 0;

    function startQuizForChar() {
        if (charIndex >= chars.length) {
            // Completed word
            handleCorrectAnswer(hanziWord);
            return;
        }

        canvas.innerHTML = '';
        writingQuizInstance = HanziWriter.create('hanzi-quiz-canvas', chars[charIndex], {
            width: 300,
            height: 300,
            showCharacter: false,
            showOutline: true,
            padding: 15,
            strokeColor: '#6366f1',
            radicalColor: '#10b981'
        });

        writingQuizInstance.quiz({
            onComplete: () => {
                charIndex++;
                setTimeout(startQuizForChar, 500);
            }
        });
    }

    hintBtn.onclick = () => writingQuizInstance && writingQuizInstance.revealFeedback();
    resetBtn.onclick = () => startQuizForChar();

    startQuizForChar();
}
```

- [ ] **Step 2: Update `loadQuestion` to trigger writing quiz**

```javascript
// script.js - In loadQuestion()
// Hide all containers first
document.getElementById('writing-quiz-container').classList.add('hidden');
document.getElementById('writing-quiz-container').style.display = 'none';

if (gameMode === 'vocab-writing' || gameMode === 'draw-hanzi') {
    // Randomly decide if this question is Drawing, Typing Pinyin, or Typing Hanzi
    const subType = Math.random();
    if (subType < 0.4) {
        loadWritingQuiz(qData.hanTu);
    } else if (subType < 0.7) {
        showPinyinInput();
    } else {
        showHanziInput();
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat: implement interactive writing quiz logic"
```

---

### Task 4: Verification and Final Polish

- [ ] **Step 1: Test the consolidation**
    - Open "Học Từ Vựng".
    - Verify 4 buttons are displayed.
    - Click "Trắc Nghiệm" and verify questions are loaded.

- [ ] **Step 2: Test Writing Mode**
    - Click "Luyện Viết & Gõ".
    - Verify that when the "Draw Hanzi" sub-mode is selected, the canvas appears.
    - Test writing a single character.
    - Test writing a multi-character word.
    - Test "Hint" and "Reset" buttons.

- [ ] **Step 3: Final Commit**

```bash
git add .
git commit -m "docs: finalize interactive writing update"
```
