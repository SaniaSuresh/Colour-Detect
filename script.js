const URL = "https://teachablemachine.withgoogle.com/models/6kv3iqWni/";

const colourMap = {
  red: "#f87171",
  orange: "#fb923c",
  yellow: "#facc15",
  green: "#34d399",
  blue: "#60a5fa",
  purple: "#a78bfa",
  pink: "#f472b6",
  brown: "#a16207",
  black: "#475569",
  white: "#f8fafc",
  grey: "#94a3b8",
  cyan: "#22d3ee",
  lime: "#84cc16",
};

let model, webcam, labelContainer, maxPredictions;

function getColourHex(name) {
  const key = name.trim().toLowerCase();
  return colourMap[key] || "#64748b";
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

let assistButton = null;
let tapOverlay = null;
let screenReaderStatus = null;
let lastSpokenLabel = "";
let lastSpeechTime = 0;
let speechEnabled = true;
let speechVoice = null;

function getFemaleVoice() {
  const voices = window.speechSynthesis.getVoices() || [];
  const femaleKeywords = [
    'female', 'zira', 'samantha', 'alloy', 'haruka', 'kendra', 'violet', 'natalie', 'allison', 'amy', 'serena'
  ];
  return voices.find(v => femaleKeywords.some(keyword => v.name.toLowerCase().includes(keyword))) || voices[0] || null;
}

function ensureVoicesLoaded() {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      console.log('Voices already loaded:', voices.length);
      resolve();
      return;
    }
    
    let attempts = 0;
    const onVoicesChanged = () => {
      const newVoices = window.speechSynthesis.getVoices();
      console.log('voiceschanged event, voices:', newVoices.length);
      if (newVoices.length > 0) {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      }
    };
    
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    const timeout = setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      console.log('Voice loading timeout, resolving anyway');
      resolve();
    }, 3000);
  });
}

function speak(text, interrupt = true) {
  try {
    if (!speechEnabled || !window.speechSynthesis) {
      console.log('Speech not enabled or speechSynthesis unavailable');
      return;
    }
    if (!speechVoice) {
      speechVoice = getFemaleVoice();
    }
    if (interrupt) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = 'en-US';
    if (speechVoice) utterance.voice = speechVoice;
    utterance.onerror = (e) => console.error('Speech error:', e);
    window.speechSynthesis.speak(utterance);
    console.log('Speech started:', text.substring(0, 50));
  } catch (e) {
    console.error('Speech exception:', e);
  }
}

function announce(text, interrupt = true) {
  if (screenReaderStatus) {
    screenReaderStatus.innerText = text;
  }
  if (speechEnabled) {
    speak(text, interrupt);
  }
}

function speakPageContents() {
  const delay = 1000;
  setTimeout(async () => {
    try {
      if (!speechVoice && window.speechSynthesis) {
        await ensureVoicesLoaded();
        speechVoice = getFemaleVoice();
        console.log('Voice set after loading:', speechVoice ? speechVoice.name : 'none');
      }
      const msg = 'Welcome to Colour Detect. The read aloud option is for visually impaired people. Tap anywhere to enable camera access and speech guidance. Once the camera is enabled, hold an object in front of the camera to identify colours.';
      if (screenReaderStatus) {
        screenReaderStatus.innerText = msg;
      }
      if (speechEnabled && window.speechSynthesis) {
        speak(msg, true);
      }
    } catch (e) {
      console.error('Error in speakPageContents:', e);
    }
  }, delay);
}

function toggleSpeech() {
  speechEnabled = !speechEnabled;
  const button = document.querySelector('.speech-button');
  if (button) {
    button.textContent = speechEnabled ? 'Read aloud on' : 'Read aloud off';
    button.setAttribute('aria-pressed', String(speechEnabled));
  }
  if (speechEnabled) {
    announce('Read aloud enabled.');
  } else {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (screenReaderStatus) {
      screenReaderStatus.innerText = 'Read aloud disabled.';
    }
  }
}

function initAssist() {
  assistButton = document.getElementById('assist-button');
  tapOverlay = document.getElementById('tap-overlay');
  screenReaderStatus = document.getElementById('screen-reader-status');
  
  if (window.speechSynthesis) {
    ensureVoicesLoaded().then(() => {
      speechVoice = getFemaleVoice();
    });
    window.speechSynthesis.onvoiceschanged = () => {
      speechVoice = getFemaleVoice();
    };
  }
  
  if (tapOverlay) {
    tapOverlay.addEventListener('click', startFromTap);
  }
  if (assistButton) {
    assistButton.addEventListener('click', () => {
      assistButton.style.display = 'none';
      announce('Starting the camera now. Please allow camera access if prompted.');
      init();
    });
  }
  speakPageContents();
}

function startFromTap() {
  if (tapOverlay) {
    tapOverlay.style.display = 'none';
  }
  if (assistButton) {
    assistButton.style.display = 'none';
  }
  announce('Thanks. Starting the camera now. Please allow camera access if prompted.');
  init();
}

function toggleTheme() {
  const active = document.body.classList.toggle("theme-pastel");
  const button = document.querySelector(".theme-button");
  if (button) {
    button.textContent = active ? "Night mode theme" : "Forest garden theme";
  }
  announce(active ? 'Forest garden theme enabled.' : 'Night mode theme enabled.');
}

window.addEventListener('load', initAssist);

async function init() {
  const modelURL = URL + "model.json";
  const metadataURL = URL + "metadata.json";
  const container = document.getElementById("webcam-container");
  const statusContainer = document.getElementById("label-container");

  if (assistButton) {
    assistButton.style.display = "none";
  }
  if (tapOverlay) {
    tapOverlay.style.display = "none";
  }

  container.innerHTML = "";
  statusContainer.innerHTML = "<div>Starting camera and loading model&hellip;</div>";

  try {
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    const flip = true;
    webcam = new tmImage.Webcam(360, 360, flip);
    await webcam.setup();
    await webcam.play();
    window.requestAnimationFrame(loop);

    container.innerHTML = "";
    container.appendChild(webcam.canvas);

    labelContainer = statusContainer;
    labelContainer.innerHTML = "";
    for (let i = 0; i < maxPredictions; i++) {
      const labelElement = document.createElement("div");
      labelElement.className = "label-chip";
      labelElement.setAttribute("data-index", i);
      labelElement.innerHTML = `
        <span class="label-title">Label ${i + 1}</span>
        <span class="label-score">0%</span>
      `;
      labelContainer.appendChild(labelElement);
    }
  } catch (error) {
    statusContainer.innerHTML = "<div>Unable to start the camera or load the model. Please open this page from a secure origin (HTTPS or localhost) and allow camera access.</div>";
    console.error(error);
  }
}

async function loop() {
  if (!webcam || !model) return;
  webcam.update();
  await predict();
  window.requestAnimationFrame(loop);
}

async function predict() {
  const prediction = await model.predict(webcam.canvas);
  const items = prediction.map((result, index) => ({ ...result, index }));
  const sorted = items.slice().sort((a, b) => b.probability - a.probability);
  const top = sorted[0] || { index: 0, probability: 0, className: "unknown" };
  const second = sorted[1] || { probability: 0, className: "" };

  const now = Date.now();
  let topSpeech = "";
  if (top.probability >= 0.3 && second.probability >= 0.25) {
    topSpeech = `Mostly ${top.className} with some ${second.className}.`;
  } else if (top.probability >= 0.2) {
    topSpeech = `${top.className} is most likely detected.`;
  } else {
    topSpeech = `Unable to clearly identify a single colour yet. Keep the object in view.`;
  }

  if (top.className !== lastSpokenLabel || now - lastSpeechTime > 4000) {
    announce(topSpeech);
    lastSpokenLabel = top.className;
    lastSpeechTime = now;
  }

  items.forEach((result) => {
    const labelElement = labelContainer.childNodes[result.index];
    const labelTitle = labelElement.querySelector(".label-title");
    const scoreSpan = labelElement.querySelector(".label-score");
    const score = (result.probability * 100).toFixed(1);
    const colour = getColourHex(result.className);
    const rgb = hexToRgb(colour);
    const alpha = Math.max(0.18, result.probability * 0.65);

    labelElement.classList.toggle("active", result.index === top.index);
    labelElement.style.backgroundColor = `rgba(${rgb}, ${alpha})`;
    labelElement.style.borderColor = `rgba(${rgb}, ${Math.min(0.65, alpha + 0.15)})`;
    labelElement.style.color = result.className.toLowerCase() === "white" ? "#0f172a" : "#f8fafc";

    labelTitle.textContent = result.className;
    scoreSpan.textContent = `${score}%`;
  });
}
