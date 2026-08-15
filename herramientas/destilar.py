#!/usr/bin/env python3
"""
destilar.py — Arnés de destilación para PatwaLink

Genera un corpus paralelo con un LLM, extrae de él lo que el motor de
reglas necesita, y produce un módulo JS que se embarca en la app.

El modelo NO viaja en la app. Se ejecuta una vez aquí, y lo que se
embarca es el residuo: léxico, frases y estadística de contexto.

Uso:
    export ANTHROPIC_API_KEY=sk-...
    python3 destilar.py generar   --n 2000 --salida corpus.jsonl
    python3 destilar.py extraer   --corpus corpus.jsonl --salida destilado.js
    python3 destilar.py auditar   --corpus corpus.jsonl

Coste orientativo: ~0,60 € por cada 1.000 pares con Sonnet.
"""

import argparse, json, os, random, re, sys, time
from collections import Counter, defaultdict
from pathlib import Path

MODELO = "claude-sonnet-4-6"
API = "https://api.anthropic.com/v1/messages"

# ---------------------------------------------------------------- dominios
# El reparto importa: un corpus sesgado hacia saludos turísticos produce
# un destilado que sólo sabe saludar.
DOMINIOS = [
    ("vida diaria",        "rutina, casa, comida, familia, compras", 0.20),
    ("conversación",       "saludos, despedidas, acuerdo, desacuerdo, preguntas", 0.15),
    ("trabajo",            "oficios, dinero, horarios, negociación", 0.12),
    ("viaje y transporte", "direcciones, precios, alojamiento, autobuses", 0.12),
    ("emociones",          "alegría, enfado, miedo, cariño, cansancio", 0.10),
    ("música y cultura",   "reggae, dancehall, sound system, baile", 0.10),
    ("salud",              "dolencias, médico, farmacia, urgencias", 0.08),
    ("naturaleza y clima", "lluvia, mar, montaña, animales, plantas", 0.08),
    ("conflicto",          "discusiones, advertencias, quejas", 0.05),
]

# Estructuras gramaticales que el corpus debe cubrir a propósito.
# Sin esto el LLM produce mayoritariamente frases simples declarativas.
ESTRUCTURAS = [
    "afirmativa simple en pasado",
    "afirmativa simple en presente habitual",
    "progresivo (acción en curso)",
    "anterior (pluscuamperfecto)",
    "pasado progresivo",
    "completivo (ya he hecho algo)",
    "futuro próximo",
    "condicional",
    "negativa con concordancia negativa",
    "interrogativa con palabra interrogativa",
    "interrogativa polar",
    "imperativo afirmativo",
    "imperativo negativo",
    "subordinada completiva",
    "oración de relativo",
    "focalización (anteposición enfática)",
    "verbo serial",
    "comparativa",
    "reduplicación intensiva",
    "plural con determinante",
]

PROMPT = """Eres lexicógrafo especializado en criollo jamaicano (Jamaican Creole/Patwa).

Genera {n} pares de frases español ↔ patois jamaicano.

Dominio: {dominio} ({detalle})
Estructura gramatical exigida en cada par: {estructura}

Requisitos del patois:
- Criollo real hablado, no inglés con ortografía alterada.
- Marcadores TMA antepuestos: a (progresivo), did (anterior), a go / wi (futuro), done (completivo), did a (pasado progresivo).
- Pronombres invariables: mi, yu, im, wi, unu, dem.
- Cópula supletiva: "a" ante nominal, "deh" ante lugar, cero ante adjetivo.
- Plural analítico con "dem" pospuesto, sólo en sintagmas definidos.
- Concordancia negativa con nuh / neva / nah.
- Ortografía: la grafía más extendida en el uso real, no la académica de la UWI.

Requisitos del español:
- Español peninsular natural. Sin pronombre sujeto salvo contraste.
- Registro coherente con el del patois: si el patois es coloquial, el español también.

Varía la longitud entre 3 y 14 palabras. No repitas vocabulario entre pares.

Responde SOLO con un array JSON, sin markdown ni preámbulo:
[{{"es":"...","pw":"...","reg":"neutral|informal|vulgar|rasta|dancehall","est":"{estructura}"}}]
"""


# ---------------------------------------------------------------- API
def llamar(prompt, reintentos=4):
    import urllib.request, urllib.error
    clave = os.environ.get("ANTHROPIC_API_KEY")
    if not clave:
        sys.exit("Falta ANTHROPIC_API_KEY en el entorno.")

    cuerpo = json.dumps({
        "model": MODELO,
        "max_tokens": 8000,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(API, data=cuerpo, headers={
        "content-type": "application/json",
        "x-api-key": clave,
        "anthropic-version": "2023-06-01",
    })

    for intento in range(reintentos):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                datos = json.loads(r.read())
            return "".join(b.get("text", "") for b in datos.get("content", []))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 529) and intento < reintentos - 1:
                espera = 2 ** intento * 5
                print(f"  reintento en {espera}s (HTTP {e.code})", file=sys.stderr)
                time.sleep(espera)
                continue
            raise
    return ""


def parsear(texto):
    t = re.sub(r"```(?:json)?", "", texto).strip()
    i, j = t.find("["), t.rfind("]")
    if i < 0 or j < 0:
        return []
    try:
        return json.loads(t[i:j + 1])
    except json.JSONDecodeError:
        # rescate: extraer objetos sueltos si el array vino truncado
        return [json.loads(m) for m in re.findall(r"\{[^{}]*\}", t[i:j + 1])
                if '"es"' in m and '"pw"' in m]


# ---------------------------------------------------------------- generar
def generar(n_total, salida, por_lote=25):
    vistos = set()
    escritos = 0

    if Path(salida).exists():
        with open(salida, encoding="utf-8") as f:
            for linea in f:
                try:
                    vistos.add(json.loads(linea)["es"].lower())
                    escritos += 1
                except Exception:
                    pass
        print(f"Reanudando: {escritos} pares ya en {salida}")

    pesos = [d[2] for d in DOMINIOS]
    f = open(salida, "a", encoding="utf-8")

    while escritos < n_total:
        dom = random.choices(DOMINIOS, weights=pesos)[0]
        est = random.choice(ESTRUCTURAS)
        prompt = PROMPT.format(n=por_lote, dominio=dom[0], detalle=dom[1], estructura=est)

        try:
            pares = parsear(llamar(prompt))
        except Exception as e:
            print(f"  lote fallido: {e}", file=sys.stderr)
            time.sleep(5)
            continue

        nuevos = 0
        for p in pares:
            if not isinstance(p, dict) or "es" not in p or "pw" not in p:
                continue
            clave = p["es"].strip().lower()
            if clave in vistos or len(clave) < 5:
                continue
            vistos.add(clave)
            p["dom"] = dom[0]
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
            nuevos += 1

        f.flush()
        escritos += nuevos
        print(f"{escritos}/{n_total}  (+{nuevos})  [{dom[0]} · {est}]")

    f.close()
    print(f"\nCorpus completo: {escritos} pares en {salida}")


# ---------------------------------------------------------------- normalizar
# Debe replicar patwa_normalize / patwa_phonetic_key del motor.
def normalizar(s):
    import unicodedata
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s'`´’\-.,!?¡¿\"()]", "", s)


VACIAS_ES = set("""el la los las un una unos unas de del a al en y o que se lo le les
me te nos os su sus mi tu es son está están ser estar por para con sin como más muy
pero si no ya cuando donde qué quién cómo este esta esto ese esa eso""".split())

VACIAS_PW = set("""di de wan a an fi inna pon wid dem mi yu im wi unu nuh no did
done deh yah dat dis weh wah so it""".split())


# ---------------------------------------------------------------- extraer
def extraer(corpus, salida, min_frec=3, min_conf=0.55):
    pares = []
    with open(corpus, encoding="utf-8") as f:
        for linea in f:
            try:
                pares.append(json.loads(linea))
            except Exception:
                pass

    print(f"Corpus: {len(pares)} pares")

    # ---- 1. alineación léxica por coocurrencia -------------------------
    # Si "dinero" y "money" aparecen juntos mucho más de lo que el azar
    # explicaría, probablemente sean traducción mutua.
    co = defaultdict(Counter)
    frec_es, frec_pw = Counter(), Counter()

    for p in pares:
        tes = [w for w in re.findall(r"\w+", p["es"].lower()) if w not in VACIAS_ES and len(w) > 2]
        tpw = [w for w in re.findall(r"\w+", p["pw"].lower()) if w not in VACIAS_PW and len(w) > 2]
        for e in set(tes):
            frec_es[e] += 1
            for w in set(tpw):
                co[e][w] += 1
        for w in set(tpw):
            frec_pw[w] += 1

    lexico = []
    for e, cuentas in co.items():
        if frec_es[e] < min_frec:
            continue
        w, c = cuentas.most_common(1)[0]
        # Dice: 2·|A∩B| / (|A|+|B|). Robusto frente a palabras muy frecuentes.
        conf = 2 * c / (frec_es[e] + frec_pw[w])
        if conf >= min_conf and frec_pw[w] >= min_frec:
            lexico.append({"es": e, "pw": w, "conf": round(conf, 2), "n": c})

    lexico.sort(key=lambda x: -x["n"])
    print(f"Léxico alineado: {len(lexico)} pares (Dice >= {min_conf})")

    # ---- 2. frases hechas ---------------------------------------------
    # n-gramas patois que se repiten con una traducción española estable.
    ngr = defaultdict(Counter)
    for p in pares:
        pw = re.findall(r"\w+", p["pw"].lower())
        for n in (2, 3, 4):
            for i in range(len(pw) - n + 1):
                ngr[" ".join(pw[i:i + n])][p["es"].strip().lower()] += 1

    frases = []
    for g, trads in ngr.items():
        total = sum(trads.values())
        if total < min_frec:
            continue
        es, c = trads.most_common(1)[0]
        if c / total >= 0.6 and len(es.split()) <= 6:
            frases.append({"pw": g, "es": es, "n": c})

    frases.sort(key=lambda x: -x["n"])
    frases = frases[:400]
    print(f"Frases hechas: {len(frases)}")

    # ---- 3. desambiguación por contexto --------------------------------
    # Aquí está el valor real. Para cada palabra española con más de un
    # equivalente patois, se guardan las palabras que acompañan a cada
    # acepción. Es lo que un motor de reglas no puede deducir solo.
    candidatos = defaultdict(Counter)
    for e, cuentas in co.items():
        if frec_es[e] < min_frec * 2:
            continue
        top = cuentas.most_common(4)
        fuertes = [(w, c) for w, c in top
                   if 2 * c / (frec_es[e] + frec_pw[w]) >= 0.30 and frec_pw[w] >= min_frec]
        if len(fuertes) > 1:
            candidatos[e] = fuertes

    desambig = {}
    for e, opciones in candidatos.items():
        perfiles = {}
        for w, _ in opciones:
            ctx = Counter()
            for p in pares:
                tes = set(re.findall(r"\w+", p["es"].lower()))
                tpw = set(re.findall(r"\w+", p["pw"].lower()))
                if e in tes and w in tpw:
                    for o in tes:
                        if o != e and o not in VACIAS_ES and len(o) > 3:
                            ctx[o] += 1
            claves = [k for k, c in ctx.most_common(8) if c >= 2]
            if claves:
                perfiles[w] = claves
        if len(perfiles) > 1:
            desambig[e] = perfiles

    print(f"Palabras ambiguas con perfil de contexto: {len(desambig)}")

    # ---- 4. cobertura de estructuras ------------------------------------
    est = Counter(p.get("est", "?") for p in pares)
    faltan = [s for s in ESTRUCTURAS if est[s] < 20]
    if faltan:
        print(f"\nEstructuras poco cubiertas ({len(faltan)}): {', '.join(faltan[:6])}...")

    # ---- 5. emitir módulo JS -------------------------------------------
    js = f"""/* ============================================================
   DESTILADO — generado por destilar.py
   Corpus: {len(pares)} pares · léxico {len(lexico)} · frases {len(frases)}
   · desambiguación {len(desambig)}

   No editar a mano: se regenera. Las correcciones van al corpus.
   PENDIENTE DE VALIDACIÓN POR HABLANTE NATIVO.
   ============================================================ */

const DESTILADO = {{
  lexico: {json.dumps(lexico, ensure_ascii=False)},
  frases: {json.dumps(frases, ensure_ascii=False)},
  desambig: {json.dumps(desambig, ensure_ascii=False)}
}};

/* Integración con el motor de reglas.
   El destilado NO pisa las entradas escritas a mano: sólo rellena
   huecos. Lo verificado manda sobre lo inferido. */
function aplicarDestilado(){{
  let nuevos = 0;
  const yaEs = new Set(NOUNS.map(x=>x.es).concat(VERBS.map(x=>x.es), ADJS.map(x=>x.es)));

  DESTILADO.lexico.forEach(d=>{{
    if(d.conf < 0.65) return;
    if(yaEs.has(d.es)) return;
    /* sin categoría gramatical fiable, entra como sustantivo:
       es la clase más numerosa y la de menor daño si se equivoca */
    NOUNS.push({{pw:d.pw, es:d.es, g:'m', destilado:true, conf:d.conf}});
    yaEs.add(d.es);
    nuevos++;
  }});

  DESTILADO.frases.forEach(f=>{{
    const k = normalize(f.es);
    if(PHRASE_ES.has(k)) return;
    const p = {{pw:f.pw, es:f.es, destilado:true}};
    PHRASES.push(p);
    PHRASE_ES.set(k, p);
    if(!PHRASE_PW.has(normalize(f.pw))) PHRASE_PW.set(normalize(f.pw), p);
  }});

  rebuildIndex();
  return nuevos;
}}

/* Desambiguación por contexto: ante varias opciones, gana la que
   comparte más palabras con el resto de la frase. */
function elegirPorContexto(lemaEs, tokensFrase){{
  const perfiles = DESTILADO.desambig[lemaEs];
  if(!perfiles) return null;
  const ctx = new Set(tokensFrase.map(normalize));
  let mejor = null, mejorPunt = 0;
  for(const [pw, claves] of Object.entries(perfiles)){{
    const punt = claves.filter(c=>ctx.has(normalize(c))).length;
    if(punt > mejorPunt){{ mejorPunt = punt; mejor = pw; }}
  }}
  return mejorPunt > 0 ? mejor : null;
}}
"""
    Path(salida).write_text(js, encoding="utf-8")
    print(f"\nEscrito {salida}  ({len(js)/1024:.1f} KB)")


# ---------------------------------------------------------------- auditar
def auditar(corpus):
    """Comprueba que el corpus cumple lo que el prompt pedía.
    El LLM incumple instrucciones de forma silenciosa: hay que medirlo."""
    pares = [json.loads(l) for l in open(corpus, encoding="utf-8")]
    n = len(pares)
    print(f"Corpus: {n} pares\n")

    marcadores = ["a ", "did ", "done ", "a go ", "wi ", "nuh ", "deh ", "dem", "fi "]
    con_marcador = sum(1 for p in pares if any(m in " " + p["pw"].lower() + " " for m in marcadores))
    print(f"Con algún marcador TMA/gramatical : {con_marcador/n:6.1%}")

    # síntomas de inglés estándar sin criollizar
    sospechosos = [p for p in pares if re.search(
        r"\b(the|is|are|was|were|they|them|their|this|that|with|there|going|doing)\b",
        p["pw"].lower())]
    print(f"Con calcos del inglés estándar    : {len(sospechosos)/n:6.1%}  ← revisar")

    # pronombre sujeto español redundante
    redundantes = [p for p in pares if re.match(
        r"^(yo|tú|él|ella|nosotros|vosotros|ellos)\s", p["es"].lower())]
    print(f"Español con pronombre redundante  : {len(redundantes)/n:6.1%}")

    largos = sum(1 for p in pares if len(p["es"].split()) > 14)
    print(f"Frases más largas de lo pedido    : {largos/n:6.1%}")

    print("\nReparto por estructura:")
    for e, c in Counter(p.get("est", "?") for p in pares).most_common():
        marca = "  ← escaso" if c < 20 else ""
        print(f"  {c:5d}  {e}{marca}")

    print("\nReparto por dominio:")
    for d, c in Counter(p.get("dom", "?") for p in pares).most_common():
        print(f"  {c:5d}  {d}")

    if sospechosos:
        print("\nMuestra de casos con calco del inglés (revisar a mano):")
        for p in sospechosos[:8]:
            print(f"  ES: {p['es']}\n  PW: {p['pw']}\n")


# ---------------------------------------------------------------- cli
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generar", help="genera el corpus paralelo con el LLM")
    g.add_argument("--n", type=int, default=2000)
    g.add_argument("--salida", default="corpus.jsonl")
    g.add_argument("--lote", type=int, default=25)

    e = sub.add_parser("extraer", help="destila el corpus a un módulo JS")
    e.add_argument("--corpus", default="corpus.jsonl")
    e.add_argument("--salida", default="destilado.js")
    e.add_argument("--min-frec", type=int, default=3)
    e.add_argument("--min-conf", type=float, default=0.55)

    a = sub.add_parser("auditar", help="mide la calidad del corpus")
    a.add_argument("--corpus", default="corpus.jsonl")

    args = ap.parse_args()
    if args.cmd == "generar":
        generar(args.n, args.salida, args.lote)
    elif args.cmd == "extraer":
        extraer(args.corpus, args.salida, args.min_frec, args.min_conf)
    else:
        auditar(args.corpus)


if __name__ == "__main__":
    main()
