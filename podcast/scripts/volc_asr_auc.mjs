#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SUBMIT_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit";
const QUERY_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query";
const DONE = "20000000";
const PROCESSING = new Set(["20000001", "20000002"]);

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

function parseArgs(argv) {
  const args = {
    format: "mp3",
    codec: "raw",
    rate: 16000,
    bits: 16,
    channel: 1,
    modelName: "bigmodel",
    language: "",
    enableItn: true,
    enablePunc: false,
    enableDdc: false,
    enableSpeakerInfo: false,
    enableChannelSplit: false,
    showSpeechRate: false,
    showVolume: false,
    enableLid: false,
    enableEmotionDetection: false,
    enableGenderDetection: false,
    showUtterances: false,
    vadSegment: false,
    sensitiveWordsFilter: "",
    corpusContext: "",
    corpusHotwords: "",
    callback: "",
    callbackData: "",
    pollIntervalMs: 3000,
    timeoutMs: 10 * 60 * 1000,
    output: "transcript.json",
    textOutput: "",
    uid: "doubao-asr",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === "--url") args.url = next();
    else if (arg === "--format") args.format = next();
    else if (arg === "--codec") args.codec = next();
    else if (arg === "--rate") args.rate = Number(next());
    else if (arg === "--bits") args.bits = Number(next());
    else if (arg === "--channel") args.channel = Number(next());
    else if (arg === "--language") args.language = next();
    else if (arg === "--output") args.output = next();
    else if (arg === "--text-output") args.textOutput = next();
    else if (arg === "--uid") args.uid = next();
    else if (arg === "--request-id") args.requestId = next();
    else if (arg === "--poll-interval-ms") args.pollIntervalMs = Number(next());
    else if (arg === "--timeout-ms") args.timeoutMs = Number(next());
    else if (arg === "--model-name") args.modelName = next();
    else if (arg === "--punctuation") args.enablePunc = true;
    else if (arg === "--utterances") args.showUtterances = true;
    else if (arg === "--words") {
      args.showUtterances = true;
      args.enablePunc = true;
    } else if (arg === "--speaker-info") args.enableSpeakerInfo = true;
    else if (arg === "--channel-split") args.enableChannelSplit = true;
    else if (arg === "--speech-rate-info") args.showSpeechRate = true;
    else if (arg === "--volume-info") args.showVolume = true;
    else if (arg === "--lid") args.enableLid = true;
    else if (arg === "--emotion") args.enableEmotionDetection = true;
    else if (arg === "--gender") args.enableGenderDetection = true;
    else if (arg === "--ddc") args.enableDdc = true;
    else if (arg === "--vad-segment") args.vadSegment = true;
    else if (arg === "--end-window-size") args.endWindowSize = Number(next());
    else if (arg === "--ssd-version") args.ssdVersion = next();
    else if (arg === "--sensitive-words-filter") args.sensitiveWordsFilter = next();
    else if (arg === "--corpus-context") args.corpusContext = next();
    else if (arg === "--hotwords") args.corpusHotwords = next();
    else if (arg === "--callback") args.callback = next();
    else if (arg === "--callback-data") args.callbackData = next();
    else if (arg === "--no-itn") args.enableItn = false;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/volc_asr_auc.mjs --url "https://example.com/audio.mp3" --output transcript.json
  node scripts/volc_asr_auc.mjs --url "https://example.com/audio.mp3" --punctuation --utterances --text-output transcript.txt

Input must be a public audio URL. The AUC submit API does not upload local files.

Common options:
  --language zh-CN       Language hint, e.g. zh-CN, en-US, yue-CN
  --format mp3           raw / wav / mp3 / ogg
  --rate 16000           Audio sample rate metadata
  --punctuation          enable_punc=true
  --utterances           show_utterances=true
  --words                enable punctuation + utterances, returns word timing when available
  --speaker-info         enable speaker clustering
  --channel-split        enable dual-channel recognition
  --lid                  enable language-id labels in additions
  --emotion              enable emotion labels in additions
  --gender               enable gender labels in additions
  --speech-rate-info     include utterance speech_rate in additions
  --volume-info          include utterance volume in additions
  --hotwords "词1,词2"    pass direct hotwords through corpus.context
`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Fill it in .env first.`);
  return value;
}

function makeHeaders(requestId, includeSequence) {
  const headers = {
    "Content-Type": "application/json",
    "X-Api-Key": requireEnv("VOLC_API_KEY"),
    "X-Api-Resource-Id": process.env.VOLC_ASR_RESOURCE_ID || "volc.seedasr.auc",
    "X-Api-Request-Id": requestId,
  };
  if (includeSequence) headers["X-Api-Sequence"] = "-1";
  return headers;
}

function buildSubmitPayload(args) {
  if (!args.url) throw new Error("Provide --url with a public audio URL.");
  const audio = {
    url: args.url,
    format: args.format,
    codec: args.codec,
    rate: args.rate,
    bits: args.bits,
    channel: args.channel,
  };
  if (args.language) audio.language = args.language;

  const payload = {
    user: { uid: args.uid },
    audio,
    request: {
      model_name: args.modelName,
      ...(args.ssdVersion ? { ssd_version: args.ssdVersion } : {}),
      enable_itn: args.enableItn,
      enable_punc: args.enablePunc,
      enable_ddc: args.enableDdc,
      enable_speaker_info: args.enableSpeakerInfo,
      enable_channel_split: args.enableChannelSplit,
      show_utterances: args.showUtterances,
      show_speech_rate: args.showSpeechRate,
      show_volume: args.showVolume,
      enable_lid: args.enableLid,
      enable_emotion_detection: args.enableEmotionDetection,
      enable_gender_detection: args.enableGenderDetection,
      vad_segment: args.vadSegment,
      ...(args.endWindowSize ? { end_window_size: args.endWindowSize } : {}),
      sensitive_words_filter: args.sensitiveWordsFilter,
    },
  };

  if (args.corpusContext || args.corpusHotwords) {
    const corpus = {};
    if (args.corpusContext) {
      corpus.context = args.corpusContext;
    } else {
      corpus.context = JSON.stringify({
        hotwords: args.corpusHotwords
          .split(",")
          .map((word) => ({ word: word.trim() }))
          .filter((item) => item.word),
      });
    }
    payload.request.corpus = corpus;
  }

  if (args.callback) payload.callback = args.callback;
  if (args.callbackData) payload.callback_data = args.callbackData;

  return payload;
}

async function postJson(url, headers, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

function statusFrom(response) {
  return {
    code: response.headers.get("x-api-status-code") || "",
    message: response.headers.get("x-api-message") || "",
    logid: response.headers.get("x-tt-logid") || "",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submit(args, requestId) {
  const { response, body } = await postJson(SUBMIT_URL, makeHeaders(requestId, true), buildSubmitPayload(args));
  const status = statusFrom(response);
  if (!response.ok || status.code !== DONE) {
    throw new Error(`Submit failed: http=${response.status} code=${status.code} message=${status.message} body=${JSON.stringify(body)}`);
  }
  console.log(`Submitted task_id=${requestId} logid=${status.logid || "-"}`);
}

async function queryUntilDone(args, requestId) {
  const start = Date.now();
  while (Date.now() - start < args.timeoutMs) {
    const { response, body } = await postJson(QUERY_URL, makeHeaders(requestId, false), {});
    const status = statusFrom(response);
    if (!response.ok) {
      throw new Error(`Query failed: http=${response.status} code=${status.code} message=${status.message} body=${JSON.stringify(body)}`);
    }
    if (status.code === DONE) {
      console.log(`Query done task_id=${requestId} logid=${status.logid || "-"}`);
      return body;
    }
    if (!PROCESSING.has(status.code)) {
      throw new Error(`ASR failed: code=${status.code} message=${status.message} body=${JSON.stringify(body)}`);
    }
    console.log(`Waiting task_id=${requestId} code=${status.code} message=${status.message || "-"}`);
    await sleep(args.pollIntervalMs);
  }
  throw new Error(`Timed out after ${args.timeoutMs}ms waiting for ASR result.`);
}

function extractText(result) {
  return result?.result?.text || "";
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const requestId = args.requestId || crypto.randomUUID();
  await submit(args, requestId);
  const result = await queryUntilDone(args, requestId);

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
  console.log(`Wrote ${outputPath}`);

  const text = extractText(result);
  if (args.textOutput) {
    const textPath = path.resolve(args.textOutput);
    fs.mkdirSync(path.dirname(textPath), { recursive: true });
    fs.writeFileSync(textPath, text, "utf8");
    console.log(`Wrote ${textPath}`);
  }
  if (text) console.log(`Text: ${text}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
