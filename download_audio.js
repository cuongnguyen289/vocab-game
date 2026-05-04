const fs = require('fs');
const path = require('path');
const https = require('https');

const sheetId = '13JmgXrxeuBzmBWadW9qAjtTzxObl1c5x6dk3pNr9f7w';
const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;

const audioDir = path.join(__dirname, 'audio_files');

if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir);
    console.log(`📁 Đã tạo thư mục: ${audioDir}`);
}

function cleanWord(text) {
    if (!text) return "";
    return text.replace(/（___）/g, '')
               .replace(/（/g, '(').replace(/）/g, ')')
               .replace(/___/g, '')
               .replace(/\(.*?\)/g, '')
               .replace(/\[.*?\]/g, '')
               .replace(/<.*?>/g, '')
               .replace(/['"]/g, '')
               .replace(/[/\\|]/g, ' ')
               .trim();
}

function downloadAudio(word, index) {
    const cleanText = cleanWord(word);
    if (!cleanText || cleanText === '-') return;

    const isLong = cleanText.length > 15 || /[，。！？,.!?]/.test(cleanText);
    
    let youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanText)}&le=zh`;
    let googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=zh-CN&client=tw-ob&ttsspeed=1`;

    const safeName = cleanText.replace(/[\\/:*?"<>|]/g, ""); 
    const fileName = `${String(index).padStart(3, '0')}_${safeName}.mp3`;
    const filePath = path.join(audioDir, fileName);

    if (fs.existsSync(filePath)) {
        console.log(`⏩ Đã tồn tại: ${fileName}`);
        return;
    }

    const download = (targetUrl, isFallback = false) => {
        https.get(targetUrl, (res) => {
            if (res.statusCode === 200) {
                const fileStream = fs.createWriteStream(filePath);
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log(`✅ Đã tải: ${fileName}` + (isFallback ? ' (Google TTS)' : ''));
                });
            } else {
                if (!isFallback) {
                    console.log(`⚠️ Youdao lỗi cho ${fileName}, tự động thử lại bằng Google TTS...`);
                    download(googleUrl, true);
                } else {
                    console.log(`❌ Lỗi tải ${fileName} ở cả 2 nguồn - HTTP ${res.statusCode}`);
                }
            }
        }).on('error', (err) => {
            if (!isFallback) {
                download(googleUrl, true);
            } else {
                console.log(`❌ Lỗi mạng khi tải ${fileName}: ${err.message}`);
            }
        });
    };

    if (isLong) {
        download(googleUrl, true);
    } else {
        download(youdaoUrl, false);
    }
}

async function start() {
    console.log("⏳ Đang tải danh sách từ vựng từ Google Sheet...");
    try {
        const response = await fetch(csvUrl);
        const data = await response.text();
        const lines = data.split('\n');
        
        // Remove header row
        lines.shift();
        
        console.log(`✅ Đã tải xong danh sách. Bắt đầu tải audio cho ${lines.length} từ...`);
        
        let count = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const columns = line.split(',');
            if (columns.length > 1) {
                let hanTu = columns[1].trim();
                if(hanTu.startsWith('"')) hanTu = hanTu.slice(1, -1);
                
                if (hanTu) {
                    count++;
                    let currentIndex = count;
                    setTimeout(() => {
                        downloadAudio(hanTu, currentIndex);
                    }, count * 300);
                }
            }
        }
    } catch (e) {
        console.error("Lỗi:", e);
    }
}

start();
