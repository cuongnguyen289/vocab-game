# Compact Vertical Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce vertical space in the vocabulary game's quiz interface to ensure it fits on one screen without scrolling on desktop.

**Architecture:** Modify `style.css` to reduce paddings, margins, and font sizes globally for the quiz screen components.

**Tech Stack:** CSS, HTML

---

### Task 1: Optimize Container and Quiz Header

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Reduce Container Padding and remove min-height**

```css
/* style.css */
.container {
    width: 100%;
    max-width: 850px;
    background: var(--card-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    padding: 1.2rem 1.5rem; /* Reduced from 2.5rem */
    border-radius: 24px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0,0,0,0.05);
    border: 1px solid rgba(255, 255, 255, 0.5);
    /* min-height: 550px; Remove this or reduce it */
    display: flex;
    flex-direction: column;
}
```

- [ ] **Step 2: Reduce Quiz Header spacing**

```css
/* style.css */
.quiz-header {
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 0.8rem; /* Reduced from 1.5rem */
    font-weight: 600;
}
```

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: reduce container and header spacing"
```

---

### Task 2: Optimize Question Area

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Shrink Question Text and margins**

```css
/* style.css */
.question-container {
    text-align: center;
    margin-bottom: 1rem; /* Reduced from 2rem */
    width: 100%;
}

#question-text {
    font-size: 2.2rem !important; /* Reduced from default large size */
}

.pinyin {
    color: var(--primary-color);
    font-size: 1.2rem; /* Reduced from 1.4rem */
    font-weight: 500;
    margin-top: 2px; /* Reduced from 5px */
}
```

- [ ] **Step 2: Shrink Timer Bar margin**

```css
/* style.css */
#timer-bar-container {
    width: 100%;
    height: 6px;
    background-color: #e2e8f0;
    border-radius: 3px;
    margin-bottom: 0.8rem; /* Reduced from 1.5rem */
    overflow: hidden;
}
```

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: shrink question text and timer bar"
```

---

### Task 3: Optimize Options and Example Box

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Reduce Options Grid gap and button padding**

```css
/* style.css */
.options-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.7rem; /* Reduced from 1rem */
    width: 100%;
}

.option-btn {
    margin-bottom: 0;
    background: white;
    border: 2px solid #e2e8f0;
    color: var(--text-main);
    justify-content: center;
    text-align: center;
    padding: 0.6rem 0.8rem; /* Reduced from 0.8rem 1rem */
    font-weight: 500;
    line-height: 1.2;
}
```

- [ ] **Step 2: Shrink Example Box and Next Button**

```css
/* style.css */
.example-box {
    width: 100%;
    margin-top: 0.6rem; /* Reduced from 1.5rem */
    padding: 0.8rem; /* Reduced from 1rem */
    background: #f1f5f9;
    border-radius: 12px;
    text-align: left;
}

.ex-sentence {
    font-size: 1.2rem; /* Reduced from 1.4rem */
    font-weight: 700;
    color: var(--primary-color);
}

.next-btn {
    margin-top: 1rem; /* Reduced from 2rem */
    background-color: var(--text-main);
    color: white;
}
```

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: optimize options grid and example box"
```
