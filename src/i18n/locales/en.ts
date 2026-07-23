// English UI strings. Keep keys in sync with es.ts — vue-i18n falls back to
// this file, so a key missing HERE renders as the raw key path.
export default {
  app: {
    title: 'Sail Trim Simulator',
    subtitle: 'Mainsail + headsail wardrobe · All points of sail · Educational tool',
    footer:
      "Polar targets from ORC certificates (data.orc.org); trim response and speed estimates are qualitative illustrations.",
    closePanel: 'Close panel',
    languageAria: 'Language',
    tabs: {
      boat: 'Boat',
      trim: 'Wind',
      data: 'Data',
    },
    panels: {
      boat: 'Boat Model',
      trim: 'Conditions',
      data: 'Performance',
    },
  },

  boat: {
    heading: 'Boat Model',
    presets: 'ORC presets',
    yourFiles: 'Your files',
    headsailHeading: 'Headsail',
    bestNow: '★ best now',
    bestNowTitle: 'Best sail for the current wind and course',
    lpMeta: 'LP {pct}% of J',
    areaMeta: '{area} m²',
    wardrobeHint: "Wardrobe derived from the certificate's rated headsail (Area_Jib)",
    sailNoPlaceholder: 'Sail number, e.g. ESP-7352',
    sailNoAria: 'Sail number',
    loadFromOrc: 'Load from ORC',
    loading: 'Loading…',
    orcHint: 'Fetches the active certificate from data.orc.org',
    loadPolar: 'Load your own polar…',
    fileHint: 'ORC certificate JSON (data.orc.org) or polar grid (.pol / .csv)',
    orcError: 'Could not load boat from ORC',
    fileError: 'Could not read file',
  },

  headsail: {
    kind: {
      genoa: 'Genoa',
      jib: 'Jib',
      heavyJib: 'Heavy jib',
    },
    desc: {
      ratedGenoa: 'Rated headsail — full cut, maximum power, light-medium air',
      ratedJib: 'Rated headsail — non-overlapping blade, flat cut',
      workingJib: 'Working jib — flatter cut, sheets inboard, for a building breeze',
      heavyJib: 'Heavy-weather jib — small, flat, high-clewed',
    },
  },

  trim: {
    heading: 'Trim Controls',
    conditionsHeading: 'Conditions',
    anchorHow: 'drag ↕ · wheel to fine-tune',
    trueWindSpeed: 'True Wind Speed',
    kts: 'kts',
    course: 'Course (TWA)',
    awa: 'AWA ≈ {deg}°',
    pointOfSail: {
      closeHauled: 'close-hauled',
      closeReach: 'close reach',
      beamReach: 'beam reach',
      broadReach: 'broad reach',
      run: 'run',
    },
    showOptimal: 'Show Optimal Trim',
    ofOptimum: '{pct}% of optimum',
    proximityTitle: 'How close current trim is to the optimum',
    mainsail: 'Mainsail',
    traveler: {
      windward: '+{v} ▲ windward',
      leeward: '{v} ▼ leeward',
      centered: '{v} centered',
    },
    sliders: {
      mainsheet: {
        label: 'Mainsheet',
        hint: 'Controls twist (primary) and leech tension',
      },
      traveler: {
        label: 'Traveler',
        hint: 'Controls angle of attack without changing leech tension',
      },
      outhaul: {
        label: 'Outhaul',
        hint: 'Foot tension: flattens the lower third of the sail',
      },
      cunningham: {
        label: 'Cunningham',
        hint: 'Moves draft forward; slightly flattens the sail',
      },
      backstay: {
        label: 'Backstay',
        hint: 'Bends mast → flattens sail and opens upper leech',
      },
      jibsheet: {
        label: 'Jib sheet',
        hint: 'Primary genoa control: angle of attack and leech twist',
      },
      car: {
        label: 'Lead car',
        hint: 'Forward = closed leech, full foot; aft = open leech, flat foot',
      },
      halyard: {
        label: 'Halyard',
        hint: 'Luff tension: moves the genoa draft forward',
      },
    },
  },

  perf: {
    heading: 'Performance Readout',
    disclaimer: "Speed estimate is qualitative — targets come from the boat's ORC polar.",
    badge: {
      underpowered: '⬇ Underpowered',
      optimal: '✓ Optimal',
      overpowered: '⬆ Overpowered',
    },
    sailNote: "⚑ {sail} gives {pct}% of the best sail's power — see ★ in Boat Model",
    estSpeed: 'Est. speed',
    target: 'Target',
    beatVmg: 'Beat VMG',
    beatAngle: 'Beat angle',
    kn: 'kn',
    clLift: 'Cl (Rig lift)',
    cdDrag: 'Cd (Rig drag)',
    efficiency: 'Cl/Cd (Efficiency)',
    relativeVmg: 'Relative VMG',
    relativeHeel: 'Relative Heel',
    mainsail: 'Mainsail',
    aoa: 'AoA',
    twist: 'Twist',
    camber: 'Camber',
    draftPos: 'Draft pos.',
  },

  viz: {
    heading: 'Sail Shape — 3D View',
    hint: 'Drag to rotate · Scroll to zoom',
    main: 'Main',
    luffing: 'LUFFING',
    twist: 'Twist',
    aoa: 'AoA',
    camber: 'Camber',
    draft: 'Draft',
    legend: {
      windward: 'windward telltale',
      leeward: 'leeward telltale',
      leech: 'leech ribbon',
      twa: 'true wind (TWA)',
      awa: 'apparent wind (AWA)',
    },
  },
}
