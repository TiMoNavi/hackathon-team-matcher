// apps/server/src/lib/profanity.ts

/** 1) Deine lange Wortliste – NUR als Array, NICHT als Regex-Literal! */
export const BAD_WORDS: string[] = [
  // Englisch (Grundform)
  "fuck","shit","bitch","asshole","cunt","bastard","slut","whore","dick","pussy","cock",
  "faggot","nigger","retard","moron","jerk","wanker","twat","prick","hoe","dyke",
  "motherfucker","bullshit","douche","cum","suckmydick","fag","slag","skank","tits","boobs",
  "ballsack","dildo","clit","porn","nigga","spic","chink","beaner","kike","gook","coon","tranny",
  "homo","queer","shemale","rapist","pedo","paedo","molester","perv","slutty","slapper",
  "cockhead","cockface","shithead","fuckface","fuckhead","cumdump","cumslut","fucktoy","whorefuck",

  // Englisch (Varianten, Abkürzungen, Leetspeak)
  "fuk","phuck","phuk","fucc","fck","fux","sh1t","shyt","biatch","b!tch","btch","b!+ch",
  "cnt","c*nt","c0ck","c0cksucker","coksukr","dik","d1ck","d!ck","pusy","pussee","cl1t",
  "f4g","f@g","f4ggot","f@g0t","f@gg0t","n1gga","n1gger","niggah","ni99a","ni99er","ret@rd",
  "rehtard","reeetard","mong","sp@z","wtf","omfg","lmfao","jizz","j1zz","j!zz","fap","f4p",
  "fisting","handjob","blowjob","bl0wj0b","handj0b","analsex","anal","rimjob","rimj0b","rimjib",
  "deepthroat","dp","bdsm","s&m","buttplug","buttsex","bootycall","pegging","pecker","boner",
  "pornhub","xnxx","xvideos","xhamster","xxx","camgirl","camwhore","camsex",

  // Deutsch (Grundform)
  "scheisse","arsch","arschloch","fotze","hurensohn","wichser","schlampe","nutte","miststück",
  "pimmel","schwanz","muschi","drecksau","verfickte","opfer","mongo","penner","lutscher",
  "fresse","hure","bimbo","neger","spast","idiot","trottel","blödmann","depp","doofi","vollidiot",
  "dummkopf","dummie","kotzbrocken","arschgesicht","arschgeige","drecksack","hinterlader",
  "schwuchtel","tunte","lesbe","puffmutter","bordsteinschwalbe","hobbyhure","stricher",
  "wichsbirne","wichskopf","wichsgriffel","wichsfinger","onkel fester","bumsbirne",
  "fickfresse","fickstück","bumsen","ficken","gefickt","gefickte","gangbang","gangbanger",
  "poppen","bums","gebumst","gebumste","pimpern","pimperer","bumsbude",

  // Deutsch (Varianten, Leetspeak)
  "f1cken","f!cken","f1ck","f!ck","f1cker","f!cker","f1ckr","f!ckr","hurnsohn","hur3nsohn",
  "huanso","h0rensohn","h0rnsn","h0ren","h0rnsohn","hurenson","hurnsn","huhrensohn",
  "wichs3r","w1chs3r","w1chser","w!chser","wiixer","wiXXer","wi*er","wi**er","wi###er",
  "fotzn","fotznkopf","fotznkind","f0tze","f0tz3","f0tzn","arschfick","arschfick3r","arschf!cker",
  "arschf1cker","ar5ch","4rsch","@rsch","ar$ch","scheixxe","scheixx","schei55e","schei$$e",
  "sche!sse","sch3isse","sch3!sse","scheizze","sche!ze","scheizz","sche!zz","scheissekopf",

  // Sonstige / International häufig (es + pt)
  "puta","puto","cabron","maricon","pendejo","coño","chingar","gilipollas","mierda",
  "zorra","perra","culero","verga","chingon","carajo","concha","boludo","garchar",
  "mierdoso","trolazo","travesti","culo","polla","joder","hostia","imbecil","idiota",
  "gordo","fea","marica","pirobo","gonorrea","careverga","malparido","chucha","cuca",
  "sapopemba","caralho","puta madre","hijo de puta","mamada","mamon","chingada",
  "cabrona","pervertido","pedo","pendeja","chingadera","chingado","cabrón","putazo",
  "maldito","chingonsote",
];

/** 2) Helfer: Regex sicher bauen */
function escapeRegex(s: string): string {
  // Sonderzeichen escapen
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Unicode-„Wort“-Ränder (statt \b), damit Umlaute usw. sauber funktionieren
const LEFT_BOUND  = "(?<![\\p{L}\\p{N}_])";   // davor kein Buchstabe/Ziffer/_
const RIGHT_BOUND = "(?![\\p{L}\\p{N}_])";     // danach kein Buchstabe/Ziffer/_
const FLAGS = "iu"; // i: case-insensitiv, u: Unicode

function termToPattern(term: string): string {
  // Mehrwort-Begriffe zulassen (Leerraum tolerant)
  const safe = escapeRegex(term.trim()).replace(/\s+/g, "\\s+");
  return `${LEFT_BOUND}(?:${safe})${RIGHT_BOUND}`;
}

/** Sehr große Listen in mehrere Regexe splitten (Performance & Längenlimits) */
function buildRegexChunks(words: string[], chunkSize = 200): RegExp[] {
  const chunks: RegExp[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    const part = words.slice(i, i + chunkSize).map(termToPattern).join("|");
    chunks.push(new RegExp(part, FLAGS));
  }
  return chunks;
}

// einmalig kompilieren
const REGEXES = buildRegexChunks(BAD_WORDS);

/** 3) API */
export function containsProfanity(input?: string | null): boolean {
  if (!input) return false;
  for (const rx of REGEXES) {
    if (rx.test(input)) return true;
  }
  return false;
}

export function maskProfanity(input?: string | null): string | null {
  if (!input) return input ?? null;
  let out = input;
  for (const rx of REGEXES) {
    out = out.replace(rx, (m) => "*".repeat(m.length));
  }
  return out;
}
