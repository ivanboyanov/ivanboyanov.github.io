import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, addDoc,
  deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig, firebaseConfigured, ADMIN_DISPLAY_NAME } from "./firebase-config.js";
import { BUILTIN_VERBS, BUILTIN_LISTS, TYPES, TYPE_ORDER, conjugateRegular } from "./verbs.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const PRONOUNS = [
  { key: "ich", label: "ich", prompt: "ich", slot: 0 },
  { key: "du", label: "du", prompt: "du", slot: 1 },
  { key: "er", label: "er", prompt: "er", slot: 2 },
  { key: "sie_sg", label: "sie", prompt: "sie – Singular", slot: 2 },
  { key: "es", label: "es", prompt: "es", slot: 2 },
  { key: "wir", label: "wir", prompt: "wir", slot: 3 },
  { key: "ihr", label: "ihr", prompt: "ihr", slot: 4 },
  { key: "sie_pl", label: "sie", prompt: "sie – Plural", slot: 5 },
  { key: "Sie", label: "Sie", prompt: "Sie", slot: 5 }
];

const state = {
  auth: null,
  db: null,
  user: null,
  isAdmin: false,
  verbs: [...BUILTIN_VERBS],
  publicLists: [...BUILTIN_LISTS],
  selectedTypes: new Set(TYPE_ORDER),
  selectedList: "all",
  currentCard: null,
  flipped: false,
  recentCards: [],
  session: { cards: 0, known: 0 },
  guestProgress: {},
  userData: defaultUserData("Gast"),
  audioEnabled: localStorage.getItem("verbfit-audio") === "true",
  authMode: "login",
  editingPersonalListId: null,
  personalSelection: new Set(),
  publicSelection: new Set(),
  saveTimer: null
};

function defaultUserData(username) {
  return {
    username,
    progress: {},
    dailyCards: {},
    stats: { total: 0, known: 0 },
    personalLists: []
  };
}

function sanitizeUserData(data, fallbackName) {
  return {
    username: String(data?.username || fallbackName || "Lernende Person"),
    progress: data?.progress && typeof data.progress === "object" ? data.progress : {},
    dailyCards: data?.dailyCards && typeof data.dailyCards === "object" ? data.dailyCards : {},
    stats: {
      total: Number(data?.stats?.total || 0),
      known: Number(data?.stats?.known || 0)
    },
    personalLists: Array.isArray(data?.personalLists) ? data.personalLists.slice(0, 3) : []
  };
}

function normalizeUsername(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

async function usernameToTechnicalEmail(username) {
  const bytes = new TextEncoder().encode(`verbfit:${normalizeUsername(username)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `u.${hash}@users.verbfit.invalid`;
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previousDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d - 1, 12);
  return todayKey(date);
}

function calculateStreak(dailyCards) {
  let cursor = todayKey();
  if ((dailyCards[cursor] || 0) < 15) cursor = previousDay(cursor);
  let streak = 0;
  while ((dailyCards[cursor] || 0) >= 15) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

function currentProgressStore() {
  return state.user ? state.userData.progress : state.guestProgress;
}

function cardKey(verbId, pronounKey) {
  return `${verbId}::${pronounKey}`;
}

function getVerbById(id) {
  return state.verbs.find(verb => verb.id === id);
}

function currentListVerbIds() {
  if (state.selectedList === "all") return null;
  const [kind, id] = state.selectedList.split(":");
  let list;
  if (kind === "builtin" || kind === "public") list = state.publicLists.find(item => item.id === id);
  if (kind === "personal") list = state.userData.personalLists.find(item => item.id === id);
  return list ? new Set(list.verbIds) : null;
}

function availableVerbs() {
  const ids = currentListVerbIds();
  return state.verbs.filter(verb => state.selectedTypes.has(verb.type) && (!ids || ids.has(verb.id)));
}

function weightedChoice(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let target = Math.random() * total;
  for (const item of items) {
    target -= item.weight;
    if (target <= 0) return item;
  }
  return items.at(-1);
}

function chooseNextCard() {
  const verbs = availableVerbs();
  if (!verbs.length) {
    state.currentCard = null;
    renderCard();
    return;
  }

  const progress = currentProgressStore();
  const recent = new Set(state.recentCards);
  let candidates = [];

  for (const verb of verbs) {
    for (const pronoun of PRONOUNS) {
      const key = cardKey(verb.id, pronoun.key);
      const record = progress[key] || {};
      let weight = Number(record.weight || 1);
      if (recent.has(key)) weight *= 0.06;
      if (state.currentCard?.verb.id === verb.id) weight *= 0.35;
      candidates.push({ verb, pronoun, key, weight: Math.max(.01, weight) });
    }
  }

  const selected = weightedChoice(candidates);
  state.currentCard = selected;
  state.flipped = false;
  state.recentCards.unshift(selected.key);
  state.recentCards = state.recentCards.slice(0, 6);
  renderCard();
  if (state.audioEnabled) speakFront();
}

function renderCard() {
  const empty = !state.currentCard;
  $("#cardScene").hidden = empty;
  $("#showAnswerButton").hidden = empty;
  $("#emptyState").hidden = !empty;
  $("#answerActions").classList.remove("visible");

  if (empty) return;
  const { verb, pronoun } = state.currentCard;
  $("#frontInfinitive").textContent = verb.infinitive;
  $("#frontPronoun").textContent = `(${pronoun.prompt})`;
  $("#backAnswer").textContent = `${pronoun.label} ${verb.forms[pronoun.slot]}`;
  $("#backInfinitive").textContent = verb.infinitive;
  $("#typeBadge").textContent = verb.type === TYPES.ABSOLUTE ? `⭐ ${verb.type}` : verb.type;
  $("#flashcard").classList.remove("flipped");
  $("#flashcard").setAttribute("aria-pressed", "false");
  $("#showAnswerButton").hidden = false;
}

function revealAnswer(forceBack = false) {
  if (!state.currentCard) return;
  if (!state.flipped || forceBack) {
    state.flipped = true;
    $("#flashcard").classList.add("flipped");
    $("#flashcard").setAttribute("aria-pressed", "true");
    $("#answerActions").classList.add("visible");
    $("#showAnswerButton").hidden = true;
    if (state.audioEnabled) speakBack();
  } else {
    state.flipped = false;
    $("#flashcard").classList.remove("flipped");
    $("#flashcard").setAttribute("aria-pressed", "false");
    if (state.audioEnabled) speakFront();
  }
}

function rateCard(known) {
  if (!state.currentCard) return;
  const progress = currentProgressStore();
  const key = state.currentCard.key;
  const old = progress[key] || { weight: 1, correct: 0, wrong: 0 };
  progress[key] = {
    weight: known ? Math.max(.35, Number(old.weight || 1) * .72) : Math.min(20, Number(old.weight || 1) * 1.8 + .75),
    correct: Number(old.correct || 0) + (known ? 1 : 0),
    wrong: Number(old.wrong || 0) + (known ? 0 : 1)
  };

  state.session.cards += 1;
  if (known) state.session.known += 1;

  if (state.user) {
    state.userData.progress = progress;
    state.userData.stats.total += 1;
    if (known) state.userData.stats.known += 1;
    const today = todayKey();
    state.userData.dailyCards[today] = Number(state.userData.dailyCards[today] || 0) + 1;
    scheduleUserSave();
  }

  updateStatsUI();
  window.setTimeout(chooseNextCard, 180);
}

function updateStatsUI() {
  const sessionRate = state.session.cards ? Math.round(state.session.known / state.session.cards * 100) + "%" : "–";
  $("#sessionCards").textContent = state.session.cards;
  $("#sessionKnown").textContent = state.session.known;
  $("#sessionRate").textContent = sessionRate;

  const total = state.user ? state.userData.stats.total : state.session.cards;
  const known = state.user ? state.userData.stats.known : state.session.known;
  const rate = total ? Math.round(known / total * 100) + "%" : "–";
  const streak = state.user ? calculateStreak(state.userData.dailyCards) : 0;
  const todayCards = state.user ? Number(state.userData.dailyCards[todayKey()] || 0) : state.session.cards;
  const progress = Math.min(15, todayCards);

  $("#totalCards").textContent = total;
  $("#totalKnown").textContent = known;
  $("#overallRate").textContent = rate;
  $("#profileStreak").textContent = `${streak} 🔥`;
  $("#streakCount").textContent = streak;
  $("#dailyProgressBar").style.width = `${progress / 15 * 100}%`;
  $("#dailyHint").textContent = progress >= 15
    ? "Super! Der heutige Übungstag zählt für deine Serie."
    : `Noch ${15 - progress} ${15 - progress === 1 ? "Karte" : "Karten"} für den heutigen Übungstag.`;
}

function updateProfileUI() {
  const name = state.user ? state.userData.username : "Gast";
  $("#profileName").textContent = name;
  $("#profileTitle").textContent = name;
  $("#avatar").textContent = name.trim().charAt(0).toLocaleUpperCase("de-DE") || "G";
  $("#guestBanner").hidden = Boolean(state.user);
  $("#logoutButton").hidden = !state.user;
  $("#profileLoginButton").hidden = Boolean(state.user);
  $("#manageListsButton").hidden = !state.user;
  $("#openAdminButton").hidden = !state.isAdmin;
  updateStatsUI();
  renderListSelect();
}

function renderTypeFilters() {
  const container = $("#typeFilters");
  container.innerHTML = "";
  TYPE_ORDER.forEach(type => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.selectedTypes.has(type);
    input.addEventListener("change", () => {
      if (input.checked) state.selectedTypes.add(type); else state.selectedTypes.delete(type);
      chooseNextCard();
    });
    const span = document.createElement("span");
    span.textContent = type === TYPES.ABSOLUTE ? `⭐ ${type}` : type;
    label.append(input, span);
    container.append(label);
  });
}

function renderListSelect() {
  const select = $("#listSelect");
  const current = state.selectedList;
  select.innerHTML = '<option value="all">Alle Verben</option>';

  const builtins = state.publicLists.filter(list => list.builtin);
  const remote = state.publicLists.filter(list => !list.builtin);
  addOptionGroup(select, "VerbFit-Listen", builtins, "builtin");
  if (remote.length) addOptionGroup(select, "Öffentliche Listen", remote, "public");
  if (state.userData.personalLists.length) addOptionGroup(select, "Meine Listen", state.userData.personalLists, "personal");

  const valid = [...select.options].some(option => option.value === current);
  state.selectedList = valid ? current : "all";
  select.value = state.selectedList;
}

function addOptionGroup(select, label, lists, kind) {
  const group = document.createElement("optgroup");
  group.label = label;
  lists.forEach(list => {
    const option = document.createElement("option");
    option.value = `${kind}:${list.id}`;
    option.textContent = `${list.title} (${list.verbIds.length})`;
    group.append(option);
  });
  select.append(group);
}

function updateAudioUI() {
  $("#audioToggle").setAttribute("aria-pressed", String(state.audioEnabled));
  $("#audioIcon").textContent = state.audioEnabled ? "🔊" : "🔇";
  $("#audioLabel").textContent = state.audioEnabled ? "Vorlesen an" : "Vorlesen aus";
  localStorage.setItem("verbfit-audio", String(state.audioEnabled));
}

function germanVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = speechSynthesis.getVoices();
  return voices.find(v => v.lang.toLowerCase() === "de-de") || voices.find(v => v.lang.toLowerCase().startsWith("de")) || null;
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    toast("Dieser Browser unterstützt keine Sprachausgabe.");
    state.audioEnabled = false;
    updateAudioUI();
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = .88;
  const voice = germanVoice();
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

function speakFront() {
  if (!state.currentCard) return;
  speak(`${state.currentCard.verb.infinitive}. ${state.currentCard.pronoun.prompt}.`);
}

function speakBack() {
  if (!state.currentCard) return;
  const { verb, pronoun } = state.currentCard;
  speak(`${pronoun.label} ${verb.forms[pronoun.slot]}`);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog?.open) dialog.close();
}

function scheduleUserSave() {
  if (!state.user || !state.db) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveUserData, 350);
}

async function saveUserData() {
  if (!state.user || !state.db) return;
  try {
    await setDoc(doc(state.db, "users", state.user.uid), {
      username: state.userData.username,
      progress: state.userData.progress,
      dailyCards: state.userData.dailyCards,
      stats: state.userData.stats,
      personalLists: state.userData.personalLists,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error(error);
    toast("Speichern nicht möglich. Prüfe die Internetverbindung.");
  }
}

async function loadPublicData() {
  if (!state.db) return;
  try {
    const [verbSnapshot, listSnapshot] = await Promise.all([
      getDocs(collection(state.db, "verbs")),
      getDocs(collection(state.db, "publicLists"))
    ]);

    const customVerbs = verbSnapshot.docs.map(item => ({ id: item.id, ...item.data(), source: "admin" }))
      .filter(verb => verb.infinitive && Array.isArray(verb.forms) && verb.forms.length === 6);
    const merged = new Map(BUILTIN_VERBS.map(verb => [verb.id, verb]));
    customVerbs.forEach(verb => merged.set(verb.id, verb));
    state.verbs = [...merged.values()].sort((a,b) => a.infinitive.localeCompare(b.infinitive, "de"));

    const remoteLists = listSnapshot.docs.map(item => ({ id: item.id, ...item.data(), builtin: false }))
      .filter(list => list.active !== false && Array.isArray(list.verbIds));
    state.publicLists = [...BUILTIN_LISTS, ...remoteLists];
    renderListSelect();
    refreshVerbGrids();
    chooseNextCard();
  } catch (error) {
    console.error(error);
    toast("Öffentliche Firebase-Daten konnten nicht geladen werden. Die eingebauten Verben funktionieren weiter.");
  }
}

async function handleAuthChange(user) {
  state.user = user;
  state.isAdmin = false;
  if (!user) {
    state.userData = defaultUserData("Gast");
    updateProfileUI();
    chooseNextCard();
    return;
  }

  try {
    const userRef = doc(state.db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);
    if (userSnapshot.exists()) {
      state.userData = sanitizeUserData(userSnapshot.data(), user.displayName);
    } else {
      state.userData = defaultUserData(user.displayName || "Lernende Person");
      await setDoc(userRef, { ...state.userData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }

    const adminSnapshot = await getDoc(doc(state.db, "admins", user.uid));
    state.isAdmin = adminSnapshot.exists() && adminSnapshot.data().active === true;
  } catch (error) {
    console.error(error);
    toast("Das Profil konnte nicht vollständig geladen werden.");
    state.userData = defaultUserData(user.displayName || "Lernende Person");
  }

  updateProfileUI();
  refreshVerbGrids();
  chooseNextCard();
}

function firebaseMessage(error) {
  const code = error?.code || "";
  if (code.includes("email-already-in-use")) return "Dieser Benutzername ist bereits vergeben.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Benutzername oder Passwort ist falsch.";
  if (code.includes("weak-password")) return "Das Passwort muss mindestens 6 Zeichen haben.";
  if (code.includes("too-many-requests")) return "Zu viele Versuche. Bitte probiere es später erneut.";
  if (code.includes("network-request-failed")) return "Keine Verbindung zu Firebase.";
  return "Das hat leider nicht funktioniert. Prüfe deine Eingaben und die Firebase-Einstellungen.";
}

function setAuthMode(mode) {
  state.authMode = mode;
  const login = mode === "login";
  $("#loginTab").classList.toggle("active", login);
  $("#registerTab").classList.toggle("active", !login);
  $("#authTitle").textContent = login ? "Anmelden" : "Registrieren";
  $("#authSubmit").textContent = login ? "Anmelden" : "Konto erstellen";
  $("#authPassword").autocomplete = login ? "current-password" : "new-password";
  $("#authError").textContent = "";
}

async function submitAuth(event) {
  event.preventDefault();
  if (!firebaseConfigured || !state.auth) {
    $("#authError").textContent = "Firebase ist noch nicht eingerichtet. Folge der README-Anleitung.";
    return;
  }

  const username = $("#authUsername").value.trim();
  const password = $("#authPassword").value;
  if (username.length < 3) {
    $("#authError").textContent = "Der Benutzername braucht mindestens 3 Zeichen.";
    return;
  }

  $("#authSubmit").disabled = true;
  $("#authError").textContent = "";
  try {
    const email = await usernameToTechnicalEmail(username);
    if (state.authMode === "register") {
      const credential = await createUserWithEmailAndPassword(state.auth, email, password);
      await updateProfile(credential.user, { displayName: username });
      state.userData = defaultUserData(username);
      await setDoc(doc(state.db, "users", credential.user.uid), {
        ...state.userData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast("Konto erstellt. Dein Fortschritt wird jetzt gespeichert.");
    } else {
      await signInWithEmailAndPassword(state.auth, email, password);
      toast("Willkommen zurück!");
    }
    closeDialog("authDialog");
    $("#authForm").reset();
  } catch (error) {
    console.error(error);
    $("#authError").textContent = firebaseMessage(error);
  } finally {
    $("#authSubmit").disabled = false;
  }
}

function slugId(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ä","ae").replaceAll("ö","oe").replaceAll("ü","ue").replaceAll("ß","ss")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

function refreshVerbGrids() {
  renderPersonalListsOverview();
  renderVerbCheckboxGrid("personal");
  renderVerbCheckboxGrid("public");
  renderAdminPublicLists();
}

function renderVerbCheckboxGrid(kind) {
  const isPersonal = kind === "personal";
  const grid = isPersonal ? $("#personalVerbGrid") : $("#publicVerbGrid");
  const search = (isPersonal ? $("#personalVerbSearch") : $("#publicVerbSearch"))?.value.trim().toLocaleLowerCase("de-DE") || "";
  const selection = isPersonal ? state.personalSelection : state.publicSelection;
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = state.verbs.filter(verb => verb.infinitive.toLocaleLowerCase("de-DE").includes(search));
  for (const verb of filtered) {
    const label = document.createElement("label");
    label.className = "verb-choice";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selection.has(verb.id);
    input.addEventListener("change", () => {
      if (input.checked) selection.add(verb.id); else selection.delete(verb.id);
      updateSelectionCounts();
    });
    const span = document.createElement("span");
    span.textContent = verb.infinitive;
    span.title = verb.type;
    label.append(input, span);
    grid.append(label);
  }
  updateSelectionCounts();
}

function updateSelectionCounts() {
  $("#personalSelectionCount").textContent = state.personalSelection.size;
  $("#publicSelectionCount").textContent = state.publicSelection.size;
}

function renderPersonalListsOverview() {
  const box = $("#personalListsOverview");
  if (!box) return;
  box.innerHTML = "";
  if (!state.userData.personalLists.length) {
    box.innerHTML = '<p class="form-note">Du hast noch keine persönliche Liste. Du kannst bis zu drei Listen speichern.</p>';
  }
  state.userData.personalLists.forEach(list => {
    const row = document.createElement("div");
    row.className = "saved-list";
    row.innerHTML = `<div><strong></strong><small>${list.verbIds.length} Verben</small></div>`;
    row.querySelector("strong").textContent = list.title;
    const actions = document.createElement("div");
    actions.className = "saved-list-actions";
    const edit = miniButton("Bearbeiten", () => editPersonalList(list.id));
    const remove = miniButton("Löschen", () => deletePersonalList(list.id), true);
    actions.append(edit, remove);
    row.append(actions);
    box.append(row);
  });

  const atLimit = state.userData.personalLists.length >= 3 && !state.editingPersonalListId;
  $("#savePersonalListButton").disabled = atLimit;
  $("#savePersonalListButton").textContent = state.editingPersonalListId ? "Änderungen speichern" : atLimit ? "Maximal 3 Listen" : "Liste speichern";
}

function miniButton(text, handler, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `mini-button${danger ? " delete" : ""}`;
  button.textContent = text;
  button.addEventListener("click", handler);
  return button;
}

function editPersonalList(id) {
  const list = state.userData.personalLists.find(item => item.id === id);
  if (!list) return;
  state.editingPersonalListId = id;
  state.personalSelection = new Set(list.verbIds);
  $("#personalListName").value = list.title;
  renderVerbCheckboxGrid("personal");
  renderPersonalListsOverview();
  $("#personalListName").focus();
}

function deletePersonalList(id) {
  state.userData.personalLists = state.userData.personalLists.filter(list => list.id !== id);
  if (state.editingPersonalListId === id) resetPersonalEditor();
  if (state.selectedList === `personal:${id}`) state.selectedList = "all";
  scheduleUserSave();
  renderListSelect();
  refreshVerbGrids();
  chooseNextCard();
  toast("Liste gelöscht.");
}

function resetPersonalEditor() {
  state.editingPersonalListId = null;
  state.personalSelection = new Set();
  $("#personalListName").value = "";
  $("#personalVerbSearch").value = "";
}

function savePersonalList() {
  $("#listError").textContent = "";
  if (!state.user) {
    $("#listError").textContent = "Bitte melde dich zuerst an.";
    return;
  }
  const title = $("#personalListName").value.trim();
  if (!title) {
    $("#listError").textContent = "Gib der Liste einen Namen.";
    return;
  }
  if (!state.personalSelection.size) {
    $("#listError").textContent = "Wähle mindestens ein Verb aus.";
    return;
  }

  const list = { id: state.editingPersonalListId || `${slugId(title) || "liste"}-${Date.now()}`, title, verbIds: [...state.personalSelection] };
  if (state.editingPersonalListId) {
    state.userData.personalLists = state.userData.personalLists.map(item => item.id === list.id ? list : item);
  } else {
    if (state.userData.personalLists.length >= 3) {
      $("#listError").textContent = "Du kannst maximal drei persönliche Listen haben.";
      return;
    }
    state.userData.personalLists.push(list);
  }

  scheduleUserSave();
  resetPersonalEditor();
  renderListSelect();
  refreshVerbGrids();
  toast("Persönliche Liste gespeichert.");
}

function populateAdminTypes() {
  const select = $("#adminType");
  select.innerHTML = "";
  TYPE_ORDER.forEach(type => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    select.append(option);
  });
}

function autoFillAdminForms() {
  $("#adminVerbError").textContent = "";
  if ($("#adminType").value !== TYPES.REGULAR) {
    $("#adminVerbError").textContent = "Die automatische Bildung ist nur für „Regelmäßig“ vorgesehen.";
    return;
  }
  const infinitive = $("#adminInfinitive").value.trim().toLocaleLowerCase("de-DE");
  if (!infinitive) {
    $("#adminVerbError").textContent = "Gib zuerst den Infinitiv ein.";
    return;
  }
  const separable = $("#adminSeparable").checked;
  const prefix = $("#adminPrefix").value.trim().toLocaleLowerCase("de-DE");
  if (separable && (!prefix || !infinitive.startsWith(prefix))) {
    $("#adminVerbError").textContent = "Bei einem trennbaren Verb muss das passende Präfix angegeben werden.";
    return;
  }
  const forms = conjugateRegular(infinitive, { separable, prefix });
  ["#formIch","#formDu","#formEr","#formWir","#formIhr","#formSie"].forEach((selector, index) => $(selector).value = forms[index]);
}

async function saveAdminVerb() {
  $("#adminVerbError").textContent = "";
  if (!state.isAdmin || !state.db) return;
  const infinitive = $("#adminInfinitive").value.trim().toLocaleLowerCase("de-DE");
  const forms = ["#formIch","#formDu","#formEr","#formWir","#formIhr","#formSie"].map(selector => $(selector).value.trim());
  const type = $("#adminType").value;
  const separable = $("#adminSeparable").checked;
  const prefix = $("#adminPrefix").value.trim().toLocaleLowerCase("de-DE");

  if (!infinitive || forms.some(form => !form)) {
    $("#adminVerbError").textContent = "Infinitiv und alle sechs Formen sind erforderlich.";
    return;
  }
  if (state.verbs.some(verb => verb.infinitive.toLocaleLowerCase("de-DE") === infinitive)) {
    $("#adminVerbError").textContent = "Dieses Verb ist bereits vorhanden.";
    return;
  }
  if (separable && !prefix) {
    $("#adminVerbError").textContent = "Gib das trennbare Präfix ein.";
    return;
  }

  const id = `${slugId(infinitive)}-${Date.now()}`;
  const data = { infinitive, forms, type, separable, prefix: separable ? prefix : "", createdAt: serverTimestamp(), createdBy: state.user.uid };
  try {
    await setDoc(doc(state.db, "verbs", id), data);
    state.verbs.push({ id, ...data, source: "admin" });
    state.verbs.sort((a,b) => a.infinitive.localeCompare(b.infinitive, "de"));
    ["#adminInfinitive","#adminPrefix","#formIch","#formDu","#formEr","#formWir","#formIhr","#formSie"].forEach(selector => $(selector).value = "");
    $("#adminSeparable").checked = false;
    $("#adminPrefix").disabled = true;
    refreshVerbGrids();
    chooseNextCard();
    toast("Das Verb ist jetzt für alle sichtbar.");
  } catch (error) {
    console.error(error);
    $("#adminVerbError").textContent = "Das Verb konnte nicht gespeichert werden. Prüfe Adminrolle und Firestore-Regeln.";
  }
}

async function savePublicList() {
  $("#adminListError").textContent = "";
  if (!state.isAdmin || !state.db) return;
  const title = $("#publicListTitle").value.trim();
  const description = $("#publicListDescription").value.trim();
  if (!title) {
    $("#adminListError").textContent = "Gib der Liste einen Titel.";
    return;
  }
  if (!state.publicSelection.size) {
    $("#adminListError").textContent = "Wähle mindestens ein Verb aus.";
    return;
  }
  try {
    const data = { title, description, verbIds: [...state.publicSelection], active: true, createdAt: serverTimestamp(), createdBy: state.user.uid };
    const reference = await addDoc(collection(state.db, "publicLists"), data);
    state.publicLists.push({ id: reference.id, ...data, builtin: false });
    state.publicSelection = new Set();
    $("#publicListTitle").value = "";
    $("#publicListDescription").value = "";
    $("#publicVerbSearch").value = "";
    renderListSelect();
    refreshVerbGrids();
    toast("Die Liste ist jetzt für alle sichtbar.");
  } catch (error) {
    console.error(error);
    $("#adminListError").textContent = "Die Liste konnte nicht gespeichert werden.";
  }
}

function renderAdminPublicLists() {
  const box = $("#adminPublicLists");
  if (!box) return;
  box.innerHTML = "";
  const lists = state.publicLists.filter(list => !list.builtin);
  if (!lists.length) {
    box.innerHTML = '<p class="form-note">Noch keine eigenen öffentlichen Listen.</p>';
    return;
  }
  lists.forEach(list => {
    const row = document.createElement("div");
    row.className = "saved-list";
    row.innerHTML = `<div><strong></strong><small>${list.verbIds.length} Verben</small></div>`;
    row.querySelector("strong").textContent = list.title;
    row.append(miniButton("Löschen", () => deletePublicList(list.id), true));
    box.append(row);
  });
}

async function deletePublicList(id) {
  if (!state.isAdmin || !state.db) return;
  try {
    await deleteDoc(doc(state.db, "publicLists", id));
    state.publicLists = state.publicLists.filter(list => list.id !== id);
    if (state.selectedList === `public:${id}`) state.selectedList = "all";
    renderListSelect();
    renderAdminPublicLists();
    chooseNextCard();
    toast("Öffentliche Liste gelöscht.");
  } catch (error) {
    console.error(error);
    toast("Die Liste konnte nicht gelöscht werden.");
  }
}

function switchAdminTab(tab) {
  $$('[data-admin-tab]').forEach(button => button.classList.toggle("active", button.dataset.adminTab === tab));
  $("#adminVerbPanel").hidden = tab !== "verb";
  $("#adminListPanel").hidden = tab !== "list";
}

function bindEvents() {
  $("#flashcard").addEventListener("click", () => revealAnswer());
  $("#flashcard").addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); revealAnswer(); }
  });
  $("#showAnswerButton").addEventListener("click", () => revealAnswer(true));
  $("#wrongButton").addEventListener("click", () => rateCard(false));
  $("#rightButton").addEventListener("click", () => rateCard(true));
  $("#listSelect").addEventListener("change", event => { state.selectedList = event.target.value; chooseNextCard(); });
  $("#audioToggle").addEventListener("click", () => {
    state.audioEnabled = !state.audioEnabled;
    updateAudioUI();
    if (state.audioEnabled) state.flipped ? speakBack() : speakFront(); else if ("speechSynthesis" in window) speechSynthesis.cancel();
  });

  $("#profileButton").addEventListener("click", () => openDialog("profileDialog"));
  $("#openAuthButton").addEventListener("click", () => { setAuthMode("login"); openDialog("authDialog"); });
  $("#profileLoginButton").addEventListener("click", () => { closeDialog("profileDialog"); setAuthMode("login"); openDialog("authDialog"); });
  $("#loginTab").addEventListener("click", () => setAuthMode("login"));
  $("#registerTab").addEventListener("click", () => setAuthMode("register"));
  $("#authForm").addEventListener("submit", submitAuth);
  $("#logoutButton").addEventListener("click", async () => {
    if (state.auth) await signOut(state.auth);
    closeDialog("profileDialog");
    toast("Du bist abgemeldet.");
  });

  $("#manageListsButton").addEventListener("click", () => {
    closeDialog("profileDialog");
    resetPersonalEditor();
    refreshVerbGrids();
    openDialog("listsDialog");
  });
  $("#personalVerbSearch").addEventListener("input", () => renderVerbCheckboxGrid("personal"));
  $("#savePersonalListButton").addEventListener("click", savePersonalList);

  $("#openAdminButton").addEventListener("click", () => {
    closeDialog("profileDialog");
    refreshVerbGrids();
    openDialog("adminDialog");
  });
  $$('[data-admin-tab]').forEach(button => button.addEventListener("click", () => switchAdminTab(button.dataset.adminTab)));
  $("#adminSeparable").addEventListener("change", event => { $("#adminPrefix").disabled = !event.target.checked; });
  $("#autoFillButton").addEventListener("click", autoFillAdminForms);
  $("#saveAdminVerbButton").addEventListener("click", saveAdminVerb);
  $("#publicVerbSearch").addEventListener("input", () => renderVerbCheckboxGrid("public"));
  $("#savePublicListButton").addEventListener("click", savePublicList);

  $$('[data-close]').forEach(button => button.addEventListener("click", () => closeDialog(button.dataset.close)));
  $$("dialog").forEach(dialog => dialog.addEventListener("click", event => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) dialog.close();
  }));
}

async function initializeFirebase() {
  if (!firebaseConfigured) {
    console.info("VerbFit läuft im Gastmodus: Firebase-Konfiguration fehlt.");
    return;
  }
  try {
    const app = initializeApp(firebaseConfig);
    state.auth = getAuth(app);
    state.db = getFirestore(app);
    await setPersistence(state.auth, browserLocalPersistence);
    await loadPublicData();
    onAuthStateChanged(state.auth, handleAuthChange);
  } catch (error) {
    console.error(error);
    toast("Firebase konnte nicht gestartet werden. Der Gastmodus bleibt verfügbar.");
  }
}

function init() {
  renderTypeFilters();
  populateAdminTypes();
  renderListSelect();
  updateAudioUI();
  updateProfileUI();
  bindEvents();
  refreshVerbGrids();
  chooseNextCard();
  initializeFirebase();

  if (!("speechSynthesis" in window)) {
    $("#audioToggle").disabled = true;
    $("#audioLabel").textContent = "Kein Vorlesen";
  }
  if ("speechSynthesis" in window) speechSynthesis.addEventListener?.("voiceschanged", germanVoice);

  // Für die Admin-Einrichtung bleibt der Name sichtbar, die Rolle selbst ist UID-basiert.
  document.documentElement.dataset.adminName = ADMIN_DISPLAY_NAME;
}

init();
