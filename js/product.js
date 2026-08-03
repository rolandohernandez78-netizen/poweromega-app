/* ==========================================================================
   PowerOmega APP - Módulo de Producto EQUIGRAS® & 9 Razones de Nutrición Lipídica
   Desarrollado por Rolando Hernández Mora (Médico Veterinario, Master en Nutrición Animal)
   Soportado por Tecnigrasas Suplementos y Nutrientes S.A.S.
   ========================================================================== */

const ProductModule = (function() {
  const REASONS = [
    {
      num: 1,
      title: "Máxima Densidad Energética",
      desc: "Suministra 2.25 veces más energía que los cereales tradicionales sin saturar el tracto digestivo del equino."
    },
    {
      num: 2,
      title: "Apoyo a la Salud Digestiva",
      desc: "Puede ayudar a reducir la dependencia de dietas muy altas en almidón cuando se integra correctamente en una ración balanceada."
    },
    {
      num: 3,
      title: "Reducción del Incremento Calórico",
      desc: "La grasa produce menos incremento calórico que algunos alimentos tradicionales y puede apoyar el manejo nutricional en ambientes cálidos."
    },
    {
      num: 4,
      title: "Ahorro de Glucógeno Muscular",
      desc: "Aumenta la glucosa plasmática y glucógeno en 15.8%, mejorando tiempos de carrera (Harking et al. 1992)."
    },
    {
      num: 5,
      title: "Modulación Inmunológica & Antiinflamatoria",
      desc: "Los ácidos grasos Omega 3 (EPA y DHA) reducen mediadores proinflamatorios y fortalecen la respuesta inmune."
    },
    {
      num: 6,
      title: "Salud del Pelaje y Cascos",
      desc: "Los ácidos grasos esenciales contribuyen al mantenimiento normal de la piel, el pelaje y los cascos."
    },
    {
      num: 7,
      title: "Eficiencia Reproductiva en Yeguas",
      desc: "Mejora el desarrollo folicular, calidad del embrión y modula el ambiente uterino post-parto."
    },
    {
      num: 8,
      title: "Calidad Espermática en Sementales",
      desc: "Mejora la motilidad y resistencia de los espermatozoides en semen fresco, refrigerado y congelado."
    },
    {
      num: 9,
      title: "Energía 'Fría' sin Excitabilidad",
      desc: "Proporciona energía de liberación sostenida sin alterar el temperamento ni provocar nerviosismo en el animal."
    }
  ];

  function renderReasons() {
    const listElem = document.getElementById('reasonsListContainer');
    if (!listElem) return;

    listElem.innerHTML = REASONS.map(r => `
      <li class="reason-item">
        <div class="reason-num">${r.num}</div>
        <div class="reason-text">
          <h4>${r.title}</h4>
          <p>${r.desc}</p>
        </div>
      </li>
    `).join('');
  }

  function toggleExpertsPanel() {
    const panel = document.getElementById('expertsPanel');
    const button = document.getElementById('btnExpertsToggle');
    if (!panel || !button) return;

    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
  }

  function bindEvents() {
    const expertsToggle = document.getElementById('btnExpertsToggle');
    if (expertsToggle) {
      expertsToggle.addEventListener('click', toggleExpertsPanel);
    }
  }

  function init() {
    renderReasons();
    bindEvents();
  }

  return {
    init
  };
})();
