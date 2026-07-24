export const TYPES = {
  REGULAR: "Regelmäßig",
  E_I: "e → i",
  E_IE: "e → ie",
  A_AUMLAUT: "a → ä",
  ABSOLUTE: "Ganz unregelmäßig",
  MODAL: "Modalverben",
  OTHER: "Andere Änderungen"
};

export const TYPE_ORDER = [
  TYPES.REGULAR,
  TYPES.E_I,
  TYPES.E_IE,
  TYPES.A_AUMLAUT,
  TYPES.ABSOLUTE,
  TYPES.MODAL,
  TYPES.OTHER
];

const verbs = [];
const byInfinitive = new Map();

function idFor(text) {
  return text.toLowerCase()
    .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function needsE(stem) {
  if (/[dt]$/.test(stem)) return true;
  if (/[mn]$/.test(stem)) {
    const before = stem.at(-2) || "";
    return !/[aeiouäöürlmn]/.test(before);
  }
  return false;
}

export function conjugateRegular(infinitive, { separable = false, prefix = "" } = {}) {
  const clean = infinitive.trim().toLowerCase();
  let base = clean;
  if (separable && prefix && clean.startsWith(prefix)) base = clean.slice(prefix.length);

  let forms;
  if (base.endsWith("eln")) {
    const stem = base.slice(0, -2); // sammeln -> sammel
    forms = [stem.slice(0, -1) + "le", stem + "st", stem + "t", base, stem + "t", base];
  } else if (base.endsWith("ern")) {
    const stem = base.slice(0, -2);
    forms = [stem + "e", stem + "st", stem + "t", base, stem + "t", base];
  } else {
    const stem = base.endsWith("en") ? base.slice(0, -2) : base.endsWith("n") ? base.slice(0, -1) : base;
    const extraE = needsE(stem);
    const sibilant = /[sßxz]$/.test(stem);
    forms = [
      stem + "e",
      stem + (extraE ? "est" : sibilant ? "t" : "st"),
      stem + (extraE ? "et" : "t"),
      base,
      stem + (extraE ? "et" : "t"),
      base
    ];
  }

  return separable && prefix ? forms.map(form => `${form} ${prefix}`) : forms;
}

function add(infinitive, type, forms, options = {}) {
  const verb = {
    id: idFor(infinitive), infinitive, type, forms,
    separable: Boolean(options.separable), prefix: options.prefix || "", source: "builtin"
  };
  if (!byInfinitive.has(infinitive)) {
    verbs.push(verb);
    byInfinitive.set(infinitive, verb);
  }
  return verb;
}

function regular(infinitive, options = {}) {
  return add(infinitive, TYPES.REGULAR, conjugateRegular(infinitive, options), options);
}

function explicit(infinitive, type, forms, options = {}) { return add(infinitive, type, forms, options); }

function derived(infinitive, baseInfinitive, prefix, separable = true) {
  const base = byInfinitive.get(baseInfinitive);
  if (!base) throw new Error(`Fehlendes Grundverb: ${baseInfinitive}`);
  const forms = separable
    ? base.forms.map(form => `${form} ${prefix}`)
    : base.forms.map(form => prefix + form);
  return add(infinitive, base.type, forms, { separable, prefix });
}

// Regelmäßige Verben und Verben mit regelmäßigen Präsensformen
[
  "arbeiten","antworten","atmen","baden","basteln","bauen","bedeuten","benutzen","bestellen","besuchen",
  "bezahlen","brauchen","danken","dauern","duschen","enden","entschuldigen","entdecken","entwickeln","erklären",
  "erleben","erzählen","feiern","fehlen","folgen","fragen","frühstücken","fühlen","glauben","gratulieren",
  "heiraten","hoffen","holen","hören","kaufen","klingeln","kochen","kosten","lachen","lächeln","leben",
  "legen","lernen","lieben","machen","meinen","mieten","öffnen","packen","passen","planen","probieren",
  "putzen","rechnen","reden","regnen","reisen","reparieren","reservieren","sagen","sammeln","schenken",
  "schicken","schmecken","spielen","stellen","studieren","suchen","tanzen","telefonieren","trainieren","üben",
  "verkaufen","warten","wechseln","wohnen","zahlen","zeigen","zeichnen","wandern","wünschen","wiederholen",
  "räumen","hängen","klettern","fotografieren","informieren","kontrollieren","markieren","organisieren","passieren",
  "produzieren","diskutieren","funktionieren","interessieren","akzeptieren","buchstabieren","kopieren","notieren",
  "sortieren","servieren","verdienen","mischen","trocknen","regeln","retten","testen","öffnen","schließen"
].forEach(regular);

explicit("heißen", TYPES.REGULAR, ["heiße","heißt","heißt","heißen","heißt","heißen"]);

// e → i
explicit("geben", TYPES.E_I, ["gebe","gibst","gibt","geben","gebt","geben"]);
explicit("nehmen", TYPES.E_I, ["nehme","nimmst","nimmt","nehmen","nehmt","nehmen"]);
explicit("sprechen", TYPES.E_I, ["spreche","sprichst","spricht","sprechen","sprecht","sprechen"]);
explicit("treffen", TYPES.E_I, ["treffe","triffst","trifft","treffen","trefft","treffen"]);
explicit("helfen", TYPES.E_I, ["helfe","hilfst","hilft","helfen","helft","helfen"]);
explicit("essen", TYPES.E_I, ["esse","isst","isst","essen","esst","essen"]);
explicit("vergessen", TYPES.E_I, ["vergesse","vergisst","vergisst","vergessen","vergesst","vergessen"]);
explicit("werfen", TYPES.E_I, ["werfe","wirfst","wirft","werfen","werft","werfen"]);
explicit("sterben", TYPES.E_I, ["sterbe","stirbst","stirbt","sterben","sterbt","sterben"]);
explicit("brechen", TYPES.E_I, ["breche","brichst","bricht","brechen","brecht","brechen"]);
explicit("treten", TYPES.E_I, ["trete","trittst","tritt","treten","tretet","treten"]);
explicit("gelten", TYPES.E_I, ["gelte","giltst","gilt","gelten","geltet","gelten"]);
explicit("messen", TYPES.E_I, ["messe","misst","misst","messen","messt","messen"]);
explicit("fressen", TYPES.E_I, ["fresse","frisst","frisst","fressen","fresst","fressen"]);
explicit("erschrecken", TYPES.E_I, ["erschrecke","erschrickst","erschrickt","erschrecken","erschreckt","erschrecken"]);
explicit("bergen", TYPES.E_I, ["berge","birgst","birgt","bergen","bergt","bergen"]);
explicit("werben", TYPES.E_I, ["werbe","wirbst","wirbt","werben","werbt","werben"]);
explicit("verderben", TYPES.E_I, ["verderbe","verdirbst","verdirbt","verderben","verderbt","verderben"]);
explicit("schelten", TYPES.E_I, ["schelte","schiltst","schilt","schelten","scheltet","schelten"]);
explicit("quellen", TYPES.E_I, ["quelle","quillst","quillt","quellen","quellt","quellen"]);
explicit("schwellen", TYPES.E_I, ["schwelle","schwillst","schwillt","schwellen","schwellt","schwellen"]);

// e → ie
explicit("sehen", TYPES.E_IE, ["sehe","siehst","sieht","sehen","seht","sehen"]);
explicit("lesen", TYPES.E_IE, ["lese","liest","liest","lesen","lest","lesen"]);
explicit("empfehlen", TYPES.E_IE, ["empfehle","empfiehlst","empfiehlt","empfehlen","empfehlt","empfehlen"]);
explicit("stehlen", TYPES.E_IE, ["stehle","stiehlst","stiehlt","stehlen","stehlt","stehlen"]);
explicit("befehlen", TYPES.E_IE, ["befehle","befiehlst","befiehlt","befehlen","befehlt","befehlen"]);
explicit("geschehen", TYPES.E_IE, ["geschehe","geschiehst","geschieht","geschehen","gescheht","geschehen"]);

// a → ä (laufen gehört auf Wunsch ebenfalls hierher)
explicit("fahren", TYPES.A_AUMLAUT, ["fahre","fährst","fährt","fahren","fahrt","fahren"]);
explicit("schlafen", TYPES.A_AUMLAUT, ["schlafe","schläfst","schläft","schlafen","schlaft","schlafen"]);
explicit("tragen", TYPES.A_AUMLAUT, ["trage","trägst","trägt","tragen","tragt","tragen"]);
explicit("waschen", TYPES.A_AUMLAUT, ["wasche","wäschst","wäscht","waschen","wascht","waschen"]);
explicit("halten", TYPES.A_AUMLAUT, ["halte","hältst","hält","halten","haltet","halten"]);
explicit("fallen", TYPES.A_AUMLAUT, ["falle","fällst","fällt","fallen","fallt","fallen"]);
explicit("lassen", TYPES.A_AUMLAUT, ["lasse","lässt","lässt","lassen","lasst","lassen"]);
explicit("fangen", TYPES.A_AUMLAUT, ["fange","fängst","fängt","fangen","fangt","fangen"]);
explicit("laufen", TYPES.A_AUMLAUT, ["laufe","läufst","läuft","laufen","lauft","laufen"]);
explicit("wachsen", TYPES.A_AUMLAUT, ["wachse","wächst","wächst","wachsen","wachst","wachsen"]);
explicit("graben", TYPES.A_AUMLAUT, ["grabe","gräbst","gräbt","graben","grabt","graben"]);
explicit("laden", TYPES.A_AUMLAUT, ["lade","lädst","lädt","laden","ladet","laden"]);
explicit("schlagen", TYPES.A_AUMLAUT, ["schlage","schlägst","schlägt","schlagen","schlagt","schlagen"]);
explicit("raten", TYPES.A_AUMLAUT, ["rate","rätst","rät","raten","ratet","raten"]);
explicit("braten", TYPES.A_AUMLAUT, ["brate","brätst","brät","braten","bratet","braten"]);
explicit("blasen", TYPES.A_AUMLAUT, ["blase","bläst","bläst","blasen","blast","blasen"]);
explicit("backen", TYPES.A_AUMLAUT, ["backe","bäckst","bäckt","backen","backt","backen"]);

// Ganz unregelmäßig
explicit("sein", TYPES.ABSOLUTE, ["bin","bist","ist","sind","seid","sind"]);
explicit("haben", TYPES.ABSOLUTE, ["habe","hast","hat","haben","habt","haben"]);
explicit("werden", TYPES.ABSOLUTE, ["werde","wirst","wird","werden","werdet","werden"]);
explicit("wissen", TYPES.ABSOLUTE, ["weiß","weißt","weiß","wissen","wisst","wissen"]);

// Modalverben
explicit("dürfen", TYPES.MODAL, ["darf","darfst","darf","dürfen","dürft","dürfen"]);
explicit("können", TYPES.MODAL, ["kann","kannst","kann","können","könnt","können"]);
explicit("mögen", TYPES.MODAL, ["mag","magst","mag","mögen","mögt","mögen"]);
explicit("müssen", TYPES.MODAL, ["muss","musst","muss","müssen","müsst","müssen"]);
explicit("sollen", TYPES.MODAL, ["soll","sollst","soll","sollen","sollt","sollen"]);
explicit("wollen", TYPES.MODAL, ["will","willst","will","wollen","wollt","wollen"]);

// Weitere häufige unregelmäßige Verben
explicit("tun", TYPES.OTHER, ["tue","tust","tut","tun","tut","tun"]);
explicit("gehen", TYPES.OTHER, ["gehe","gehst","geht","gehen","geht","gehen"]);
explicit("stehen", TYPES.OTHER, ["stehe","stehst","steht","stehen","steht","stehen"]);
explicit("kommen", TYPES.OTHER, ["komme","kommst","kommt","kommen","kommt","kommen"]);
explicit("bringen", TYPES.OTHER, ["bringe","bringst","bringt","bringen","bringt","bringen"]);
explicit("denken", TYPES.OTHER, ["denke","denkst","denkt","denken","denkt","denken"]);
explicit("kennen", TYPES.OTHER, ["kenne","kennst","kennt","kennen","kennt","kennen"]);
explicit("nennen", TYPES.OTHER, ["nenne","nennst","nennt","nennen","nennt","nennen"]);
explicit("rennen", TYPES.OTHER, ["renne","rennst","rennt","rennen","rennt","rennen"]);
explicit("senden", TYPES.OTHER, ["sende","sendest","sendet","senden","sendet","senden"]);
explicit("wenden", TYPES.OTHER, ["wende","wendest","wendet","wenden","wendet","wenden"]);
explicit("ziehen", TYPES.OTHER, ["ziehe","ziehst","zieht","ziehen","zieht","ziehen"]);
explicit("fliegen", TYPES.OTHER, ["fliege","fliegst","fliegt","fliegen","fliegt","fliegen"]);
explicit("liegen", TYPES.OTHER, ["liege","liegst","liegt","liegen","liegt","liegen"]);
explicit("sitzen", TYPES.OTHER, ["sitze","sitzt","sitzt","sitzen","sitzt","sitzen"]);
explicit("bitten", TYPES.OTHER, ["bitte","bittest","bittet","bitten","bittet","bitten"]);
explicit("finden", TYPES.OTHER, ["finde","findest","findet","finden","findet","finden"]);
explicit("binden", TYPES.OTHER, ["binde","bindest","bindet","binden","bindet","binden"]);
explicit("singen", TYPES.OTHER, ["singe","singst","singt","singen","singt","singen"]);
explicit("trinken", TYPES.OTHER, ["trinke","trinkst","trinkt","trinken","trinkt","trinken"]);
explicit("springen", TYPES.OTHER, ["springe","springst","springt","springen","springt","springen"]);
explicit("schwimmen", TYPES.OTHER, ["schwimme","schwimmst","schwimmt","schwimmen","schwimmt","schwimmen"]);
explicit("gewinnen", TYPES.OTHER, ["gewinne","gewinnst","gewinnt","gewinnen","gewinnt","gewinnen"]);
explicit("beginnen", TYPES.OTHER, ["beginne","beginnst","beginnt","beginnen","beginnt","beginnen"]);
explicit("bleiben", TYPES.OTHER, ["bleibe","bleibst","bleibt","bleiben","bleibt","bleiben"]);
explicit("schreiben", TYPES.OTHER, ["schreibe","schreibst","schreibt","schreiben","schreibt","schreiben"]);
explicit("schneiden", TYPES.OTHER, ["schneide","schneidest","schneidet","schneiden","schneidet","schneiden"]);
explicit("scheinen", TYPES.OTHER, ["scheine","scheinst","scheint","scheinen","scheint","scheinen"]);
explicit("steigen", TYPES.OTHER, ["steige","steigst","steigt","steigen","steigt","steigen"]);
explicit("verlieren", TYPES.OTHER, ["verliere","verlierst","verliert","verlieren","verliert","verlieren"]);
explicit("frieren", TYPES.OTHER, ["friere","frierst","friert","frieren","friert","frieren"]);
explicit("genießen", TYPES.OTHER, ["genieße","genießt","genießt","genießen","genießt","genießen"]);
explicit("gießen", TYPES.OTHER, ["gieße","gießt","gießt","gießen","gießt","gießen"]);
explicit("bieten", TYPES.OTHER, ["biete","bietest","bietet","bieten","bietet","bieten"]);
explicit("verbieten", TYPES.OTHER, ["verbiete","verbietest","verbietet","verbieten","verbietet","verbieten"]);
explicit("entscheiden", TYPES.OTHER, ["entscheide","entscheidest","entscheidet","entscheiden","entscheidet","entscheiden"]);
explicit("stoßen", TYPES.OTHER, ["stoße","stößt","stößt","stoßen","stoßt","stoßen"]);
explicit("rufen", TYPES.OTHER, ["rufe","rufst","ruft","rufen","ruft","rufen"]);

// Trennbare und untrennbare Verben – Kategorie des Grundverbs
[
  ["aufmachen","machen","auf",true],["zumachen","machen","zu",true],["mitmachen","machen","mit",true],
  ["weitermachen","machen","weiter",true],["anmachen","machen","an",true],["ausmachen","machen","aus",true],
  ["einkaufen","kaufen","ein",true],["abholen","holen","ab",true],["aufhören","hören","auf",true],
  ["zuhören","hören","zu",true],["mitarbeiten","arbeiten","mit",true],["zusammenarbeiten","arbeiten","zusammen",true],
  ["mitspielen","spielen","mit",true],["vorspielen","spielen","vor",true],["abspielen","spielen","ab",true],
  ["einspielen","spielen","ein",true],["vorstellen","stellen","vor",true],["aufstellen","stellen","auf",true],
  ["feststellen","stellen","fest",true],["aufstehen","stehen","auf",true],["verstehen","stehen","ver",false],
  ["bestehen","stehen","be",false],["entstehen","stehen","ent",false],["ausgehen","gehen","aus",true],
  ["eingehen","gehen","ein",true],["mitgehen","gehen","mit",true],["losgehen","gehen","los",true],
  ["zurückgehen","gehen","zurück",true],["weggehen","gehen","weg",true],["weitergehen","gehen","weiter",true],
  ["ankommen","kommen","an",true],["mitkommen","kommen","mit",true],["zurückkommen","kommen","zurück",true],
  ["bekommen","kommen","be",false],["entkommen","kommen","ent",false],["abfahren","fahren","ab",true],
  ["losfahren","fahren","los",true],["mitfahren","fahren","mit",true],["zurückfahren","fahren","zurück",true],
  ["wegfahren","fahren","weg",true],["erfahren","fahren","er",false],["ansprechen","sprechen","an",true],
  ["aussprechen","sprechen","aus",true],["besprechen","sprechen","be",false],["versprechen","sprechen","ver",false],
  ["widersprechen","sprechen","wider",false],["abgeben","geben","ab",true],["angeben","geben","an",true],
  ["ausgeben","geben","aus",true],["eingeben","geben","ein",true],["mitgeben","geben","mit",true],
  ["zurückgeben","geben","zurück",true],["ergeben","geben","er",false],["vergeben","geben","ver",false],
  ["abnehmen","nehmen","ab",true],["annehmen","nehmen","an",true],["aufnehmen","nehmen","auf",true],
  ["mitnehmen","nehmen","mit",true],["teilnehmen","nehmen","teil",true],["übernehmen","nehmen","über",false],
  ["unternehmen","nehmen","unter",false],["ansehen","sehen","an",true],["aussehen","sehen","aus",true],
  ["zusehen","sehen","zu",true],["fernsehen","sehen","fern",true],["übersehen","sehen","über",false],
  ["vorlesen","lesen","vor",true],["nachlesen","lesen","nach",true],["durchlesen","lesen","durch",true],
  ["einschlafen","schlafen","ein",true],["ausschlafen","schlafen","aus",true],["eintragen","tragen","ein",true],
  ["vortragen","tragen","vor",true],["beitragen","tragen","bei",true],["anhalten","halten","an",true],
  ["aufhalten","halten","auf",true],["behalten","halten","be",false],["erhalten","halten","er",false],
  ["enthalten","halten","ent",false],["auffallen","fallen","auf",true],["einfallen","fallen","ein",true],
  ["umfallen","fallen","um",true],["anfangen","fangen","an",true],["auffangen","fangen","auf",true],
  ["anlaufen","laufen","an",true],["auslaufen","laufen","aus",true],["weglaufen","laufen","weg",true],
  ["abwaschen","waschen","ab",true],["einladen","laden","ein",true],["herunterladen","laden","herunter",true],
  ["hochladen","laden","hoch",true],["vorschlagen","schlagen","vor",true],["einschlagen","schlagen","ein",true],
  ["aufessen","essen","auf",true],["antreffen","treffen","an",true],["aushelfen","helfen","aus",true],
  ["wegwerfen","werfen","weg",true],["vorwerfen","werfen","vor",true],["abbrechen","brechen","ab",true],
  ["aufbrechen","brechen","auf",true],["zerbrechen","brechen","zer",false],["mitbringen","bringen","mit",true],
  ["wegbringen","bringen","weg",true],["zurückbringen","bringen","zurück",true],["verbringen","bringen","ver",false],
  ["aufschreiben","schreiben","auf",true],["abschreiben","schreiben","ab",true],["beschreiben","schreiben","be",false],
  ["unterschreiben","schreiben","unter",false],["anziehen","ziehen","an",true],["ausziehen","ziehen","aus",true],
  ["umziehen","ziehen","um",true],["erziehen","ziehen","er",false],["abschließen","schließen","ab",true],
  ["aufschließen","schließen","auf",true],["einschließen","schließen","ein",true],["beschließen","schließen","be",false],
  ["herausfinden","finden","heraus",true],["stattfinden","finden","statt",true],["erfinden","finden","er",false],
  ["einsteigen","steigen","ein",true],["aussteigen","steigen","aus",true],["umsteigen","steigen","um",true],
  ["abfliegen","fliegen","ab",true],["wegfliegen","fliegen","weg",true],["anrufen","rufen","an",true],
  ["aufrufen","rufen","auf",true],["aufräumen","räumen","auf",true],["aufpassen","passen","auf",true],
  ["kennenlernen","lernen","kennen",true]
].forEach(args => derived(...args));

export const BUILTIN_VERBS = verbs.sort((a,b) => a.infinitive.localeCompare(b.infinitive, "de"));

function ids(names) { return names.map(name => byInfinitive.get(name)?.id).filter(Boolean); }

export const BUILTIN_LISTS = [
  {
    id: "a1-start",
    title: "A1 – Start",
    description: "Sehr häufige Verben für die ersten Lektionen",
    verbIds: ids(["sein","haben","heißen","wohnen","kommen","gehen","machen","lernen","arbeiten","spielen","sprechen","hören","lesen","schreiben","essen","trinken","kaufen","brauchen","mögen","können"]),
    builtin: true
  },
  {
    id: "alltag",
    title: "Alltag",
    description: "Tagesablauf, Wohnung, Freizeit und Einkaufen",
    verbIds: ids(["aufstehen","duschen","frühstücken","arbeiten","einkaufen","kochen","aufräumen","putzen","fernsehen","schlafen","anrufen","aufmachen","zumachen","warten","fahren","mitkommen","bezahlen","bestellen","holen","abholen","anziehen","ausziehen"]),
    builtin: true
  },
  {
    id: "stammwechsel",
    title: "Stammwechsel",
    description: "e → i, e → ie und a → ä",
    verbIds: BUILTIN_VERBS.filter(v => [TYPES.E_I,TYPES.E_IE,TYPES.A_AUMLAUT].includes(v.type)).map(v => v.id),
    builtin: true
  },
  {
    id: "trennbar",
    title: "Trennbare Verben",
    description: "Verben mit abgetrenntem Präfix",
    verbIds: BUILTIN_VERBS.filter(v => v.separable).map(v => v.id),
    builtin: true
  },
  {
    id: "modalverben",
    title: "Modalverben",
    description: "dürfen, können, mögen, müssen, sollen und wollen",
    verbIds: BUILTIN_VERBS.filter(v => v.type === TYPES.MODAL).map(v => v.id),
    builtin: true
  }
];
