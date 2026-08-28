/* ==========================================================================
   PowerOmega APP - Módulo de Estimación Nutricional & Suplementación EQUIGRAS®
   Desarrollado por Rolando Hernández Mora (Médico Veterinario, Máster en Nutrición Animal)
   Citas bibliográficas: NRC (2007), INRA (2014, 2015), Lawrence (2014)
   DMI (Ingesta de Materia Seca): NRC (2007) & INRA (2014)
   ========================================================================== */

const Nutrition = (function() {
  let state = {
    weightKg: 500,
    physioState: 'maintenance', // 'maintenance', 'light_work', 'moderate_work', 'intense_work', 'stallion', 'gestation_late', 'lactation_early', 'foal'
    heightCategory: 'high',     // 'low' (<= 1.45m) or 'high' (> 1.45m)
    forageQuality: 'medium',    // 'medium', 'high'
    sex: null                   // 'male', 'gelding', 'female' — reflejo de #selectAnimalSex (módulo morfométrico), vía evento 'animalProfileUpdated'
  };
  let waterWeightManuallyEdited = false; // evita que weightUpdated pise un peso "qué pasaría si" escrito a mano

  // Parámetros Nutricionales de EQUIGRAS®
  const EQUIGRAS_SPECS = {
    fatPercent: 75,
    emMcalPerKg: 6.5,
    grossMcalPerKg: 7.6,
    omega3Percent: 5.0,  // EPA + DHA min %
    omega6Percent: 12.0, // Linoleico min %
    ratioOmega63: '3:1'
  };

  // Estimaciones de consumo de agua derivadas de NRC (2007), Tabla 7-1.
  // Algunas combinaciones se identifican en la interfaz como aproximadas
  // porque corresponden a interpolaciones o escenarios complementarios.
  const NRC_WATER_TABLE = {
    maintenance_neutral_hay:   { L100: 5.0,  low: 21, high: 29 },
    maintenance_warm_hay:      { L100: 9.6,  low: 42, high: 54 },
    maintenance_neutral_mixed: { L100: 6.7,  low: 30, high: 38 },
    maintenance_warm_mixed:    { L100: 7.8,  low: 34, high: 44 },
    maintenance_cold_mixed:    { L100: 6.2,  low: 27, high: 35 },
    maintenance_cold_hay:      { L100: 8.4,  low: 37, high: 47 },
    maintenance_hot_hay:       { L100: 11.0, low: 48, high: 62 },
    maintenance_hot_mixed:     { L100: 9.0,  low: 38, high: 52 },
    gestation_neutral_mixed:   { L100: 6.2,  low: 27, high: 35 },
    gestation_neutral_hay:     { L100: 6.5,  low: 28, high: 37 },
    gestation_warm_mixed:      { L100: 8.0,  low: 35, high: 45 },
    gestation_warm_hay:        { L100: 9.0,  low: 39, high: 51 },
    gestation_cold_mixed:      { L100: 6.2,  low: 27, high: 35 },
    gestation_cold_hay:        { L100: 7.5,  low: 33, high: 42 },
    gestation_hot_mixed:       { L100: 9.5,  low: 41, high: 54 },
    gestation_hot_hay:         { L100: 11.0, low: 47, high: 63 },
    lactating_neutral_hay:     { L100: 12.9, low: 52, high: 78 },
    lactating_neutral_mixed:   { L100: 10.2, low: 40, high: 63 },
    lactating_warm_hay:        { L100: 15.0, low: 63, high: 87 },
    lactating_warm_mixed:      { L100: 13.0, low: 54, high: 76 },
    lactating_cold_hay:        { L100: 12.9, low: 52, high: 78 },
    lactating_cold_mixed:      { L100: 10.2, low: 40, high: 63 },
    lactating_hot_hay:         { L100: 17.0, low: 70, high: 100 },
    lactating_hot_mixed:       { L100: 14.5, low: 60, high: 85 },
    moderate_ex_neutral_mixed: { L100: 8.2,  low: 36, high: 46 },
    moderate_ex_neutral_hay:   { L100: 9.0,  low: 39, high: 51 },
    moderate_ex_warm_mixed:    { L100: 12.0, low: 52, high: 68 },
    moderate_ex_warm_hay:      { L100: 13.5, low: 58, high: 77 },
    moderate_ex_hot_mixed:     { L100: 16.4, low: 72, high: 92 },
    moderate_ex_hot_hay:       { L100: 18.0, low: 79, high: 100 },
    moderate_ex_cold_mixed:    { L100: 7.5,  low: 33, high: 42 },
    moderate_ex_cold_hay:      { L100: 8.5,  low: 37, high: 48 },
    yearling_neutral_mixed:    { L100: 6.3,  low: 17, high: 21, refWt: 300 },
    yearling_neutral_hay:      { L100: 7.0,  low: 18, high: 24, refWt: 300 },
    yearling_cold_mixed:       { L100: 6.0,  low: 16, high: 20, refWt: 300 },
    yearling_cold_hay:         { L100: 6.5,  low: 17, high: 22, refWt: 300 },
    yearling_warm_mixed:       { L100: 8.0,  low: 21, high: 27, refWt: 300 },
    yearling_warm_hay:         { L100: 9.0,  low: 23, high: 31, refWt: 300 },
    yearling_hot_mixed:        { L100: 10.0, low: 26, high: 34, refWt: 300 },
    yearling_hot_hay:          { L100: 11.5, low: 29, high: 40, refWt: 300 }
  };

  /**
   * Calcula requerimientos de Energía Digestible (Mcal/día)
   * NRC (2007)
   */
  function calcEDRequirements(weightKg, physioState) {
    const EDm_min = (30.3 * weightKg) / 1000.0;
    const EDm_avg = (33.3 * weightKg) / 1000.0;
    const EDm_high = (36.3 * weightKg) / 1000.0;

    let totalED = EDm_avg;
    let factorName = "Mantenimiento Adulto";

    switch (physioState) {
      case 'light_work':
        totalED = EDm_avg * 1.2;
        factorName = "Ejercicio Ligero (+20%)";
        break;
      case 'moderate_work':
        totalED = EDm_avg * 1.4;
        factorName = "Ejercicio Moderado (+40%)";
        break;
      case 'intense_work':
        totalED = EDm_avg * 1.9;
        factorName = "Ejercicio Intenso / Deporte (+90%)";
        break;
      case 'stallion':
        totalED = EDm_avg * 1.25;
        factorName = "Semental en temporada de monta (+25%)";
        break;
      case 'gestation_late':
        totalED = EDm_avg * 1.15;
        factorName = "Yegua Gestante 3er Tercio (+15%; rango orientativo +10–20%)";
        break;
      case 'lactation_early':
        totalED = EDm_avg * 1.75;
        factorName = "Yegua Lactante Pico (+75%; rango orientativo +70–80%)";
        break;
      case 'foal':
        totalED = null;
        factorName = "Requiere edad, peso adulto esperado y ganancia diaria";
        break;
    }

    return {
      EDm_min,
      EDm_avg,
      EDm_high,
      totalED,
      factorName
    };
  }

  /**
   * Ingesta Estimada de Materia Seca (DMI) en kg/día y % PV
   * NRC (2007) Nutrient Requirements of Horses, Cap. 2 / INRA (2014) Equine Nutrition
   * Rango general: 1.5 – 3.0 % del PV según estado fisiológico
   */
  function calcDMI(weightKg, physioState) {
    // Porcentaje del PV (%PV) según estado fisiológico — NRC 2007 / INRA 2014
    let pctPV_min, pctPV_max, pctPV, label, source;

    switch (physioState) {
      case 'maintenance':
        pctPV_min = 1.5; pctPV_max = 2.0; pctPV = 1.8;
        label = "Mantenimiento Adulto";
        source = "NRC 2007 / INRA 2014";
        break;
      case 'light_work':
        pctPV_min = 1.5; pctPV_max = 2.5; pctPV = 2.0;
        label = "Ejercicio Ligero";
        source = "NRC 2007";
        break;
      case 'moderate_work':
        pctPV_min = 1.75; pctPV_max = 2.5; pctPV = 2.2;
        label = "Ejercicio Moderado";
        source = "NRC 2007";
        break;
      case 'intense_work':
        pctPV_min = 1.5; pctPV_max = 3.0; pctPV = 2.5;
        label = "Ejercicio Intenso / Competencia";
        source = "NRC 2007";
        break;
      case 'stallion':
        pctPV_min = 1.5; pctPV_max = 2.5; pctPV = 2.0;
        label = "Semental en Monta";
        source = "NRC 2007";
        break;
      case 'gestation_late':
        pctPV_min = 1.5; pctPV_max = 2.0; pctPV = 1.8;
        label = "Yegua Gestante 3er Tercio";
        source = "NRC 2007 / INRA 2014";
        break;
      case 'lactation_early':
        pctPV_min = 2.0; pctPV_max = 3.0; pctPV = 2.5;
        label = "Yegua Lactante Pico";
        source = "NRC 2007 / INRA 2014";
        break;
      case 'foal':
        pctPV_min = 2.0; pctPV_max = 3.0; pctPV = 2.5;
        label = "Potro en Crecimiento";
        source = "NRC 2007";
        break;
      default:
        pctPV_min = 1.5; pctPV_max = 2.0; pctPV = 1.8;
        label = "Mantenimiento";
        source = "NRC 2007";
    }

    const dmiKg = (weightKg * pctPV) / 100.0;
    const dmiKg_min = (weightKg * pctPV_min) / 100.0;
    const dmiKg_max = (weightKg * pctPV_max) / 100.0;

    return {
      dmiKg,
      dmiKg_min,
      dmiKg_max,
      pctPV,
      pctPV_min,
      pctPV_max,
      label,
      source
    };
  }

  /**
   * Recomienda la dosis de EQUIGRAS® (g/día) según la Ficha Técnica Oficial 2025 (ICA 10396SL)
   * Clasificado por Alzada (<= 1.45m vs > 1.45m) y Etapa Productiva
   */
  function calcEquigrasDose(heightCat, physioState) {
    let doseGrams = 150;
    let doseNote = "";

    if (heightCat === 'low') { // Equinos con alzada de hasta 1.45 m
      switch (physioState) {
        case 'lactation_early':
        case 'intense_work':
          doseGrams = 150;
          doseNote = "Equinos hasta 1.45 m en lactancia / competencia (150 g/día)";
          break;
        case 'gestation_late':
          doseGrams = 100;
          doseNote = "Yeguas gestantes hasta 1.45 m (100 g/día)";
          break;
        case 'foal':
          doseGrams = 75;
          doseNote = "Potros y potrancas hasta 18 meses (75 g/día)";
          break;
        case 'maintenance':
        case 'light_work':
        case 'moderate_work':
        case 'stallion':
        default:
          doseGrams = 100;
          doseNote = "Equinos adultos hasta 1.45 m en mantenimiento / trabajo (100 g/día)";
          break;
      }
    } else { // Equinos con alzada superior a 1.45 m
      switch (physioState) {
        case 'lactation_early':
        case 'intense_work':
          doseGrams = 200;
          doseNote = "Equinos > 1.45 m en lactancia / competencia (200 g/día)";
          break;
        case 'gestation_late':
          doseGrams = 150;
          doseNote = "Yeguas gestantes > 1.45 m (150 g/día)";
          break;
        case 'foal':
          doseGrams = 100;
          doseNote = "Potros y potrancas hasta 18 meses > 1.45 m (100 g/día)";
          break;
        case 'maintenance':
        case 'light_work':
        case 'moderate_work':
        case 'stallion':
        default:
          doseGrams = 150;
          doseNote = "Equinos adultos > 1.45 m en mantenimiento / trabajo (150 g/día)";
          break;
      }
    }

    const emContributionMcal = (doseGrams / 1000.0) * EQUIGRAS_SPECS.emMcalPerKg;
    const omega3Grams = (doseGrams * 0.75) * (EQUIGRAS_SPECS.omega3Percent / 100.0);
    const omega6Grams = (doseGrams * 0.75) * (EQUIGRAS_SPECS.omega6Percent / 100.0);

    return {
      doseGrams,
      doseNote,
      emContributionMcal,
      omega3Grams,
      omega6Grams
    };
  }

  function calcWaterNeeds() {
    const category = document.getElementById('simCategory');
    const temperature = document.getElementById('simTemp');
    const diet = document.getElementById('simDiet');
    const weightInput = document.getElementById('simBodyWeight');
    const resultValue = document.getElementById('simResultValue');
    const resultRange = document.getElementById('simResultRange');
    const resultNote = document.getElementById('simResultNote');

    if (!category || !temperature || !diet || !weightInput ||
        !resultValue || !resultRange || !resultNote) return;

    const rawWeight = parseFloat(weightInput.value);
    const bodyWeight = Math.min(900, Math.max(100, Number.isFinite(rawWeight) ? rawWeight : 500));
    if (rawWeight !== bodyWeight) weightInput.value = Math.round(bodyWeight);

    const key = `${category.value}_${temperature.value}_${diet.value}`;
    let data = NRC_WATER_TABLE[key];
    let isFallback = false;

    if (!data) {
      data = NRC_WATER_TABLE[`${category.value}_neutral_mixed`];
      isFallback = true;
    }

    if (!data) {
      resultValue.textContent = '— L/día';
      resultRange.textContent = 'Sin datos para esta combinación.';
      resultNote.textContent = 'Seleccione otra combinación de parámetros.';
      return;
    }

    const referenceWeight = data.refWt || 500;
    const total = Math.round((data.L100 / 100) * bodyWeight);
    const low = Math.round((data.low / referenceWeight) * bodyWeight);
    const high = Math.round((data.high / referenceWeight) * bodyWeight);

    resultValue.textContent = `${total} L/día`;
    resultRange.textContent = `${isFallback ? 'Rango estimado' : 'Rango esperado'}: ${low} – ${high} L/día`;

    if (isFallback) {
      resultNote.textContent = '⚠️ Combinación aproximada — consulte la tabla completa para mayor precisión.';
      return;
    }

    const notes = {
      maintenance: 'Caballo adulto en reposo. La ingesta sube hasta ~2× con calor extremo.',
      gestation: 'Yegua gestante: el tercer tercio eleva los requerimientos hídricos.',
      lactating: 'Yegua lactante: el pico de producción láctea puede triplicar el consumo de agua.',
      moderate_ex: 'Ejercicio moderado: el sudor y la respiración aumentan la pérdida hídrica.',
      yearling: `Potro de un año (referencia ${referenceWeight} kg). Valor ajustado para ${bodyWeight} kg de peso vivo.`
    };
    resultNote.textContent = notes[category.value] || '';
  }

  function toggleWaterSimulator() {
    const simulator = document.getElementById('waterSimulator');
    const button = document.getElementById('btnToggleWaterSim');
    const text = document.getElementById('btnWaterSimText');
    if (!simulator || !button || !text) return;

    const willOpen = simulator.hidden;
    simulator.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
    text.textContent = willOpen
      ? 'Ocultar simulador de consumo de agua'
      : 'Estimar consumo de agua de mi equino';
    if (willOpen) calcWaterNeeds();
  }

  /**
   * T-13, opción C: réplica en el lado de nutrición de la comprobación de
   * coherencia sexo / estado fisiológico que ya existe en morphometrics.js
   * (checkSexPhysioCoherence). Aquí no hace falta leer el DOM ajeno: state.sex
   * ya se mantiene sincronizado vía el evento 'animalProfileUpdated' que
   * emite morphometrics.js. Ver DEUDA_TECNICA_POWEROMEGA.md (D-01/D-02) —
   * este acoplamiento por eventos debería migrar a un estado compartido del
   * animal cuando ambos módulos entren en un mismo trabajo de refactor.
   */
  function checkSexPhysioCoherence() {
    const isFemaleOnlyState = state.physioState === 'gestation_late' || state.physioState === 'lactation_early';
    if ((state.sex === 'male' || state.sex === 'gelding') && isFemaleOnlyState) {
      return 'El estado fisiológico elegido no concuerda con el sexo indicado en el módulo morfométrico. Revise ambos valores.';
    }
    return null;
  }

  function updateUI() {
    const edReq = calcEDRequirements(state.weightKg, state.physioState);
    const dmi   = calcDMI(state.weightKg, state.physioState);
    const eqDose = calcEquigrasDose(state.heightCategory, state.physioState);

    // Actualizar elementos DOM
    const edTotalElem  = document.getElementById('valEdTotal');
    const edmAvgElem   = document.getElementById('valEdmAvg');
    const dmiKgElem    = document.getElementById('valDmiKg');
    const dmiPctElem   = document.getElementById('valDmiPct');
    const dmiRangeElem = document.getElementById('valDmiRange');
    const dmiBasisElem = document.getElementById('valDmiBasisWeight');
    const eqDoseElem   = document.getElementById('valEquigrasDose');
    const eqEmElem     = document.getElementById('valEquigrasEM');
    const eqO3Elem     = document.getElementById('valEquigrasO3');
    const eqO6Elem     = document.getElementById('valEquigrasO6');

    const eqDoseNoteElem = document.getElementById('valEquigrasDoseNote');

    if (edTotalElem) {
      edTotalElem.textContent = Number.isFinite(edReq.totalED)
        ? `${edReq.totalED.toFixed(2)} Mcal ED/día`
        : 'Cálculo individual requerido';
    }
    if (edmAvgElem)   edmAvgElem.textContent    = `${edReq.EDm_avg.toFixed(2)} Mcal/día (${edReq.factorName})`;
    if (dmiKgElem)    dmiKgElem.textContent     = `${dmi.dmiKg.toFixed(1)} kg MS/día`;
    if (dmiPctElem)   dmiPctElem.textContent    = `${dmi.pctPV.toFixed(1)} % del PV (${dmi.label})`;
    if (dmiRangeElem) dmiRangeElem.textContent  = `Rango: ${dmi.dmiKg_min.toFixed(1)} – ${dmi.dmiKg_max.toFixed(1)} kg/día (${dmi.pctPV_min}–${dmi.pctPV_max}% PV) · ${dmi.source}`;
    if (dmiBasisElem) dmiBasisElem.textContent  = Math.round(state.weightKg);
    if (eqDoseElem) eqDoseElem.textContent = `${eqDose.doseGrams} g/día`;
    if (eqDoseNoteElem) eqDoseNoteElem.textContent = eqDose.doseNote;
    if (eqEmElem) eqEmElem.textContent = `${eqDose.emContributionMcal.toFixed(2)} Mcal EM/d*`;
    if (eqO3Elem) eqO3Elem.textContent = `${eqDose.omega3Grams.toFixed(1)} g EPA+DHA/d`;
    if (eqO6Elem) eqO6Elem.textContent = `${eqDose.omega6Grams.toFixed(1)} g Linoleico/d`;

    // T-13, opción C: aviso de coherencia sexo / estado fisiológico, en el punto de selección
    const sexPhysioWarningElem = document.getElementById('nutritionSexPhysioWarning');
    if (sexPhysioWarningElem) {
      const warning = checkSexPhysioCoherence();
      if (warning) {
        sexPhysioWarningElem.textContent = `⚠️ ${warning}`;
        sexPhysioWarningElem.hidden = false;
      } else {
        sexPhysioWarningElem.textContent = '';
        sexPhysioWarningElem.hidden = true;
      }
    }
  }

  function bindEvents() {
    const stateSelect = document.getElementById('selectPhysioState');
    const heightSelect = document.getElementById('selectHeightCategory');
    const waterToggle = document.getElementById('btnToggleWaterSim');
    const waterCategory = document.getElementById('simCategory');
    const waterTemperature = document.getElementById('simTemp');
    const waterDiet = document.getElementById('simDiet');
    const waterWeight = document.getElementById('simBodyWeight');

    if (stateSelect) {
      stateSelect.addEventListener('change', (e) => {
        state.physioState = e.target.value;
        updateUI();
      });
    }

    if (heightSelect) {
      heightSelect.addEventListener('change', (e) => {
        state.heightCategory = e.target.value;
        updateUI();
      });
    }

    if (waterToggle) waterToggle.addEventListener('click', toggleWaterSimulator);
    [waterCategory, waterTemperature, waterDiet].forEach(control => {
      if (control) control.addEventListener('change', calcWaterNeeds);
    });
    if (waterWeight) {
      waterWeight.addEventListener('input', () => {
        waterWeightManuallyEdited = true;
        calcWaterNeeds();
      });
      waterWeight.addEventListener('change', calcWaterNeeds);
    }

    // Escuchar actualizaciones de peso provenientes del módulo morfométrico
    window.addEventListener('weightUpdated', (e) => {
      if (e.detail && e.detail.weightKg) {
        state.weightKg = e.detail.weightKg;
        if (!waterWeightManuallyEdited) {
          const waterWeight = document.getElementById('simBodyWeight');
          if (waterWeight) {
            waterWeight.value = Math.round(state.weightKg);
            calcWaterNeeds();
          }
        }
        updateUI();
      }
    });

    // T-13, opción C: sincronizar sexo del animal desde el módulo morfométrico
    // (solo lectura del evento; nunca escribe en #selectAnimalSex ni en morphometrics.js)
    window.addEventListener('animalProfileUpdated', (e) => {
      if (e.detail) {
        state.sex = e.detail.sex || null;
        updateUI();
      }
    });
  }

  function init() {
    bindEvents();
    updateUI();
    calcWaterNeeds();
  }

  return {
    init,
    updateState: (newState) => {
      state = { ...state, ...newState };
      updateUI();
    }
  };
})();
