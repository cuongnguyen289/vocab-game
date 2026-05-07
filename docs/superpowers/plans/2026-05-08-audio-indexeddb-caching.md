# Audio IndexedDB Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay thế tính năng tải file thủ công bằng hệ thống tự động lưu trữ (caching) vào IndexedDB để phát âm thanh mượt mà, tức thì và hỗ trợ offline.

**Architecture:** Sử dụng IndexedDB API để lưu trữ các Audio Blobs. Hàm `playAudio` sẽ ưu tiên đọc từ cache trước khi tải từ mạng. Thêm trung tâm quản lý âm thanh vào UI.

**Tech Stack:** Native JavaScript, IndexedDB API.

---

### Task 1: Khởi tạo IndexedDB
**Files:**
- Modify: `script.js`

- [ ] **Step 1: Định nghĩa các hàm quản lý DB**
Thêm code khởi tạo database vào đầu file `script.js` (sau phần cấu hình Firebase).

```javascript
const DB_NAME = 'VocabGameAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'audio_cache';

function initAudioDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getCachedAudio(text) {
    const db = await initAudioDB();
    return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(text);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

async function saveAudioToCache(text, blob) {
    const db = await initAudioDB();
    return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(blob, text);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
    });
}
```

- [ ] **Step 2: Commit**
`git commit -m "feat: add IndexedDB initialization and helper functions"`

---

### Task 2: Cập nhật hàm playAudio hỗ trợ Caching
**Files:**
- Modify: `script.js`

- [ ] **Step 1: Cập nhật logic playAudio**
Sửa hàm `window.playAudio` để kiểm tra cache trước.

```javascript
window.playAudio = function(text, lang, rate = 1.0) {
    return new Promise(async (resolve) => {
        if (!text || text === '-' || lang !== 'zh-CN') return resolve();
        
        const cleanText = cleanTTSText(text);
        if (!cleanText) return resolve();

        // 1. Kiểm tra Cache trước
        const cachedBlob = await getCachedAudio(cleanText);
        if (cachedBlob) {
            console.log(`🎯 Phát từ Cache: "${cleanText.substring(0, 15)}..."`);
            const url = URL.createObjectURL(cachedBlob);
            globalAudio.src = url;
            globalAudio.onended = () => { URL.revokeObjectURL(url); resolve(); };
            globalAudio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            globalAudio.play().catch(() => resolve());
            return;
        }

        // 2. Nếu không có cache, tải từ mạng (giữ nguyên logic cũ nhưng thêm bước lưu cache)
        const requestId = ++currentAudioId;
        // ... (giữ logic safetyTimer và stop âm thanh cũ) ...
        
        // Cập nhật các hàm tryYoudao, tryGoogle để lưu vào cache khi tải thành công
        const saveAndFinish = async (blob) => {
            await saveAudioToCache(cleanText, blob);
            const url = URL.createObjectURL(blob);
            globalAudio.src = url;
            globalAudio.onended = () => { URL.revokeObjectURL(url); resolve(); };
            globalAudio.play();
        };

        // Fetch và chuyển thành Blob
        const fetchAndCache = async (url) => {
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                await saveAudioToCache(cleanText, blob);
                return blob;
            } catch (e) { return null; }
        };
        
        // (Thay thế logic gán globalAudio.src trực tiếp bằng việc fetch blob)
    });
};
```
*(Lưu ý: Tôi sẽ viết code chi tiết chính xác khi thực hiện)*

- [ ] **Step 2: Commit**
`git commit -m "feat: update playAudio to support transparent caching"`

---

### Task 3: Chuyển đổi "Tải hàng loạt" sang lưu vào IndexedDB
**Files:**
- Modify: `script.js`, `index.html`

- [ ] **Step 1: Cập nhật downloadAllSentenceAudio**
Thay thế logic tạo link tải file bằng logic fetch & save vào IndexedDB.
Thêm UI hiển thị tiến độ (Progress bar) vào Modal.

- [ ] **Step 2: Cập nhật index.html**
Thêm một thanh tiến trình ẩn dưới nút "Tải âm thanh".

- [ ] **Step 3: Commit**
`git commit -m "feat: implement batch caching with progress UI"`

---

### Task 4: Dọn dẹp và Tối ưu
**Files:**
- Delete: `download_audio.js`
- Modify: `script.js`

- [ ] **Step 1: Xóa file không dùng đến**
Xóa `download_audio.js`.
Xóa hàm `window.downloadAudioFile` trong `script.js`.

- [ ] **Step 2: Thêm hàm dọn dẹp cache**
Thêm nút "Xóa bộ nhớ âm thanh" trong UI để người dùng có thể giải phóng dung lượng nếu cần.

- [ ] **Step 3: Commit**
`git commit -m "cleanup: remove manual download logic and add cache clearing"`

---

### Task 5: Kiểm tra và Bàn giao
- [ ] **Step 1: Chạy ứng dụng và tải thử 10 câu**
- [ ] **Step 2: Ngắt mạng và kiểm tra xem có phát được âm thanh đã tải không**
- [ ] **Step 3: Kiểm tra tốc độ phản hồi (phải gần như tức thì)**
