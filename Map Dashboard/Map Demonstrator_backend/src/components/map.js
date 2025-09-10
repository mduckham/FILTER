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
  const [uploading, setUploading] = useState(false);
  const [uploadedGeojson, setUploadedGeojson] = useState(null);

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

    if (!uploadedGeojson) {
      if (map.current.getLayer(fillId)) map.current.setLayoutProperty(fillId, 'visibility', 'none');
      if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'none');
      return;
    }

    // Determine the 'Total' property to visualize
    const detectTotalKey = (fc, indicator) => {
      if (!fc || !fc.features || !fc.features.length) return null;
      const keys = Object.keys(fc.features[0].properties || {});
      const indicatorKey = indicator ? indicator.toLowerCase() : '';
      // Prefer keys containing both indicator name and 'total'
      let match = keys.find(k => k.toLowerCase().includes('total') && k.toLowerCase().includes(indicatorKey));
      if (!match) {
        // Fall back to first key including 'total'
        match = keys.find(k => k.toLowerCase().includes('total')) || null;
      }
      return match;
    };

    const totalKey = detectTotalKey(uploadedGeojson, selectedIndicator);

    // Compute min/max for the selected key
    const values = (uploadedGeojson.features || [])
      .map(f => Number((f.properties || {})[totalKey]))
      .filter(v => Number.isFinite(v));
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const palette = (legendData[selectedIndicator]?.items || [
      { color: '#fee5d9' }, { color: '#fcae91' }, { color: '#fb6a4a' }, { color: '#de2d26' }, { color: '#a50f15' }
    ]).map(i => i.color);
    const stopsCount = Math.max(3, Math.min(9, palette.length));
    const step = (max - min) / (stopsCount - 1 || 1);
    const colorStops = [];
    for (let i = 0; i < stopsCount; i++) {
      colorStops.push(min + i * step, palette[i] || palette[palette.length - 1]);
    }

    if (map.current.getSource(sourceId)) {
      map.current.getSource(sourceId).setData(uploadedGeojson);
    } else {
      map.current.addSource(sourceId, { type: 'geojson', data: uploadedGeojson });
      map.current.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: { 'fill-color': ['interpolate', ['linear'], ['to-number', ['get', totalKey]], ...colorStops], 'fill-opacity': 0.6 } });
      map.current.addLayer({ id: outlineId, type: 'line', source: sourceId, paint: { 'line-color': '#cc8800', 'line-width': 1.2 } });
    }
    // Update paint if layer already exists (e.g., new upload with a different key/range)
    if (map.current.getLayer(fillId)) {
      map.current.setPaintProperty(fillId, 'fill-color', ['interpolate', ['linear'], ['to-number', ['get', totalKey]], ...colorStops]);
      map.current.setPaintProperty(fillId, 'fill-opacity', 0.6);
    }
    if (map.current.getLayer(fillId)) map.current.setLayoutProperty(fillId, 'visibility', 'visible');
    if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'visible');
  }, [uploadedGeojson]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedIndicator) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('indicator', selectedIndicator.toLowerCase());
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
          lastErr = new Error(`HTTP ${res.status} at ${url}`);
        } catch (err) {
          lastErr = err;
        }
      }
      if (!res || !res.ok) throw lastErr || new Error('Upload failed');
      const geojson = await res.json();
      setUploadedGeojson(geojson);
    } catch (err) {
      console.error(err);
      alert('Failed to generate GeoJSON from CSV. See console for details.');
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
      <div style={{ position: 'absolute', top: '1rem', left: '1rem', backgroundColor: 'white', padding: '1rem', borderRadius: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '288px', zIndex: 10 }}>
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
        </select>
  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Upload CSV for selected indicator</label>
  <input type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={!selectedIndicator || uploading} />
        {uploading && <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Processing…</div>}
      </div>
    </div>
  );
}
// --- END: MAP COMPONENT ---