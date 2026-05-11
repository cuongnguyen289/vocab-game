# Feature Consolidation & UI Enhancement (v5.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate game modes into 4 logical groups, implement dynamic window titles, and finalize the interactive Hanzi writing experience.

**Architecture:** Update `index.html` and `style.css` for new UI components. Implement mapping logic in `script.js` to handle mode grouping and title display.

**Tech Stack:** JavaScript, HTML5, CSS3, Hanzi Writer.

---

### Task 1: UI Foundations (HTML & CSS)

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Add Mode Title Banner to index.html**
Add the banner div inside `#quiz-screen`, above the `.quiz-header`.

```html
<!-- index.html around line 170 -->
<div id="quiz-screen" class="screen">
    <!-- NEW: Mode Title Banner -->
    <div id="mode-title-banner" class="mode-title-banner">
        <span id="mode-title-text">📚 Trắc Nghiệm</span>
    </div>
    
    <div id="timer-bar-container" class="hidden">
    ...
```

- [ ] **Step 2: Add Writing Skip Button to index.html**
Ensure the button is present in `#writing-quiz-container`.

```html
<!-- index.html around line 232 -->
<div id="writing-quiz-container" class="hidden" ...>
    <div id="hanzi-quiz-canvas" ...></div>
    <div class="writing-controls" ...>
        <button id="writing-hint-btn" ...>Gợi ý 💡</button>
        <button id="writing-reset-btn" ...>Viết lại 🔄</button>
    </div>
    <!-- NEW: Skip Button will be injected via JS or add it here -->
    <button id="writing-skip-btn" class="btn skip-btn" style="margin-top: 10px; width: auto; padding: 0.6rem 1.2rem; font-size: 0.9rem;">Bỏ qua từ này ⏩</button>
</div>
```

- [ ] **Step 3: Add Styles to style.css**
Add the glassmorphism banner and grouped button styles.

```css
/* style.css */
.mode-title-banner {
    width: 100%;
    padding: 0.8rem;
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
    text-align: center;
    margin-bottom: 1rem;
    border-radius: 0 0 20px 20px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
}

#mode-title-text {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--primary-color);
    letter-spacing: 0.5px;
}

/* Grouped Button styling */
.mode-group-container {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    width: 100%;
}
```

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat: add mode title banner and writing skip button UI"
```

---

### Task 2: Logic & Mode Consolidation

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Implement `getModeTitle` helper**
Add this function to map internal modes to user-friendly titles.

```javascript
// script.js
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
        'sentence-cloze': '📝 Điền Từ Vào Câu'
    };
    return titles[mode] || '🎮 Đang Chơi';
}
```

- [ ] **Step 2: Update `renderDynamicButtons` to the 4-group layout**
Replace the `if (currentSetupMode === 'vocab')` block.

```javascript
// script.js inside renderDynamicButtons
if (currentSetupMode === 'vocab') {
    // 1. Trắc Nghiệm Tổng Hợp
    container.appendChild(createBtn('primary-btn', '📚', 'Trắc Nghiệm', () => startGame('vocab-mcq'), !dataLoaded));
    
    // 2. Luyện Viết & Gõ (Consolidated)
    const level1Plus = (stats[1] || 0) + (stats[2] || 0) + (stats[3] || 0) + (stats[4] || 0) + (stats[5] || 0);
    const writeBtn = createBtn('secondary-btn', '✍️', 'Luyện Viết & Gõ', () => startGame('vocab-writing'), !dataLoaded || level1Plus === 0);
    writeBtn.style.backgroundColor = level1Plus > 0 ? '#0ea5e9' : '';
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

- [ ] **Step 3: Update `startGame` to handle `vocab-writing` and set titles**

```javascript
// script.js update startGame
async function startGame(mode, levelFilter = null) {
    // ... existing initialization ...
    
    // Update Window Title
    const titleEl = document.getElementById('mode-title-text');
    if (titleEl) titleEl.textContent = getModeTitle(mode);

    // Handle vocab-writing sub-mode selection
    if (mode === 'vocab-writing') {
        // Logic will be handled in loadQuestion for each item
    }
    
    // ... rest of startGame ...
}
```

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "feat: consolidate vocab modes and implement dynamic titles"
```

---

### Task 3: Finalize Interactive Writing

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Refactor `loadWritingQuiz` and implement Skip**
Ensure the skip button works and the canvas resets correctly.

```javascript
// script.js update loadWritingQuiz
function loadWritingQuiz(hanziWord) {
    const container = document.getElementById('writing-quiz-container');
    const canvas = document.getElementById('hanzi-quiz-canvas');
    const skipBtn = document.getElementById('writing-skip-btn');
    
    // ... setup containers ...
    
    skipBtn.onclick = () => {
        document.getElementById('quiz-screen').classList.remove('writing-mode-active');
        container.classList.add('hidden');
        container.style.display = 'none';
        handleCorrectAnswer(hanziWord); // Or just skip to next
    };

    // ... rest of loadWritingQuiz ...
}
```

- [ ] **Step 2: Update `loadQuestion` for sub-mode logic**

```javascript
// script.js update loadQuestion
if (gameMode === 'vocab-writing') {
    const rand = Math.random();
    if (rand < 0.4) {
        currentQuestionMode = 'draw-hanzi';
    } else if (rand < 0.7) {
        currentQuestionMode = 'type-pinyin';
    } else {
        currentQuestionMode = 'type-hanzi';
    }
    // Update title specifically for the sub-mode if desired
    document.getElementById('mode-title-text').textContent = getModeTitle(currentQuestionMode);
}
```

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat: finalize interactive writing and sub-mode randomization"
```

---

### Task 4: Verification

- [ ] **Step 1: Manual Test**
    - Verify 4 buttons in "Học Từ Vựng".
    - Verify Title Banner appears and shows correct text.
    - Verify Writing Mode skips correctly.
- [ ] **Step 2: Final Cleanup**
    - Delete any unused old plans or specs.
    - Run final `git push`.
