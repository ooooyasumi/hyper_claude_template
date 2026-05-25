import fs from 'fs';

const data = JSON.parse(fs.readFileSync('exports/V2/assets/transcript.json', 'utf8'));
const utterances = data.result.utterances;

const SPEAKER_MAP = { '1': 'sumi', '2': 'guest' };

function getRealWords(words) {
  return words.filter(w => w.start_time >= 0 && w.end_time >= 0);
}

function isPunctuation(text) {
  return /^[，。！？、；：,\.!\?;:\s]$/.test(text);
}

// Characters to strip entirely
const FILLER_CHARS = new Set(['呢', '啊', '呃', '嘛', '嗯', '吧', '哦', '呀', '哇', '呐']);

function splitUtterance(utterance) {
  const realWords = getRealWords(utterance.words);
  if (realWords.length === 0) return [];
  const segments = [];
  let currentWords = [];
  for (const w of realWords) {
    currentWords.push(w);
    if (w.text === '，' || w.text === '。' || w.text === '！' || w.text === '？' || w.text === '、' || w.text === '；') {
      if (currentWords.length > 0) { segments.push([...currentWords]); currentWords = []; }
    }
  }
  if (currentWords.length > 0) segments.push([...currentWords]);
  return segments;
}

// Filler patterns to strip from beginning/middle/end of text
const STRIP_PATTERNS = [
  /^对对对对|^对对对|^对对/,  // repeated affirmations at start
  /对对对对$|对对对$|对对$/,    // at end
  /^没错没错没错|^没错没错|^没错/,  // affirmations
  /没错没错没错$|没错没错$|没错$/,    // at end
  /^就是就是|^就是说|^就是说呢|^就是说啊/,  // filler phrases
  /就是就是$|就是说$|就是说呢$|就是说啊$/,
  /^OK对|^OK对(?:吧|嘛|呢|啊)?/,  // English filler
  /OK对$|OK对(?:吧|嘛|呢|啊)?$/,
  /^对(?:吧|嘛|呢|啊)?$/,  // standalone 对
  /^好(?:吧|嘛|呢|啊)?$/,  // standalone 好
  /^嗯+$/,  // standalone 嗯嗯嗯
];

function cleanText(text) {
  let t = text;
  // Remove filler chars
  for (const fc of FILLER_CHARS) {
    t = t.replaceAll(fc, '');
  }
  // Apply strip patterns (beginning)
  for (const pat of STRIP_PATTERNS) {
    if (pat.source.endsWith('$')) {
      t = t.replace(pat, '');
    }
  }
  // Remove empty result
  if (t.trim().length === 0) return '';
  // Fix English word spacing: add space before English words
  t = t.replace(/([a-zA-Z])([一-鿿])/g, '$1 $2');
  t = t.replace(/([一-鿿])([a-zA-Z])/g, '$1 $2');
  // Fix number spacing
  t = t.replace(/(\d)([一-鿿])/g, '$1 $2');
  t = t.replace(/([一-鿿])(\d)/g, '$1 $2');
  // Clean up double spaces
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

// Build all segments
let allSegments = [];
for (const utterance of utterances) {
  const speaker = SPEAKER_MAP[utterance.additions?.speaker] || 'guest';
  const rawSegments = splitUtterance(utterance);
  for (const segWords of rawSegments) {
    const contentWords = segWords.filter(w => !isPunctuation(w.text) && !FILLER_CHARS.has(w.text));
    if (contentWords.length === 0) continue;
    const rawText = contentWords.map(w => w.text).join('');
    const text = cleanText(rawText);
    if (!text || text.length <= 1) continue;
    const timing = {
      start: contentWords[0].start_time,
      end: contentWords[contentWords.length - 1].end_time
    };
    allSegments.push({ speaker, text, start: timing.start, end: timing.end, duration: timing.end - timing.start });
  }
}

// Merge short segments (<900ms) with neighbors if same speaker
const merged = [allSegments[0]];
for (let i = 1; i < allSegments.length; i++) {
  const curr = allSegments[i];
  const prev = merged[merged.length - 1];
  if (prev.speaker === curr.speaker) {
    const gap = curr.start - prev.end;
    const totalDur = curr.end - prev.start;
    if (curr.duration < 900 || (gap < 400 && totalDur < 5000)) {
      prev.text += ' ' + curr.text;
      prev.end = curr.end;
      prev.duration = prev.end - prev.start;
      continue;
    }
  }
  merged.push(curr);
}

// Split segments >5000ms
const final = [];
for (const seg of merged) {
  if (seg.duration > 5000 && seg.text.length > 10) {
    const mid = Math.floor(seg.text.length / 2);
    const durationRatio = mid / seg.text.length;
    const splitTime = seg.start + Math.round(seg.duration * durationRatio);
    final.push({ speaker: seg.speaker, text: seg.text.substring(0, mid), start: seg.start, end: splitTime, duration: splitTime - seg.start });
    final.push({ speaker: seg.speaker, text: seg.text.substring(mid), start: splitTime, end: seg.end, duration: seg.end - splitTime });
  } else {
    final.push(seg);
  }
}

// Generate output
const lines = [];
for (const seg of final) {
  const startSec = (seg.start / 1000).toFixed(1);
  const durSec = Math.max(0.3, seg.duration / 1000).toFixed(1);
  lines.push(`  <div class="caption-item clip" data-start="${startSec}" data-duration="${durSec}" data-speaker="${seg.speaker}"><span class="caption-text">${seg.text}</span></div>`);
}

console.log('Total segments:', final.length);
console.log('---CAPTIONS---');
console.log(lines.join('\n'));
console.log('---END---');
