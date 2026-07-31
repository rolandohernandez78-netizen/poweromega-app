/* ==========================================================================
   PowerOmega APP - Módulo Morfométrico y Estimación de Peso Equino
   Desarrollado por Rolando Hernández Mora (RRHM)
   Modelos Bibliográficos Validados:
   1. Carroll & Huntington (1988) [PREDETERMINADO / MÁS UTILIZADO]
   2. Tradicional / Hall (1971) / NRC (2007)
   3. Marcenac & Aublet (1964)
   4. Ensminger (1977)
   5. Jones et al. (1989)
   6. Willoughby (1975)
   ========================================================================== */

const Morphometrics = (function() {
  let currentUnit = 'metric'; // 'metric' (cm, kg) or 'imperial' (in, lb)
  let selectedModel = 'carroll_1988'; // DEFAULT MODEL: Carroll & Huntington (1988)

  // Internal state stored in cm
  let state = {
    NC: 85,  // Circunferencia cuello (cm)
    H: 150,  // Altura cruz (cm)
    G: 180,  // Circunferencia cincha/barril/cardíaca (cm)
    L: 165,  // Longitud corporal (cm)
    BCS: 5 // Condición corporal Henneke, escala 1-9
  };

  const METRIC_RANGES = {
    NC: { min: 40, max: 160, step: 1 },
    H:  { min: 80, max: 210, step: 1 },
    G:  { min: 90, max: 260, step: 1 },
    L:  { min: 80, max: 240, step: 1 }
  };

  // Punto neutro del ajuste complementario: conserva exactamente el resultado
  // publicado de cada modelo con las medidas iniciales de la aplicación.
  const REFERENCE_MEASUREMENTS = { NC: 85, H: 150, G: 180, L: 165 };

  // Variables que ya forman parte de cada ecuación original.
  const MODEL_INPUTS = {
    carroll_1988: ['G', 'L'],
    traditional_hall: ['G', 'L'],
    marcenac_1964: ['G'],
    ensminger_1977: ['G', 'L'],
    jones_1989: ['G', 'L'],
    willoughby_1975: ['G']
  };

  // Exponentes del modelo multivariado de Martinson et al., que utiliza
  // circunferencia torácica, longitud, altura y circunferencia del cuello.
  const COMPLEMENTARY_EXPONENTS = { NC: 0.173, H: 0.599, L: 0.554 };

  /**
   * 1. Carroll & Huntington (1988) - MODELO PREDETERMINADO
   * Standard: (G^2 * L) / 11877
   * Carroll BCS < 2.5/5: divisor 12265
   * Carroll BCS >= 3/5: divisor 11706
   *
   * La interfaz usa Henneke 1-9. Para no mezclar escalas directamente,
   * se normalizan linealmente sus extremos: 1 -> 0 y 9 -> 5.
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
      population: "Equinos entre 160 a 680 kg, alzada 12 a 17 hh, CC 1 a 5."
    };
  }

  /**
   * 2. Tradicional / Hall (1971) / NRC (2007)
   */
  function calcHallNRC(g, l) {
    const weightKg = (Math.pow(g, 2) * l) / 11880.0;
    return {
      weightKg,
      formulaText: `PV (kg) = (G² × L) / 11880  [en lb/in: (G² × L) / 300]`,
      citation: "Hall, L. W. (1971). Wright's Veterinary Anaesthesia; NRC (2007) Nutrient Requirements of Horses.",
      population: "Equinos adultos tradicionales."
    };
  }

  /**
   * 3. Marcenac & Aublet (1964)
   * BW (kg) = Girth^3 * 80 (Girth en metros)
   */
  function calcMarcenac(g) {
    const gMeters = g / 100.0;
    const weightKg = Math.pow(gMeters, 3) * 80.0;
    return {
      weightKg,
      formulaText: `PV (kg) = G³ × 80  (G en metros)`,
      citation: "Marcenac, B., & Aublet, H. (1964). Ecuación francesa de masa corporal.",
      population: "Equinos adultos."
    };
  }

  /**
   * 4. Ensminger (1977)
   * BW (kg) = (Girth_in^2 * Length_in + 22.7) / 660
   */
  function calcEnsminger(g, l) {
    const gIn = g / 2.54;
    const lIn = l / 2.54;
    const weightKg = (Math.pow(gIn, 2) * lIn + 22.7) / 660.0;
    return {
      weightKg,
      formulaText: `BW (kg) = (G² × L + 22.7) / 660  (G, L en pulgadas)`,
      citation: "Ensminger, M. E. (1977). Complete Horse Encyclopedia.",
      population: "Equinos adultos."
    };
  }

  /**
   * 5. Jones et al. (1989)
   * BW (kg) = (G^1.78 * L^0.97) / 3011
   */
  function calcJones(g, l) {
    const weightKg = (Math.pow(g, 1.78) * Math.pow(l, 0.97)) / 3011.0;
    return {
      weightKg,
      formulaText: `BW (kg) = (G¹.⁷⁸ × L⁰.⁹⁷) / 3011`,
      citation: "Jones, W. E., et al. (1989). Weight estimation models.",
      population: "> 2 años, 230 a 707 kg."
    };
  }

  /**
   * 6. Willoughby (1975) - Machos Adultos
   * BW (lb) = (0.14475 * Girth_in)^3
   */
  function calcWilloughby(g) {
    const gIn = g / 2.54;
    const weightLb = Math.pow(0.14475 * gIn, 3);
    const weightKg = weightLb / 2.20462;
    return {
      weightKg,
      formulaText: `BW (lb) = (0.14475 × G)³  (G en pulgadas)`,
      citation: "Willoughby, D. P. (1975). Growth and nutrition equations.",
      population: "Machos adultos."
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
   * Añade únicamente las medidas ausentes de la ecuación original.
   * Así, G/L no se cuentan dos veces en los modelos que ya las incluyen,
   * pero NC, H y —cuando corresponde— L responden en todos los modelos.
   */
  function applyComplementaryAdjustment(modelKey, data) {
    const originalInputs = MODEL_INPUTS[modelKey] || [];
    const appliedInputs = Object.keys(COMPLEMENTARY_EXPONENTS)
      .filter(key => !originalInputs.includes(key));

    const factor = appliedInputs.reduce((result, key) => {
      const ratio = state[key] / REFERENCE_MEASUREMENTS[key];
      return result * Math.pow(ratio, COMPLEMENTARY_EXPONENTS[key]);
    }, 1);

    const inputLabels = { NC: 'NC', H: 'H', L: 'L' };
    const adjustmentFormula = appliedInputs
      .map(key => `(${inputLabels[key]}/${REFERENCE_MEASUREMENTS[key]})^${COMPLEMENTARY_EXPONENTS[key]}`)
      .join(' × ');

    return {
      ...data,
      baseWeightKg: data.weightKg,
      weightKg: data.weightKg * factor,
      adjustmentFactor: factor,
      adjustmentInputs: appliedInputs,
      adjustmentFormula
    };
  }

  function calculateAll() {
    const { G, L, BCS } = state;

    const carroll = calcCarrollHuntington(G, L, BCS);
    const hall = calcHallNRC(G, L);
    const marcenac = calcMarcenac(G);
    const ensminger = calcEnsminger(G, L);
    const jones = calcJones(G, L);
    const willoughby = calcWilloughby(G);

    const baseModelsMap = {
      carroll_1988: { name: "Carroll & Huntington (1988) [Default]", data: carroll },
      traditional_hall: { name: "Tradicional / Hall (1971) / NRC (2007)", data: hall },
      marcenac_1964: { name: "Marcenac & Aublet (1964)", data: marcenac },
      ensminger_1977: { name: "Ensminger (1977)", data: ensminger },
      jones_1989: { name: "Jones et al. (1989)", data: jones },
      willoughby_1975: { name: "Willoughby (1975)", data: willoughby }
    };

    const modelsMap = Object.fromEntries(
      Object.entries(baseModelsMap).map(([key, model]) => [
        key,
        { ...model, data: applyComplementaryAdjustment(key, model.data) }
      ])
    );

    const activeModelObj = modelsMap[selectedModel] || modelsMap.carroll_1988;

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
      heroModelNameElem.textContent = active.name.replace(" [Default]", "");
    }
    if (heroModelCitationElem) {
      const adjustedInputs = active.data.adjustmentInputs.join(', ');
      heroModelCitationElem.innerHTML = `
        <strong>Fórmula base:</strong> ${active.data.formulaText}<br>
        <strong>Ajuste complementario:</strong> ${active.data.adjustmentFormula}
        <span class="model-adjustment-meta">(incorpora ${adjustedInputs}; factor actual ${active.data.adjustmentFactor.toFixed(3)})</span><br>
        <strong>Fuente base:</strong> ${active.data.citation}<br>
        <strong>Base del ajuste:</strong> Martinson et al. — ecuación morfométrica multivariada para equinos.
      `;
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

    // Renderizar tabla comparativa de modelos
    const tableBody = document.getElementById('modelComparisonTableBody');
    if (tableBody) {
      tableBody.innerHTML = Object.keys(calc.modelsMap).map(key => {
        const item = calc.modelsMap[key];
        const isSelected = key === selectedModel;
        const wVal = Math.round(kgToUnit(item.data.weightKg));
        return `
          <tr class="${isSelected ? 'model-row-selected' : ''}">
            <td class="model-name-cell">${item.name.replace(" [Default]", "")} ${isSelected ? '<span class="model-selected-label">(Seleccionado)</span>' : ''}</td>
            <td class="model-weight-cell">${wVal} ${wUnit}</td>
            <td class="model-citation-cell">
              ${item.data.citation}<br>
              <span class="model-adjustment-note">Ajuste complementario con ${item.data.adjustmentInputs.join(', ')} · factor ${item.data.adjustmentFactor.toFixed(3)}</span>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Disparar evento global para actualizar Módulo de Nutrición con el peso del modelo activo
    window.dispatchEvent(new CustomEvent('weightUpdated', {
      detail: {
        weightKg: active.data.weightKg,
        modelName: active.name.replace(' [Default]', '')
      }
    }));
  }

  function setUnit(unit) {
    currentUnit = unit;
    document.querySelectorAll('.unit-label-length').forEach(el => el.textContent = currentUnit === 'metric' ? 'cm' : 'in');
    
    ['NC', 'H', 'G', 'L'].forEach(key => {
      const numInput = document.getElementById(`input${key}`);
      const rangeInput = document.getElementById(`range${key}`);
      const metricRange = METRIC_RANGES[key];
      const min = currentUnit === 'metric' ? metricRange.min : metricRange.min / 2.54;
      const max = currentUnit === 'metric' ? metricRange.max : metricRange.max / 2.54;
      const step = currentUnit === 'metric' ? metricRange.step : 0.1;
      const val = currentUnit === 'metric'
        ? Math.round(state[key])
        : Number((state[key] / 2.54).toFixed(1));

      [numInput, rangeInput].forEach(input => {
        if (!input) return;
        input.min = min.toFixed(currentUnit === 'metric' ? 0 : 1);
        input.max = max.toFixed(currentUnit === 'metric' ? 0 : 1);
        input.step = step;
        input.value = val;
        input.removeAttribute('aria-invalid');
      });
    });

    updateUI();
  }

  function setModel(modelKey) {
    selectedModel = modelKey;
    updateUI();
  }

  function bindEvents() {
    ['NC', 'H', 'G', 'L'].forEach(key => {
      const numInput = document.getElementById(`input${key}`);
      const rangeInput = document.getElementById(`range${key}`);

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
          if (rangeInput) rangeInput.value = val;
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
          if (rangeInput) rangeInput.value = val;
          updateUI();
        });
      }

      if (rangeInput) {
        const syncRangeValue = (e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isFinite(val)) return;
          state[key] = unitToCm(val);
          if (numInput) numInput.value = val;
          e.target.setAttribute('aria-valuetext', `${val} ${getUnitLabelLength()}`);
          updateUI();
        };
        // `input` ofrece actualización continua; `change` cubre navegadores
        // que solo notifican al soltar el control.
        rangeInput.addEventListener('input', syncRangeValue);
        rangeInput.addEventListener('change', syncRangeValue);
      }
    });

    // Selector de Modelo
    const selectModel = document.getElementById('selectWeightModel');
    if (selectModel) {
      selectModel.addEventListener('change', (e) => {
        setModel(e.target.value);
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
    getState: () => ({ ...state }),
    getCalculatedWeightKg: () => calculateAll().activeModel.data.weightKg
  };
})();
