/* ==========================================================================
   PowerOmega APP - Controlador Principal y Navegación Modular
   Desarrollado por Rolando Hernández Mora (RRHM)
   Soportado por Tecnigrasas Suplementos y Nutrientes S.A.S.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  console.log("Inicializando PowerOmega APP - Tecnigrasas S.A.S. (RRHM, 2026)");

  // Sustitución accesible de logotipos cuando el recurso principal no carga.
  document.querySelectorAll('img[data-fallback-src]').forEach(image => {
    const applyFallback = () => {
      const fallbackSrc = image.dataset.fallbackSrc;
      if (fallbackSrc && image.getAttribute('src') !== fallbackSrc) {
        image.setAttribute('src', fallbackSrc);
      }
    };
    image.addEventListener('error', applyFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) applyFallback();
  });

  // Inicializar Módulos JS
  // ⚠️ Morphometrics debe iniciar primero: calcula el peso base que usan los demás módulos
  if (typeof Morphometrics !== 'undefined') Morphometrics.init();

  // Pasar el peso calculado por Morphometrics a Nutrition antes de que inicialice su UI
  if (typeof Nutrition !== 'undefined') {
    const initialWeightKg = (typeof Morphometrics !== 'undefined')
      ? Morphometrics.getCalculatedWeightKg()
      : 500;
    Nutrition.updateState({ weightKg: initialWeightKg });
    Nutrition.init();
  }

  if (typeof BCS !== 'undefined') BCS.init();
  if (typeof ProductModule !== 'undefined') ProductModule.init();

  // Control de Tabs / Módulos
  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  const moduleSections = document.querySelectorAll('.module-section');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetModuleId = btn.dataset.module;

      // Remover activo de botones
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
        b.setAttribute('tabindex', '-1');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      btn.setAttribute('tabindex', '0');

      // Mostrar sección correspondiente
      moduleSections.forEach(section => {
        section.classList.remove('active');
        section.hidden = true;
        if (section.id === targetModuleId) {
          section.classList.add('active');
          section.hidden = false;
        }
      });
    });

    btn.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(tabButtons);
      const current = buttons.indexOf(btn);
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      buttons[next].click();
    });
  });

  moduleSections.forEach(section => {
    section.hidden = !section.classList.contains('active');
  });

  const initialWaterWeight = document.getElementById('simBodyWeight');
  if (initialWaterWeight && typeof Morphometrics !== 'undefined') {
    initialWaterWeight.value = Math.round(Morphometrics.getCalculatedWeightKg());
  }

  // Resaltar líneas del SVG al pasar sobre inputs
  ['NC', 'H', 'G', 'L'].forEach(key => {
    const inputGroup = document.getElementById(`input${key}`);
    const svgLine = document.getElementById(`svgLine${key}`);
    if (inputGroup && svgLine) {
      inputGroup.addEventListener('focus', () => {
        svgLine.setAttribute('stroke-width', '5');
        svgLine.setAttribute('stroke', '#38bdf8');
      });
      inputGroup.addEventListener('blur', () => {
        svgLine.setAttribute('stroke-width', '3');
        svgLine.setAttribute('stroke', key === 'NC' ? '#e11d48' : key === 'H' ? '#16a34a' : key === 'G' ? '#d97706' : '#0284c7');
      });
    }
  });
});
