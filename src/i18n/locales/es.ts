// Textos de la interfaz en español. Mantener las claves sincronizadas con
// en.ts (el fallback es el inglés).
export default {
  app: {
    title: 'Simulador de Trimado',
    subtitle: 'Mayor + inventario de velas de proa · Todos los rumbos · Herramienta educativa',
    footer:
      'Objetivos de polar de certificados ORC (data.orc.org); la respuesta al trimado y las velocidades estimadas son ilustraciones cualitativas.',
    closePanel: 'Cerrar panel',
    languageAria: 'Idioma',
    tabs: {
      boat: 'Barco',
      trim: 'Viento',
      data: 'Datos',
    },
    panels: {
      boat: 'Modelo de barco',
      trim: 'Condiciones',
      data: 'Rendimiento',
    },
  },

  boat: {
    heading: 'Modelo de barco',
    presets: 'Presets ORC',
    yourFiles: 'Tus archivos',
    headsailHeading: 'Vela de proa',
    bestNow: '★ mejor ahora',
    bestNowTitle: 'La mejor vela para el viento y rumbo actuales',
    lpMeta: 'LP {pct}% de J',
    areaMeta: '{area} m²',
    wardrobeHint: 'Inventario derivado de la vela de proa del certificado (Area_Jib)',
    sailNoPlaceholder: 'Nº de vela, p. ej. ESP-7352',
    sailNoAria: 'Número de vela',
    loadFromOrc: 'Cargar de ORC',
    loading: 'Cargando…',
    orcHint: 'Descarga el certificado activo de data.orc.org',
    loadPolar: 'Cargar tu propia polar…',
    fileHint: 'Certificado ORC en JSON (data.orc.org) o tabla polar (.pol / .csv)',
    orcError: 'No se pudo cargar el barco desde ORC',
    fileError: 'No se pudo leer el archivo',
  },

  headsail: {
    kind: {
      genoa: 'Génova',
      jib: 'Foque',
      heavyJib: 'Foque de capa',
    },
    desc: {
      ratedGenoa: 'Vela del certificado — corte profundo, máxima potencia, viento flojo-medio',
      ratedJib: 'Vela del certificado — foque sin solape, corte plano',
      workingJib: 'Foque de trabajo — corte más plano, caza más adentro, para brisa en aumento',
      heavyJib: 'Foque de tiempo duro — pequeño, plano, puño de escota alto',
    },
  },

  trim: {
    heading: 'Controles de trimado',
    conditionsHeading: 'Condiciones',
    anchorHow: 'arrastra ↕ · rueda para ajuste fino',
    trueWindSpeed: 'Viento real (TWS)',
    kts: 'nudos',
    course: 'Rumbo (TWA)',
    awa: 'AWA ≈ {deg}°',
    pointOfSail: {
      closeHauled: 'ceñida',
      closeReach: 'ceñida abierta',
      beamReach: 'través',
      broadReach: 'largo',
      run: 'popa',
    },
    showOptimal: 'Mostrar trimado óptimo',
    ofOptimum: '{pct}% del óptimo',
    proximityTitle: 'Lo cerca que está el trimado actual del óptimo',
    mainsail: 'Mayor',
    traveler: {
      windward: '+{v} ▲ barlovento',
      leeward: '{v} ▼ sotavento',
      centered: '{v} centrado',
    },
    sliders: {
      mainsheet: {
        label: 'Escota de mayor',
        hint: 'Controla el twist (principal) y la tensión de baluma',
      },
      traveler: {
        label: 'Carro de mayor',
        hint: 'Controla el ángulo de ataque sin cambiar la tensión de baluma',
      },
      outhaul: {
        label: 'Pajarín',
        hint: 'Tensión del pujamen: aplana el tercio bajo de la vela',
      },
      cunningham: {
        label: 'Cunningham',
        hint: 'Adelanta la bolsa; aplana ligeramente la vela',
      },
      backstay: {
        label: 'Backstay',
        hint: 'Curva el mástil → aplana la vela y abre la baluma alta',
      },
      jibsheet: {
        label: 'Escota',
        hint: 'Control principal del génova: ángulo de ataque y twist de baluma',
      },
      car: {
        label: 'Carro de escota',
        hint: 'Adelante = baluma cerrada, pujamen lleno; atrás = baluma abierta, pujamen plano',
      },
      halyard: {
        label: 'Driza',
        hint: 'Tensión del gratil: adelanta la bolsa del génova',
      },
    },
  },

  perf: {
    heading: 'Datos de rendimiento',
    disclaimer: 'La velocidad estimada es cualitativa — los objetivos salen de la polar ORC del barco.',
    badge: {
      underpowered: '⬇ Falto de potencia',
      optimal: '✓ Óptimo',
      overpowered: '⬆ Sobrepotenciado',
    },
    sailNote: '⚑ {sail} da el {pct}% de la potencia de la mejor vela — mira la ★ en Modelo de barco',
    estSpeed: 'Vel. estimada',
    target: 'Objetivo',
    beatVmg: 'VMG en ceñida',
    beatAngle: 'Ángulo de ceñida',
    kn: 'kn',
    clLift: 'Cl (sustentación)',
    cdDrag: 'Cd (resistencia)',
    efficiency: 'Cl/Cd (eficiencia)',
    relativeVmg: 'VMG relativa',
    relativeHeel: 'Escora relativa',
    mainsail: 'Mayor',
    aoa: 'Áng. ataque',
    twist: 'Twist',
    camber: 'Profundidad',
    draftPos: 'Pos. bolsa',
  },

  viz: {
    heading: 'Forma de la vela — Vista 3D',
    hint: 'Arrastra para rotar · Rueda para zoom',
    main: 'Mayor',
    luffing: 'FLAMEANDO',
    twist: 'Twist',
    aoa: 'AA',
    camber: 'Prof.',
    draft: 'Bolsa',
    legend: {
      windward: 'cataviento de barlovento',
      leeward: 'cataviento de sotavento',
      leech: 'cataviento de baluma',
      twa: 'viento real (TWA)',
      awa: 'viento aparente (AWA)',
    },
  },
}
