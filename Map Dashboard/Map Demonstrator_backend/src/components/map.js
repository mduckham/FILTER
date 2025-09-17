import React, { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// (Legend and AI description components removed per requirements)


// --- START: MAP COMPONENT ---
export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const hoverStateBySource = useRef({}); // track hovered feature ids per source for outlines

  // Definitions for interactive text highlighting
  const PRECINCT_NAMES = ['Montague', 'Sandridge', 'Lorimer', 'Wirraway', 'Employment Precinct'];
  const PRECINCT_COLORS = {
    'Montague': '#3498db',
    'Sandridge': '#e74c3c',
    'Lorimer': '#2ecc71',
    'Wirraway': '#f39c12',
    'Employment Precinct': '#9b59b6'
  };

  // --- STATE MANAGEMENT ---
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const [selectedScale, setSelectedScale] = useState(null); // 'sa1' | 'mb' | 'dzn'
  const [uploading, setUploading] = useState(false);
  const [uploadedGeojson, setUploadedGeojson] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [propertyOptions, setPropertyOptions] = useState([]);
  const lastCsvFileRef = useRef(null); // store last uploaded CSV File object
  const popupPropRef = useRef(null);
  const [legendInfo, setLegendInfo] = useState(null);

  // Panel widths for map padding
  const leftPanelWidth = 200;
  const rightPanelWidth = 0;

  // --- DATA DEFINITIONS ---
  const legendData = {
    'Education': {
      title: 'Education (Total)',
      items: [ { color: '#fee5d9', label: 'low' }, { color: '#fcbba1', label: '' }, { color: '#fc9272', label: '' }, { color: '#fb6a4a', label: '' }, { color: '#ef3b2c', label: '' }, { color: '#cb181d', label: 'high' } ]
    },
    'Income': {
      title: 'Income (Total)',
      items: [ { color: '#fcfbfd', label: 'low' }, { color: '#efedf5', label: '' }, { color: '#dadaeb', label: '' }, { color: '#bcbddc', label: '' }, { color: '#9e9ac8', label: '' }, { color: '#807dba', label: '' }, { color: '#6a51a3', label: '' }, { color: '#54278f', label: '' }, { color: '#3f007d', label: 'high' } ]
    },
    'Occupation': {
      title: 'Occupation (Total)',
      items: [ { color: '#f7fbff', label: 'low' }, { color: '#deebf7', label: '' }, { color: '#c6dbef', label: '' }, { color: '#9ecae1', label: '' }, { color: '#6baed6', label: '' }, { color: '#4292c6', label: '' }, { color: '#2171b5', label: '' }, { color: '#08519c', label: '' }, { color: '#08306b', label: 'high' } ]
    },
    'Employment': {
      title: 'Employment (Total)',
      items: [ { color: '#f1eef6', label: 'low' }, { color: '#d7b5d8', label: '' }, { color: '#c994c7', label: '' }, { color: '#df65b0', label: '' }, { color: '#dd1c77', label: 'high' } ]
    },
    'POB': {
      title: 'Place of Birth (Total)',
      items: [ { color: '#edf8e9', label: 'low' }, { color: '#bae4b3', label: '' }, { color: '#74c476', label: '' }, { color: '#31a354', label: '' }, { color: '#006d2c', label: 'high' } ]
    }
  };

  // DZN filter list requested
  const DZN_FILTER_SET = new Set([
    215110001, 215110002, 215110003, 215110004, 215110005, 215110006,
    215110007, 215110008, 215110009, 215110010, 215110011, 215110012
  ].map(String));

  const SA1_FILTER_SET = new Set([
    '20605151101','20605151102','20605151103','20605151104','20605151105'
  ]);

  const MB_FILTER_SET = new Set([
    '20395192000','20397951000','20397952000','20398940000','20398951000','20398952000','20398953000','20398954000','20399560000','20400531000','20400550000','20400560000','20400574000','20400582000','20528882000','20529430000','20529440000','20529901000','20529902000','20529903000','20530481000','20530482000','20530491000','20531030000','20531040000','20531261000','20531263000','20531265000','20531951000','20531952000','20531953000','20531955000','20533071000','20533160000','20533171000','20533172000','20533173000','20533174000','20533175000','20533212000','20533213000','20533214000','20533215000','20533221000','20533222000','20533224000','20533225000','20533241000','20533242000','20533244000','20533246000','20631905370','20631923570','20631925300','20631932830','20631944740','20631945490','20631977930','20631977940','20668280000','20668300000','20668330000','20675200000','20689950000','21345020000','21345080000','21345090000','21345100000','21345110000','21345240000','21345250000','21345290000','21345300000','21345400000','21345410000','21345590000','21345600000','21345610000'
  ]);

  const indicatorConfig = {
    'Education': { path: '/data/education-fb-sa1.geojson', property: 'Education-VIC_Total', source: 'education-data-source' },
    'Employment': { path: '/data/employment-fb-sa1.geojson', property: 'employment-VIC_Total', source: 'employment-data-source' },
    'Income': { path: '/data/income-fb-sa1.geojson', property: 'Income-VIC1_Total', source: 'income-data-source' },
    'POB': { path: '/data/POB-fb-sa1.geojson', property: 'POB-VIC1_Total', source: 'pob-data-source' },
    'Occupation': { path: '/data/occupation-fb-sa1.geojson', property: 'Occupation-VIC_Total', source: 'occupation-data-source' }
  };

  // --- HOOKS for Map Lifecycle & Effects ---

  // Main Map Initialization
  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      scrollZoom: false, boxZoom: false, dragRotate: false, dragPan: false,
      keyboard: false, doubleClickZoom: false, touchZoomRotate: false,
      preserveDrawingBuffer: true // Required for exporting map canvas
    });

    map.current.on('error', (e) => console.error('A map error occurred:', e.error ? e.error.message : 'Unknown error'));

    map.current.on('load', () => {
      adjustMapBounds();
      // Add sources
      const sources = [
        { name: 'base-outline', path: '/data/fb-sa1-2021-WGS84-boundary.geojson' },
        { name: 'employment', path: '/data/employment-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'education', path: '/data/education-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'pob', path: '/data/POB-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'income', path: '/data/income-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'occupation', path: '/data/occupation-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'precincts', path: '/data/fb-precincts-official-boundary.geojson' },
        // jobs layers removed per requirements
      ];
      sources.forEach(s => {
        const spec = { type: 'geojson', data: s.path };
        if (s.promoteId) spec.promoteId = s.promoteId;
        map.current.addSource(`${s.name}-data-source`, spec);
      });

      // Define layers for indicators
      const layers = [
        { id: 'education-layer', indicatorName: 'Education', source: 'education-data-source', property: indicatorConfig['Education'].property, colors: legendData['Education'].items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500] },
        { id: 'employment-layer', indicatorName: 'Employment', source: 'employment-data-source', property: indicatorConfig['Employment'].property, colors: legendData['Employment'].items.map(i => i.color), stops: [0, 100, 200, 300, 400] },
        { id: 'income-layer', indicatorName: 'Income', source: 'income-data-source', property: indicatorConfig['Income'].property, colors: legendData['Income'].items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500, 600, 700, 800] },
        { id: 'pob-layer', indicatorName: 'POB', source: 'pob-data-source', property: indicatorConfig['POB'].property, colors: legendData['POB'].items.map(i => i.color), stops: [0, 100, 200, 300, 400] },
        { id: 'occupation-layer', indicatorName: 'Occupation', source: 'occupation-data-source', property: indicatorConfig['Occupation'].property, colors: legendData['Occupation'].items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500, 600, 700, 800] }
      ];

      layers.forEach(layer => {
        // Fill paint
        let paint;
        if (layer.type === 'step') {
          const base = '#ffffff';
          const stepExpr = ['step', ['to-number', ['get', layer.property]], base];
          layer.breaks.forEach((b, i) => { stepExpr.push(b, layer.colors[i] || layer.colors[layer.colors.length - 1]); });
          paint = { 'fill-color': stepExpr, 'fill-opacity': 0.6 };
        } else {
          const colorStops = layer.stops.flatMap((stop, i) => [stop, layer.colors[i] || layer.colors[layer.colors.length - 1]]);
          paint = { 'fill-color': ['interpolate', ['linear'], ['to-number', ['get', layer.property]], ...colorStops], 'fill-opacity': 0.6 };
        }
        map.current.addLayer({ id: layer.id, type: 'fill', source: layer.source, layout: { visibility: 'none' }, paint });

        // Base thin boundary for clear geometry edges (always visible with layer)
        const baseOutlineId = `${layer.id}-base-outline`;
        map.current.addLayer({
          id: baseOutlineId,
          type: 'line',
          source: layer.source,
          layout: { visibility: 'none' },
          paint: { 'line-color': '#666', 'line-width': 0.4, 'line-opacity': 0.7 }
        });

  // Outline layer that lights up on hover
  const outlineId = `${layer.id}-hover-outline`;
        map.current.addLayer({
          id: outlineId,
          type: 'line',
          source: layer.source,
          layout: { visibility: 'none' },
          paint: {
            'line-color': '#111',
            'line-width': 2.5,
            'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0]
          }
        });

        // Hover feature-state handlers
        map.current.on('mousemove', layer.id, (e) => {
          if (!e.features || !e.features.length) return;
          const f = e.features[0];
          const sourceId = layer.source;
          const prev = hoverStateBySource.current[sourceId];
          if (prev !== undefined) {
            try { map.current.setFeatureState({ source: sourceId, id: prev }, { hover: false }); } catch (_) {}
          }
          hoverStateBySource.current[sourceId] = f.id;
          try { map.current.setFeatureState({ source: sourceId, id: f.id }, { hover: true }); } catch (_) {}
        });
        map.current.on('mouseleave', layer.id, () => {
          const sourceId = layer.source;
          const prev = hoverStateBySource.current[sourceId];
          if (prev !== undefined) {
            try { map.current.setFeatureState({ source: sourceId, id: prev }, { hover: false }); } catch (_) {}
            hoverStateBySource.current[sourceId] = undefined;
          }
        });
      });

      map.current.addLayer({
        id: 'base-outline-layer', type: 'line', source: 'base-outline-data-source',
        paint: { 'line-color': '#444', 'line-width': 0.2 }
      });
      
      const precinctColorExpression = ['case'];
      PRECINCT_NAMES.forEach(name => {
          precinctColorExpression.push(['==', ['get', 'name'], name], PRECINCT_COLORS[name]);
      });
      precinctColorExpression.push('#CCC'); 

     map.current.addLayer({
        id: 'precincts-fill-layer', type: 'fill', source: 'precincts-data-source',
        paint: { 'fill-color': '#ffffffff', 'fill-opacity': 0.15 }
      });
      map.current.addLayer({
        id: 'precincts-shadow-layer', type: 'line', source: 'precincts-data-source',
        paint: { 'line-color': 'rgba(0, 0, 0, 0.4)', 'line-width': 7, 'line-translate': [2, 2], 'line-blur': 4 }
      });
      map.current.addLayer({
          id: 'precincts-outline-layer', type: 'line', source: 'precincts-data-source',
          paint: { 'line-color': '#0868ac', 'line-width': 2.5, 'line-opacity': 0.9 }
      });

  // Precinct click handlers removed (no narrative panel)

      map.current.on('mouseenter', 'precincts-fill-layer', () => { map.current.getCanvas().style.cursor = 'pointer'; });
      map.current.on('mouseleave', 'precincts-fill-layer', () => { map.current.getCanvas().style.cursor = ''; });
    });

    return () => { if (map.current) { map.current.remove(); map.current = null; } };
  }, []);

  // Adjust map bounds on load
  const adjustMapBounds = () => {
    if (!map.current) return;
    const bounds = [ [144.890, -37.850], [144.948, -37.816] ];
    map.current.fitBounds(bounds, {
      padding: { top: 20, bottom: 20, left: leftPanelWidth, right: rightPanelWidth },
      duration: 2000, essential: true
    });
  };

  // Adjust map bounds on window resize
  useEffect(() => {
    function debounce(fn, ms) {
      let timer;
      return function(...args) { clearTimeout(timer); timer = setTimeout(() => { fn.apply(this, args); }, ms); };
    }
    const debouncedAdjustBounds = () => {
      if (!map.current) return;
      const bounds = [ [144.890, -37.850], [144.948, -37.816] ];
      map.current.fitBounds(bounds, { padding: { top: 20, bottom: 20, left: leftPanelWidth, right: rightPanelWidth }, duration: 0 });
    };
    const debouncedResizeListener = debounce(debouncedAdjustBounds, 150);
    window.addEventListener('resize', debouncedResizeListener);
    return () => window.removeEventListener('resize', debouncedResizeListener);
  }, []);

  // Toggle visibility of indicator layers
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const allLayerIds = [
      'education-layer',
      'employment-layer',
      'income-layer',
      'pob-layer',
      'occupation-layer'
    ];
  // Do NOT show preloaded indicator layers when selecting an indicator; we only visualize uploaded CSV output
  const selectedLayerId = null;

    if (map.current.getLayer('base-outline-layer')) {
        map.current.setLayoutProperty('base-outline-layer', 'visibility', selectedIndicator ? 'visible' : 'none');
    }

    allLayerIds.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        const vis = layerId === selectedLayerId ? 'visible' : 'none';
        map.current.setLayoutProperty(layerId, 'visibility', vis);
  const outlineId = `${layerId}-hover-outline`;
  const baseOutlineId = `${layerId}-base-outline`;
  if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
  if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
      }
    });
  }, [selectedIndicator]);

  // Handle uploaded GeoJSON rendering
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
  const sourceId = 'uploaded-geojson-source';
  const fillId = 'uploaded-geojson-fill';
  const outlineId = 'uploaded-geojson-outline';
  const hoverOutlineId = 'uploaded-geojson-hover-outline';

    if (!uploadedGeojson) {
      if (map.current.getLayer(fillId)) map.current.setLayoutProperty(fillId, 'visibility', 'none');
      if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'none');
      return;
    }

    // Determine the property to visualize
    const detectTotalKey = (fc, indicator) => {
      if (!fc || !fc.features || !fc.features.length) return null;
      const props = fc.features[0].properties || {};
      const keys = Object.keys(props);
      const indicatorKey = (indicator || '').toLowerCase();

      // Explicit cases for special indicators produced by backend
      if (indicatorKey.includes('industry')) {
        const exact = keys.find(k => k.toLowerCase() === 'industry specialisation_21');
        if (exact) return exact;
        const fuzzy = keys.find(k => k.toLowerCase().includes('industry') && k.toLowerCase().includes('special'));
        if (fuzzy) return fuzzy;
      }

      // Prefer job-related totals for Total number of jobs
      if (indicatorKey.includes('job')) {
        const candidatesJobs = [
          'TotJob_21', 'TotalJobs', 'Total_Jobs', 'Jobs_Total', 'Total number of jobs', 'Jobs', 'Job_Total'
        ].map(s => s.toLowerCase());
        const byExact = keys.find(k => candidatesJobs.includes(k.toLowerCase()));
        if (byExact) return byExact;
        const byFuzzy = keys.find(k => k.toLowerCase().includes('job'));
        if (byFuzzy) return byFuzzy;
      }

      // Prefer keys containing both indicator name and 'total'
      let match = keys.find(k => k.toLowerCase().includes('total') && k.toLowerCase().includes(indicatorKey));
      if (!match) match = keys.find(k => k.toLowerCase().includes('total')) || null;

      if (match) return match;

      // Fallback: first numeric field that is not an ID
      const idLike = new Set(['sa1_code', 'sa1_code21', 'dzn_21', 'dzn_code21']);
      for (const k of keys) {
        if (idLike.has(k.toLowerCase())) continue;
        const v = Number(props[k]);
        if (Number.isFinite(v)) return k;
      }
      // Final fallback: first property key
      return keys[0] || null;
    };

    // If indicator is DZN-based, filter features to the required DZN list
  const indLower = (selectedIndicator || '').toLowerCase();
  const isDznBased = selectedScale === 'dzn' || indLower.includes('industry') || (indLower.includes('total') && indLower.includes('jobs'));
    let dataToRender = uploadedGeojson;
    try {
      if (uploadedGeojson?.features?.length) {
        // Determine appropriate idKey by scale and filter sets
        const props = uploadedGeojson.features[0].properties || {};
        let idKey = null;
        if (selectedScale === 'dzn') {
          idKey = Object.keys(props).find(k => k.toLowerCase() === 'dzn_21' || k.toLowerCase() === 'dzn_code21' || k.toLowerCase().includes('dzn')) || 'DZN_21';
        } else if (selectedScale === 'sa1') {
          idKey = Object.keys(props).find(k => ['sa1_code','sa1_code21','sa1_code_2021','sa1 (ur)'].includes(k.toLowerCase())) || 'SA1_CODE';
        } else if (selectedScale === 'mb') {
          idKey = Object.keys(props).find(k => k.toLowerCase()==='mb_code21' || k.toLowerCase()==='mb_code_2021' || k.toLowerCase()==='mb_code' || k.toLowerCase().includes('mb_code')) || 'MB_CODE21';
        }

        const filtered = uploadedGeojson.features.filter(f => {
          const raw = idKey ? (f.properties || {})[idKey] : undefined;
          const idStr = String(raw).replace(/\D/g, '');
          if (selectedScale === 'dzn') return DZN_FILTER_SET.has(idStr);
          if (selectedScale === 'sa1') return SA1_FILTER_SET.has(idStr.padStart(11,'0')) || SA1_FILTER_SET.has(idStr);
          if (selectedScale === 'mb') return MB_FILTER_SET.has(idStr);
          return true;
        });
        dataToRender = { type: 'FeatureCollection', features: filtered };
      }
    } catch (_) {}

    // Build property options (numeric fields) and choose default
    if (dataToRender?.features?.length) {
      const sampleProps = dataToRender.features[0].properties || {};
      const keys = Object.keys(sampleProps).filter(k => {
        const kl = k.toLowerCase();
        if (kl.includes('sa1') || kl.includes('dzn') || kl.includes('id') || kl.includes('code')) return false;
        const v = Number(sampleProps[k]);
        return Number.isFinite(v);
      });
      setPropertyOptions(keys);
      if (!selectedProperty) {
        // Default to TotJob_21 when Total number of jobs indicator is selected
        const lower = (selectedIndicator || '').toLowerCase();
        let auto = detectTotalKey(dataToRender, selectedIndicator);
        if (!auto && lower.includes('job')) {
          auto = keys.find(k => k.toLowerCase() === 'totjob_21') || keys.find(k => k.toLowerCase().includes('job')) || null;
        }
        setSelectedProperty(auto || keys[0] || null);
      }
    }

    const totalKey = selectedProperty || detectTotalKey(dataToRender, selectedIndicator);

    // Keep popup property in sync
    popupPropRef.current = totalKey;

    // Compute min/max for the selected key
    const values = (dataToRender.features || [])
      .map(f => Number((f.properties || {})[totalKey]))
      .filter(v => Number.isFinite(v));
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    // Build equal-interval classes (5 classes)
    // Red sequential palette (light -> dark)
    const palette = [
      '#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#cb181d'
    ];
    while (palette.length < 5) palette.push(palette[palette.length - 1] || '#888');
    const n = 5;
    const width = (max - min) || 1;
    const t1 = min + width * (1 / n);
    const t2 = min + width * (2 / n);
    const t3 = min + width * (3 / n);
    const t4 = min + width * (4 / n);
    const stepExpr = ['step', ['to-number', ['get', totalKey]], palette[0], t1, palette[1], t2, palette[2], t3, palette[3], t4, palette[4]];

    // Prepare legend info ranges
    const ranges = [
      { min, max: t1, color: palette[0] },
      { min: t1, max: t2, color: palette[1] },
      { min: t2, max: t3, color: palette[2] },
      { min: t3, max: t4, color: palette[3] },
      { min: t4, max, color: palette[4] },
    ];
    setLegendInfo({ title: totalKey, ranges });

    if (map.current.getSource(sourceId)) {
      map.current.getSource(sourceId).setData(dataToRender);
    } else {
      map.current.addSource(sourceId, { type: 'geojson', data: dataToRender, generateId: true });
  map.current.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: { 'fill-color': stepExpr, 'fill-opacity': 0.6 } });
      map.current.addLayer({ id: outlineId, type: 'line', source: sourceId, paint: { 'line-color': '#999', 'line-width': 0.8 } });
      // Hover outline layer
      map.current.addLayer({
        id: hoverOutlineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#000',
          'line-width': 3,
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0]
        }
      });

      // Popup on hover/click for uploaded layer
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      const showPopup = (e) => {
        if (!e.features || !e.features.length) return;
        const f = e.features[0];
        const props = f.properties || {};
        const idKey = Object.keys(props).find(k => k.toLowerCase() === 'dzn_21' || k.toLowerCase() === 'dzn_code21' || k.toLowerCase() === 'sa1_code' || k.toLowerCase() === 'sa1_code21');
        const idVal = idKey ? props[idKey] : '';
        const k = popupPropRef.current || '';
        const val = k ? props[k] : '';
        const html = `<div style=\"font-size:12px\"><div><strong>${idKey || ''}</strong>: ${idVal}</div><div><strong>${k}</strong>: ${val}</div></div>`;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map.current);
      };
      map.current.on('mousemove', fillId, showPopup);
      map.current.on('click', fillId, showPopup);
      map.current.on('mouseleave', fillId, () => popup.remove());

      // Hover feature-state handlers for uploaded source
      map.current.on('mousemove', fillId, (e) => {
        if (!e.features || !e.features.length) return;
        const f = e.features[0];
        const prev = hoverStateBySource.current[sourceId];
        if (prev !== undefined) {
          try { map.current.setFeatureState({ source: sourceId, id: prev }, { hover: false }); } catch (_) {}
        }
        hoverStateBySource.current[sourceId] = f.id;
        try { map.current.setFeatureState({ source: sourceId, id: f.id }, { hover: true }); } catch (_) {}
      });
      map.current.on('mouseleave', fillId, () => {
        const prev = hoverStateBySource.current[sourceId];
        if (prev !== undefined) {
          try { map.current.setFeatureState({ source: sourceId, id: prev }, { hover: false }); } catch (_) {}
          hoverStateBySource.current[sourceId] = undefined;
        }
      });
    }
    // Update paint if layer already exists (e.g., new upload with a different key/range)
    if (map.current.getLayer(fillId)) {
      map.current.setPaintProperty(fillId, 'fill-color', stepExpr);
      map.current.setPaintProperty(fillId, 'fill-opacity', 0.6);
    }
  if (map.current.getLayer(fillId)) map.current.setLayoutProperty(fillId, 'visibility', 'visible');
  if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'visible');
  if (map.current.getLayer(hoverOutlineId)) map.current.setLayoutProperty(hoverOutlineId, 'visibility', 'visible');
  }, [uploadedGeojson, selectedIndicator, selectedProperty]);

  const reprocessLastCsv = async (indicator, scale) => {
    const file = lastCsvFileRef.current;
    if (!file || !indicator || !scale) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('indicator', indicator.toLowerCase());
      form.append('scale', scale.toLowerCase());
      form.append('file', file);
      const attempts = [];
      const base = process.env.REACT_APP_API_URL;
      if (base) attempts.push(`${base}/generate`);
      attempts.push('/generate');
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol;
        const host = window.location.hostname;
        attempts.push(`${proto}//${host}:8000/generate`);
      }
      attempts.push('http://localhost:8000/generate');

      let res; let lastErr;
      for (const url of attempts) {
        try {
          res = await fetch(url, { method: 'POST', body: form });
          if (res.ok) break;
          const text = await res.text();
          lastErr = new Error(`HTTP ${res.status} at ${url}: ${text}`);
        } catch (err) { lastErr = err; }
      }
      if (!res || !res.ok) throw lastErr || new Error('Upload failed');
      const geojson = await res.json();
      setUploadedGeojson(geojson);
      setSelectedProperty(null);
    } catch (err) {
      console.error(err);
      const msg = `${err?.message || ''}`;
      // If backend returned a 400 with our scale mismatch message, show a friendlier alert
      if (/scale mismatch|spatial scale/i.test(msg)) {
        alert('The selected Spatial scale does not match the identifiers in your CSV. Please choose the correct Spatial scale and try again.');
      } else {
        alert(`Failed to reprocess with the new Spatial scale. ${msg}`);
      }
    } finally {
      setUploading(false);
    }
  };

  // When spatial scale changes, reprocess the last uploaded CSV (if any)
  useEffect(() => {
    if (lastCsvFileRef.current && selectedIndicator && selectedScale) {
      reprocessLastCsv(selectedIndicator, selectedScale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScale]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedIndicator || !selectedScale) {
      if (!selectedScale) alert('Please select a spatial scale (SA1 / MB / DZN) before uploading.');
      return;
    }
    lastCsvFileRef.current = file; // remember for future reprocessing
    setUploading(true);
    try {
      const form = new FormData();
      form.append('indicator', selectedIndicator.toLowerCase());
      form.append('scale', selectedScale.toLowerCase());
      form.append('file', file);
      const attempts = [];
      const base = process.env.REACT_APP_API_URL;
      if (base) attempts.push(`${base}/generate`);
      // CRA dev proxy
      attempts.push('/generate');
      // Same host on port 8000
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol;
        const host = window.location.hostname;
        attempts.push(`${proto}//${host}:8000/generate`);
      }
      // Explicit localhost
      attempts.push('http://localhost:8000/generate');

      let res;
      let lastErr;
      for (const url of attempts) {
        try {
          res = await fetch(url, { method: 'POST', body: form });
          if (res.ok) break;
          const text = await res.text();
          lastErr = new Error(`HTTP ${res.status} at ${url}: ${text}`);
        } catch (err) {
          lastErr = err;
        }
      }
      if (!res || !res.ok) throw lastErr || new Error('Upload failed');
      const geojson = await res.json();
      setUploadedGeojson(geojson);
      setSelectedProperty(null); // Reset selection on new upload
    } catch (err) {
      console.error(err);
      const msg = `${err?.message || ''}`;
      if (/scale mismatch|spatial scale/i.test(msg)) {
        alert('The selected Spatial scale does not match the identifiers in your CSV. Please choose the correct Spatial scale and try again.');
      } else {
        alert(`Failed to generate GeoJSON from CSV. ${msg}`);
      }
    } finally {
      setUploading(false);
      // Reset file input to allow re-upload of same file
      e.target.value = '';
    }
  };

  // (All narrative, search, and export logic removed)

  // --- RENDER METHOD ---
  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 78px)' }}>
      <div ref={mapContainer} style={{ position: 'absolute', width: '100%', height: '100%' }} />
      {/* Left overlay with dropdown and file upload */}
      <div style={{ position: 'absolute', top: '1rem', left: '1rem', backgroundColor: 'white', padding: '1rem', borderRadius: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '320px', zIndex: 10 }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Select Indicator</h3>
        <select
          value={selectedIndicator || ''}
          onChange={(e) => setSelectedIndicator(e.target.value || null)}
          style={{ width: '100%', padding: '0.5rem', border: '1px solid #D1D5DB', borderRadius: '0.375rem', marginBottom: '0.75rem' }}
        >
          <option value="">Select…</option>
          <option value="Education">Education</option>
          <option value="Employment">Employment</option>
          <option value="Income">Income</option>
          <option value="POB">POB</option>
          <option value="Occupation">Occupation</option>
          <option value="Total number of jobs">Total number of jobs</option>
          <option value="Industry specialisation">Industry specialisation</option>
        </select>
        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Spatial scale</label>
        <select
          value={selectedScale || ''}
          onChange={(e) => setSelectedScale(e.target.value || null)}
          style={{ width: '100%', padding: '0.5rem', border: '1px solid #D1D5DB', borderRadius: '0.375rem', marginBottom: '0.75rem' }}
        >
          <option value="">Select scale…</option>
          <option value="sa1">SA1 level</option>
          <option value="mb">MB level</option>
          <option value="dzn">DZN level</option>
        </select>
  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Upload CSV for selected indicator</label>
        <input type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={!selectedIndicator || !selectedScale || uploading} />
        {uploading && <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Processing…</div>}

        {/* Property selector for uploaded GeoJSON */}
        {uploadedGeojson && propertyOptions.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Property to visualize</label>
            <select
              value={selectedProperty || ''}
              onChange={(e) => setSelectedProperty(e.target.value || null)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #D1D5DB', borderRadius: '0.375rem' }}
            >
              {propertyOptions.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Bottom-right dynamic legend tied to selectedProperty */}
      {legendInfo && (
        <div style={{ position: 'absolute', right: '1rem', bottom: '2.3rem', backgroundColor: 'white', padding: '0.75rem', borderRadius: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10 }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem' }}>{legendInfo.title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {legendInfo.ranges.map((r, i) => {
              const fmt = (x) => {
                const n = Number(x);
                if (!Number.isFinite(n)) return String(x);
                const abs = Math.abs(n);
                const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
                return n.toLocaleString(undefined, { maximumFractionDigits: digits });
              };
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 18, height: 12, backgroundColor: r.color, border: '1px solid #ccc' }} />
                  <div style={{ fontSize: '0.85rem' }}>{fmt(r.min)} – {fmt(r.max)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
// --- END: MAP COMPONENT ---