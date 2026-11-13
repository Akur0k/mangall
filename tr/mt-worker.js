// Переводчик en→ru: движок Bergamot (тот же, что в Firefox) + модель Mozilla, всё локально.
importScripts("mt/bergamot-translator.js");   // пути — относительно воркера (static/tr/)

let service = null, model = null;
const buf = async (u) => (await fetch(u)).arrayBuffer();
// модель больше 25 МБ (лимит файла Cloudflare Pages) лежит частями model.enru.bin.0, .1, … — склеиваем
async function parts(u) {
  const bufs = [];
  for (let i = 0; ; i++) { const r = await fetch(`${u}.${i}`); if (!r.ok) break; bufs.push(new Uint8Array(await r.arrayBuffer())); }
  if (!bufs.length) return buf(u);
  const out = new Uint8Array(bufs.reduce((n, b) => n + b.length, 0)); let o = 0;
  for (const b of bufs) { out.set(b, o); o += b.length; }
  return out.buffer;
}

function aligned(bergamot, buffer, alignment) {
  const mem = new bergamot.AlignedMemory(buffer.byteLength, alignment);
  mem.getByteArrayView().set(new Uint8Array(buffer));
  return mem;
}

async function init() {
  const t0 = performance.now();
  const [wasmBinary, modelBuf, lexBuf, vocabBuf] = await Promise.all([
    buf("mt/bergamot-translator.wasm"), parts("mt/model.enru.bin"), buf("mt/lex.enru.bin"), buf("mt/vocab.enru.spm"),
  ]);
  const tLoaded = performance.now();
  const bergamot = await new Promise((resolve, reject) => {
    const b = loadBergamot({
      INITIAL_MEMORY: 41_943_040,
      print: () => {},
      onAbort: () => reject(new Error("Bergamot wasm aborted")),
      onRuntimeInitialized: async () => { await Promise.resolve(); resolve(b); },
      wasmBinary,
    });
  });
  const vocabs = new bergamot.AlignedMemoryList();
  vocabs.push_back(aligned(bergamot, vocabBuf, 64));
  const config = Object.entries({
    "beam-size": "1", normalize: "1.0", "word-penalty": "0", "max-length-break": "128",
    "mini-batch-words": "1024", workspace: "128", "max-length-factor": "2.0", "skip-cost": "true",
    "cpu-threads": "0", quiet: "true", "quiet-translation": "true",
    "gemm-precision": "int8shiftAlphaAll", alignment: "soft",
  }).map(([k, v]) => `${k}: ${v}`).join("\n");
  model = new bergamot.TranslationModel("en", "ru", config, aligned(bergamot, modelBuf, 256), aligned(bergamot, lexBuf, 64), vocabs, null);
  service = new bergamot.BlockingService({ cacheSize: 0 });
  self.bergamot = bergamot;
  return { downloadMs: Math.round(tLoaded - t0), initMs: Math.round(performance.now() - tLoaded) };
}

function translate(text) {
  const b = self.bergamot;
  const messages = new b.VectorString(), options = new b.VectorResponseOptions();
  messages.push_back(text);
  options.push_back({ qualityScores: false, alignment: false, html: false });
  const responses = service.translate(model, messages, options);
  const out = responses.get(0).getTranslatedText();
  messages.delete(); options.delete(); responses.delete();
  return out;
}

self.onmessage = async (ev) => {
  const { id, cmd, texts } = ev.data;
  try {
    if (cmd === "init") return self.postMessage({ id, ok: true, ...(await init()) });
    const out = [], ms = [];
    for (const t of texts) {
      const t0 = performance.now();
      out.push(t.trim() ? translate(t) : "");
      ms.push(+(performance.now() - t0).toFixed(1));
    }
    self.postMessage({ id, ok: true, out, ms });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.stack ?? e).slice(0, 800) });
  }
};
