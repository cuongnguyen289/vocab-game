# Stroke Order Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Hanzi Writer to show stroke order animations on character reveal.

**Architecture:** Use Hanzi Writer library via CDN. Update HTML overlay, style with CSS, and implement logic in JS.

**Tech Stack:** JavaScript (Hanzi Writer), HTML, CSS

---

### Task 1: Setup Library and HTML Structure

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Hanzi Writer CDN**

```html
<!-- index.html -->
<script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js"></script>
<script src="script.js?v=4.0"></script>
```

- [ ] **Step 2: Update Overlay HTML**

```html
<!-- index.html around line 296 -->
<div id="character-reveal-overlay" class="character-overlay">
    <div class="character-reveal-content">
        <div id="hanzi-writer-container" class="large-char" style="width: 250px; height: 250px; margin: 0 auto;"></div>
        <div id="large-pinyin-display" class="large-pinyin"></div>
        
        <!-- Controls -->
        <div class="writer-controls" style="margin-top: 1rem; display: flex; flex-direction: column; align-items: center; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 15px;">
                <button id="replay-stroke-btn" class="btn" style="width: auto; padding: 0.5rem 1rem; border-radius: 50%; font-size: 1.5rem;" title="Viết lại">🔄</button>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; width: 100%; max-width: 200px;">
                <span style="font-size: 0.8rem; color: var(--text-muted);">Tốc độ:</span>
                <input type="range" id="stroke-speed-slider" min="0.5" max="3" step="0.1" value="1" style="flex: 1;">
            </div>
        </div>

        <div id="radical-analysis" class="radical-analysis"></div>
    </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add hanzi-writer structure and library"
```

---

### Task 2: Style the Writer and Controls

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Style the container and slider**

```css
/* style.css */
#hanzi-writer-container {
    background: white;
    border-radius: 16px;
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.05);
    display: flex;
    justify-content: center;
    align-items: center;
}

.writer-controls input[type=range] {
    accent-color: var(--primary-color);
}

#replay-stroke-btn:hover {
    background: #f1f5f9;
    transform: rotate(30deg);
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "style: add styles for hanzi writer controls"
```

---

### Task 3: Implement Animation Logic

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Initialize Global Writer and update reveal logic**

```javascript
// script.js
let writerInstance = null;

function showFullscreenReveal(char, pinyin, callback) {
    const overlay = document.getElementById('character-reveal-overlay');
    const container = document.getElementById('hanzi-writer-container');
    const pinyinDisplay = document.getElementById('large-pinyin-display');
    const analysis = document.getElementById('radical-analysis');
    const speedSlider = document.getElementById('stroke-speed-slider');
    const replayBtn = document.getElementById('replay-stroke-btn');

    if (!overlay || !container) return callback ? callback() : null;

    // Reset container
    container.innerHTML = '';
    
    // Create Writer for the first character (or all if short)
    const displayChar = char.charAt(0); // For now, animate the first character
    writerInstance = HanziWriter.create('hanzi-writer-container', displayChar, {
        width: 250,
        height: 250,
        padding: 5,
        strokeAnimationSpeed: parseFloat(speedSlider.value),
        delayBetweenStrokes: 150
    });

    // Handle Speed Change
    speedSlider.oninput = (e) => {
        if (writerInstance) {
            writerInstance.updateColorAndSize('strokeAnimationSpeed', parseFloat(e.target.value));
            // Actually HanziWriter update is a bit different, we might need to recreate or use setOptions
            writerInstance.options.strokeAnimationSpeed = parseFloat(e.target.value);
        }
    };

    // Handle Replay
    replayBtn.onclick = () => {
        if (writerInstance) writerInstance.animateCharacter();
    };

    // Auto animate
    writerInstance.animateCharacter();

    // Rest of the logic (Pinyin, Analysis, etc.)
    if (pinyinDisplay) pinyinDisplay.textContent = pinyin || "";
    // ... existing analysis logic ...
}
```

- [ ] **Step 2: Handle Multi-character reveal**
*(Add logic to animate sequentially if char.length > 1)*

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat: implement hanzi-writer animation logic"
```
