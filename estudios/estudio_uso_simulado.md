# PatwaLink — Estudio de uso simulado

**10.000 usuarios · 8 horas · 82.020 traducciones**
Semilla `20260816` · repertorio de 459 frases · motor `patwalink.html`

```bash
node herramientas/estudio_uso.js --usuarios=10000 --horas=8
```

---

## Lo primero: qué es esto y qué no es

Esto **no** es un estudio con personas. Son 10.000 usuarios sintéticos generados
con semilla fija, y por tanto reproducible: dos ejecuciones dan el mismo
resultado, y cambiar la semilla sirve para comprobar que las conclusiones no
dependen de un sorteo concreto.

| Se mide | No se mide |
|---|---|
| Latencia por traducción, y su cola | Si la traducción **suena bien** a un jamaicano |
| Cobertura léxica real por dominio | Si la acepción elegida es la adecuada |
| Qué palabras faltan y a cuántos usuarios afectan | Si el registro es el correcto |
| Qué reglas gramaticales disparan y cuáles no | Si el usuario se entendió con su interlocutor |
| Fallos del motor bajo carga | Satisfacción, retención, nada conductual |

La razón es que no hay verdad de referencia. Para medir corrección haría falta
un juicio humano por traducción; simular ese juicio sería inventarlo. La
validación por hablantes nativos sigue siendo el cuello de botella del proyecto
y este estudio no la sustituye ni la acerca.

**Lo que sí hace** es responder a preguntas que hasta ahora no tenían dato:
¿aguanta el motor? ¿cuánta gente se topa con una palabra que falta? ¿cuáles,
exactamente? ¿qué partes del motor se usan de verdad?

---

## Cómo se construyó el corpus

La trampa evidente de un ejercicio así es generar las frases desde el propio
diccionario del motor: la cobertura saldría del 100% por construcción y el
estudio no diría nada. `herramientas/corpus_uso.js` se escribió **sin mirar el
léxico**, con vocabulario español y criollo corriente organizado por dominio de
uso: saludos, comida, direcciones, familia, trabajo, salud, ocio, problemas,
gramática marcada, palabra suelta y registro abstracto. Que una parte no esté
cubierta es el resultado que se busca, no un defecto del corpus.

El muestreo es **Zipf**, no uniforme: en uso real unas pocas frases se repiten
muchísimo y la cola es larguísima. Muestrear uniforme habría dado una cobertura
optimista, porque diluye el peso de las frases corrientes — y son justamente las
corrientes las que más daño hacen cuando fallan.

Modelo de sesión: 1–3 sesiones por usuario (68% una sola), traducciones por
sesión con cola geométrica de media 6, y una curva diurna de carga con pico en
la cuarta hora.

---

## 1 · Volumen

| | |
|---|---|
| Traducciones | **82.020** |
| Sesiones | 13.793 (5,95 traducciones cada una) |
| Hora pico | 14.325 traducciones |
| Fallos del motor | **0** |

Cero excepciones en 82.020 traducciones, incluidas entradas en la dirección
equivocada y palabras inventadas. El motor no se rompe; devuelve algo siempre.

---

## 2 · Rendimiento: el hallazgo que cambió el código

El perfil de CPU de una traducción con palabras desconocidas salió inequívoco:

```
58,3%  phoneticKey
15,6%  normalize
 5,3%  lookupPw
```

**El 74% del tiempo se iba en dos funciones puras de una cadena.** Derivar una
palabra que no está en el léxico las llama cientos de veces sobre el mismo
puñado de formas: la cascada de derivación genera candidatos, y cada candidato
que prospera indexa además su paradigma completo de conjugación.

Memorizarlas —dos `Map` y una guarda de tamaño— es el cambio de mayor efecto por
línea escrita en todo el motor. Medido con el mismo corpus y la misma semilla,
contra el motor de antes y el de después:

| | Antes | Después | Mejora |
|---|---:|---:|---:|
| Media | 1,367 ms | **0,055 ms** | 25× |
| Mediana (p50) | 0,043 ms | 0,014 ms | 3× |
| p90 | 4,854 ms | 0,158 ms | 31× |
| p95 | 9,736 ms | **0,293 ms** | 33× |
| p99 | 14,870 ms | 0,521 ms | 29× |
| Máximo | 32,109 ms | 4,583 ms | 7× |
| CPU en la hora pico | 19,6 s | 0,8 s | 25× |

Lo que importa no es la media sino **la forma de la distribución**. Antes, la
mediana era 0,04 ms y el p95 casi 10 ms: un factor 226 entre el caso corriente y
el caso malo. Ese salto es exactamente la frontera entre «la palabra está en el
diccionario» y «hay que derivarla», y el usuario lo notaba justo cuando escribía
algo que el motor no conocía — es decir, en el peor momento posible.

Las métricas de cobertura de ambas pasadas son **idénticas byte a byte**, y el
ranking de palabras desconocidas también. Es la comprobación de que la
optimización no cambió ni una traducción.

Coste: dos cachés acotadas a 20.000 entradas. Tras 3.000 traducciones variadas
contenían 7.539 y 2.114 entradas, así que en una sesión real no llegan al tope
nunca.

---

## 3 · Cobertura léxica

| | |
|---|---|
| Cobertura media | **95,5%** |
| Traducciones completas | 88,0% |
| Con algún hueco | 12,0% |
| Por debajo del 80% | 9,0% |
| Sesiones con al menos un hueco | 45,0% |
| **Usuarios con al menos un hueco** | **53,5%** |
| Palabras distintas sin cubrir | 23 |

El 95,5% suena bien y es la cifra engañosa. **La que importa es el 53,5%**: más
de la mitad de los usuarios se topa con una palabra que falta en algún momento
de su jornada. Un promedio alto de tokens no protege a nadie, porque los huecos
no se reparten uniformemente entre las personas: se concentran en unas pocas
frases muy repetidas, y esas las escribe casi todo el mundo.

Sólo **23 palabras distintas** producen todo ese daño. Es una lista corta y
completamente accionable.

### Por dominio

| Dominio | Traducciones | Cobertura |
|---|---:|---:|
| saludo | 7.053 | **90,0%** |
| abstracto | 1.504 | 91,8% |
| ocio | 2.885 | 93,4% |
| comida | 11.919 | 94,0% |
| direcciones | 9.338 | 95,1% |
| gramática | 22.305 | 95,7% |
| trabajo | 5.027 | 96,5% |
| palabra suelta | 7.797 | 97,4% |
| problema | 4.346 | 98,7% |
| familia | 7.333 | 98,8% |
| salud | 2.513 | 100,0% |

El peor dominio es **el saludo**, que es lo primero que escribe cualquiera al
abrir un traductor. El estudio de cobertura léxica anticipaba que la banda débil
sería el registro abstracto —y sale segundo por la cola, con un 91,8%—, pero no
anticipaba que la cortesía cotidiana estuviera peor. La causa es concreta y está
en la lista de abajo.

Por direcciones el reparto es simétrico: es→pw 95,6%, pw→es 95,3%. Ninguna de las
dos arrastra a la otra.

---

## 4 · La cola de reparación

Ordenada por **usuarios afectados**, no por frecuencia: lo que decide la
prioridad es a cuánta gente le pasa, no cuántas veces pasa.

| # | Palabra | Usuarios | Dir | Qué es |
|---:|---|---:|---|---|
| 1 | **por** / **favor** | 1.619 | es→pw | «por favor» sale sin traducir |
| 3 | **hay** | 1.146 | es→pw | *haber* impersonal |
| 4 | **llévame** | 817 | es→pw | imperativo con enclítico |
| 5 | **du** | 799 | pw→es | *do*, verbo corrientísimo |
| 6 | **gi** | 670 | pw→es | *give* |
| 7 | **déjame** | 621 | es→pw | imperativo con enclítico |
| 8 | **fin** | 517 | es→pw | de «fin de semana» |
| 9 | **hol** | 453 | pw→es | *hold* |
| 10 | **done** | 312 | pw→es | como verbo léxico, no marcador |
| 11 | **respect** | 249 | pw→es | fórmula de saludo |
| 12 | **yeah** | 239 | pw→es | |
| 13 | **vibes** | 209 | pw→es | |
| 14 | **cool** | 205 | pw→es | |

Se agrupan en cuatro arreglos, no catorce:

1. **Cortesía**: `por favor`, `respect`, `yeah`, `cool`, `vibes`. Fórmulas fijas,
   entrada directa al léxico. Arreglan el peor dominio del estudio.
2. **Verbos ligeros del criollo**: `du`, `gi`, `hol`. Están entre los más
   frecuentes de la lengua y faltan los tres.
3. **Imperativo con enclítico**: `llévame`, `déjame`. No es léxico sino
   morfología — el motor ya separa clíticos en otras posiciones.
4. **`haber` impersonal**: «hay» no tiene equivalente directo y necesita
   reescritura a la construcción locativa con `deh`.

Frases enteras que salen mal, por número de usuarios que las escriben:

```
"por favor"            ->  Por favor          (sin traducir)
"respect"              ->  Respect            (sin traducir)
"yeah man"             ->  Yeah hombre        (medio traducida)
"di vibes nice"        ->  El vibes majo
"cool nuh man"         ->  Cool no hombre
"la cuenta por favor"  ->  Di bill por favor
"¿dónde hay una fiesta?" -> Weh hay wan party?
```

---

## 5 · Qué partes del motor se usan

| Regla | Disparos | |
|---|---:|---|
| ASP clase aspectual | 17.148 | el corazón del motor |
| MOD modales | 7.390 | |
| COP0 cópula cero | 7.367 | |
| COP cópula supletiva | 7.226 | |
| FRASE fórmula fija | 7.211 | |
| TMA marcadores | 5.668 | |
| NEG negación | 5.411 | |
| IMP imperativo | 4.524 | |
| SUB subordinación | 3.131 | |
| DER derivación | 2.914 | la ruta cara |
| FUT futuro | 2.203 | |
| SN sintagma nominal | 2.120 | |

La clase aspectual dispara en uno de cada cinco tokens procesados: es, con
diferencia, la regla que más trabajo hace. Coincide con lo que decía la auditoría
—«sin este rasgo el tiempo verbal es incorrecto en la mayoría de oraciones
reales»— y ahora hay una cifra detrás.

La derivación dispara 2.914 veces. Era la ruta que costaba 2–24 ms.

---

## 6 · Defectos de traducción que el volumen destapó

Además de los huecos léxicos, la pasada masiva sacó dos fallos gramaticales
reales. **Ambos son anteriores a este trabajo**: se reproducen igual en la
versión original del proyecto.

**`a go` seguido de lugar pierde el futuro.**

```
mi a go a di shop   ->  «Estoy en la tienda»     debería ser «voy a la tienda»
mi a go nyam        ->  «Voy a comer»            correcto
```

El futuro sólo se reconoce si tras `a go` viene un verbo. Con un locativo detrás,
el análisis cae a la rama de cópula.

**La preposición de lugar tras verbo de movimiento no llega a aplicarse.**

```
guh a shop   ->  «Ve es tiendas»    debería ser «ve a la tienda»
```

La regla existe —«PREP a tras verbo de movimiento»— pero la rama de cópula se
evalúa antes en el bucle y se lleva el token. Es un problema de **orden de
reglas**, no de regla ausente: exactamente la clase de fallo que CLAUDE.md
advierte que aparece al tocar el orden de las ramas.

---

## 7 · Qué hacer con esto

Por relación entre lo que cuesta y a cuánta gente alcanza:

1. **Las cinco fórmulas de cortesía.** Entradas de léxico, una tarde. Suben el
   peor dominio del estudio y alcanzan a ~2.000 usuarios de 10.000.
2. **`du`, `gi`, `hol`.** Tres verbos básicos, tres líneas.
3. **El orden de reglas del locativo.** Un fallo visible en el 11% de las
   traducciones (dominio direcciones) y de causa ya localizada.
4. **`a go` + locativo.** Misma familia.
5. **Imperativo con enclítico.** Morfología, más trabajo que las anteriores.
6. **`haber` impersonal.** Requiere reescritura estructural, no una entrada.

Y lo que **no** cambia: nada de esto acerca la validación por hablantes nativos.
El estudio dice que el motor aguanta y qué le falta al diccionario. No dice, ni
puede decir, si lo que traduce es buen criollo.
