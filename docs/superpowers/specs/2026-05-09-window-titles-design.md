# Design Spec - Window Titles Integration

Add clear, dynamic functional titles to all application screens and modals to provide better context and improve user navigation.

## Goals
- Display the name of the active function (game mode) prominently in the `quiz-screen`.
- Ensure all screens (History, Results, Settings, etc.) have consistent and descriptive titles.
- Enhance the premium aesthetic by using modern typography and styling for these headers.

## Proposed Changes

### 1. HTML Structure Improvements (`index.html`)
- **Quiz Screen**: Add a dedicated header element to display the dynamic mode name.
- **Character Reveal Overlay**: Add a title to clarify it's showing the stroke order/character details.

### 2. Styling (`style.css`)
- Create a `.mode-title-banner` class with:
    - Glassmorphism effect (backdrop-filter: blur).
    - Subtle gradients.
    - Centered typography with appropriate spacing.
    - Responsive design for mobile and desktop.

### 3. Logic (`script.js`)
- Implement a `getModeTitle(mode)` helper function.
- Map internal modes to user-friendly Vietnamese titles:
    - `vocab-mcq` -> "📚 Trắc Nghiệm Từ Vựng"
    - `type-pinyin` -> "⌨️ Luyện Gõ Pinyin"
    - `type-hanzi` -> "✍️ Luyện Gõ Chữ Hán"
    - `draw-hanzi` -> "🖌️ Tập Viết Chữ Hán"
    - `speech-challenge` -> "🎙️ Luyện Phát Âm"
    - `vocab-challenge` -> "⚡ Thử Thách Từ Vựng"
    - `sentence-trung-viet` -> "🗣️ Dịch Câu Trung - Việt"
    - `sentence-target` -> "🧩 Ghép Câu Tiếng Trung"
    - `sentence-cloze` -> "📝 Điền Từ Vào Câu"
- Update `startGame()` to set this title when entering the quiz.

## UI/UX Considerations
- The title should be visible but not distract from the main game content.
- On mobile, the title might need to be more compact.
- Use icons alongside text for quick visual recognition.

## Success Criteria
- When clicking "Học từ vựng gõ Pinyin", the quiz screen clearly shows "⌨️ Luyện Gõ Pinyin" at the top.
- All other screens have consistent headers.
- The design looks "premium" and integrates well with the current theme.
