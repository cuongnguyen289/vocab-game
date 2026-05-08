# Design Specification: Compact Vertical Layout for Vocabulary Game

## Goal
Optimize the user interface for desktop and single-screen usage by reducing vertical space consumption and bringing key components closer together. This ensures all relevant information (question, options, and examples) fits within the viewport without requiring scrolling.

## User Review Required
- [ ] Reduced font size for large characters (from ~3rem to 2.2rem).
- [ ] Reduced padding and margins globally across the quiz screen.

## Proposed Changes

### CSS Styles (`style.css`)
- **Container**: Reduce padding from `2.5rem` to `1.2rem` vertically and `1.5rem` horizontally. Remove `min-height: 550px`.
- **Quiz Header**: Reduce `margin-bottom` from `1.5rem` to `0.8rem`.
- **Question Container**: Reduce `margin-bottom` from `2rem` to `1rem`. Adjust `#question-text` font-size and margins.
- **Options Grid**: Reduce `gap` from `1rem` to `0.7rem`. Reduce `.option-btn` padding.
- **Example Box**: Reduce `margin-top` from `1.5rem` to `0.6rem` and internal padding.
- **Next Button**: Reduce `margin-top` from `2rem` to `1rem`.

## Verification Plan
1. Open the game in a browser.
2. Navigate to the Quiz screen.
3. Verify that the entire container fits within a standard 1080p and 768p viewport without scrolling.
4. Check that all text remains legible despite reduced sizes.
