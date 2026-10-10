
// ---------- Settings ----------
const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "gemma3:270m";
const TIMEOUT_MS = 90000; // the first request can be slow while the model loads

// ---------- Page elements ----------
const generateBtn = document.getElementById("generate");
const loadingEl = document.getElementById("loading");
const noticeEl = document.getElementById("notice");
const resultsEl = document.getElementById("results");
const resultsTitleEl = document.getElementById("results-title");
const sourceTagEl = document.getElementById("source-tag");
const cardsEl = document.getElementById("cards");

// ---------- Fallback challenges ----------
// Used only when AI generation fails. They are always labelled as fallbacks.
const FALLBACK_CHALLENGES = [
  { title: "Two greens", task: "Find a leaf with two different shades of green on it." },
  { title: "Sound map", task: "Stand still for one minute and count how many different sounds you can hear." },
  { title: "Bark patterns", task: "Look closely at a tree trunk and find an interesting pattern in the bark." },
  { title: "Cloud watch", task: "Look up, pick one cloud, and describe its shape to yourself." },
  { title: "Three textures", task: "Find three different textures in nature, such as rough, smooth, and soft." },
  { title: "Tiny world", task: "Find the smallest living thing you can see and watch it for a moment." },
  { title: "Shadow shapes", task: "Look for a shadow made by a plant or tree and notice what shape it makes." },
  { title: "Color hunt", task: "Find something natural in three different colors, such as a flower, a leaf, and a stone." },
  { title: "Wind check", task: "Notice which way the wind is moving by watching leaves, grass, or branches." },
];

// ---------- Prompt ----------
function buildPrompt(minutes) {
  return [
    "You write short outdoor activities for people of all ages.",
    `Write exactly 3 challenges that can each be done in about ${minutes} minutes or less.`,
    "Rules:",
    "- Each challenge is about noticing or finding something in nature.",
    "- Each challenge is safe, simple, and needs no equipment.",
    "- Never ask anyone to eat, taste, climb, swim, or touch animals.",
    "- Do not mention phones, photos, or screens.",
    "- The title is 2 to 4 words. The task is one short sentence.",
    'Reply with JSON only, like: {"challenges":[{"title":"...","task":"..."}]}',
  ].join("\n");
}


const RESPONSE_SHAPE = {
  type: "object",
  properties: {
    challenges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          task: { type: "string" },
        },
        required: ["title", "task"],
      },
    },
  },
  required: ["challenges"],
};

// ---------- Talking to Ollama ----------
async function askOllama(minutes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: buildPrompt(minutes) }],
        format: RESPONSE_SHAPE,
        stream: false,
        options: { temperature: 0.8 }, 
      }),
    });

    if (!response.ok) {
      
      const err = new Error(`Ollama returned status ${response.status}`);
      err.kind = response.status === 404 ? "model-missing" : "http";
      throw err;
    }

    const data = await response.json();
    return data.message && data.message.content ? data.message.content : "";
  } catch (error) {
    if (error.kind) throw error;
    //error
    const err = new Error(error.message);
    err.kind = error.name === "AbortError" ? "timeout" : "unreachable";
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Validating the AI answer ----------
// Words we do not want in challenges, even if the model ignores the rules.
const UNSAFE_OR_OFF_TOPIC =
  /\b(eat|taste|drink|climb|swim|wade|fire|knife|stranger|cliff|traffic|road|poison|snake|spider|mushroom|berry|berries|trespass|dark|phone|photo|picture|screen|app)\b/i;

// Returns an array of exactly 3 clean challenges, or throws if we can't.
function parseChallenges(rawText) {
  let parsed;
  try {
    
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw badAnswer("The reply was not valid JSON.");
  }

  if (!parsed || !Array.isArray(parsed.challenges)) {
    throw badAnswer("The reply had no challenges list.");
  }

  const good = [];
  const seen = new Set();

  for (const item of parsed.challenges) {
    if (!item || typeof item.title !== "string" || typeof item.task !== "string") continue;

    const title = item.title.trim();
    const task = item.task.trim();

    if (title.length < 3 || title.length > 40) continue;
    if (task.length < 12 || task.length > 160) continue;
    if (UNSAFE_OR_OFF_TOPIC.test(title + " " + task)) continue;
    if (/https?:|www\./i.test(title + task)) continue;

    const key = task.toLowerCase();
    if (seen.has(key)) continue; // skip duplicates
    seen.add(key);

    good.push({ title, task });
  }

  if (good.length < 3) {
    throw badAnswer(`Only ${good.length} usable challenge(s) came back.`);
  }
  return good.slice(0, 3); // if the model gave extras, keep the first three
}

function badAnswer(message) {
  const err = new Error(message);
  err.kind = "malformed";
  return err;
}

// ---------- Showing things on the page ----------
function setLoading(isLoading) {
  loadingEl.hidden = !isLoading;
  generateBtn.disabled = isLoading;
  generateBtn.textContent = isLoading ? "Generating..." : "Generate Nature Quest";
}


function showNotice(paragraphs) {
  noticeEl.replaceChildren();
  for (const part of paragraphs) {
    const p = document.createElement("p");
    if (typeof part === "string") {
      p.textContent = part;
    } else {
      
      p.append(part[0]);
      const code = document.createElement("code");
      code.textContent = part[1];
      p.append(code);
    }
    noticeEl.append(p);
  }
  noticeEl.hidden = false;
}

function hideNotice() {
  noticeEl.hidden = true;
  noticeEl.replaceChildren();
}

function showChallenges(challenges, minutes, isFallback) {
  resultsTitleEl.textContent = `Your ${minutes}-minute quest`;

  sourceTagEl.textContent = isFallback
    ? "Fallback challenges: these are built into the app and were not written by AI."
    : `Written by ${MODEL} on your computer.`;
  sourceTagEl.classList.toggle("is-fallback", isFallback);

  cardsEl.replaceChildren();
  for (const c of challenges) {
    const li = document.createElement("li");
    li.className = "card";

    const h3 = document.createElement("h3");
    h3.textContent = c.title;

    const p = document.createElement("p");
    p.textContent = c.task;

    li.append(h3, p);
    cardsEl.append(li);
  }

  resultsEl.hidden = false;
  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Pick 3 different fallback challenges at random.
function pickFallbacks() {
  const pool = [...FALLBACK_CHALLENGES];
  const picked = [];
  while (picked.length < 3) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

// Friendly, specific explanation for each kind of failure.
function explainError(kind) {
  switch (kind) {
    case "unreachable":
      return [
        "Nature Quest could not reach Ollama.",
        "Make sure Ollama is running, and that you opened this page from a local web server (for example http://localhost:8000) rather than by double-clicking the file.",
      ];
    case "model-missing":
      return [
        "Ollama is running, but the Gemma model is not downloaded yet.",
        ["Download it with: ", "ollama pull gemma3:270m"],
      ];
    case "timeout":
      return [
        "Ollama took too long to answer.",
        "The first request can be slow while the model loads. Try again in a moment.",
      ];
    case "malformed":
      return [
        "The AI answered, but not in a form we could use.",
        "Small models sometimes do this. Try again, or enjoy the fallback challenges below.",
      ];
    default:
      return [
        "Something went wrong while asking Ollama for challenges.",
        "Check that Ollama is running and try again.",
      ];
  }
}

// ---------- Main action ----------
async function handleGenerate() {
  const minutes = document.querySelector('input[name="minutes"]:checked').value;

  hideNotice();
  resultsEl.hidden = true;
  setLoading(true);

  try {
    const rawText = await askOllama(minutes);
    const challenges = parseChallenges(rawText);
    showChallenges(challenges, minutes, false);
  } catch (error) {
    console.error("Nature Quest:", error);
    showNotice(explainError(error.kind));
    showChallenges(pickFallbacks(), minutes, true);
  } finally {
    setLoading(false);
  }
}

generateBtn.addEventListener("click", handleGenerate);
