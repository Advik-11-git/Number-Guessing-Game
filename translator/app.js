const $ = (id) => document.getElementById(id);

const sourceLang = $("sourceLang");
const targetLang = $("targetLang");
const sourceText = $("sourceText");
const targetText = $("targetText");
const micBtn = $("micBtn");
const translateBtn = $("translateBtn");
const statusEl = $("status");
const detectedEl = $("detected");
const charCount = $("charCount");

const LANG_BY_CODE = Object.fromEntries(LANGUAGES.map(([code, name, locale]) => [code, { name, locale }]));

// ---------- Language dropdowns ----------

function fillSelect(select, includeAuto) {
  if (includeAuto) select.add(new Option("Detect language", "auto"));
  for (const [code, name] of LANGUAGES) select.add(new Option(name, code));
}

fillSelect(sourceLang, true);
fillSelect(targetLang, false);

function loadPrefs() {
  try {
    sourceLang.value = localStorage.getItem("translator.source") || "auto";
    targetLang.value = localStorage.getItem("translator.target") || "es";
  } catch {
    sourceLang.value = "auto";
    targetLang.value = "es";
  }
}

function savePrefs() {
  try {
    localStorage.setItem("translator.source", sourceLang.value);
    localStorage.setItem("translator.target", targetLang.value);
  } catch { /* storage unavailable; ignore */ }
}

loadPrefs();

// ---------- Translation ----------

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

async function translateWithGoogle(text, from, to) {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t"
    + `&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Translate returned ${res.status}`);
  const data = await res.json();
  const translated = data[0].map((chunk) => chunk[0]).join("");
  return { translated, detected: data[2] };
}

async function translateWithMyMemory(text, from, to) {
  const url = "https://api.mymemory.translated.net/get"
    + `?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory returned ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || "Translation failed");
  return { translated: data.responseData.translatedText, detected: from };
}

let requestId = 0;
let detectedCode = null; // language detected for the current text when source is "auto"

async function translate() {
  const text = sourceText.value.trim();
  const from = sourceLang.value;
  const to = targetLang.value;

  if (!text) {
    targetText.textContent = "";
    detectedCode = null;
    detectedEl.textContent = "";
    setStatus("");
    return;
  }

  const id = ++requestId;
  translateBtn.disabled = true;
  setStatus("Translating…");

  try {
    let result;
    try {
      result = await translateWithGoogle(text, from, to);
    } catch (err) {
      // MyMemory can't auto-detect, so the fallback needs an explicit source language.
      if (from === "auto") throw err;
      result = await translateWithMyMemory(text, from, to);
    }
    if (id !== requestId) return; // a newer request has started

    targetText.textContent = result.translated;
    detectedCode = from === "auto" && LANG_BY_CODE[result.detected] ? result.detected : null;
    detectedEl.textContent = detectedCode ? `Detected: ${LANG_BY_CODE[detectedCode].name}` : "";
    setStatus("");
  } catch (err) {
    if (id !== requestId) return;
    setStatus(`Could not translate: ${err.message}. Check your internet connection.`, true);
  } finally {
    if (id === requestId) translateBtn.disabled = false;
  }
}

let debounceTimer;
function scheduleTranslate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(translate, 600);
}

sourceText.addEventListener("input", () => {
  charCount.textContent = `${sourceText.value.length} / 5000`;
  scheduleTranslate();
});

translateBtn.addEventListener("click", translate);

for (const select of [sourceLang, targetLang]) {
  select.addEventListener("change", () => {
    savePrefs();
    translate();
  });
}

$("swapBtn").addEventListener("click", () => {
  const newSource = targetLang.value;
  const newTarget = sourceLang.value === "auto" ? (detectedCode || "en") : sourceLang.value;
  sourceLang.value = newSource;
  targetLang.value = newTarget;
  sourceText.value = targetText.textContent;
  charCount.textContent = `${sourceText.value.length} / 5000`;
  savePrefs();
  translate();
});

$("clearBtn").addEventListener("click", () => {
  sourceText.value = "";
  charCount.textContent = "0 / 5000";
  translate();
  sourceText.focus();
});

$("copyBtn").addEventListener("click", async () => {
  if (!targetText.textContent) return;
  try {
    await navigator.clipboard.writeText(targetText.textContent);
    setStatus("Copied to clipboard");
  } catch {
    setStatus("Could not copy", true);
  }
});

// ---------- Text to speech ----------

function localeFor(code) {
  if (code === "auto") return navigator.language || "en-US";
  return LANG_BY_CODE[code]?.locale || code;
}

function speak(text, code) {
  if (!text) return;
  if (!("speechSynthesis" in window)) {
    setStatus("Your browser can't read text aloud.", true);
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const locale = localeFor(code);
  utterance.lang = locale;
  const base = locale.split("-")[0].toLowerCase();
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().replace("_", "-") === locale.toLowerCase())
    || speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(base));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

$("speakSourceBtn").addEventListener("click", () => {
  speak(sourceText.value, sourceLang.value === "auto" && detectedCode ? detectedCode : sourceLang.value);
});

$("speakTargetBtn").addEventListener("click", () => speak(targetText.textContent, targetLang.value));

// ---------- Microphone (speech to text) ----------

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (!SpeechRecognition) {
  micBtn.disabled = true;
  micBtn.title = "Speech input isn't supported in this browser. Try Chrome, Edge or Safari.";
}

function stopListening() {
  listening = false;
  micBtn.classList.remove("listening");
  micBtn.setAttribute("aria-label", "Start speaking");
  if (recognition) recognition.stop();
}

micBtn.addEventListener("click", () => {
  if (!SpeechRecognition) {
    setStatus(micBtn.title, true);
    return;
  }
  if (listening) {
    stopListening();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = localeFor(sourceLang.value);
  recognition.interimResults = true;
  recognition.continuous = true;

  const existing = sourceText.value ? sourceText.value.replace(/\s*$/, " ") : "";
  let finalTranscript = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript;
      else interim += transcript;
    }
    sourceText.value = existing + finalTranscript + interim;
    charCount.textContent = `${sourceText.value.length} / 5000`;
    scheduleTranslate();
  };

  recognition.onerror = (event) => {
    const messages = {
      "not-allowed": "Microphone access was blocked. Allow it in your browser settings.",
      "no-speech": "No speech heard. Try again.",
      "language-not-supported": "Speech input isn't available for this language in your browser.",
      "network": "Speech recognition needs an internet connection.",
    };
    setStatus(messages[event.error] || `Microphone error: ${event.error}`, true);
    stopListening();
  };

  recognition.onend = () => {
    if (listening) stopListening();
    translate();
  };

  recognition.start();
  listening = true;
  micBtn.classList.add("listening");
  micBtn.setAttribute("aria-label", "Stop speaking");
  const langName = sourceLang.value === "auto" ? "your browser's language" : LANG_BY_CODE[sourceLang.value].name;
  setStatus(`Listening in ${langName}… tap the mic again to stop.`);
});
