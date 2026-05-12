# Word Matching Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Word Matching (Nối chữ) game mode for the lesson-based review feature.

**Architecture:** A new dedicated screen (`matching-screen`) will handle the 12-tile randomized grid, with logic for triple-matching (HanTu, Pinyin, Meaning) and visual/audio feedback.

**Tech Stack:** HTML5, Vanilla CSS3, JavaScript (ES6+).

---

### Task 1: UI Structure (HTML)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the matching screen container**
Add the `matching-screen` div before the closing `body` tag or near other screens.
```html
<!-- Matching Game Screen -->
<div id="matching-screen" class="screen">
    <div class="matching-container">
        <div class="matching-header">
            <button class="back-btn" onclick="showScreen('lessonSelection')">
                <i class="fas fa-arrow-left"></i>
            </button>
            <h2 id="matching-title">Nối Chữ</h2>
            <div class="matching-stats">Tiến độ: <span id="matching-progress">0/0</span></div>
        </div>
        <div id="matching-grid" class="matching-grid">
            <!-- Tiles will be injected here -->
        </div>
    </div>
</div>
```

- [ ] **Step 2: Add the "Nối Chữ" button to lesson cards**
Modify the `goToLessonSelection` function (or the template it uses) to include a "Nối Chữ" button.
*Note: I will implement the button rendering in script.js later, but the button class should be defined.*

- [ ] **Step 3: Commit**
```bash
git add index.html
git commit -m "ui: add matching screen structure to index.html"
```

---

### Task 2: Styling and Animations (CSS)

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Add Matching Game Layout Styles**
```css
.matching-container {
    width: 95%;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.matching-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 15px;
    margin-top: 20px;
    flex-grow: 1;
}

.matching-tile {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    padding: 20px 10px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    color: white;
    min-height: 80px;
    user-select: none;
}

.matching-tile:hover {
    transform: translateY(-3px);
    background: rgba(255, 255, 255, 0.15);
}

.matching-tile.selected {
    border-color: #3b82f6;
    box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
    background: rgba(59, 130, 246, 0.1);
}

.matching-tile.correct {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.2);
    pointer-events: none;
    opacity: 0.5;
}

.matching-tile.wrong {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.2);
    animation: shake 0.4s ease-in-out;
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
}
```

- [ ] **Step 2: Commit**
```bash
git add style.css
git commit -m "style: add matching game styles and animations"
```

---

### Task 3: State and Core Logic (JS)

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Register the new screen and state variables**
Add `matchingScreen` to the `screens` object and define matching-specific variables.
```javascript
// Inside screens object
matching: document.getElementById('matching-screen')

// State variables
let matchingSelectedTiles = [];
let matchingMatchedCount = 0;
let currentMatchingWords = [];
let matchingLessonPool = [];
```

- [ ] **Step 2: Implement Shuffle Utility**
```javascript
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
```

- [ ] **Step 3: Implement Game Initialization**
```javascript
function startMatchingGame(lessonName) {
    matchingLessonPool = lessonsGrouped[lessonName] || [];
    if (matchingLessonPool.length < 4) {
        alert("Bài học này không đủ từ để chơi nối chữ!");
        return;
    }
    matchingMatchedCount = 0;
    document.getElementById('matching-title').textContent = `Nối Chữ: ${lessonName}`;
    initMatchingRound();
    showScreen('matching-screen');
}

function initMatchingRound() {
    // Pick 4 random words from pool
    const poolCopy = [...matchingLessonPool];
    shuffleArray(poolCopy);
    currentMatchingWords = poolCopy.slice(0, 4);
    
    // Create 12 tiles (4 HanTu, 4 Pinyin, 4 Meaning)
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
```

- [ ] **Step 4: Commit**
```bash
git add script.js
git commit -m "feat: implement matching game state and initialization"
```

---

### Task 4: UI Interaction and Match Logic (JS)

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Implement Tile Rendering and Clicking**
```javascript
function renderMatchingGrid(tiles) {
    const grid = document.getElementById('matching-grid');
    grid.innerHTML = '';
    matchingSelectedTiles = [];
    
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
    
    // Prevent selecting same type twice
    const alreadyHasType = matchingSelectedTiles.some(t => t.el.dataset.type === el.dataset.type);
    if (alreadyHasType) {
        matchingSelectedTiles.forEach(t => t.el.classList.remove('selected'));
        matchingSelectedTiles = [];
    }
    
    el.classList.add('selected');
    matchingSelectedTiles.push({ el, wordRef });
    
    if (matchingSelectedTiles.length === 3) {
        checkMatchingSet();
    }
}
```

- [ ] **Step 2: Implement Validation Logic**
```javascript
function checkMatchingSet() {
    const isMatch = matchingSelectedTiles.every(t => t.el.dataset.id === matchingSelectedTiles[0].el.dataset.id);
    
    if (isMatch) {
        // Correct
        const word = matchingSelectedTiles[0].wordRef;
        matchingSelectedTiles.forEach(t => {
            t.el.classList.remove('selected');
            t.el.classList.add('correct');
        });
        
        // Play Audio
        speakWord(word.hanTu);
        
        matchingMatchedCount++;
        matchingSelectedTiles = [];
        
        if (matchingMatchedCount === 4) {
            setTimeout(() => {
                alert("Chúc mừng! Bạn đã hoàn thành lượt này.");
                initMatchingRound();
            }, 500);
        }
    } else {
        // Wrong
        matchingSelectedTiles.forEach(t => {
            t.el.classList.add('wrong');
        });
        
        // Trigger Vibration (if supported)
        if (navigator.vibrate) navigator.vibrate(200);
        
        setTimeout(() => {
            matchingSelectedTiles.forEach(t => {
                t.el.classList.remove('selected', 'wrong');
            });
            matchingSelectedTiles = [];
        }, 500);
    }
}
```

- [ ] **Step 3: Commit**
```bash
git add script.js
git commit -m "feat: implement matching logic and feedback"
```

---

### Task 5: Integration and Final Polish

**Files:**
- Modify: `script.js`, `index.html`

- [ ] **Step 1: Update Lesson Selection Cards**
Update `goToLessonSelection` to render the "Nối Chữ" button for each lesson.
```javascript
// Inside goToLessonSelection button rendering loop
const matchingBtn = document.createElement('button');
matchingBtn.className = 'btn-secondary'; // Or appropriate class
matchingBtn.innerHTML = 'Nối Chữ <i class="fas fa-puzzle-piece"></i>';
matchingBtn.onclick = (e) => {
    e.stopPropagation();
    startMatchingGame(lessonName);
};
```

- [ ] **Step 2: Bump version to v5.14**
Update `index.html` version strings.

- [ ] **Step 3: Final Commit**
```bash
git add .
git commit -m "chore: integrate matching game and bump version to v5.14"
```
