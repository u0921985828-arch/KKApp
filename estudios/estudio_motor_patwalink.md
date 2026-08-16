# PatwaLink — Auditoría del motor de traducción

**Versión evaluada inicialmente:** v0.4 (motor de reglas, 451 verbos / 621 sustantivos / 242 adjetivos / 154 frases, 9.388 formas españolas indexadas)
**Método:** batería diagnóstica de 70 casos etiquetados por fenómeno gramatical, ejecutada contra el motor sin intervención manual.
**Fecha:** agosto 2026

> **Actualización — v0.7.** Aplicadas las cuatro fases.
> Resultado: **66/70 (94%)**, desde 6/70 (9%).
> Detalle por fenómeno al final del documento (§8).

---

## 1. Resumen ejecutivo

El motor pasa **6 de 70** casos (9%).

Las pruebas anteriores daban 20/20. No eran falsas: medían **cobertura léxica** — qué porcentaje de palabras reconoce el diccionario. Esta batería mide **corrección gramatical**, que es otra cosa. Un motor puede reconocer el 100% de las palabras y producir una traducción incorrecta en el 90% de los casos. Es exactamente lo que ocurre.

| Métrica | Resultado |
|---|---|
| Casos superados | 6/70 (9%) |
| Fallos sólo por pro-drop (cosmético) | 8 |
| Fallos estructurales | 56/70 (80%) |
| Fenómenos con 0% de acierto | TMA, cópula, focalización, negación, verbos seriales, subordinación, pronombres, reduplicación |

**Conclusión:** el motor actual no es un traductor. Es un **sustituidor léxico con parcheado morfológico**. Traduce palabra por palabra y aplica unos pocos ajustes locales. Produce resultados aceptables sólo en oraciones cortas de estructura SVO simple, que es precisamente el subconjunto que usé para desarrollarlo — sesgo de confirmación clásico.

Lo relevante es que **ninguno de los 56 fallos estructurales es un fallo de datos**. Todos son fallos de arquitectura. Ampliar el léxico a 10.000 entradas no arreglaría ni uno.

---

## 2. Resultados por fenómeno

```
TMA   0/10    0%   sistema tiempo-modo-aspecto
COP   0/5     0%   cópula supletiva
FOC   0/4     0%   focalización con a-fronting
NEG   0/6     0%   negación y concordancia negativa
SER   0/4     0%   verbos seriales
SUB   0/5     0%   subordinación
PRO   0/4     0%   pronombres (unu, fi-serie, reflexivos)
RED   0/3     0%   reduplicación
PRD   1/10   10%   producción ES→PW
SN    1/7    14%   sintagma nominal
INT   1/4    25%   interrogación
ESP   3/8    38%   naturalidad del español
```

---

## 3. Análisis de causa raíz

Los 64 fallos se reducen a **nueve defectos de arquitectura**. Ordenados por número de casos que bloquean.

### R1 · No hay análisis sintagmático — 23 casos

El motor procesa tokens en secuencia lineal. No construye constituyentes. Consecuencias directas:

- **Orden adjetivo-sustantivo.** El criollo antepone (`big house`), el español pospone (`casa grande`). Sin sintagma nominal identificado, no hay nada que reordenar. → `wan big house` = "Una grande casa"
- **Posesivo por yuxtaposición.** `di man car` es "el coche del hombre": dos sintagmas nominales en relación genitiva. Sin análisis, salen dos sustantivos seguidos. → "El hombre coche"
- **Verbos seriales.** `carry it come`, `tek di book go`, `run go a shop` son predicados complejos de un solo evento. Tratados como verbos independientes producen sinsentidos. → "Lleva it viene"
- **Relativas.** `di man weh mi si` requiere identificar la frontera de la cláusula relativa. → "El hombre dónde me ve"
- **Focalización.** `a di book mi buy` antepone el objeto al sujeto. Un parser lineal lee "a" como cópula y colapsa. → "Es el me reserva compra"

**Este es el defecto central.** Los demás son reparables por parches; éste exige reescribir el núcleo.

### R2 · Aspecto por defecto invertido — 10 casos

Error lingüístico grave, no de implementación.

En criollo jamaicano el valor temporal de un verbo **sin marca** depende de su clase aspectual:

| Clase | Ejemplo | Verbo desnudo significa |
|---|---|---|
| Dinámico | `nyam`, `run`, `buy` | **pasado** |
| Estativo | `know`, `have`, `want`, `love` | **presente** |

El motor asume presente en ambos casos.

```
mi nyam di food   →  obtenido: "como la comida"   correcto: "comí la comida"
mi know im        →  obtenido: "lo sé"            correcto: "lo conozco"
```

Esto invalida sistemáticamente el tiempo verbal de toda oración sin marcador explícito, que en habla real es la mayoría. **Requiere un rasgo `stative: true/false` en cada una de las 451 entradas verbales.** No hay atajo: la clase aspectual no es predecible desde la forma.

### R3 · El analizador TMA no apila marcadores — 8 casos

Los marcadores del criollo ocupan posiciones fijas y se combinan:

```
[NEG] [did] [a go | wi] [a | done] VERBO
 nuh   did      a go      done      nyam
```

El motor consume **como máximo un marcador** y trata el resto como palabra desconocida.

```
mi did a nyam    →  "Yo did estoy comiendo"  [did no reconocido]
mi did done nyam →  "Yo did ya comí"         [did no reconocido]
im did tiad      →  "Él did está cansado"    [did no reconocido]
```

La solución es un autómata de ranuras que consuma marcadores mientras los haya y componga el valor TMA resultante antes de emitir. Las combinaciones son finitas y bien documentadas:

| Combinación | Valor | Español |
|---|---|---|
| `V` (dinámico) | pasado simple | comí |
| `V` (estativo) | presente | conozco |
| `a V` | progresivo | estoy comiendo |
| `did V` | anterior | había comido |
| `did a V` | pasado progresivo | estaba comiendo |
| `done V` | completivo | ya he comido |
| `did done V` | pasado completivo | ya había comido |
| `a go V` / `wi V` | futuro | voy a comer / comeré |
| `wuda V` | condicional | comería |
| `cuda V` | condicional de capacidad | podría comer |

### R4 · `a` no está desambiguado — 9 casos

`a` es el morfema más sobrecargado del criollo. Funciona como:

1. Marcador progresivo — `mi a nyam`
2. Cópula ecuativa — `im a teacha`
3. Preposición de lugar — `guh a shop`
4. Marcador de foco — `a mi dweet`
5. Parte de `a go` (futuro)

El motor lo resuelve con heurísticas ad hoc encadenadas. Falla en cuanto el contexto se aparta de los casos que probé.

**Procedimiento de decisión correcto**, por orden:

```
a + "go" + V              → futuro
a en posición inicial      → foco  (a mi dweet / a di book mi buy)
a + V                      → progresivo
a + SN definido/nombre     → cópula ecuativa
a + topónimo/lugar         → preposición
tras verbo de movimiento   → preposición
```

La regla decisiva que falta: **`a` en posición inicial absoluta es siempre foco**, nunca cópula.

### R5 · La negación no se trata como rasgo oracional — 6 casos

El criollo tiene concordancia negativa: la negación se marca en todos los elementos negables de la cláusula. El español la marca una vez (más el "no" preverbal).

```
mi nuh have nuh money    →  obtenido: "no tengo no dinero"   correcto: "no tengo dinero"
nobody nuh si nutten     →  obtenido: "nadie no ve nada"     correcto: "nadie vio nada"
```

Solución: detectar negación a nivel de cláusula, emitir **un** negador español, y suprimir los redundantes. Regla adicional: si el sujeto español ya es negativo (`nadie`, `nada`, `nunca`), no se emite "no".

Faltan además tres negadores del inventario: `neva` (pasado negado), `nah` (progresivo/futuro negado), `nuhbaddy`.

### R6 · Sin desambiguación de categoría gramatical — 7 casos

Palabras homógrafas entre verbo y sustantivo se resuelven por orden de inserción en el índice, no por contexto.

```
tek di book go   →  "book" leído como verbo 'reservar'  →  "Coge el reserva va"
a fi mi book     →  idem                                →  "Está para me reserva"
```

El parche actual (tras determinante gana el sustantivo) cubre un caso de varios. Se necesita desambiguación posicional real: tras determinante o posesivo → nominal; tras marcador TMA o negador → verbal; tras preposición → nominal.

### R7 · Español sin pro-drop — 8 casos

El motor emite siempre el pronombre sujeto. En español es agramatical por redundante salvo contraste o énfasis.

```
mi have money  →  obtenido: "Yo tengo dinero"   natural: "Tengo dinero"
```

Es el defecto más barato de arreglar y el que más afecta a la percepción de calidad: la salida actual suena a traducción automática de los años noventa. Regla: suprimir el pronombre sujeto salvo que (a) haya foco explícito en el original, (b) haya cambio de sujeto respecto a la cláusula anterior, o (c) sea 3ª persona ambigua.

### R8 · Inventario funcional incompleto — 12 casos

Elementos gramaticales de alta frecuencia ausentes del léxico:

| Falta | Función | Ejemplo fallado |
|---|---|---|
| `fi` complementante | infinitivo / subjuntivo | `mi waan fi go` → "quiero para voy" |
| `seh` complementante | "que" tras verbo de dicción/cognición | `mi know seh...` → "sé lo digo..." |
| `weh` relativizador | "que" relativo | `di man weh mi si` → "el hombre dónde me ve" |
| `mek` causativo | "dejar/hacer que" | `mek mi si` → "me hace ve" |
| `neva`, `nah` | negadores | ver R5 |
| `wuda`, `cuda`, `shuda` | condicionales | no reconocidos |
| `dan` | comparativo | no reconocido |
| `so` en `yah so` | intensificador locativo | `a yah so` → "así que" |
| `it`, `much`, `every` | funcionales básicos | marcados como desconocidos |

Nótese que `fi`, `seh` y `weh` **ya existen** en el léxico pero con la acepción equivocada (`fi`=preposición, `seh`=verbo decir, `weh`=interrogativo dónde). El problema no es que falten: es que sólo tienen una acepción y no hay desambiguación.

### R9 · Fenómenos no implementados — 8 casos

- **Reduplicación** (3 casos). `long long` = intensidad, `talk talk` = iteración, `likkle likkle` = atenuación. Detección trivial (token repetido adyacente), semántica dependiente de la clase de palabra.
- **Imperativo** (2 casos). El criollo usa el verbo desnudo sin sujeto. El español necesita forma imperativa propia, distinta en afirmativo (`ven`) y negativo (`no vengas`, subjuntivo).
- **`unu`** — se traduce como "vosotros" pero no fuerza concordancia verbal de 2ª plural.
- **Interrogación** — el criollo no invierte ni marca; el español necesita signos de apertura y cierre. Detectable por presencia de palabra-qu o por entonación, que en texto no existe. Requiere heurística sobre el original.

---

## 4. Defectos menores detectados de paso

Fallos del conjugador español localizados durante la ejecución:

1. **`conseguir` → gerundio `consiguyendo`** (correcto: *consiguiendo*). La regla de `-uir` con inserción de *y* captura por error los verbos en `-guir` y `-quir`. Corrección: excluir cuando la `u` es ortográfica y no vocálica.
2. **`di food a get cold` → "consiguyendo fría"**. Además del error anterior, `get + adjetivo` es una construcción incoativa que el español expresa con verbo pronominal (`enfriarse`), no con "conseguir".
3. **`wi` (futuro) confundido con `wi` (nosotros)** → `mi wi nyam` = "Yo nos como". Homografía no resuelta: `wi` tras pronombre sujeto es marcador de futuro.

---

## 5. Hoja de ruta

Ordenada por casos desbloqueados frente a esfuerzo.

### Fase 1 — Reparaciones sin cambio de arquitectura
*Estimado: ~20 casos recuperados*

| # | Tarea | Casos |
|---|---|---|
| 1.1 | Pro-drop en salida española | 8 |
| 1.2 | Autómata de ranuras TMA (apilar marcadores) | 8 |
| 1.3 | Negación como rasgo de cláusula | 6 |
| 1.4 | Completar inventario funcional (`neva`, `nah`, `wuda`, `cuda`, `dan`, `it`, `much`, `every`) | 5 |
| 1.5 | Desambiguar `wi` futuro / `wi` pronombre | 1 |
| 1.6 | Corregir `-guir`/`-quir` en el conjugador | 2 |

Nota: las cifras se solapan; un caso puede requerir dos arreglos.

### Fase 2 — Rasgo aspectual del léxico
*Estimado: ~10 casos*

Etiquetar las 451 entradas verbales con `stative: true/false`. Trabajo de datos, no de código. Los estativos del criollo son un conjunto acotado y bien descrito: verbos de cognición (`know`, `undastan`, `memba`), de percepción (`si`, `hear`, `feel`), de posesión (`have`, `own`), de volición (`want`, `love`, `like`, `need`), de relación (`belong`, `cost`) y los adjetivos predicativos, que en criollo **son verbos**.

Sin este rasgo el tiempo verbal es incorrecto en la mayoría de oraciones reales. Es la mejora de mayor impacto por unidad de esfuerzo.

### Fase 3 — Análisis sintagmático
*Estimado: ~23 casos. Reescritura del núcleo.*

Sustituir el bucle lineal por un analizador de dos pasadas:

**Pasada 1 — segmentador de constituyentes.** Agrupa tokens en sintagmas nominales (`DET? ADJ* N (dem)?`), sintagmas verbales (`NEG? TMA* V+`) y preposicionales. No requiere gramática completa: un *chunker* superficial basado en categoría gramatical cubre el criollo con holgura, porque su sintaxis es marcadamente analítica y de orden fijo.

**Pasada 2 — transferencia.** Opera sobre constituyentes, no sobre palabras. Aquí sí es posible reordenar adjetivo y sustantivo, resolver el genitivo por yuxtaposición, colapsar verbos seriales en un predicado y reconocer la anteposición focal.

Esta fase es la que convierte el sistema en un traductor de verdad. También es la que puede romper lo que ya funciona, así que la batería diagnóstica debe correr en cada cambio.

### Fase 4 — Fenómenos restantes
Reduplicación, imperativo, interrogación, concordancia de `unu`, construcciones incoativas con `get`.

---

## 6. Advertencias metodológicas

**La batería la he escrito yo, y las respuestas esperadas también.** Eso significa que mide la distancia entre el motor y *mi* modelo del criollo jamaicano, no entre el motor y el criollo real. Los 70 casos están construidos sobre descripciones gramaticales publicadas (Bailey, Cassidy & Le Page, Patrick, Durrleman), pero la traducción española esperada es criterio mío y no está validada.

Antes de tomar estos números como referencia estable, la batería necesita revisión por un hablante nativo. Un caso mal etiquetado es peor que ningún caso: convierte un acierto en fallo o al revés, y orienta mal el desarrollo.

**Segunda advertencia:** 70 casos son pocos. Cubren fenómenos, no frecuencias. Un motor puede aprobar los 70 y seguir siendo malo con habla real, donde aparecen elipsis, cambio de código con inglés estándar, y vocabulario que ningún diccionario recoge. La batería debería crecer hacia 300-500 casos con material de habla real transcrita.

---

## 7. Qué significa esto para el producto

El diagnóstico no invalida la estrategia. La refuerza.

El motor de reglas **sigue siendo el enfoque correcto** para coste cero y funcionamiento sin conexión, y el diagnóstico demuestra por qué: los fallos son sistemáticos y localizables. Un modelo estadístico con este rendimiento sería una caja negra imposible de depurar. Aquí cada fallo tiene una causa nombrable y una corrección concreta.

La comparación con el APK competidor no cambia: ellos no traducen en absoluto. Un motor al 9% de corrección gramatical sigue haciendo algo que su aplicación no hace. Pero **no se puede publicar así**, y menos con la palabra "traductor" en el nombre — que es exactamente la crítica que le hice a su producto.

Orden sensato: Fase 1 y 2 primero (recuperan ~30 casos con trabajo acotado), medir de nuevo, y sólo entonces decidir si la Fase 3 merece la reescritura o si conviene acotar el producto a lo que el motor hace bien —frases hechas, glosario con contexto cultural, oraciones simples— y ser honesto sobre el alcance.


---

## 8. Resultado tras aplicar el estudio (v0.5)

| Fenómeno | v0.4 | v0.5 | |
|---|---|---|---|
| ESP naturalidad del español | 3/8 | **8/8** | resuelto |
| NEG negación | 0/6 | **6/6** | resuelto |
| RED reduplicación | 0/3 | **3/3** | resuelto |
| TMA sistema tiempo-modo-aspecto | 0/10 | **10/10** | resuelto |
| COP cópula supletiva | 0/5 | **5/5** | resuelto |
| PRO pronombres | 0/4 | **4/4** | resuelto |
| SUB subordinación | 0/5 | **5/5** | resuelto |
| PRD producción ES→PW | 1/10 | **10/10** | resuelto |
| INT interrogación | 1/4 | **2/4** | |
| SN sintagma nominal | 1/7 | **5/7** | |
| FOC focalización | 0/4 | **4/4** | resuelto |
| SER verbos seriales | 0/4 | **4/4** | resuelto |
| **GLOBAL** | **6/70 (9%)** | **66/70 (94%)** | |

### Qué se implementó

**R7 · Pro-drop.** Supresión del pronombre sujeto español salvo ambigüedad de tercera persona sin sustantivo identificador.

**R3 · Autómata de ranuras TMA.** Sustituye el consumo de un solo marcador por un parser que apila `[NEG][did][a go|wi][a|done][modal]` y compone un valor único. Cubre las diez combinaciones documentadas, incluidas `did a` (pasado progresivo) y `did done` (pasado completivo).

**R2 · Clase aspectual.** Conjunto `ESTATIVOS` con 35 lemas. El verbo desnudo se resuelve como pasado si es dinámico y presente si es estativo. Añadida la excepción por adverbio habitual, que fuerza presente.

**R5 · Negación oracional.** La negación pasa a ser un token propio en lugar de ir embebida en el verbo, lo que permite colapsarla al final y colocar correctamente los clíticos (`no lo vi`, no `lo no vi`). Añadidos `neva` (pasado negado), `nah` (prospectivo negado) y los pronombres negativos inherentes.

**R8 · Inventario funcional.** `seh` complementante, `weh` relativizador, `fi` infinitivo y `fi` con sujeto (→ subjuntivo), `mek` causativo, `wuda`/`cuda`, `dan` comparativo, `every`, `it`, `much`, `so`.

**Morfología española nueva:** participio (con 17 irregulares), subjuntivo presente derivado de la 1ª persona —lo que arrastra las irregularidades automáticamente—, subjuntivo imperfecto sobre la 3ª plural del pretérito, condicional, futuro sintético e imperativo afirmativo y negativo.

**Fenómenos añadidos:** reduplicación en sus tres valores (intensiva → superlativo, iterativa → «X y X», atenuativa), imperativo por posición, `unu` con concordancia de segunda plural, «a» personal ante objeto animado, signos de interrogación en preguntas con palabra-qu.

**Dirección ES→PW:** mapeo inverso de tiempos. El punto no evidente es que el pretérito español se traduce por **verbo desnudo**, no por `did`: `did` es anterioridad y corresponde al pluscuamperfecto. El motor anterior lo hacía al revés en todos los casos.

### R1 abordado por reconocimiento de patrones

En vez de reescribir el núcleo con un analizador sintáctico completo, se implementó **reconocimiento de patrones sintagmáticos**: reglas que detectan construcciones concretas antes de entrar al bucle lineal.

- **Focalización.** `analizarFoco()` reconoce las cuatro variantes del `a`-fronting (sujeto, objeto, copia verbal, locativo) y genera la perífrasis de relativo correspondiente en español.
- **Verbos seriales.** Tabla de combinaciones (`carry … come`, `tek … go`, `V + go`, `come + V`) que colapsan dos verbos en un predicado único.
- **Orden adjetivo-nombre.** Detección de ADJ+N con reordenamiento y propagación de género y número al artículo.
- **Genitivo por yuxtaposición.** N+N con determinante → «N2 de N1».
- **Desambiguación posicional.** `tipoDe()` acepta el token anterior: tras determinante gana la lectura nominal. Esto resolvió una familia entera de fallos donde `book` se leía como *reservar*.

Resultado: FOC 0→3, SER 0→2, SN 1→3. Sin reescribir el núcleo.

### R2b · Incoativas

`get`/`tun` + adjetivo no es el verbo léxico seguido de atributo, sino un
cambio de estado: `di food a get cold` es «la comida se está enfriando», no
«está consiguiendo fría». El español lo resuelve de dos maneras y el motor
usa las dos: verbo pronominal lexicalizado cuando existe (`frío` →
*enfriarse*, `viejo` → *envejecer*) y perífrasis con `ponerse` cuando no
(`hungry` → «se está poniendo hambrienta», con concordancia).

Tres decisiones que no son evidentes:

- **La tabla se indexa por el adjetivo español**, no por el token criollo.
  Así una sola entrada cubre todas las grafías que resuelvan al mismo lema,
  que es justo el problema que tiene un léxico sin ortografía fijada.
- **La perífrasis es la salida por defecto**, no un caso de error. Una tabla
  incompleta degrada a español correcto en vez de a disparate, así que
  ampliarla mejora la naturalidad pero nunca es un requisito.
- **No dispara si tras el adjetivo hay un nombre.** En `get nice ting` el
  adjetivo se agrupa con el nombre y `get` vuelve a ser «conseguir».

El arreglo obligó además a corregir la colocación del clítico en las
perífrasis: `realizarTMA()` construía «está enfriando» porque el gerundio
descarta el `se` del lema. Ahora los verbos pronominales lo anteponen
(«se está enfriando», «ya se ha enfriado»), lo que beneficia a cualquier
lema pronominal del léxico, no sólo a las incoativas.

Resultado: COP 4/5 → 5/5.

### Los casos restantes

| Caso | Situación |
|---|---|
| **INT-01** `yu a come` → «¿vienes?» | **Irreducible.** La cadena es idéntica a la afirmativa; sólo la entonación las distingue, y en texto plano no existe. |
| **INT-03** `wah mek yu seh dat` | Resuelto salvo el tiempo verbal: sale «¿por qué dijiste eso?» en vez de «dices». Requiere saber que la pregunta es habitual, no puntual. |
| **SN-04** `a fi mi book` | Colisión entre dos patrones de foco: el posesivo tónico gana sobre el posesivo con nominal. |
| **SN-07** «una casa grande» → `wan big yaad` | **El orden es correcto.** La discrepancia es sólo léxica: el motor elige `yaad` y la batería esperaba `house`. `yaad` es la forma más auténtica, así que aquí el fallo probablemente está en la respuesta esperada, no en el motor. Se deja como fallo para no ajustar la prueba al resultado. |

### Rendimiento final por dirección

- **Patois → Español:** el sistema resuelve TMA completo, cópula supletiva, negación con concordancia, focalización, verbos seriales, subordinación, reduplicación y pronombres.
- **Español → Patois:** 10/10. Incluye el mapeo inverso de tiempos, imperativo afirmativo y negativo, subjuntivo con `fi`, condicional con `wuda`/`cuda`, impersonal con `dem`, verbos pronominales reconocidos como unidad y comparativos con `dan`.

### El número no es una nota

93% mide la distancia entre el motor y **mi** modelo del criollo jamaicano. La batería la escribí yo y las respuestas esperadas también. Sin validación por hablante nativo, ese 93% podría ser un 60% real.

Además, 70 casos cubren fenómenos, no frecuencias. Con habla real —elipsis, cambio de código con inglés estándar, léxico no recogido— el rendimiento será menor. La batería debería crecer hacia 300-500 casos sobre transcripciones reales antes de considerarse una medida fiable.

INT-01 (interrogativa polar sin palabra-qu) es **irresoluble en texto plano**: `yu a come` y "estás viniendo" son la misma cadena; sólo la entonación las distingue. Ninguna arquitectura lo arregla sin marca ortográfica en la entrada.

### Nota sobre el método

El salto de 9% a 59% se obtuvo sin ampliar el léxico ni una entrada. Confirma el diagnóstico de la §3: los fallos eran de arquitectura, no de datos.
