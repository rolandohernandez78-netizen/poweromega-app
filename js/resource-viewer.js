document.addEventListener('DOMContentLoaded', () => {
  const resources = Object.freeze({
    'water-guide': {
      title: 'Guía técnica: consumo de agua en equinos',
      source: 'output/pdf/guia_consumo_agua_equinos.pdf',
      type: 'pdf'
    },
    'bcs-chart': {
      title: 'Tabla BCS 1-9 - Kentucky Equine Research',
      source: 'assets/bcs_slide11_c.jpeg',
      type: 'image',
      alt: 'Tabla de condición corporal BCS 1 al 9 de Kentucky Equine Research'
    },
    'nrc-fat': {
      title: 'NRC 2007: grasas y metabolismo lipídico en caballos',
      source: 'docs/NRC_2007_fat_in_horses_pp61-70.pdf',
      type: 'pdf'
    },
    'warren-fat': {
      title: 'Feeding Fat to Horses',
      source: 'docs/Warren_Feeding_Fat_to_Horses.pdf',
      type: 'pdf'
    },
    'dietary-lipids': {
      title: 'Dietary Fats & Lipid Metabolism in the Horse',
      source: 'docs/Dietary_Fats_Lipid_Metabolism_Horses.pdf',
      type: 'pdf'
    },
    'diet-exercise': {
      title: 'Diet and Exercise Performance in the Horse',
      source: 'docs/Diet_Exercise_Performance_Horse.pdf',
      type: 'pdf'
    },
    'omega3-performance': {
      title: 'Omega-3 Fatty Acids & Sports/Athletic Performance',
      source: 'docs/Omega3_Sports_Athletic_Performance.pdf',
      type: 'pdf'
    },
    'equigras-supplementation': {
      title: 'Suplementación con grasa en caballos - EQUIGRAS®',
      source: 'docs/EQ_Suplementacion_grasa_equinos.pdf',
      type: 'pdf'
    },
    'lorry-warren': {
      title: 'Capítulo: grasas en equinos',
      source: 'docs/Capitulo_Grasas_Equinos_LorryWarren_2013.pdf',
      type: 'pdf'
    },
    'stallion-nutraceuticals': {
      title: 'Use of Nutraceuticals in the Stallion',
      source: 'docs/Use_of_nutraceuticals_stallion.pdf',
      type: 'pdf'
    }
  });

  const title = document.getElementById('viewerTitle');
  const frame = document.getElementById('viewerFrame');
  const image = document.getElementById('viewerImage');
  const error = document.getElementById('viewerError');
  const backButton = document.getElementById('viewerBackButton');
  const resourceKey = new URLSearchParams(window.location.search).get('resource');
  const resource = resources[resourceKey];

  document.querySelectorAll('img[data-fallback-src]').forEach(logo => {
    logo.addEventListener('error', () => {
      const fallback = logo.dataset.fallbackSrc;
      if (fallback && logo.getAttribute('src') !== fallback) logo.setAttribute('src', fallback);
    }, { once: true });
  });

  const returnToApp = () => {
    let sameOriginReferrer = false;
    try {
      sameOriginReferrer = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
    } catch (_error) {
      sameOriginReferrer = false;
    }

    if (sameOriginReferrer && window.history.length > 1) {
      window.history.back();
      window.setTimeout(() => window.location.replace('index.html'), 450);
      return;
    }
    window.location.replace('index.html');
  };

  backButton.addEventListener('click', returnToApp);

  if (!resource) {
    title.textContent = 'Recurso no disponible';
    error.hidden = false;
    return;
  }

  document.title = `${resource.title} | PowerOmega APP`;
  title.textContent = resource.title;

  if (resource.type === 'image') {
    image.src = resource.source;
    image.alt = resource.alt || resource.title;
    image.hidden = false;
    image.addEventListener('error', () => {
      image.hidden = true;
      error.hidden = false;
    }, { once: true });
    return;
  }

  frame.src = resource.source;
  frame.title = resource.title;
  frame.hidden = false;
});
