/* ==========================================================================
   PowerOmega APP - Módulo de Evaluación de Condición Corporal (BCS) & Grasa Subcutánea
   Desarrollado por Rolando Hernández Mora (RRHM)
   Citas bibliográficas: Henneke et al. (1983), INRA (2015), Westervelt et al. (1976)
   ========================================================================== */

const BCS = (function() {
  let selectedScore = 5;
  let fatCm = 0.8; // Espesor de grasa en cm por ultrasonografía
  let equineType = 'horse'; // 'horse' or 'pony'
  const BCS_POSITION_CLASSES = [
    'bcs-overlay-r0-c0', 'bcs-overlay-r0-c1', 'bcs-overlay-r0-c2',
    'bcs-overlay-r1-c0', 'bcs-overlay-r1-c1', 'bcs-overlay-r1-c2',
    'bcs-overlay-r2-c0', 'bcs-overlay-r2-c1', 'bcs-overlay-r2-c2'
  ];

  const BCS_DESCRIPTIONS = {
    1: { name: "Pobre / Emaciado", desc: "Caballo extremadamente emaciado. Columna vertebral, costillas, huesos de la cadera y base de la cola prominentes. Estructuras óseas de cruz, hombros y cuello prominentes. Sin grasa palpable.", status: "danger" },
    2: { name: "Muy Flaco", desc: "Emaciado. Ligera capa de grasa cubriendo las vértebras. Estructuras óseas discernibles pero ligeramente cubiertas.", status: "warning" },
    3: { name: "Flaco", desc: "Acumulación leve de grasa en las vértebras. Las costillas son visibles pero pueden palparse. Base de la cola prominente.", status: "warning" },
    4: { name: "Moderadamente Flaco", desc: "Ligera cresta a lo largo de la columna. Contorno débil de costillas. Grasa perceptible en la base de la cola.", status: "caution" },
    5: { name: "Moderado (Óptimo Mantenimiento)", desc: "Espalda nivelada. Costillas fácilmente palpables pero no visibles. Grasa en base de la cola esponjosa. Cruz redondeada y hombros suaves.", status: "success" },
    6: { name: "Moderadamente Carnoso", desc: "Ligero pliegue en la espalda. Grasa suave en base de cola y sobre costillas. Grasa a ambos lados de la cruz y cresta del cuello.", status: "success" },
    7: { name: "Carnoso", desc: "Pliegue en la espalda. Capa notable de grasa sobre costillas y depósitos subcutáneos suaves a lo largo del cuello y la cruz.", status: "caution" },
    8: { name: "Gordo", desc: "Pliegue evidente en la espalda. Costillas difíciles de palpar. Depósitos de grasa prominentes en cuello, cruz y detrás de hombros.", status: "warning" },
    9: { name: "Obeso", desc: "Pliegue muy profundo en la espalda. Depósitos masivos de grasa en cuello (cresta), cruz, hombros y grupa. Espacio entre muslos abultado.", status: "danger" }
  };

  /**
   * % Grasa Corporal por Ultrasonido en Grupa
   * Westervelt et al. (1976), Kane et al. (1987)
   */
  function calcFatPercentage(cm, type) {
    if (type === 'pony') {
      return 5.47 * cm + 2.47;
    }
    return 4.70 * cm + 8.64;
  }

  function updateUI() {
    const data = BCS_DESCRIPTIONS[selectedScore];
    const nameElem  = document.getElementById('bcsScoreName');
    const descElem  = document.getElementById('bcsScoreDesc');
    const fatValElem = document.getElementById('valFatPercentage');

    if (nameElem) nameElem.textContent = `CC ${selectedScore}: ${data.name}`;
    if (descElem) descElem.textContent = data.desc;

    const fatPct = calcFatPercentage(fatCm, equineType);
    if (fatValElem) fatValElem.textContent = `${fatPct.toFixed(1)} % aprox.`;

    // ── Actualizar badge + overlay rojo sobre la foto ──
    const labelEl   = document.getElementById('bcsImageLabel');
    const overlayEl = document.getElementById('bcsRedOverlay');
    const overlayLb = document.getElementById('bcsOverlayLabel');

    // Mapa BCS → posición en la grilla 3×3 de la foto
    // Columna: 0=Poor(izq), 1=Moderate(centro), 2=Fat(der)
    // Fila:    0=arriba, 1=medio, 2=abajo
    const BCS_GRID = {
      1: { row: 0, col: 0 },
      2: { row: 1, col: 0 },
      3: { row: 2, col: 0 },
      4: { row: 0, col: 1 },
      5: { row: 1, col: 1 },
      6: { row: 2, col: 1 },
      7: { row: 0, col: 2 },
      8: { row: 1, col: 2 },
      9: { row: 2, col: 2 },
    };

    const cell = BCS_GRID[selectedScore];
    if (cell && overlayEl) {
      overlayEl.classList.remove(...BCS_POSITION_CLASSES);
      overlayEl.classList.add(`bcs-overlay-r${cell.row}-c${cell.col}`);
    }
    if (overlayLb) overlayLb.textContent = `CC ${selectedScore}`;
    if (labelEl)   labelEl.textContent   = `CC ${selectedScore} · ${data.name}`;

    // Resaltar tarjeta BCS activa
    document.querySelectorAll('.bcs-card').forEach(card => {
      card.classList.remove('active');
      if (parseInt(card.dataset.score) === selectedScore) {
        card.classList.add('active');
      }
    });
  }

  function bindEvents() {
    document.querySelectorAll('.bcs-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedScore = parseInt(card.dataset.score);
        updateUI();
        window.dispatchEvent(new CustomEvent('bcsUpdated', {
          detail: { hennekeScore: selectedScore }
        }));
      });
    });

    const rangeFat = document.getElementById('rangeFatCm');
    const inputFat = document.getElementById('inputFatCm');
    const selectType = document.getElementById('selectEquineType');

    if (rangeFat && inputFat) {
      rangeFat.addEventListener('input', (e) => {
        fatCm = parseFloat(e.target.value) || 0;
        inputFat.value = fatCm;
        updateUI();
      });
      inputFat.addEventListener('input', (e) => {
        const raw = parseFloat(e.target.value);
        const min = parseFloat(e.target.min);
        const max = parseFloat(e.target.max);
        if (!Number.isFinite(raw) || raw < min || raw > max) {
          e.target.setAttribute('aria-invalid', 'true');
          return;
        }
        e.target.removeAttribute('aria-invalid');
        fatCm = raw;
        rangeFat.value = fatCm;
        updateUI();
      });
      inputFat.addEventListener('change', (e) => {
        const min = parseFloat(e.target.min);
        const max = parseFloat(e.target.max);
        const raw = parseFloat(e.target.value);
        fatCm = Math.min(max, Math.max(min, Number.isFinite(raw) ? raw : min));
        e.target.value = fatCm;
        e.target.removeAttribute('aria-invalid');
        rangeFat.value = fatCm;
        updateUI();
      });
    }

    if (selectType) {
      selectType.addEventListener('change', (e) => {
        equineType = e.target.value;
        updateUI();
      });
    }
  }

  function init() {
    bindEvents();
    updateUI();
  }

  return {
    init,
    getScore: () => selectedScore
  };
})();
