/* ==========================================================================
   PowerOmega APP - Módulo Morfométrico y Estimación de Peso Equino
   Desarrollado por Rolando Hernández Mora (Médico Veterinario, Máster en Nutrición Animal)

   Modelos vigentes (6), todos con fuente verificada y variables correctas:
   1. Martinson et al. (2014)  [PREDETERMINADO] - G, L, H, NC + tipo racial
   2. Catalano et al. (2016)                     - G, L, H, NC
   3. Carroll & Huntington (1988)                 - G, L + condición corporal
   4. Criollo Sudamericano (García Neder et al., 2009) - G, L (evidencia limitada, n=42)
   5. Marcenac & Aublet (1964)                    - G
   6. Willoughby (1975)                           - G + sexo

   Modelos retirados de la aplicación:
   - Jones et al. (1989): requiere perímetro umbilical y longitud a olécranon,
     no capturados por la app. RSR 1,09 (islandés) y 1,60 (sangre caliente)
     en Jensen et al. (2019), Acta Vet Scand 61:63. RSR > 1 indica error de
     predicción superior a la desviación estándar de la población.
   - Ensminger (1977): requiere longitud a olécranon. RSR 2,25 y 1,92 en la
     misma fuente; menos exacta en los cinco grupos raciales de Górniak
     et al. (2020), Animals 10:1750.
   - Tradicional / Hall / NRC (divisor 11880): fuente primaria no verificada;
     la atribución a NRC (2007) no pudo confirmarse. Numéricamente redundante
     con Carroll & Huntington (11880 frente a 11877, diferencia 0,025%).
     Ambigüedad no resuelta sobre si la ecuación original usa longitud
     escápula-nalga o longitud a olécranon (27% de diferencia entre ambas
     lecturas). Retirado hasta verificación de fuente primaria.

   Historial: hasta la versión anterior, cada ecuación se multiplicaba por un
   factor construido con los exponentes de Martinson et al. (2014) para las
   medidas que la ecuación base no incluía. Ese ajuste sumaba exponentes en
   lugar de reemplazarlos, violando la conservación de densidad (una ecuación
   de masa a partir de medidas lineales debe escalar con exponente ≈3) e
   invalidando toda la evidencia de validación publicada, que corresponde a
   las ecuaciones tal como fueron publicadas. Fue retirado por completo.
   ========================================================================== */

const Morphometrics = (function() {
  let currentUnit = 'metric'; // 'metric' (cm, kg) or 'imperial' (in, lb)
  let selectedModel = 'martinson_2014'; // DEFAULT MODEL: Martinson et al. (2014)
  let tableRenderTimer = null; // Debounce del rebuild de la tabla comparativa durante el arrastre del slider
  let warningsRenderTimer = null; // Debounce de las advertencias de dominio (mismo patrón, 120 ms)

  // Internal state stored in cm
  let state = {
    NC: 85,  // Circunferencia cuello (cm)
    H: 150,  // Altura cruz (cm)
    G: 180,  // Circunferencia cincha/barril/cardíaca (cm)
    L: 165,  // Longitud corporal (cm)
    BCS: 5,  // Condición corporal Henneke, escala 1-9
    sex: null, // 'male' | 'gelding' | 'female' — sin valor por defecto silencioso (T-13)
    breedType: 'arabian_pony' // 'arabian_pony' | 'stock' — divisor de Martinson (T-02)
  };

  const METRIC_RANGES = {
    NC: { min: 40, max: 160, step: 1 },
    H:  { min: 80, max: 210, step: 1 },
    G:  { min: 90, max: 260, step: 1 },
    L:  { min: 80, max: 240, step: 1 }
  };

  // Declaración de qué medidas usa cada modelo (T-14). Ya no alimenta ningún
  // ajuste numérico: gobierna la atenuación visual de las medidas no usadas,
  // la validación de dominio (T-09) y el cálculo de índices (T-08).
  const MODEL_INPUTS = {
    martinson_2014:  { linear: ['G', 'L', 'H', 'NC'], extra: ['breedType'] },
    catalano_2016:   { linear: ['G', 'L', 'H', 'NC'], extra: [] },
    carroll_1988:    { linear: ['G', 'L'], extra: ['BCS'] },
    carroll_criollo: { linear: ['G', 'L'], extra: [] },
    marcenac_1964:   { linear: ['G'], extra: [] },
    willoughby_1975: { linear: ['G'], extra: ['sex'] }
  };

  // Rangos de dominio de calibración (T-09). Solo se declaran los que constan
  // en la tabla canónica; ningún otro modelo recibe advertencia de dominio.
  const DOMAIN_RANGES = {
    carroll_1988: {
      weightKg: [160, 680],
      heightCm: [122, 173]
    },
    martinson_2014: {
      weightKg: null, // "Sin límite declarado" en la tabla canónica
      heightCm: [112, null]
      // "Otras restricciones" (edad ≥ 3 años, no gestantes) no son verificables
      // numéricamente: se declaran en el campo "population" de calcMartinson().
    },
    carroll_criollo: {
      weightKg: [368, 565],
      heightCm: [137, 150]
    }
  };

  // Intervalos de concordancia del 95% (T-07), derivados de los límites de
  // Jensen, Rockhold & Tauson (2019), Acta Vet Scand 61:63.
  const UNCERTAINTY_PCT = {
    martinson_2014: { low: -3.3, high: 11.2 },
    catalano_2016:  { low: -11.0, high: 5.7 },
    carroll_1988:   { low: -7.7, high: 12.8 }
  };
  // Resto de modelos sin intervalo publicado en Jensen et al. (2019):
  // estimación conservadora declarada explícitamente como tal.
  const DEFAULT_UNCERTAINTY_PCT = { low: -15, high: 15 };

  /**
   * 1. Martinson et al. (2014) - MODELO PREDETERMINADO
   * PV = (G^1.486 × L^0.554 × H^0.599 × NC^0.173) / D
   * D = 3596 (árabe/poni, diferencia de 0,28% entre ambos, se fusionan),
   *     3441 (stock horse)
   * n = 629; edad ≥ 3 años; alzada ≥ 112 cm; no gestantes.
   * Fuente: Martinson, K. L., Coleman, R. C., Rendahl, A. K., Fang, Z., &
   * McCue, M. E. (2014). Estimation of body weight and development of a body
   * weight score for adult equids using morphometric measurements. Journal
   * of Animal Science, 92(5), 2230-2238.
   */
  function calcMartinson(g, l, h, nc, breedType) {
    const divisor = breedType === 'stock' ? 3441 : 3596;
    const breedLabel = breedType === 'stock' ? 'Sin raza determinada' : 'Árabe / Poni';
    const weightKg = (Math.pow(g, 1.486) * Math.pow(l, 0.554) * Math.pow(h, 0.599) * Math.pow(nc, 0.173)) / divisor;
    return {
      weightKg,
      formulaText: `PV (kg) = (G¹·⁴⁸⁶ × L⁰·⁵⁵⁴ × H⁰·⁵⁹⁹ × NC⁰·¹⁷³) / ${divisor} · ${breedLabel}`,
      citation: "Martinson, K. L., Coleman, R. C., Rendahl, A. K., Fang, Z., & McCue, M. E. (2014). Estimation of body weight and development of a body weight score for adult equids using morphometric measurements. Journal of Animal Science, 92(5), 2230-2238.",
      population: "n = 629; edad ≥ 3 años; alzada ≥ 112 cm; equinos no gestantes.",
      validation: {
        source: "Jensen, Rockhold & Tauson (2019), Acta Vet Scand 61:63",
        groups: [
          { group: 'Islandés', rmspeKg: 19.6, rsr: 0.67, ccc: 0.80, biasKg: 14.4 }
        ]
      },
      uncertaintyPct: UNCERTAINTY_PCT.martinson_2014
    };
  }

  /**
   * 2. Catalano et al. (2016) - Tiro y sangre caliente
   * PV = (G^1.528 × L^0.574 × H^0.246 × NC^0.261) / 1209
   * n = 89; tiro y sangre caliente.
   * Fuente: Catalano, D. N., Coleman, R. J., Hathaway, M. R., McCue, M. E.,
   * Rendahl, A. K., & Martinson, K. L. (2016). Estimation of actual and ideal
   * bodyweight using morphometric measurements and owner guessed bodyweight
   * of adult draft and warmblood horses. Journal of Equine Veterinary
   * Science, 39, 38-43.
   */
  function calcCatalano(g, l, h, nc) {
    const weightKg = (Math.pow(g, 1.528) * Math.pow(l, 0.574) * Math.pow(h, 0.246) * Math.pow(nc, 0.261)) / 1209;
    return {
      weightKg,
      formulaText: `PV (kg) = (G¹·⁵²⁸ × L⁰·⁵⁷⁴ × H⁰·²⁴⁶ × NC⁰·²⁶¹) / 1209`,
      citation: "Catalano, D. N., Coleman, R. J., Hathaway, M. R., McCue, M. E., Rendahl, A. K., & Martinson, K. L. (2016). Estimation of actual and ideal bodyweight using morphometric measurements and owner guessed bodyweight of adult draft and warmblood horses. Journal of Equine Veterinary Science, 39, 38-43.",
      population: "n = 89; equinos de tiro y sangre caliente.",
      validation: {
        source: "Jensen, Rockhold & Tauson (2019), Acta Vet Scand 61:63",
        groups: [
          { group: 'Sangre caliente', rmspeKg: 32.0, rsr: 0.61, ccc: 0.79, biasKg: -17.2 }
        ]
      },
      uncertaintyPct: UNCERTAINTY_PCT.catalano_2016
    };
  }

  /**
   * 3. Carroll & Huntington (1988)
   * Standard: (G^2 * L) / 11877
   * Carroll BCS < 2.5/5: divisor 12265
   * Carroll BCS >= 3/5: divisor 11706
   * n = 372; 160-680 kg; alzada 12-17 hh (122-173 cm).
   * Fuente: Carroll, C. L., & Huntington, P. J. (1988). Body condition
   * scoring and weight estimation of horses. Equine Veterinary Journal,
   * 20(1), 41-45.
   *
   * La interfaz usa Henneke 1-9. Para no mezclar escalas directamente, se
   * normalizan linealmente sus extremos: 1 -> 0 y 9 -> 5. Los umbrales
   * efectivos resultantes de esa normalización son: Henneke ≤ 4,5 usa 12265;
   * Henneke 5 a 5,5 usa 11877; Henneke ≥ 6 usa 11706. Las dos escalas no son
   * linealmente equivalentes en rigor, pero el comportamiento resultante es
   * correcto y se conserva sin cambios (H-09).
   */
  function calcCarrollHuntington(g, l, hennekeBcs) {
    const carrollBcs = ((hennekeBcs - 1) * 5) / 8;
    let divisor = 11877;
    let variantNote = `CC Henneke ${hennekeBcs} ≈ Carroll ${carrollBcs.toFixed(1)}/5 (Factor 11.877)`;

    if (carrollBcs < 2.5) {
      divisor = 12265;
      variantNote = `CC Henneke ${hennekeBcs} ≈ Carroll ${carrollBcs.toFixed(1)}/5, condición baja (Factor 12.265)`;
    } else if (carrollBcs >= 3.0) {
      divisor = 11706;
      variantNote = `CC Henneke ${hennekeBcs} ≈ Carroll ${carrollBcs.toFixed(1)}/5, condición alta (Factor 11.706)`;
    }

    const weightKg = (Math.pow(g, 2) * l) / divisor;
    return {
      weightKg,
      variantNote,
      formulaText: `PV (kg) = (G² × L) / ${divisor} · ${variantNote}`,
      citation: "Carroll, C. L., & Huntington, P. J. (1988). Body condition scoring and weight estimation of horses. Equine Veterinary Journal, 20(1), 41-45.",
      population: "n = 372; equinos entre 160 y 680 kg, alzada 12 a 17 hh (122-173 cm), CC 1 a 5.",
      validation: {
        source: "Jensen, Rockhold & Tauson (2019), Acta Vet Scand 61:63",
        groups: [
          { group: 'Islandés', rmspeKg: 21.1, rsr: 0.72, ccc: 0.78, biasKg: 9.4 },
          { group: 'Sangre caliente', rmspeKg: 36.2, rsr: 0.69, ccc: 0.78, biasKg: 20.7 }
        ]
      },
      uncertaintyPct: UNCERTAINTY_PCT.carroll_1988,
      // Nota comunicacional (T-06): en condición corporal moderada, este
      // resultado coincide con el de la fórmula tradicional de cinta
      // (divisor ≈11880), retirada de la aplicación por fuente no verificada.
      traditionalBridgeNote: "En condición corporal moderada, este resultado coincide con el de la fórmula tradicional de cinta métrica."
    };
  }

  /**
   * 4. Criollo Sudamericano - evidencia limitada (T-10, opcional)
   * PV = (G² × L) / 11689
   * n = 42; Criollo argentino; 2-22 años. Divisor ajustado por mínimos
   * cuadrados no lineales; única de nueve ecuaciones evaluadas cuya
   * diferencia con el peso real no fue estadísticamente significativa
   * (p = 0,16), con error absoluto medio de 4,21%. Sin validación cruzada.
   * Fuente: García Neder, A., Pérez, A., & Perrone, G. (2009). Estimación
   * del peso corporal del caballo Criollo mediante medidas morfométricas:
   * validación de ecuaciones publicadas para otras razas y desarrollo de
   * nueva fórmula. REDVET, 10(9).
   */
  function calcCarrollCriollo(g, l) {
    const weightKg = (Math.pow(g, 2) * l) / 11689;
    return {
      weightKg,
      formulaText: `PV (kg) = (G² × L) / 11689 · Criollo sudamericano`,
      citation: "García Neder, A., Pérez, A., & Perrone, G. (2009). Estimación del peso corporal del caballo Criollo mediante medidas morfométricas: validación de ecuaciones publicadas para otras razas y desarrollo de nueva fórmula. REDVET, 10(9).",
      population: "n = 42; Criollo argentino; 2 a 22 años.",
      validation: {
        source: "García Neder, Pérez & Perrone (2009), REDVET 10(9)",
        note: "Error absoluto medio 4,21%; diferencia con el peso real no significativa (p = 0,16); sin validación cruzada ni conjunto de prueba independiente."
      },
      uncertaintyPct: DEFAULT_UNCERTAINTY_PCT,
      limitedEvidence: true
    };
  }

  /**
   * 5. Marcenac & Aublet (1964)
   * BW (kg) = Girth^3 * 80 (Girth en metros)
   * Fuente: Marcenac, L. N., & Aublet, H. (1964). Encyclopédie du Cheval.
   * Paris: Maloine, pp. 102-104.
   */
  function calcMarcenac(g) {
    const gMeters = g / 100.0;
    const weightKg = Math.pow(gMeters, 3) * 80.0;
    return {
      weightKg,
      formulaText: `PV (kg) = G³ × 80  (G en metros)`,
      citation: "Marcenac, L. N., & Aublet, H. (1964). Encyclopédie du Cheval. Paris: Maloine, pp. 102-104.",
      population: "Equinos adultos.",
      validation: {
        source: "Jensen, Rockhold & Tauson (2019), Acta Vet Scand 61:63",
        groups: [
          { group: 'Islandés', rmspeKg: 25.4, rsr: 0.87, ccc: 0.71, biasKg: 14.4 }
        ]
      },
      uncertaintyPct: DEFAULT_UNCERTAINTY_PCT
    };
  }

  /**
   * 6. Willoughby (1975) - por sexo (T-13)
   * BW (lb) = (0.14475 * Girth_in)^3  — machos adultos
   * BW (lb) = (0.14341 * Girth_in)^3  — hembras adultas
   * Sin coeficiente publicado para castrados: se aplica el de machos y se
   * señala la advertencia correspondiente en la interfaz.
   * Fuente: Willoughby, D. P. (1975). Growth and Nutrition in the Horse.
   * South Brunswick: A. S. Barnes.
   */
  function calcWilloughby(g, sex) {
    const gIn = g / 2.54;
    // Sin sexo elegido todavía: se muestra la variante de machos como
    // referencia visual, marcada explícitamente como no asumida (T-14 pt. 5).
    const effectiveSex = sex === 'female' ? 'female' : 'male';
    const coefficient = effectiveSex === 'female' ? 0.14341 : 0.14475;
    const weightLb = Math.pow(coefficient * gIn, 3);
    const weightKg = weightLb / 2.20462;
    return {
      weightKg,
      formulaText: `PV (lb) = (${coefficient} × G)³  (G en pulgadas) · ${effectiveSex === 'female' ? 'hembras adultas' : 'machos adultos'}`,
      citation: "Willoughby, D. P. (1975). Growth and Nutrition in the Horse. South Brunswick: A. S. Barnes.",
      population: "Equinos adultos, machos o hembras. Sin coeficiente publicado para castrados: se aplica el de machos.",
      validation: {
        source: "Jensen, Rockhold & Tauson (2019), Acta Vet Scand 61:63",
        groups: [
          { group: 'Islandés', rmspeKg: 20.5, rsr: 0.70, ccc: 0.80, biasKg: 1.7 }
        ]
      },
      uncertaintyPct: DEFAULT_UNCERTAINTY_PCT,
      sexApplied: effectiveSex,
      sexAssumed: sex !== 'male' && sex !== 'female' // true si aún no se ha elegido sexo, o es castrado
    };
  }

  function cmToUnit(val) {
    return currentUnit === 'metric' ? val : val / 2.54;
  }

  function unitToCm(val) {
    return currentUnit === 'metric' ? val : val * 2.54;
  }

  function kgToUnit(val) {
    return currentUnit === 'metric' ? val : val * 2.20462;
  }

  function getUnitLabelLength() {
    return currentUnit === 'metric' ? 'cm' : 'in';
  }

  function getUnitLabelWeight() {
    return currentUnit === 'metric' ? 'kg' : 'lb';
  }

  /**
   * Índices morfométricos (T-08). Sustituyen la función que cumplía el
   * ajuste eliminado: dan uso legítimo a NC y H en los modelos que no las
   * usan para calcular el peso, sin alterar ninguna ecuación publicada.
   * Índice G:H: Carter et al. (2009), The Veterinary Journal, 179(2), 204-210.
   * Índice NC:H: asociado a adiposidad regional del cuello y riesgo metabólico.
   */
  function calcMorphometricIndices(currentState) {
    return {
      ghIndex: currentState.G / currentState.H,
      nchIndex: currentState.NC / currentState.H
    };
  }

  /**
   * Validación de dominio (T-09). Devuelve advertencias, nunca bloquea el
   * cálculo. Solo se declaran los rangos que constan en la tabla canónica.
   */
  function validateDomain(modelKey, weightKg, heightCm) {
    const domain = DOMAIN_RANGES[modelKey];
    const warnings = [];
    if (!domain) return warnings;

    if (domain.weightKg) {
      const [min, max] = domain.weightKg;
      if (weightKg < min || weightKg > max) {
        warnings.push(`El peso estimado (${Math.round(weightKg)} kg) está fuera del rango en que se validó este modelo (${min}-${max} kg).`);
      }
    }
    if (domain.heightCm) {
      const [min, max] = domain.heightCm;
      if (heightCm < min || (max !== null && heightCm > max)) {
        warnings.push(`La alzada (${Math.round(heightCm)} cm) está fuera del rango en que se validó este modelo (${min}${max !== null ? '–' + max : '+'} cm).`);
      }
    }
    // domain.note (p. ej. "edad ≥ 3 años; no gestantes" de Martinson) es una
    // restricción de la tabla canónica que no se puede verificar numéricamente
    // (la app no captura edad ni estado de gestación): se comunica siempre en
    // el campo "population" de la ficha del modelo (heroModelCitation), nunca
    // aquí, para que esta lista quede reservada a violaciones detectadas de
    // verdad y no pierda su valor de alerta por mostrarse permanentemente.
    return warnings;
  }

  /**
   * Lectura acotada de #selectPhysioState (T-13). Pertenece a
   * #module-nutrition, fuera de alcance de este módulo. Autorizada bajo
   * condiciones estrictas: esta función solo lee ese control (nunca escribe
   * en él ni dispara eventos sobre él), es tolerante a su ausencia, y se
   * invoca desde bindEvents() en cada recálculo de morfometría (medidas,
   * modelo, unidad, sexo, BCS).
   *
   * AJUSTE POST-AUDITORÍA: la versión original de T-13 pedía además que
   * ningún listener escuchara #selectPhysioState, para no crear ninguna
   * dependencia de comportamiento hacia el control ajeno. En la práctica
   * eso dejaba la advertencia de incoherencia congelada con el resultado de
   * la última evaluación cuando el cambio más reciente del usuario ocurría
   * del lado de nutrición (el orden "estado fisiológico primero" nunca
   * volvía a evaluarse). bindEvents() añade ahora un listener de solo
   * lectura sobre #selectPhysioState que únicamente vuelve a llamar a
   * updateUI() — sigue sin escribir en el control ni modificar
   * nutrition.js, pero ya no se cumple la restricción literal de "ningún
   * listener sobre el control ajeno".
   *
   * DEUDA TÉCNICA: este acoplamiento debería migrar a un estado compartido
   * del animal cuando nutrition.js entre en alcance de un trabajo futuro.
   */
  function checkSexPhysioCoherence(sex) {
    try {
      const physioEl = document.getElementById('selectPhysioState');
      if (!physioEl) return null;
      const physioVal = physioEl.value;
      if (!physioVal) return null;
      const isFemaleOnlyState = physioVal === 'gestation_late' || physioVal === 'lactation_early';
      if ((sex === 'male' || sex === 'gelding') && isFemaleOnlyState) {
        return 'El sexo seleccionado no concuerda con el estado fisiológico elegido en el módulo de nutrición. Revise ambos valores.';
      }
      return null;
    } catch (_error) {
      return null;
    }
  }

  function calculateAll() {
    const { G, L, H, NC, BCS, sex, breedType } = state;

    const martinson = calcMartinson(G, L, H, NC, breedType);
    const catalano = calcCatalano(G, L, H, NC);
    const carroll = calcCarrollHuntington(G, L, BCS);
    const carrollCriollo = calcCarrollCriollo(G, L);
    const marcenac = calcMarcenac(G);
    const willoughby = calcWilloughby(G, sex);

    const modelsMap = {
      martinson_2014:  { name: "Martinson et al. (2014) [Predeterminado]", data: martinson },
      catalano_2016:   { name: "Catalano et al. (2016)", data: catalano },
      carroll_1988:    { name: "Carroll & Huntington (1988)", data: carroll },
      carroll_criollo: { name: "Criollo Sudamericano — evidencia limitada", data: carrollCriollo },
      marcenac_1964:   { name: "Marcenac & Aublet (1964)", data: marcenac },
      willoughby_1975: { name: "Willoughby (1975)", data: willoughby }
    };

    const activeModelObj = modelsMap[selectedModel] || modelsMap.martinson_2014;

    return {
      activeModel: activeModelObj,
      modelsMap
    };
  }

  function updateUI() {
    const calc = calculateAll();
    const active = calc.activeModel;
    const wUnit = getUnitLabelWeight();
    const lUnit = getUnitLabelLength();
    const activeInputs = MODEL_INPUTS[selectedModel] || { linear: [], extra: [] };

    // Actualizar Hero Weight con el modelo seleccionado
    const heroElem = document.getElementById('heroWeightVal');
    const heroUnitElem = document.getElementById('heroWeightUnit');
    const heroModelNameElem = document.getElementById('heroModelName');
    const heroModelCitationElem = document.getElementById('heroModelCitation');

    if (heroElem) {
      heroElem.textContent = Math.round(kgToUnit(active.data.weightKg));
    }
    if (heroUnitElem) {
      heroUnitElem.textContent = wUnit;
    }
    if (heroModelNameElem) {
      heroModelNameElem.textContent = active.name.replace(' [Predeterminado]', '');
    }
    if (heroModelCitationElem) {
      const validationHtml = active.data.validation
        ? `<br><strong>Validación publicada:</strong> ${
            active.data.validation.groups
              ? active.data.validation.groups.map(g => `${g.group}: RMSPE ${g.rmspeKg} kg, RSR ${g.rsr}, CCC ${g.ccc}, sesgo ${g.biasKg > 0 ? '+' : ''}${g.biasKg} kg`).join(' · ')
              : active.data.validation.note
          } (${active.data.validation.source})`
        : '';
      const bridgeHtml = active.data.traditionalBridgeNote
        ? `<br><em>${active.data.traditionalBridgeNote}</em>`
        : '';
      heroModelCitationElem.innerHTML = `
        <strong>Fórmula:</strong> ${active.data.formulaText}<br>
        <strong>Fuente:</strong> ${active.data.citation}<br>
        <strong>Población de calibración:</strong> ${active.data.population}${validationHtml}${bridgeHtml}
      `;
    }

    // T-07: rango de incertidumbre bajo el peso estimado
    const rangeElem = document.getElementById('heroWeightRange');
    if (rangeElem && active.data.uncertaintyPct) {
      const low = kgToUnit(active.data.weightKg * (1 + active.data.uncertaintyPct.low / 100));
      const high = kgToUnit(active.data.weightKg * (1 + active.data.uncertaintyPct.high / 100));
      rangeElem.textContent = `Rango probable: ${Math.round(low)} - ${Math.round(high)} ${wUnit} (intervalo de concordancia 95%)`;
    }

    // T-14: declarar qué usa el modelo activo
    const usageElem = document.getElementById('heroModelUsage');
    if (usageElem) {
      const measureLabels = { G: 'perímetro torácico', L: 'longitud corporal', H: 'alzada', NC: 'circunferencia de cuello' };
      const usedLabels = activeInputs.linear.map(k => measureLabels[k]).join(', ');
      const unusedKeys = ['G', 'L', 'H', 'NC'].filter(k => !activeInputs.linear.includes(k));
      const unusedLabels = unusedKeys.map(k => measureLabels[k]).join(' y ');
      usageElem.textContent = unusedKeys.length
        ? `Usa ${usedLabels}. ${unusedLabels.charAt(0).toUpperCase() + unusedLabels.slice(1)} no entra${unusedKeys.length > 1 ? 'n' : ''} en esta ecuación, pero se usa${unusedKeys.length > 1 ? 'n' : ''} para los índices morfométricos y para verificar el rango de validez.`
        : `Usa las cuatro medidas: ${usedLabels}.`;
    }

    // T-14: entrada adicional destacada si falta (sexo para Willoughby)
    const sexNoticeElem = document.getElementById('heroSexNotice');
    if (sexNoticeElem) {
      if (selectedModel === 'willoughby_1975' && active.data.sexAssumed) {
        sexNoticeElem.hidden = false;
        sexNoticeElem.textContent = state.sex === 'gelding'
          ? 'Willoughby (1975) no publicó coeficiente para castrados. Se aplica el de machos.'
          : 'Selecciona el sexo del animal arriba: se muestra la variante de machos mientras tanto.';
      } else {
        sexNoticeElem.hidden = true;
      }
    }

    // Actualizar badges en la imagen del caballo
    const svgBadgeNC = document.getElementById('svgBadgeNC');
    const svgBadgeH = document.getElementById('svgBadgeH');
    const svgBadgeG = document.getElementById('svgBadgeG');
    const svgBadgeL = document.getElementById('svgBadgeL');

    if (svgBadgeNC) svgBadgeNC.textContent = `NC: ${Math.round(cmToUnit(state.NC))} ${lUnit}`;
    if (svgBadgeH) svgBadgeH.textContent = `H: ${Math.round(cmToUnit(state.H))} ${lUnit}`;
    if (svgBadgeG) svgBadgeG.textContent = `G: ${Math.round(cmToUnit(state.G))} ${lUnit}`;
    if (svgBadgeL) svgBadgeL.textContent = `L: ${Math.round(cmToUnit(state.L))} ${lUnit}`;

    // T-14: atenuar medidas no usadas por el modelo activo (badges + bloques del formulario)
    ['NC', 'H', 'G', 'L'].forEach(key => {
      const used = activeInputs.linear.includes(key);
      const formGroup = document.querySelector(`.morphometric-measure--${key.toLowerCase()}`);
      if (formGroup) formGroup.classList.toggle('morphometrics-measure-dimmed', !used);
      const badgeGroup = document.getElementById(`svgBadge${key}`)?.closest('g');
      if (badgeGroup) badgeGroup.classList.toggle('morphometrics-badge-dimmed', !used);

      // Botones +/-: deshabilitar el que ya no tiene a dónde moverse (en el
      // límite mínimo o máximo), para que el usuario vea de inmediato por
      // qué no reacciona en vez de seguir tocando sin efecto.
      const numInput = document.getElementById(`input${key}`);
      if (numInput) {
        const val = parseFloat(numInput.value);
        const min = parseFloat(numInput.min);
        const max = parseFloat(numInput.max);
        const minusBtn = document.querySelector(`.measure-step-btn--minus[data-target="input${key}"]`);
        const plusBtn = document.querySelector(`.measure-step-btn--plus[data-target="input${key}"]`);
        if (minusBtn) minusBtn.disabled = Number.isFinite(val) && val <= min;
        if (plusBtn) plusBtn.disabled = Number.isFinite(val) && val >= max;
      }
    });

    // T-14, ampliación: atenuar el tipo racial cuando el modelo activo no es
    // Martinson (2014) — único que lo usa. A diferencia del sexo, la raza no
    // tiene ningún otro propósito en la app, así que reutiliza el mismo
    // tratamiento genérico ("No entra en este modelo") que NC/H/G/L, sin texto
    // propio ni deshabilitarse.
    const breedGroupElem = document.getElementById('breedTypeGroup');
    if (breedGroupElem) breedGroupElem.classList.toggle('morphometrics-measure-dimmed', selectedModel !== 'martinson_2014');

    // T-14, ampliación: atenuar el selector de sexo cuando el modelo activo no es
    // Willoughby (único que lo usa para el peso), pero sin deshabilitarlo — sigue
    // alimentando el aviso de coherencia sexo/estado fisiológico (T-13) con
    // cualquier modelo activo. Ver nota junto a #animalSexGroup en index.html.
    const sexGroupElem = document.getElementById('animalSexGroup');
    const sexRelevanceNoteElem = document.getElementById('sexModelRelevanceNote');
    const willoughbyActive = selectedModel === 'willoughby_1975';
    if (sexGroupElem) sexGroupElem.classList.toggle('morphometrics-sex-dimmed', !willoughbyActive);
    if (sexRelevanceNoteElem) {
      if (willoughbyActive) {
        sexRelevanceNoteElem.hidden = true;
        sexRelevanceNoteElem.textContent = '';
      } else {
        sexRelevanceNoteElem.hidden = false;
        sexRelevanceNoteElem.textContent = 'No afecta el peso con este modelo, pero se usa para verificar coherencia con el estado fisiológico.';
      }
    }

    // T-08: índices morfométricos (uso legítimo de NC y H en modelos de dos medidas)
    const indices = calcMorphometricIndices(state);
    const ghIndexElem = document.getElementById('morphometricsIndexGH');
    const nchIndexElem = document.getElementById('morphometricsIndexNCH');
    if (ghIndexElem) ghIndexElem.textContent = indices.ghIndex.toFixed(2);
    if (nchIndexElem) nchIndexElem.textContent = indices.nchIndex.toFixed(2);

    // T-09: advertencias de dominio del modelo activo (debounce: evita reflow continuo al arrastrar)
    clearTimeout(warningsRenderTimer);
    warningsRenderTimer = setTimeout(() => {
      const warningsElem = document.getElementById('morphometricsDomainWarnings');
      if (!warningsElem) return;
      const domainWarnings = validateDomain(selectedModel, active.data.weightKg, state.H);
      const coherenceWarning = checkSexPhysioCoherence(state.sex);
      const allWarnings = coherenceWarning ? [...domainWarnings, coherenceWarning] : domainWarnings;
      warningsElem.innerHTML = allWarnings.length
        ? allWarnings.map(w => `<li>${w}</li>`).join('')
        : '';
      warningsElem.hidden = allWarnings.length === 0;
    }, 120);

    // Renderizar tabla comparativa de modelos (con debounce: evita reconstruir
    // el DOM en cada micro-movimiento del slider durante un arrastre)
    clearTimeout(tableRenderTimer);
    tableRenderTimer = setTimeout(() => {
      const tableBody = document.getElementById('modelComparisonTableBody');
      if (!tableBody) return;
      tableBody.innerHTML = Object.keys(calc.modelsMap).map(key => {
        const item = calc.modelsMap[key];
        const isSelected = key === selectedModel;
        const wVal = Math.round(kgToUnit(item.data.weightKg));
        const limitedTag = item.data.limitedEvidence ? ' <span class="model-selected-label">(evidencia limitada)</span>' : '';
        return `
          <tr class="${isSelected ? 'model-row-selected' : ''}">
            <td class="model-name-cell">${item.name.replace(' [Predeterminado]', '')}${limitedTag} ${isSelected ? '<span class="model-selected-label">(Seleccionado)</span>' : ''}</td>
            <td class="model-weight-cell">${wVal} ${wUnit}</td>
            <td class="model-citation-cell">
              ${item.data.citation}<br>
              <span class="model-adjustment-note">${item.data.population}</span>
            </td>
          </tr>
        `;
      }).join('');
    }, 120);

    // Disparar evento global para actualizar Módulo de Nutrición con el peso del modelo activo
    window.dispatchEvent(new CustomEvent('weightUpdated', {
      detail: {
        weightKg: active.data.weightKg,
        modelName: active.name.replace(' [Predeterminado]', '')
      }
    }));
  }

  function setUnit(unit) {
    currentUnit = unit;
    document.querySelectorAll('.unit-label-length').forEach(el => el.textContent = currentUnit === 'metric' ? 'cm' : 'in');

    ['NC', 'H', 'G', 'L'].forEach(key => {
      const numInput = document.getElementById(`input${key}`);
      if (!numInput) return;
      const metricRange = METRIC_RANGES[key];
      const min = currentUnit === 'metric' ? metricRange.min : metricRange.min / 2.54;
      const max = currentUnit === 'metric' ? metricRange.max : metricRange.max / 2.54;
      const step = currentUnit === 'metric' ? metricRange.step : 0.1;
      const val = currentUnit === 'metric'
        ? Math.round(state[key])
        : Number((state[key] / 2.54).toFixed(1));

      numInput.min = min.toFixed(currentUnit === 'metric' ? 0 : 1);
      numInput.max = max.toFixed(currentUnit === 'metric' ? 0 : 1);
      numInput.step = step;
      numInput.value = val;
      numInput.removeAttribute('aria-invalid');
    });

    updateUI();
  }

  function setModel(modelKey) {
    // Ruta de migración: si la clave no existe entre los modelos vigentes
    // (p. ej. una preferencia guardada apuntando a un modelo retirado),
    // cae al modelo predeterminado sin lanzar excepción.
    selectedModel = MODEL_INPUTS[modelKey] ? modelKey : 'martinson_2014';
    const select = document.getElementById('selectWeightModel');
    if (select && select.value !== selectedModel) select.value = selectedModel;
    updateUI();
  }

  function setSex(sex) {
    state.sex = (sex === 'male' || sex === 'gelding' || sex === 'female') ? sex : null;
    window.dispatchEvent(new CustomEvent('animalProfileUpdated', {
      detail: { sex: state.sex }
    }));
    updateUI();
  }

  function setBreedType(breedType) {
    state.breedType = breedType === 'stock' ? 'stock' : 'arabian_pony';
    updateUI();
  }

  function bindEvents() {
    ['NC', 'H', 'G', 'L'].forEach(key => {
      const numInput = document.getElementById(`input${key}`);

      if (numInput) {
        numInput.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          const min = parseFloat(e.target.min);
          const max = parseFloat(e.target.max);
          if (!Number.isFinite(val) || val < min || val > max) {
            e.target.setAttribute('aria-invalid', 'true');
            return;
          }
          e.target.removeAttribute('aria-invalid');
          state[key] = unitToCm(val);
          updateUI();
        });
        numInput.addEventListener('change', (e) => {
          const min = parseFloat(e.target.min);
          const max = parseFloat(e.target.max);
          const raw = parseFloat(e.target.value);
          const val = Math.min(max, Math.max(min, Number.isFinite(raw) ? raw : min));
          e.target.value = val;
          e.target.removeAttribute('aria-invalid');
          state[key] = unitToCm(val);
          updateUI();
        });
      }
    });

    // Botones +/- de NC/H/G/L (T-09b, ajuste de sensibilidad táctil): cada
    // toque suma o resta exactamente el `step` vigente del campo numérico
    // asociado y dispara el mismo evento 'change' que ya maneja la validación,
    // el clamping a min/max y la actualización de estado — sin duplicar esa
    // lógica aquí. Reemplazan la barra deslizante retirada de Módulo 1.
    document.querySelectorAll('.measure-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const numInput = document.getElementById(btn.dataset.target);
        if (!numInput) return;
        const step = parseFloat(numInput.step) || 1;
        const direction = btn.classList.contains('measure-step-btn--minus') ? -1 : 1;
        const current = parseFloat(numInput.value);
        const base = Number.isFinite(current) ? current : parseFloat(numInput.min);
        numInput.value = +(base + direction * step).toFixed(1);
        numInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    // Selector de Modelo
    const selectModel = document.getElementById('selectWeightModel');
    if (selectModel) {
      selectModel.addEventListener('change', (e) => {
        setModel(e.target.value);
      });
    }

    // Selector de tipo racial (Martinson, T-02)
    const selectBreedType = document.getElementById('selectBreedType');
    if (selectBreedType) {
      selectBreedType.addEventListener('change', (e) => {
        setBreedType(e.target.value);
      });
    }

    // Selector de sexo (Willoughby y advertencia cruzada, T-13)
    const selectSex = document.getElementById('selectAnimalSex');
    if (selectSex) {
      selectSex.addEventListener('change', (e) => {
        setSex(e.target.value);
      });
    }

    // T-13, ajuste post-auditoría: #selectPhysioState pertenece a
    // #module-nutrition (fuera de alcance). El texto original de T-13 pedía
    // no escuchar ese control; en la práctica eso dejaba la advertencia de
    // incoherencia congelada con el último resultado calculado cuando el
    // cambio más reciente del usuario ocurría del lado de nutrición (orden
    // "fisiológico primero" nunca se re-evaluaba). Se añade este listener,
    // de solo lectura, exclusivamente para volver a llamar a updateUI() —
    // no escribe en el control, no dispara eventos sobre él, no modifica
    // nutrition.js. Sigue tolerando la ausencia del elemento. Deuda técnica
    // sin cambios: migrar a un estado compartido del animal cuando
    // nutrition.js entre en alcance de un trabajo futuro.
    const physioStateEl = document.getElementById('selectPhysioState');
    if (physioStateEl) {
      physioStateEl.addEventListener('change', () => {
        updateUI();
      });
    }

    // Botones de unidad
    const btnMetric = document.getElementById('btnUnitMetric');
    const btnImperial = document.getElementById('btnUnitImperial');

    if (btnMetric && btnImperial) {
      btnMetric.addEventListener('click', () => {
        btnMetric.classList.add('active');
        btnImperial.classList.remove('active');
        setUnit('metric');
      });

      btnImperial.addEventListener('click', () => {
        btnImperial.classList.add('active');
        btnMetric.classList.remove('active');
        setUnit('imperial');
      });
    }

    // Sincronizar el BCS visual (Henneke 1-9) con el modelo de peso.
    window.addEventListener('bcsUpdated', (e) => {
      const score = Number(e.detail && e.detail.hennekeScore);
      if (score >= 1 && score <= 9) {
        state.BCS = score;
        updateUI();
      }
    });
  }

  function init() {
    bindEvents();
    updateUI();
  }

  return {
    init,
    setUnit,
    setModel,
    setSex,
    setBreedType,
    getState: () => ({ ...state }),
    getCalculatedWeightKg: () => calculateAll().activeModel.data.weightKg,
    getCalculatedWeightRangeKg: () => {
      const active = calculateAll().activeModel;
      const pct = active.data.uncertaintyPct || DEFAULT_UNCERTAINTY_PCT;
      return {
        low: active.data.weightKg * (1 + pct.low / 100),
        high: active.data.weightKg * (1 + pct.high / 100)
      };
    }
  };
})();
