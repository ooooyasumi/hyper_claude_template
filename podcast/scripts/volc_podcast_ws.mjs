#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import zlib from "node:zlib";
import { URL } from "node:url";

const EVENTS = {
  START_CONNECTION: 1,
  FINISH_CONNECTION: 2,
  CONNECTION_STARTED: 50,
  CONNECTION_FINISHED: 52,
  START_SESSION: 100,
  SESSION_STARTED: 150,
  SESSION_FINISHED: 152,
  USAGE_RESPONSE: 154,
  PODCAST_ROUND_START: 360,
  PODCAST_ROUND_RESPONSE: 361,
  PODCAST_ROUND_END: 362,
  PODCAST_END: 363,
};

const EVENT_NAMES = Object.fromEntries(Object.entries(EVENTS).map(([key, value]) => [value, key]));

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
    action: undefined,
    output: "podcast_final.mp3",
    format: "mp3",
    sampleRate: 24000,
    speechRate: 0,
    headMusic: false,
    tailMusic: false,
    strictAudit: false,
    returnAudioUrl: true,
    randomOrder: false,
    speakers: [
      "zh_male_dayixiansheng_v2_saturn_bigtts",
      "zh_female_mizaitongxue_v2_saturn_bigtts",
    ],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === "--text") args.text = next();
    else if (arg === "--text-file") args.text = fs.readFileSync(next(), "utf8");
    else if (arg === "--url") args.url = next();
    else if (arg === "--prompt") args.prompt = next();
    else if (arg === "--nlp-file") args.nlpFile = next();
    else if (arg === "--output") args.output = next();
    else if (arg === "--format") args.format = next();
    else if (arg === "--sample-rate") args.sampleRate = Number(next());
    else if (arg === "--speech-rate") args.speechRate = Number(next());
    else if (arg === "--input-id") args.inputId = next();
    else if (arg === "--speaker") args.speakers.push(next());
    else if (arg === "--speakers") args.speakers = next().split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg === "--head-music") args.headMusic = true;
    else if (arg === "--tail-music") args.tailMusic = true;
    else if (arg === "--strict-audit") args.strictAudit = true;
    else if (arg === "--only-nlp-text") args.onlyNlpText = true;
    else if (arg === "--no-audio-url") args.returnAudioUrl = false;
    else if (arg === "--random-order") args.randomOrder = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/volc_podcast_ws.mjs --text "介绍下火山引擎" --output podcast_final.mp3
  node scripts/volc_podcast_ws.mjs --url "https://example.com/article" --output article_podcast.mp3
  node scripts/volc_podcast_ws.mjs --prompt "怎么平衡工作和生活？" --output topic_podcast.mp3
  node scripts/volc_podcast_ws.mjs --nlp-file dialogue.json --output dialogue.mp3

Required .env values:
  VOLC_APP_ID
  VOLC_ACCESS_KEY

dialogue.json for --nlp-file should be an array:
  [{"speaker":"zh_male_dayixiansheng_v2_saturn_bigtts","text":"第一轮文本"}, ...]
`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Fill it in .env first.`);
  return value;
}

function buildAuthHeaders(requestId) {
  const resourceId = process.env.VOLC_RESOURCE_ID || "volc.service_type.10050";
  const apiKey = process.env.VOLC_PODCAST_API_KEY || process.env.VOLC_API_KEY;
  const appId = process.env.VOLC_APP_ID;
  const accessKey = process.env.VOLC_ACCESS_KEY;

  if (apiKey && !appId) {
    return {
      "X-Api-Key": apiKey,
      "X-Api-Resource-Id": resourceId,
      "X-Api-Request-Id": requestId,
    };
  }

  return {
    "X-Api-App-Id": requireEnv("VOLC_APP_ID"),
    "X-Api-Access-Key": requireEnv("VOLC_ACCESS_KEY"),
    "X-Api-Resource-Id": resourceId,
    "X-Api-App-Key": process.env.VOLC_APP_KEY || "aGjiRDfUWi",
    "X-Api-Request-Id": requestId,
  };
}

function buildPodcastPayload(args) {
  const inputId = args.inputId || `podcast_${crypto.randomUUID()}`;
  const payload = {
    input_id: inputId,
    use_head_music: args.headMusic,
    use_tail_music: args.tailMusic,
    aigc_watermark: false,
    audio_config: {
      format: args.format,
      sample_rate: args.sampleRate,
      speech_rate: args.speechRate,
    },
    input_info: {
      return_audio_url: args.returnAudioUrl,
      strict_audit: args.strictAudit,
    },
  };

  if (args.onlyNlpText) payload.input_info.only_nlp_text = true;

  if (args.nlpFile) {
    payload.action = 3;
    payload.nlp_texts = JSON.parse(fs.readFileSync(args.nlpFile, "utf8"));
  } else if (args.prompt) {
    payload.action = 4;
    payload.prompt_text = args.prompt;
  } else {
    payload.action = 0;
    if (args.url) {
      payload.input_info.input_url = args.url;
    } else if (args.text) {
      payload.input_text = args.text.trim();
      payload.input_info.input_text_max_length = Math.min(payload.input_text.length, 12000);
    } else {
      throw new Error("Provide one of --text, --text-file, --url, --prompt, or --nlp-file.");
    }
  }

  if (payload.action !== 3) {
    if (args.speakers.length !== 2) throw new Error("speaker_info.speakers must contain exactly two speakers.");
    payload.speaker_info = {
      random_order: args.randomOrder,
      speakers: args.speakers,
    };
  }

  return payload;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function buildProtocolMessage(event, payload, sessionId = null) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const parts = [
    Buffer.from([0x11, 0x14, 0x10, 0x00]),
    u32(event),
  ];

  if (sessionId !== null) {
    const session = Buffer.from(sessionId, "utf8");
    parts.push(u32(session.length), session);
  }

  parts.push(u32(body.length), body);
  return Buffer.concat(parts);
}

function encodeWsFrame(payload, opcode = 0x2) {
  const length = payload.length;
  let headerLength = 2;
  if (length >= 126 && length <= 0xffff) headerLength += 2;
  else if (length > 0xffff) headerLength += 8;
  headerLength += 4;

  const frame = Buffer.alloc(headerLength + length);
  frame[0] = 0x80 | opcode;
  let offset = 2;
  if (length < 126) {
    frame[1] = 0x80 | length;
  } else if (length <= 0xffff) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(length, offset);
    offset += 2;
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(length), offset);
    offset += 8;
  }

  const mask = crypto.randomBytes(4);
  mask.copy(frame, offset);
  offset += 4;
  for (let index = 0; index < length; index += 1) {
    frame[offset + index] = payload[index] ^ mask[index % 4];
  }
  return frame;
}

function tryReadWsFrame(buffer) {
  if (buffer.length < 2) return null;
  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = Boolean(second & 0x80);
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    const bigLength = buffer.readBigUInt64BE(offset);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("WebSocket frame too large.");
    length = Number(bigLength);
    offset += 8;
  }

  let mask;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + length) return null;
  let payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }
  return { frame: { opcode, payload }, rest: buffer.subarray(offset + length) };
}

function decodePayload(payload, compression) {
  if (compression === 1) return zlib.gunzipSync(payload);
  return payload;
}

function parseJsonMaybe(buffer) {
  const text = buffer.toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseProtocolMessage(buffer) {
  if (buffer.length < 4) throw new Error(`Short protocol frame: ${buffer.length} bytes`);
  const headerSize = (buffer[0] & 0x0f) * 4;
  const messageType = buffer[1] >> 4;
  const flags = buffer[1] & 0x0f;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;
  let offset = headerSize;

  if (messageType === 0x0f || buffer[1] === 0xf0) {
    const code = buffer.length >= offset + 4 ? buffer.readUInt32BE(offset) : -1;
    offset += 4;
    const errorPayload = decodePayload(buffer.subarray(offset), compression);
    return {
      error: true,
      code,
      payload: parseJsonMaybe(errorPayload),
      messageType,
      flags,
      serialization,
      compression,
    };
  }

  let event = null;
  if (flags & 0x04) {
    event = buffer.readUInt32BE(offset);
    offset += 4;
  }

  let sessionId = null;
  let payload = Buffer.alloc(0);
  if (buffer.length >= offset + 4) {
    const firstLength = buffer.readUInt32BE(offset);
    offset += 4;
    if (buffer.length >= offset + firstLength + 4) {
      sessionId = buffer.subarray(offset, offset + firstLength).toString("utf8");
      offset += firstLength;
      const payloadLength = buffer.readUInt32BE(offset);
      offset += 4;
      payload = buffer.subarray(offset, offset + payloadLength);
    } else if (buffer.length >= offset + firstLength) {
      payload = buffer.subarray(offset, offset + firstLength);
    }
  }

  payload = decodePayload(payload, compression);
  return {
    error: false,
    event,
    eventName: EVENT_NAMES[event] || `EVENT_${event}`,
    sessionId,
    payload,
    messageType,
    flags,
    serialization,
    compression,
  };
}

class RawWebSocket {
  constructor(url, headers) {
    this.url = new URL(url);
    this.headers = headers;
    this.buffer = Buffer.alloc(0);
    this.messageQueue = [];
    this.waiters = [];
  }

  async connect() {
    const port = Number(this.url.port || (this.url.protocol === "wss:" ? 443 : 80));
    const connect = this.url.protocol === "wss:" ? tls.connect : net.connect;
    this.socket = connect({ host: this.url.hostname, port, servername: this.url.hostname });
    await new Promise((resolve, reject) => {
      this.socket.once("secureConnect", resolve);
      this.socket.once("connect", resolve);
      this.socket.once("error", reject);
    });

    const key = crypto.randomBytes(16).toString("base64");
    const requestPath = `${this.url.pathname}${this.url.search}`;
    const lines = [
      `GET ${requestPath} HTTP/1.1`,
      `Host: ${this.url.host}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${key}`,
      "Sec-WebSocket-Version: 13",
      ...Object.entries(this.headers).map(([name, value]) => `${name}: ${value}`),
      "",
      "",
    ];
    this.socket.write(lines.join("\r\n"));

    const leftover = await this.readHandshake();
    this.buffer = leftover;
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (error) => this.rejectWaiters(error));
    this.socket.on("close", () => this.rejectWaiters(new Error("WebSocket closed.")));
  }

  async readHandshake() {
    let handshake = Buffer.alloc(0);
    while (!handshake.includes(Buffer.from("\r\n\r\n"))) {
      const chunk = await new Promise((resolve, reject) => {
        this.socket.once("data", resolve);
        this.socket.once("error", reject);
      });
      handshake = Buffer.concat([handshake, chunk]);
    }

    const headerEnd = handshake.indexOf(Buffer.from("\r\n\r\n"));
    const headerText = handshake.subarray(0, headerEnd).toString("utf8");
    const statusLine = headerText.split("\r\n")[0];
    if (!/^HTTP\/1\.[01] 101 /.test(statusLine) && !/^HTTP\/1\.[01] 200 /.test(statusLine)) {
      throw new Error(`WebSocket handshake failed:\n${headerText}`);
    }
    return handshake.subarray(headerEnd + 4);
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const parsed = tryReadWsFrame(this.buffer);
      if (!parsed) break;
      this.buffer = parsed.rest;
      const { opcode, payload } = parsed.frame;
      if (opcode === 0x8) {
        this.close();
        continue;
      }
      if (opcode === 0x9) {
        this.socket.write(encodeWsFrame(payload, 0xA));
        continue;
      }
      if (opcode === 0x1 || opcode === 0x2) this.pushMessage(payload);
    }
  }

  pushMessage(payload) {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(payload);
    else this.messageQueue.push(payload);
  }

  rejectWaiters(error) {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  send(payload) {
    this.socket.write(encodeWsFrame(payload));
  }

  receive(timeoutMs = 180000) {
    if (this.messageQueue.length) return Promise.resolve(this.messageQueue.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for WebSocket message after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.waiters.push({
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  close() {
    if (!this.socket.destroyed) this.socket.end();
  }
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const requestId = crypto.randomUUID();
  const headers = buildAuthHeaders(requestId);
  const url = process.env.VOLC_PODCAST_WS_URL || "wss://openspeech.bytedance.com/api/v3/sami/podcasttts";
  const sessionId = crypto.randomUUID();
  const payload = buildPodcastPayload(args);
  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const output = fs.createWriteStream(outputPath);

  const ws = new RawWebSocket(url, headers);
  await ws.connect();
  console.log(`Connected. request_id=${headers["X-Api-Request-Id"]} auth=${headers["X-Api-Key"] ? "api-key" : "app-id"}`);

  ws.send(buildProtocolMessage(EVENTS.START_CONNECTION, {}));
  let connectionReady = false;
  let sessionFinished = false;
  let audioBytes = 0;
  let roundCount = 0;
  let audioUrl = null;

  while (!connectionReady) {
    const msg = parseProtocolMessage(await ws.receive());
    if (msg.error) throw new Error(`Volc error ${msg.code}: ${JSON.stringify(msg.payload)}`);
    console.log(`event=${msg.eventName}`, parseJsonMaybe(msg.payload));
    if (msg.event === EVENTS.CONNECTION_STARTED) connectionReady = true;
  }

  ws.send(buildProtocolMessage(EVENTS.START_SESSION, payload, sessionId));
  console.log(`Started session ${sessionId}.`);

  while (!sessionFinished) {
    const msg = parseProtocolMessage(await ws.receive(300000));
    if (msg.error) throw new Error(`Volc error ${msg.code}: ${JSON.stringify(msg.payload)}`);

    if (msg.event === EVENTS.PODCAST_ROUND_RESPONSE) {
      output.write(msg.payload);
      audioBytes += msg.payload.length;
      continue;
    }

    const body = parseJsonMaybe(msg.payload);
    console.log(`event=${msg.eventName}`, body);

    if (msg.event === EVENTS.PODCAST_ROUND_START) roundCount += 1;
    if (msg.event === EVENTS.PODCAST_END) {
      if (body?.meta_info?.audio_url) audioUrl = body.meta_info.audio_url;
      sessionFinished = true;
    }
    if (msg.event === EVENTS.SESSION_FINISHED) sessionFinished = true;
  }

  await new Promise((resolve) => output.end(resolve));
  ws.send(buildProtocolMessage(EVENTS.FINISH_CONNECTION, {}));

  try {
    while (true) {
      const msg = parseProtocolMessage(await ws.receive(5000));
      if (msg.error) throw new Error(`Volc error ${msg.code}: ${JSON.stringify(msg.payload)}`);
      console.log(`event=${msg.eventName}`, parseJsonMaybe(msg.payload));
      if (msg.event === EVENTS.CONNECTION_FINISHED) break;
    }
  } catch {
    // Some servers close immediately after SessionFinished; the audio file is already written.
  } finally {
    ws.close();
  }

  console.log(`Wrote ${outputPath} (${audioBytes} audio bytes, ${roundCount} rounds).`);
  if (audioUrl) console.log(`audio_url=${audioUrl}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
