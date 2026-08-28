# Registro de deuda técnica y pendientes - PowerOmega APP (V2)

Documento de seguimiento. No es una orden de trabajo: es el inventario de atajos conscientes, verificaciones incompletas y limitaciones conocidas que quedaron abiertos tras la corrección del módulo morfométrico.

Cada entrada indica qué está pendiente, por qué se dejó así, qué riesgo tiene y qué haría falta para cerrarla. Ninguna requiere acción inmediata salvo que se indique lo contrario.

**Cómo usar este archivo.** Al abrir un trabajo nuevo sobre la aplicación, revisar si alguna entrada cae dentro del alcance de ese trabajo y cerrarla de paso. Al cerrar una entrada, marcarla como resuelta con la fecha y el cambio aplicado, en lugar de borrarla. Al tomar un atajo nuevo, registrarlo aquí antes de terminar el trabajo.

---

## Índice

| Id | Tipo | Prioridad | Título | Estado |
|---|---|---|---|---|
| D-01 | Código | Media | Lectura cruzada de `#selectPhysioState` desde morfometría | Abierta |
| D-02 | Código | Media | Sexo y estado fisiológico sin perfil compartido del animal | Abierta |
| D-03 | Datos | Alta | Series históricas de peso calculadas con la versión anterior | Abierta |
| V-01 | Verificación | **Alta** | Atribución cruzada de Westervelt y Kane en el módulo ecográfico | Abierta |
| V-02 | Verificación | Media | Fuente primaria de la fórmula tradicional (divisor 11880) | Abierta |
| V-03 | Verificación | Media | Lectura correcta del "MSE = 22 kg" de Martinson et al. (2014) | Abierta |
| V-04 | Verificación | Baja | Punto anatómico de medición del perímetro torácico | Abierta |
| V-05 | Verificación | Baja | Ecuaciones de Catalano 2016 y 2019 no leídas en fuente directa | Abierta |
| V-06 | Verificación | Media | Relación omega-6:3 declarada frente a la aritmética de la ficha técnica | Abierta |
| L-01 | Limitación | Media | Sin validación local para Criollo colombiano ni Paso Fino | Abierta |
| L-02 | Limitación | Baja | Variantes juveniles de Willoughby no implementadas | Abierta |
| L-03 | Legal | **Alta** | Estado de redistribución de los PDF alojados en `docs/` | Abierta |

---

## D-01 · Lectura cruzada de `#selectPhysioState` desde morfometría

**Prioridad:** media. **Origen:** T-13 del plan de corrección morfométrica.

**Qué se hizo.** La función `checkSexPhysioCoherence()` en `js/morphometrics.js` lee directamente el control `#selectPhysioState`, que pertenece a `#module-nutrition`, para advertir cuando el sexo seleccionado contradice el estado fisiológico (por ejemplo sexo macho o castrado junto a yegua gestante o lactante).

**Por qué se hizo así.** `nutrition.js` estaba fuera del alcance de ese trabajo. Construir un mecanismo formal de estado compartido habría requerido modificarlo. Se autorizó la lectura directa con restricciones: solo lectura, encapsulada en una función, tolerante a la ausencia del elemento, sin listeners sobre el control ajeno y sin escritura.

**Riesgo.** La tolerancia a ausencia protege la aplicación de romperse, pero tiene un efecto secundario: si alguien renombra `selectPhysioState`, reorganiza el módulo de nutrición o cambia los valores de sus opciones, **la advertencia dejará de funcionar sin emitir ningún error**. La aplicación seguirá operando con normalidad y la pérdida de la verificación pasará inadvertida. Fue un intercambio deliberado, se prefirió el silencio a la excepción, pero implica que la protección depende de que ese identificador y sus valores no cambien.

**Mitigación inmediata sugerida (barata, no requiere refactor):**

1. Añadir un comentario en `index.html` junto a ese `<select>`: identificador consumido por `morphometrics.js` para verificación de coherencia, no renombrar sin actualizar esa dependencia.
2. Incorporar a las pruebas de regresión la combinación sexo macho o castrado más estado gestante o lactante, verificando que la advertencia aparezca y que no altere ningún valor calculado.

**Cierre definitivo.** Ver D-02. Cuando `nutrition.js` entre en alcance, sustituir la lectura directa por consumo del perfil compartido.

**Nota (2026-08-27):** además de la lectura, `morphometrics.js` ahora también escucha el evento `change` de `#selectPhysioState` (agregado al corregir un defecto donde la advertencia de incoherencia quedaba congelada si el último cambio del usuario ocurría del lado de nutrición). El listener sigue siendo de solo lectura sobre el control ajeno — solo vuelve a llamar a `updateUI()`, no escribe ni modifica `nutrition.js` — pero esto amplía ligeramente el acoplamiento descrito aquí. Ver historial de `js/morphometrics.js` para el detalle.

**Nota (2026-08-27, opción C):** se agregó un segundo aviso de la misma incoherencia en `#module-nutrition` (elemento `#nutritionSexPhysioWarning`, junto a `#selectPhysioState`), para que se vea en el punto de selección y no solo en el módulo morfométrico. Para esto, `checkSexPhysioCoherence()` **se duplicó** como una función equivalente dentro de `js/nutrition.js` (misma condición: sexo macho o castrado + estado gestante tardío o lactante temprano), en vez de compartir una sola implementación. Es un atajo consciente: la lógica de la regla ahora vive en dos archivos y puede desincronizarse si se modifica en uno y no en el otro. Ver también la nota nueva en D-02.

**Nota (2026-08-27, aclaración de doble propósito):** se atenuó visualmente `#animalSexGroup` (mismo tratamiento que NC/H/G/L, T-14) cuando el modelo activo no es Willoughby — el único que usa el sexo para el peso — con un texto explícito ("No afecta el peso con este modelo, pero se usa para verificar coherencia con el estado fisiológico") en vez de deshabilitar el control. Esto documenta en la interfaz, no solo en este archivo, que el sexo tiene el doble propósito descrito arriba: cambia el peso solo con Willoughby, pero siempre alimenta el aviso de coherencia. No cierra D-01/D-02, pero reduce el riesgo de que un usuario piense que el selector "no sirve" cuando otro modelo está activo y lo deje sin seleccionar.

**Nota (2026-08-27, tipo racial):** se aplicó el mismo criterio a `#breedTypeGroup` ("Tipo racial (Martinson)"), que solo usa `calcMartinson()`. A diferencia del sexo, la raza no tiene ningún segundo propósito en la app — no la lee ninguna otra función — así que se reutilizó directamente la clase genérica `.morphometrics-measure-dimmed` (la misma de NC/H/G/L, con su texto "No entra en este modelo"), sin crear un texto propio. Se atenúa cuando el modelo activo no es Martinson (2014) y nunca se deshabilita, por consistencia con el resto de la app.

---

## D-02 · Sexo y estado fisiológico sin perfil compartido del animal

**Prioridad:** media. **Origen:** T-13. **Bloquea el cierre de:** D-01.

**Situación actual.** El sexo vive en `state` dentro de `morphometrics.js` y se emite mediante el evento `animalProfileUpdated` con estructura `{ sex }`. Ningún módulo lo consume todavía. El estado fisiológico vive en `nutrition.js` y solo se lee, no se comparte. Ambos datos describen al mismo animal pero residen en módulos distintos y se comunican de forma asimétrica.

**Consecuencia.** Los dos módulos pueden sostener descripciones contradictorias del mismo caballo. La advertencia de D-01 detecta la contradicción pero no la previene, y depende de un acoplamiento frágil.

**Cierre propuesto.** Extraer un objeto de perfil del animal, propietario de los atributos que no pertenecen a ningún módulo en particular: sexo, edad, raza o tipo racial, estado fisiológico, condición corporal y estado reproductivo. Cada módulo lee de ahí y escribe ahí. El canal ya existe a medias: `animalProfileUpdated` fue diseñado como punto de partida para esto.

**Beneficio adicional.** Con un perfil compartido, `#selectPhysioState` podría filtrar sus opciones según el sexo, de modo que la contradicción sea imposible de introducir en lugar de detectable después. Es la solución preventiva frente a la correctiva actual.

**Requisito:** que `nutrition.js` entre en el alcance de un trabajo. No abordar de forma aislada.

**Nota (2026-08-27, opción C):** `nutrition.js` ya no ignora `animalProfileUpdated` — ahora lo escucha y refleja `sex` en su propio `state`, exclusivamente para evaluar la coherencia sexo/estado fisiológico desde su lado (ver nota en D-01). Esto es un consumo puntual del evento para un solo propósito, no el perfil compartido del animal que describe esta entrada: `sex` sigue viviendo por duplicado en dos `state` distintos (el de `morphometrics.js`, que es la fuente, y una copia de solo lectura en `nutrition.js`), y la regla de coherencia está escrita dos veces en vez de una. D-02 sigue abierta; esto reduce el síntoma (la advertencia ahora se ve donde el usuario mira) sin resolver la causa (no hay un único objeto de perfil del animal).

---

## D-03 · Series históricas de peso calculadas con la versión anterior

**Prioridad:** alta si existe persistencia. **Origen:** T-01 y T-11.

**Situación.** La corrección del ajuste complementario cambia los pesos que la aplicación venía reportando. El cambio no es uniforme: es nulo en el punto de referencia y crece hacia los extremos. En un poni Shetland la diferencia supera el 30%; en un percherón ronda el 17% en sentido contrario.

**Riesgo.** Si existe almacenamiento persistente de pesos calculados, cualquier serie temporal de un mismo animal queda partida en dos tramos no comparables. Un usuario que siga la evolución de peso de un poni verá un salto artificial de decenas de kilos que no corresponde a ningún cambio real del animal, y podría interpretarlo como ganancia o pérdida de condición.

**Acción pendiente:** confirmar si hay persistencia (localStorage, sessionStorage, perfiles guardados, exportaciones). Si la hay:

- No borrar los registros anteriores.
- Marcar cada registro con la versión de cálculo que lo produjo.
- Mostrar una separación visible en cualquier gráfico o listado que cruce ambas versiones, con una nota que explique que el método de estimación cambió y que el salto no refleja un cambio del animal.

Si no hay persistencia, cerrar esta entrada dejando constancia de la verificación.

---

## V-01 · Atribución cruzada de Westervelt y Kane en el módulo ecográfico

**Prioridad:** alta. **Origen:** revisión del módulo de condición corporal. **Requiere verificación en fuente primaria antes de corregir.**

**Qué dice la aplicación hoy** (bloque de ecuaciones ecográficas en `index.html`):

- Caballo adulto, atribuido a Westervelt et al. (1976): `% GC = 4.70 × grasa (cm) + 8.64`, medición de grupa a 5 cm de la línea media.
- Poni, atribuido a Kane et al. (1987): `% GC = 5.47 × grasa (cm) + 2.47`, protocolo de grupa con puntos a 10 cm de la línea media.

**Qué indica el capítulo 22 de Geor, Coenen & Harris (2013),** única fuente consultada hasta ahora:

- Westervelt et al. (1976) desarrolló **dos** ecuaciones sobre 8 caballos y 11 ponis: para caballos `4.70 × grasa + 8.64` y para ponis `5.58 × grasa + 3.83`, en el sitio de grupa a 5 cm lateral de la línea media.
- Kane et al. (1987) evaluó **6 caballos** de 281 a 474 kg de masa corporal, en cinco sitios a 10 cm de la línea media, y obtuvo `5.47 × grasa + 2.47` en el sitio más próximo a la base de la cola. No es un estudio en ponis.

**Discrepancia aparente.** La ecuación etiquetada como "poni" en la aplicación parece corresponder a un estudio realizado en caballos, mientras que la ecuación de Westervelt específica para ponis (`5.58 × grasa + 3.83`) no está implementada. Si se confirma, se trata de una atribución cruzada: la etiqueta de la interfaz no corresponde a la población del estudio citado.

**Qué hace falta para cerrarla.** Consultar las fuentes primarias antes de tocar nada:

- Westervelt, R. G., Stouffer, J. R., Hintz, H. F., et al. (1976). Estimating fatness in horses and ponies. *Journal of Animal Science*, 43, 781-785.
- Kane, R. A., Fisher, M., Parrett, D., et al. (1987). Estimating fatness in horses. En *Proceedings of the 10th Equine Nutrition and Physiology Society*, Fort Collins, CO, pp. 127-131.

**No corregir por ahora.** El capítulo 22 es fuente secundaria y ya demostró contener al menos una inconsistencia interna documentada (el exponente de Jones, escrito 1,05 en el texto y 0,97 en la tabla). Verificar en primario antes de modificar coeficientes.

> ⚠️ **Advertencia explícita del autor (2026-08-27):** no modificar estos coeficientes bajo ninguna circunstancia hasta verificación en fuente primaria. La única fuente disponible es secundaria y ya demostró contener errores internos.

**Limitación adicional a declarar en la interfaz cuando se resuelva.** Ambos estudios tienen muestras muy pequeñas: 19 animales en total en Westervelt, 6 en Kane. El propio capítulo 22 advierte que estas ecuaciones requieren validación adicional y que el resultado depende críticamente del sitio anatómico exacto de escaneo, además de edad, raza, sexo, estado fisiológico, historia nutricional y estación del año.

---

## V-02 · Fuente primaria de la fórmula tradicional (divisor 11880)

**Prioridad:** media. **Origen:** T-06.

El modelo `traditional_hall` fue retirado de la aplicación por cuatro motivos: fuente no verificada, atribución indebida al NRC (2007), redundancia numérica con Carroll & Huntington (11880 frente a 11877, diferencia del 0,025%) y ambigüedad sin resolver sobre si la ecuación original usa longitud escápula-nalga o longitud a olécranon, dos lecturas que difieren en un 27%.

**Qué falta.** Determinar si Hall, L. W. (1971), *Wright's Veterinary Anaesthesia*, contiene efectivamente una ecuación morfométrica de peso, y si el NRC (2007) publica alguna. Verificar también qué longitud utiliza la variante tradicional en su fuente original.

**Si se verifica,** el modelo puede restituirse con la cita correcta y la variable correcta. Si no, permanece retirado. En cualquier caso, la nota informativa añadida a la ficha de Carroll & Huntington ya conserva el puente conceptual con la fórmula tradicional de cinta.

---

## V-03 · Lectura correcta del "MSE = 22 kg" de Martinson et al. (2014)

**Prioridad:** media. **Origen:** T-07.

El abstract de Martinson et al. (2014) reporta `R² = 0.92; mean-squared error (MSE) = 22 kg`. Un error cuadrático medio genuino estaría expresado en kg², no en kg, de modo que la cifra es o un RMSE mal etiquetado o el error estándar residual.

**Por qué importa.** La aplicación declara el intervalo de incertidumbre del modelo predeterminado. Si son 22 kg de RMSE sobre una media aproximada de 500 kg, el intervalo del 95% ronda ±43 kg. Si la lectura es otra, la banda declarada podría estar mal calibrada.

**Estado actual.** El intervalo implementado para Martinson (−3,3% a +11,2%) no proviene de esta cifra sino de los límites de concordancia de Bland-Altman calculados sobre Jensen et al. (2019), que son una fuente independiente y más apropiada. La entrada queda abierta como verificación de coherencia, no como corrección urgente.

**Qué falta.** Acceder al texto completo de Martinson et al. (2014), *Journal of Animal Science* 92(5):2230-2238, y confirmar la métrica.

---

## V-04 · Punto anatómico de medición del perímetro torácico

**Prioridad:** baja. **Origen:** T-12.

Tres fuentes secundarias discrepan sobre dónde se mide el perímetro torácico en cada ecuación:

- El capítulo 22 de Geor et al. (2013) asigna a Carroll & Huntington el perímetro tomado sobre el punto más alto de la cruz.
- Jensen et al. (2019), en su tabla 1, asigna a Carroll & Huntington el perímetro tomado en la base o pendiente de la cruz, y reserva el punto alto para Martinson.
- Górniak et al. (2020) asigna a Martinson el perímetro tomado en la base de las crines.

La aplicación tiene un único campo para el perímetro torácico, lo cual es una simplificación razonable de interfaz, pero significa que los modelos del selector no fueron todos calibrados sobre el mismo punto anatómico.

**Estado actual.** La nota técnica del módulo ya declara qué punto usa la aplicación y advierte de la discrepancia. La entrada queda abierta por si en algún momento se quiere resolver contra las fuentes primarias y ofrecer campos diferenciados.

**Magnitud del efecto.** No cuantificada. La diferencia entre el perímetro sobre el punto más alto de la cruz y en la base puede alcanzar varios centímetros en animales de cruz prominente, y el perímetro entra al cuadrado en Carroll & Huntington, de modo que un error de 2 cm sobre 180 cm se traduce en aproximadamente 2,2% del peso.

---

## V-05 · Ecuaciones de Catalano 2016 y 2019 no leídas en fuente directa

**Prioridad:** baja. **Origen:** T-03.

La ecuación de Catalano et al. (2016) implementada en la aplicación (`G^1.528 × L^0.574 × H^0.246 × NC^0.261 / 1209`) se tomó de la tabla 1 de Jensen et al. (2019), no del artículo original. Es una fuente secundaria fiable y revisada por pares, pero no es el primario.

Existe además una segunda publicación del mismo grupo, Catalano et al. (2019), *Journal of Equine Veterinary Science* 78:117-122, para caballos miniatura, de tipo silla y pura sangre, cuyas ecuaciones no se han revisado y podrían ser relevantes si se amplía el catálogo de modelos.

**Qué falta.** Verificar los cuatro exponentes y el divisor contra Catalano et al. (2016), *Journal of Equine Veterinary Science* 39:38-43. Evaluar si Catalano et al. (2019) aporta ecuaciones útiles para el catálogo.

---

## V-06 · Relación omega-6:3 declarada frente a la aritmética de la ficha técnica

**Prioridad:** media. **Origen:** auditoría previa del módulo de producto, anterior a este trabajo. **Fuera del módulo morfométrico.**

La aplicación declara una relación omega-6:3 de "3:1" mientras que el cálculo aritmético a partir de los valores de la ficha técnica del producto arroja aproximadamente 2,4:1.

**Qué falta.** Determinar cuál de los dos valores es el correcto: si la ficha técnica está desactualizada, si la relación declarada corresponde a una especificación de fabricación con tolerancia y no al lote analizado, o si hay un error de transcripción. Corregir en la fuente que corresponda para que ficha técnica, material comercial y aplicación digan lo mismo.

**Riesgo.** Una discrepancia entre lo que declara la aplicación y lo que declara la ficha técnica del producto es un problema de consistencia comercial, no solo técnico.

---

## L-01 · Sin validación local para Criollo colombiano ni Paso Fino

**Prioridad:** media. **Tipo:** limitación conocida, no defecto.

Ninguna de las ecuaciones implementadas fue calibrada en las razas predominantes del mercado colombiano. La aproximación más cercana disponible es la variante Criollo con divisor 11689, ajustada sobre 42 caballos Criollos argentinos, sin validación cruzada ni conjunto de prueba independiente, y sobre una población de alzada media entre 137 y 150 cm.

La aplicación ya declara esta limitación en la interfaz. La entrada permanece abierta como oportunidad, no como defecto.

**Cierre posible.** Un estudio de validación local. Con acceso a báscula ganadera y una muestra de 60 a 80 animales por biotipo, replicando el protocolo estadístico de Jensen et al. (2019) -Bland-Altman, RMSPE, RSR, descomposición del sesgo en componente medio y de pendiente, y coeficiente de correlación de concordancia de Lin- se obtendría la primera calibración publicable para Criollo colombiano.

**Nota sobre la ruta de mejora más barata.** En Jensen et al. (2019), el 53,9% del error cuadrático de Martinson sobre caballos islandeses correspondía a sesgo medio y solo el 2,7% a sesgo de pendiente. Eso significa que la forma de la ecuación era correcta para esa raza y solo estaba descentrada: recalibrar el divisor habría eliminado más de la mitad del error sin tocar los exponentes. Si se levantan datos locales, ese es el primer ajuste a probar.

---

## L-02 · Variantes juveniles de Willoughby no implementadas

**Prioridad:** baja. **Tipo:** decisión de alcance documentada.

Willoughby (1975) publicó cuatro ecuaciones. La aplicación implementa las dos de adultos, `(0.14475 × G)³` para machos y `(0.14341 × G)³` para hembras. Las dos de animales de 0 a 5 años, `(0.1387 × G + 0.400)³` y `(0.1382 × G + 0.344)³`, no se implementaron por dos motivos: introducen la edad como variable que la aplicación no captura, y su término aditivo rompe la homogeneidad dimensional, de modo que su exponente de escala no es constante sino que varía aproximadamente entre 2,80 y 2,90 según el tamaño del animal.

**Implicación si se implementan.** Quedarían excluidas de la prueba de escalado isométrico de la suite, que es la salvaguarda principal contra la reaparición del defecto de exponente corregido en T-01. Habría que documentar la excepción de forma explícita en la prueba para que no se interprete como un fallo.

---

## L-03 · Estado de redistribución de los PDF alojados en `docs/`

**Prioridad:** alta. **Tipo:** legal. **Origen:** auditoría previa, anterior a este trabajo. **Fuera del módulo morfométrico.**

La carpeta `docs/` aloja documentos PDF servidos desde la aplicación. Al menos uno de ellos, un extracto del NRC (2007), lleva un aviso explícito de prohibición de redistribución.

**Principio aplicable.** Que un documento sea accesible públicamente no constituye una licencia de redistribución. Alojar y servir una copia desde una aplicación comercial es un acto de redistribución, con independencia de que el archivo se pueda encontrar en otro lugar de internet.

**Solución propuesta y no ejecutada.** Sustituir el alojamiento local por enlaces externos al DOI o al sitio del editor para todos los documentos de origen confirmado, y retirar aquellos cuyo estado de licencia no pueda establecerse.

**Riesgo.** Es la única entrada de este registro con exposición legal, no solo técnica, y afecta a una aplicación comercial. Conviene resolverla antes de cualquier distribución ampliada.

---

## Entradas cerradas

Ninguna al momento de crear este registro. Al cerrar una entrada, moverla a esta sección con la fecha y una línea sobre el cambio aplicado, en lugar de eliminarla del documento.

---

## Referencias citadas en este registro

Catalano, D. N., Coleman, R. J., Hathaway, M. R., McCue, M. E., Rendahl, A. K., & Martinson, K. L. (2016). Estimation of actual and ideal bodyweight using morphometric measurements and owner guessed bodyweight of adult draft and warmblood horses. *Journal of Equine Veterinary Science*, 39, 38-43.

Catalano, D. N., Coleman, R. J., Hathaway, M. R., Neu, A. E., Wagner, E. L., Tyler, P. J., McCue, M. E., & Martinson, K. L. (2019). Estimation of actual and ideal bodyweight using morphometric measurements of miniature, saddle-type, and Thoroughbred horses. *Journal of Equine Veterinary Science*, 78, 117-122.

Carroll, C. L., & Huntington, P. J. (1988). Body condition scoring and weight estimation of horses. *Equine Veterinary Journal*, 20(1), 41-45.

Carter, R. A., & Dugdale, A. H. A. (2013). Assessment of body condition and bodyweight. En Geor, R. J., Harris, P. A., & Coenen, M. (Eds.), *Equine Applied and Clinical Nutrition*, cap. 22, pp. 393-404. Saunders/Elsevier.

García Neder, A., Pérez, A., & Perrone, G. (2009). Estimación del peso corporal del caballo Criollo mediante medidas morfométricas. *REDVET*, 10(9).

Górniak, W., Wieliczko, M., Soroko, M., & Korczyński, M. (2020). Evaluation of the accuracy of horse body weight estimation methods. *Animals*, 10(10), 1750.

Jensen, R. B., Rockhold, L. L., & Tauson, A. H. (2019). Weight estimation and hormone concentrations related to body condition in Icelandic and Warmblood horses: a field study. *Acta Veterinaria Scandinavica*, 61, 63.

Kane, R. A., Fisher, M., Parrett, D., et al. (1987). Estimating fatness in horses. En *Proceedings of the 10th Equine Nutrition and Physiology Society*, Fort Collins, CO, pp. 127-131.

Martinson, K. L., Coleman, R. C., Rendahl, A. K., Fang, Z., & McCue, M. E. (2014). Estimation of body weight and development of a body weight score for adult equids using morphometric measurements. *Journal of Animal Science*, 92(5), 2230-2238.

Westervelt, R. G., Stouffer, J. R., Hintz, H. F., et al. (1976). Estimating fatness in horses and ponies. *Journal of Animal Science*, 43, 781-785.

Willoughby, D. P. (1975). *Growth and Nutrition in the Horse*. South Brunswick: A. S. Barnes.
