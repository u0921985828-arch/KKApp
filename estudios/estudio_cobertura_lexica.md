# Estudio de cobertura léxica — español completo → patois jamaicano

**Pregunta de partida:** cómo se traduciría cada palabra del español al patois.
**Estado del motor:** v0.6 · 592 verbos, 899 sustantivos, 326 adjetivos, 207 frases, 23.855 formas españolas indexadas.
**Método:** muestra estratificada de 801 lemas en cuatro bandas de frecuencia, cruzada contra el índice del motor.

---

## 1. Advertencia previa sobre el DLE

El estudio **no usa el diccionario de la RAE**, y no por comodidad.

El DLE es una base de datos protegida. Sus aproximadamente 93.000 lemas no son de descarga libre ni licenciables sin acuerdo, y en la Unión Europea el derecho *sui generis* sobre bases de datos protege además la inversión en compilarla, con independencia de que las palabras sueltas no sean originales. Volcar el DLE en PatwaLink y monetizarlo sería exactamente la infracción que identifiqué en el diccionario del competidor, sólo que con un titular mucho más litigante.

Existe una alternativa legítima: **listas de frecuencia de corpus abiertos** (CREA agregado, OpenSubtitles, Wikipedia en español). Las frecuencias son hechos, no obra protegida, y los corpus abiertos permiten uso derivado. Para propósitos de cobertura son además *mejores* que el DLE, porque ordenan por utilidad real en lugar de por criterio normativo.

Lo que sigue usa una muestra construida a tal efecto, no el DLE.

---

## 2. Cobertura medida

| Banda | Contenido | Cobertura |
|---|---|---|
| **B1 — núcleo** | verbos y sustantivos de máxima frecuencia | **90%** (179/199) |
| **B2 — frecuente** | vocabulario común de conversación culta | **60%** (222/371) |
| **B3 — específico** | objetos concretos, oficios, materiales | **6%** (8/127) |
| **B4 — abstracto culto** | *desdén, cordura, zozobra, albedrío* | **1%** (1/104) |

La caída es abrupta y no es casual: refleja dónde se ha trabajado.

---

## 3. El hallazgo central: sólo hay cuatro estrategias

Clasificando las 2.057 entradas ya existentes por cómo se formó el equivalente patois:

| Estrategia | Proporción | Ejemplo |
|---|---|---|
| **Palabra inglesa sin cambio** | 79% | *mercado* → `market` |
| **Compuesto o locución** | 18% | *patio trasero* → `backyaad` |
| **Adaptación fonológica regular** | 2% | *cosa* → `ting`, *ellos* → `dem` |
| **Origen africano o criollo propio** | 1% | *comer* → `nyam`, *niño* → `pickney` |

Esto es coherente con la descripción académica del criollo jamaicano: léxico abrumadoramente derivado del inglés sobre una gramática de sustrato africano.

**Y tiene una consecuencia operativa fuerte:** para el 79% de los casos, traducir español → patois es en la práctica traducir español → inglés y aplicar unas pocas reglas ortográficas. Eso es automatizable. El trabajo humano irreducible es el 21% restante.

---

## 4. Proyección al vocabulario completo

Extrapolando las cuatro bandas a la distribución real del español:

| Tramo | Lemas aprox. | Cobertura actual | Automatizable | Trabajo manual |
|---|---|---|---|---|
| 1–2.000 (núcleo) | 2.000 | ~90% | 150 | 50 |
| 2.000–8.000 (frecuente) | 6.000 | ~60% | 2.000 | 400 |
| 8.000–30.000 (específico) | 22.000 | ~6% | 18.000 | 2.700 |
| 30.000+ (culto, técnico, arcaico) | 60.000+ | ~1% | — | — |

**Los primeros 8.000 lemas cubren en torno al 95% de cualquier texto corriente en español.** Ese es el objetivo realista, no los 93.000 del DLE.

Los 60.000 lemas del último tramo son en su mayoría intraducibles al patois por una razón que no es de esfuerzo: **el criollo jamaicano no tiene registro culto escrito**. Palabras como *contumacia*, *longanimidad* o *prodigalidad* no tienen equivalente porque no existe la esfera de uso donde funcionarían. La traducción honesta es una paráfrasis, no una palabra.

---

## 5. Las cuatro respuestas posibles ante una palabra

Un motor serio debe distinguirlas y decírselo al usuario:

**a) Equivalente directo.** Existe la palabra. *pan* → `bread`.

**b) Adaptación regular.** No está en el léxico pero se deriva del inglés por reglas: `th`→`d`/`t`, `-er`→`-a`, caída de consonante final, pérdida de `h` inicial. *hermano* → *brother* → `bredda`. Generable automáticamente, marcable como inferido.

**c) Paráfrasis.** No hay palabra pero sí forma de decirlo. *cobardía* → `fraid fi everyting`. Requiere criterio humano.

**d) Sin equivalente.** *contumacia*. Lo correcto es decirlo, no inventar.

El motor actual sólo hace (a) y deja el resto sin traducir. Implementar (b) es la mejora de mayor retorno de todo el proyecto: cubriría gran parte de las bandas B2 y B3 sin escribir entradas a mano.

---

## 6. Hoja de ruta

**Fase A — Derivación automática por reglas fonológicas.**
Un módulo que, ante una palabra española no encontrada, la traduzca al inglés y aplique las reglas de adaptación del criollo. Marcar la salida como inferida, con confianza menor. Coste: días. Impacto estimado: B2 del 60% al 85%, B3 del 6% al 60%.

**Fase B — Léxico dirigido por corpus.**
Sacar las 3.000 palabras españolas más frecuentes de un corpus abierto que aún falten, y resolverlas por lotes. Coste: semanas. Es donde encaja el `destilar.py` que ya tienes.

**Fase C — Estrategias no léxicas.**
Marcar explícitamente los casos (c) y (d). Un traductor que dice «esto no tiene equivalente en patois; se diría así en su lugar» es más útil y más honesto que uno que inventa.

**Fase D — Corte deliberado.**
Fijar el techo en unos 8.000 lemas y declararlo. Perseguir los 93.000 del DLE es perseguir palabras que ningún hablante de patois usaría nunca.

---

## 7. Lo que este estudio no dice

Mide **cobertura**, no **corrección**. Que *acantilado* tenga entrada no garantiza que `cliff` sea lo que diría alguien en Jamaica, ni que el registro encaje.

La muestra de 801 lemas la construí yo. Es representativa por bandas, pero no es una lista de frecuencia real de corpus. Los porcentajes son órdenes de magnitud, no cifras finas.

Y la advertencia de siempre, que aquí pesa más: el 79% de las entradas actuales son palabras inglesas asumidas como válidas en criollo. Es lo que dice la literatura sobre la composición del léxico, pero **entrada por entrada nadie lo ha verificado**. Un hablante nativo diría que varias de esas formas no se usan, o que se usa otra distinta. Ese trabajo sigue pendiente y ninguna cantidad de automatización lo sustituye.
