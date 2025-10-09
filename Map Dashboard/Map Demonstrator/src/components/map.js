import React, { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GoogleGenerativeAI } from '@google/generative-ai';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import indicatorMetadata from './indicatorMetadata'; // IMPORTED METADATA
import * as turf from '@turf/turf';

// --- LLM API Setup ---
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);

// --- START: INTERACTIVE DESCRIPTION COMPONENT ---
// This component finds and styles specified keywords in a block of text.
const InteractiveDescription = ({ text, keywords, colors, onKeywordHover, onKeywordClick }) => {
  if (!text) return null;

  // Create a regex that matches either a keyword or a bolded section.
  const regex = new RegExp(`(${keywords.join('|')}|\\*\\*.+?\\*\\*)`, 'gi');
  const parts = text.split(regex).filter(part => part);

  return (
    <p style={{ fontSize: '0.95rem', color: '#6c757d', lineHeight: 1.6 }}>
      {parts.map((part, index) => {
        // First, check if the part is a bolded section.
        if (part.startsWith('**') && part.endsWith('**')) {
          const inner = part.substring(2, part.length - 2);
          const kw = keywords.find(kw => kw.toLowerCase() === inner.toLowerCase());
          if (kw) {
            // Treat bolded keywords as interactive too
            return (
              <strong
                key={index}
                style={{
                  color: colors[kw] || '#000',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  padding: '2px 0',
                  borderBottom: `2px solid ${colors[kw] || '#000'}`
                }}
                onMouseEnter={() => onKeywordHover(kw)}
                onMouseLeave={() => onKeywordHover(null)}
                onClick={() => onKeywordClick && onKeywordClick(kw)}
              >
                {inner}
              </strong>
            );
          }
          return <strong key={index}>{inner}</strong>;
        }

        // Next, check if the part is an interactive keyword.
        const originalKeyword = keywords.find(kw => kw.toLowerCase() === part.toLowerCase());
        if (originalKeyword) {
          return (
            <strong
              key={index}
              style={{
                color: colors[originalKeyword] || '#000',
                cursor: 'pointer',
                fontWeight: 'bold',
                padding: '2px 0',
                borderBottom: `2px solid ${colors[originalKeyword] || '#000'}`
              }}
              onMouseEnter={() => onKeywordHover(originalKeyword)}
              onMouseLeave={() => onKeywordHover(null)}
              onClick={() => onKeywordClick && onKeywordClick(originalKeyword)}
            >
              {part}
            </strong>
          );
        }

        // Otherwise, it's just a regular piece of text.
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </p>
  );
};
// --- END: INTERACTIVE DESCRIPTION COMPONENT ---

// --- START: LEGEND COMPONENT (MODIFIED FOR PDF EXPORT) ---
const Legend = React.forwardRef(({ title, items }, ref) => {
  return (
    <div ref={ref} style={{
      position: 'absolute',
      bottom: '2.5rem', // move up to avoid attribution
      right: '1.5rem',  // move left to avoid attribution
      backgroundColor: 'white',
      padding: '1rem',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: 10,
      width: '240px'
    }}>
      <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>{title}</h4>
      {items.map((item, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
          <span style={{
            backgroundColor: item.color,
            width: '18px',
            height: '18px',
            display: 'inline-block',
            marginRight: '0.5rem',
            border: '1px solid #ccc'
          }}></span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
});
// --- END: LEGEND COMPONENT ---


// --- START: MAP COMPONENT ---
export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const descriptionCache = useRef({});
  const legendRef = useRef(null); // Ref for the legend component
  const chartRef = useRef(null); // Ref for the jobs chart (for PDF export)
  const hoverStateBySource = useRef({}); // track hovered feature ids per source for outlines
  const selectedStateBySource = useRef({}); // track selected feature ids per source for outlines

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
  const [searchText, setSearchText] = useState('');
  const [indicators, setIndicators] = useState([]); // Will now store {indicator, score} objects
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const [showIndicators, setShowIndicators] = useState(false);
  const [panelFocus, setPanelFocus] = useState(null);
  const [dynamicDescription, setDynamicDescription] = useState('');
  const [isDescriptionLoading, setIsDescriptionLoading] = useState(false);
  const [textHoveredPrecinct, setTextHoveredPrecinct] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isExporting, setIsExporting] = useState(false); // State for PDF export
  const [mapLoaded, setMapLoaded] = useState(false); // Map style is loaded
  const [layersReady, setLayersReady] = useState(false); // All thematic layers added
  // Multi-year indicator support
  const [availableYears, setAvailableYears] = useState([]); // e.g., [2011, 2016, 2021]
  const [hoveredYear, setHoveredYear] = useState(null); // kept for precinct text hover only
  const [selectedYear, setSelectedYear] = useState(null); // persistent year selection
  // DZN selection and chart data
  const [selectedDZNPoint, setSelectedDZNPoint] = useState(null); // [lng, lat] (legacy selection - no longer used for UI)
  const [selectedDZNJobs, setSelectedDZNJobs] = useState(null); // legacy selection chart data (not shown)
  // Hover-driven chart data for DZN
  const [hoveredDZNJobs, setHoveredDZNJobs] = useState(null); // {2011:number,2016:number,2021:number}
  const [hoveredDZNCode, setHoveredDZNCode] = useState('');
  const [jobsDataLoaded, setJobsDataLoaded] = useState(false);
  const jobsGeoByYear = useRef({}); // {2011: FeatureCollection, 2016: ..., 2021: ...}
  const [dznOptions, setDznOptions] = useState([]); // dropdown options from 2021
  const [selectedDZNCode, setSelectedDZNCode] = useState('');
  const dzn2021IndexRef = useRef({}); // code -> feature
  // Dynamic global classification (0 to global max across years)
  const [jobsBreaks, setJobsBreaks] = useState(null); // 4 thresholds for 5 classes
  const [jobsMax, setJobsMax] = useState(null);
  const [precinctNarrative, setPrecinctNarrative] = useState('');

  // Panel widths for map padding
  const leftPanelWidth = 288;
  const rightPanelWidth = 175;

  // --- DATA DEFINITIONS ---
  const legendData = {
    'Diversity of Education Qualification': {
      title: 'Residents with any qualification (Total)',
      items: [ { color: '#fee5d9', label: '0 - 100' }, { color: '#fcbba1', label: '101 - 200' }, { color: '#fc9272', label: '201 - 300' }, { color: '#fb6a4a', label: '301 - 400' }, { color: '#ef3b2c', label: '401 - 500' }, { color: '#cb181d', label: '> 500' } ]
    },
    'Diversity of Income': {
        title: 'Residents with any income level (Total)',
        items: [ { color: '#fcfbfd', label: '0 - 100' }, { color: '#efedf5', label: '101 - 200' }, { color: '#dadaeb', label: '201 - 300' }, { color: '#bcbddc', label: '301 - 400' }, { color: '#9e9ac8', label: '401 - 500' }, { color: '#807dba', label: '501 - 600' }, { color: '#6a51a3', label: '601 - 700' }, { color: '#54278f', label: '701 - 800' }, { color: '#3f007d', label: '> 800' } ]
    },
    'Diversity of Occupations': {
      title: 'Residents with any occupations (Total)',
      items: [ { color: '#f7fbff', label: '0 - 100' }, { color: '#deebf7', label: '101 - 200' }, { color: '#c6dbef', label: '201 - 300' }, { color: '#9ecae1', label: '301 - 400' }, { color: '#6baed6', label: '401 - 500' }, { color: '#4292c6', label: '501 - 600' }, { color: '#2171b5', label: '601 - 700' }, { color: '#08519c', label: '701 - 800' }, { color: '#08306b', label: '> 800' } ]
    },
  'Number of jobs': { title: 'Total jobs (count)', items: [] }
  };

  const indicatorConfig = {
    'Diversity of Education Qualification': { path: '/data/education-fb-sa1.geojson', property: 'Education-VIC_Total' },
    'Diversity of Income': { path: '/data/income-fb-sa1.geojson', property: 'Income-VIC1_Total' },
  'Diversity of Occupations': { path: '/data/occupation-fb-sa1.geojson', property: 'Occupation-VIC_Total' },
  // Multi-year indicator uses separate sources per year; properties per dataset are provided below in layer configs
  'Number of jobs': { path: null, property: null }
  };

  const DEFAULT_JOBS_YEAR = 2011;
  // Show three default indicators on initial load (randomly picked from supported indicators)
  useEffect(() => {
    // Only run on initial mount
    const supported = Object.keys(indicatorConfig);
    if (!supported.length) return;
    // If no suggestions shown yet and no search input, show defaults
    if (!showIndicators && indicators.length === 0 && !searchText.trim()) {
      const base = 'Number of jobs';
      const others = supported.filter(n => n !== base);
      const shuffled = [...others].sort(() => 0.5 - Math.random());
      const extra = shuffled.slice(0, Math.min(2, shuffled.length));
      const picks = [base, ...extra];
      setIndicators(picks.map(name => ({ indicator: name, score: 1 })));
      setShowIndicators(true);
      // Ensure it's selected and focused at startup
      setSelectedIndicator(base);
      setPanelFocus({ type: 'indicator', name: base });
      setSelectedYear(DEFAULT_JOBS_YEAR);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default selection and visualisation: Number of jobs (2011)
  useEffect(() => {
    // Set preselected year to avoid being overridden by the 'latest year' effect
    setSelectedYear(2011);
    setSelectedIndicator('Number of jobs');
    setPanelFocus({ type: 'indicator', name: 'Number of jobs' });
    // No dependency: fire once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared classes and palette for Number of jobs across all years
  const JOBS_BREAKS = [591, 1097, 1356, 2742, 3000];
  const JOBS_PALETTE = ['#fee5d9','#fcae91','#fb6a4a','#de2d26','#a50f15'];
  const JOBS_YEAR_COLORS = { 2011: '#a50f15', 2016: '#08519c', 2021: '#006d2c' };

  // --- Simple point-in-polygon utilities (ray casting) ---
  const pointInRing = (pt, ring) => {
    const [x, y] = pt; let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };
  const pointInPolygonGeom = (pt, geom) => {
    if (!geom) return false;
    if (geom.type === 'Polygon') {
      const [outer, ...holes] = geom.coordinates;
      if (!pointInRing(pt, outer)) return false;
      for (const hole of holes) { if (pointInRing(pt, hole)) return false; }
      return true;
    }
    if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        const [outer, ...holes] = poly;
        if (pointInRing(pt, outer)) {
          let inHole = false; for (const hole of holes) { if (pointInRing(pt, hole)) { inHole = true; break; } }
          if (!inHole) return true;
        }
      }
      return false;
    }
    return false;
  };

  // --- Centroid utilities ---
  const ringArea = (ring) => {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
      area += (xj * yi - xi * yj);
    }
    return area / 2;
  };
  const ringCentroid = (ring) => {
    let cx = 0, cy = 0; let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
      const f = (xi * yj - xj * yi);
      cx += (xi + xj) * f; cy += (yi + yj) * f; a += f;
    }
    a = a * 0.5;
    if (a === 0) return ring[0];
    return [cx / (6 * a), cy / (6 * a)];
  };
  const geomCentroid = (geom) => {
    if (!geom) return null;
    if (geom.type === 'Polygon') {
      return ringCentroid(geom.coordinates[0]);
    }
    if (geom.type === 'MultiPolygon') {
      // choose largest area polygon
      let best = null; let bestA = -Infinity;
      for (const poly of geom.coordinates) {
        const a = Math.abs(ringArea(poly[0]));
        if (a > bestA) { bestA = a; best = poly[0]; }
      }
      return best ? ringCentroid(best) : null;
    }
    return null;
  };

  // Load jobs GeoJSONs once (for chart point-in-polygon lookup)
  useEffect(() => {
    let canceled = false;
    const loadAll = async () => {
      try {
        const urls = {
          2011: '/data/Number_of_Jobs_DZN_11.geojson',
          2016: '/data/Number_of_Jobs_DZN_16.geojson',
          2021: '/data/Number_of_Jobs_DZN_21.geojson'
        };
        const entries = await Promise.all(Object.entries(urls).map(async ([yr, url]) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed to fetch ${url}`);
          const json = await res.json();
          return [parseInt(yr, 10), json];
        }));
        if (!canceled) {
          const obj = {}; entries.forEach(([yr, fc]) => { obj[yr] = fc; });
          jobsGeoByYear.current = obj; setJobsDataLoaded(true);
          // Build 2021 DZN dropdown options and index
          const fc2021 = obj[2021];
          if (fc2021 && fc2021.features) {
            const idx = {}; const opts = [];
            for (const feat of fc2021.features) {
              const code = feat.properties?.DZN_CODE21 || feat.properties?.DZN_CODE || '';
              if (!code) continue;
              if (!idx[code]) { idx[code] = feat; opts.push({ value: code, label: code }); }
            }
            dzn2021IndexRef.current = idx;
            setDznOptions(opts.sort((a,b)=>String(a.label).localeCompare(String(b.label))));
          }

          // Compute dynamic equal-interval breaks from 0 to global max across all years
          try {
            const years = [2011, 2016, 2021];
            const propsByYear = { 2011: 'TotJob_11', 2016: 'TotJob_16', 2021: 'TotJob_21' };
            let globalMax = 0;
            years.forEach((yr) => {
              const fc = obj[yr];
              if (!fc || !fc.features) return;
              fc.features.forEach((f) => {
                const v = parseFloat(f.properties?.[propsByYear[yr]] ?? '0');
                if (isFinite(v) && v > globalMax) globalMax = v;
              });
            });
            const maxV = Math.max(0, globalMax);
            const step = maxV / 5; // 5 classes
            const breaks = [step, 2*step, 3*step, 4*step];
            setJobsBreaks(breaks);
            setJobsMax(maxV);

            // If map is ready, update layer paint expressions with new breaks
            const m = map.current;
            if (m && m.isStyleLoaded()) {
              const L = [
                { id: 'number-of-jobs-2011-layer', prop: 'TotJob_11' },
                { id: 'number-of-jobs-2016-layer', prop: 'TotJob_16' },
                { id: 'number-of-jobs-2021-layer', prop: 'TotJob_21' }
              ];
              L.forEach(({ id, prop }) => {
                if (!m.getLayer(id)) return;
                const base = JOBS_PALETTE[0];
                const stepExpr = ['step', ['to-number', ['get', prop]], base];
                breaks.forEach((b, i) => { stepExpr.push(b, JOBS_PALETTE[i + 1] || JOBS_PALETTE[JOBS_PALETTE.length - 1]); });
                m.setPaintProperty(id, 'fill-color', stepExpr);
              });
            }
          } catch (err) {
            console.warn('Failed to compute dynamic jobs breaks:', err);
          }
        }
      } catch (e) {
        console.error('Failed to load jobs GeoJSONs:', e);
      }
    };
    loadAll();
    return () => { canceled = true; };
  }, []);

  // Reapply dynamic breaks to paint once layers are ready
  useEffect(() => {
    if (!layersReady || !map.current || !map.current.isStyleLoaded()) return;
    if (!jobsBreaks || jobsBreaks.length !== 4) return;
    try {
      const m = map.current;
      const L = [
        { id: 'number-of-jobs-2011-layer', prop: 'TotJob_11' },
        { id: 'number-of-jobs-2016-layer', prop: 'TotJob_16' },
        { id: 'number-of-jobs-2021-layer', prop: 'TotJob_21' }
      ];
      L.forEach(({ id, prop }) => {
        if (!m.getLayer(id)) return;
        const base = JOBS_PALETTE[0];
        const stepExpr = ['step', ['to-number', ['get', prop]], base];
        jobsBreaks.forEach((b, i) => { stepExpr.push(b, JOBS_PALETTE[i + 1] || JOBS_PALETTE[JOBS_PALETTE.length - 1]); });
        m.setPaintProperty(id, 'fill-color', stepExpr);
      });
    } catch (_) { /* ignore */ }
  }, [layersReady, jobsBreaks]);

  // When a DZN is selected from dropdown, compute time series via centroid PIP
  useEffect(() => {
    if (!selectedDZNCode) { setSelectedDZNJobs(null); return; }
    const feat = dzn2021IndexRef.current[selectedDZNCode];
    if (!feat) { setSelectedDZNJobs(null); return; }
    const c = geomCentroid(feat.geometry);
    if (!c) { setSelectedDZNJobs(null); return; }
    const [lng, lat] = c; setSelectedDZNPoint([lng, lat]);
    const vals = computeJobsForPoint(lng, lat);
    setSelectedDZNJobs(vals);
  }, [selectedDZNCode]);

  // Compute clicked point's jobs across years by point-in-polygon search
  const computeJobsForPoint = (lng, lat) => {
    const pt = [lng, lat];
    const years = [2011, 2016, 2021];
    const propsByYear = { 2011: 'TotJob_11', 2016: 'TotJob_16', 2021: 'TotJob_21' };
    const out = {};
    years.forEach((yr) => {
      const fc = jobsGeoByYear.current[yr];
      if (!fc || !fc.features) { out[yr] = 0; return; }
      let found = 0;
      for (const feat of fc.features) {
        if (pointInPolygonGeom(pt, feat.geometry)) {
          const val = parseFloat(feat.properties?.[propsByYear[yr]] ?? '0');
          found = isFinite(val) ? val : 0; break;
        }
      }
      out[yr] = found;
    });
    return out;
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
      setMapLoaded(true);
      // Add sources
      const sources = [
        { name: 'base-outline', path: '/data/fb-sa1-2021-WGS84-boundary.geojson' },
        { name: 'employment', path: '/data/employment-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'education', path: '/data/education-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'pob', path: '/data/POB-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'income', path: '/data/income-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'occupation', path: '/data/occupation-fb-sa1.geojson', promoteId: 'SA1_CODE21' },
        { name: 'precincts', path: '/data/fb-precincts-official-boundary.geojson' },
        // Number of jobs (DZN)
        { name: 'jobs-dzn-2011', path: '/data/Number_of_Jobs_DZN_11.geojson', promoteId: 'DZN_CODE11' },
        { name: 'jobs-dzn-2016', path: '/data/Number_of_Jobs_DZN_16.geojson', promoteId: 'DZN_CODE16' },
        { name: 'jobs-dzn-2021', path: '/data/Number_of_Jobs_DZN_21.geojson', promoteId: 'DZN_CODE21' }
      ];
      sources.forEach(s => {
        const spec = { type: 'geojson', data: s.path };
        if (s.promoteId) spec.promoteId = s.promoteId;
        map.current.addSource(`${s.name}-data-source`, spec);
      });

      // Define layers including Number of jobs with requested bins/colors
      const layers = [
        { id: 'diversity-of-education-qualification-layer', indicatorName: 'Diversity of Education Qualification', source: 'education-data-source', property: indicatorConfig['Diversity of Education Qualification'].property, colors: legendData['Diversity of Education Qualification'].items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500] },
        { id: 'diversity-of-income-layer', indicatorName: 'Diversity of Income', source: 'income-data-source', property: indicatorConfig['Diversity of Income'].property, colors: legendData['Diversity of Income'].items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500, 600, 700, 800] },
        { id: 'diversity-of-occupations-layer', indicatorName: 'Diversity of Occupations', source: 'occupation-data-source', property: indicatorConfig['Diversity of Occupations'].property, colors: legendData['Diversity of Occupations'].items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500, 600, 700, 800] },
  // Use the same color palette and classes across years for better comparison
  { id: 'number-of-jobs-2011-layer', indicatorName: 'Number of jobs', source: 'jobs-dzn-2011-data-source', property: 'TotJob_11', type: 'step', breaks: JOBS_BREAKS, colors: JOBS_PALETTE },
  { id: 'number-of-jobs-2016-layer', indicatorName: 'Number of jobs', source: 'jobs-dzn-2016-data-source', property: 'TotJob_16', type: 'step', breaks: JOBS_BREAKS, colors: JOBS_PALETTE },
  { id: 'number-of-jobs-2021-layer', indicatorName: 'Number of jobs', source: 'jobs-dzn-2021-data-source', property: 'TotJob_21', type: 'step', breaks: JOBS_BREAKS, colors: JOBS_PALETTE }
      ];

      layers.forEach(layer => {
        // Fill paint
        let paint;
        if (layer.type === 'step') {
          const base = layer.colors && layer.colors.length ? layer.colors[0] : '#ffffff';
          const stepExpr = ['step', ['to-number', ['get', layer.property]], base];
          layer.breaks.forEach((b, i) => { stepExpr.push(b, layer.colors[i] || layer.colors[layer.colors.length - 1]); });
          paint = {
            'fill-color': stepExpr,
            'fill-opacity': [
              'case',
              ['any', ['boolean', ['feature-state', 'hover'], false], ['boolean', ['feature-state', 'selected'], false]],
              1,
              0.7
            ]
          };
        } else {
          const colorStops = layer.stops.flatMap((stop, i) => [stop, layer.colors[i] || layer.colors[layer.colors.length - 1]]);
          paint = {
            'fill-color': ['interpolate', ['linear'], ['to-number', ['get', layer.property]], ...colorStops],
            'fill-opacity': [
              'case',
              ['any', ['boolean', ['feature-state', 'hover'], false], ['boolean', ['feature-state', 'selected'], false]],
              0.9,
              0.9
            ]
          };
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

        // Dim mask overlay to de-emphasize non-hovered features
        // Order: fill (layer.id) -> dim-mask -> base-outline -> hover-outline
        const dimMaskId = `${layer.id}-dim-mask`;
        map.current.addLayer({
          id: dimMaskId,
          type: 'fill',
          source: layer.source,
          layout: { visibility: 'none' },
          paint: {
            'fill-color': '#fbfbfbff',
            // If feature is hovered or selected: mask transparent (0). Else apply dim opacity
            'fill-opacity': [
              'case',
              ['any', ['boolean', ['feature-state', 'hover'], false], ['boolean', ['feature-state', 'selected'], false]],
              0,
              0.5
            ]
          }
        }, baseOutlineId);

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
            'line-opacity': [
              'case',
              ['any', ['boolean', ['feature-state', 'hover'], false], ['boolean', ['feature-state', 'selected'], false]],
              1,
              0
            ]
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

          // If hovering over a Number of jobs layer, compute and show hover chart
          if (layer.indicatorName === 'Number of jobs') {
            try {
              const c = geomCentroid(f.geometry);
              if (c) {
                const vals = computeJobsForPoint(c[0], c[1]);
                setHoveredDZNJobs(vals);
              }
              // Get the DZN code for label from current layer's year-specific property
              const yearMatch = layer.id.match(/(2011|2016|2021)/);
              const yr = yearMatch ? parseInt(yearMatch[1], 10) : null;
              const codeProp = yr === 2011 ? 'DZN_CODE11' : yr === 2016 ? 'DZN_CODE16' : 'DZN_CODE21';
              setHoveredDZNCode(f.properties?.[codeProp] || '');
            } catch (_) {
              // no-op
            }
          }
        });
        map.current.on('mouseenter', layer.id, () => {
          // Show dim mask when interacting with this layer
          if (map.current.getLayer(dimMaskId)) {
            map.current.setLayoutProperty(dimMaskId, 'visibility', 'visible');
          }
          map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', layer.id, () => {
          const sourceId = layer.source;
          const prev = hoverStateBySource.current[sourceId];
          if (prev !== undefined) {
            try { map.current.setFeatureState({ source: sourceId, id: prev }, { hover: false }); } catch (_) {}
            hoverStateBySource.current[sourceId] = undefined;
          }
          if (layer.indicatorName === 'Number of jobs') {
            setHoveredDZNJobs(null);
            setHoveredDZNCode('');
          }
          // Hide dim mask when leaving layer
          if (map.current.getLayer(dimMaskId)) {
            map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
          }
          map.current.getCanvas().style.cursor = '';
        });
      });

      // Safety: default to show 2011 jobs layer on first load (others remain hidden)
      const initialJobsLayer = 'number-of-jobs-2011-layer';
      const outline2011 = `${initialJobsLayer}-hover-outline`;
      const baseOutline2011 = `${initialJobsLayer}-base-outline`;
      const dimMask2011 = `${initialJobsLayer}-dim-mask`;
      try {
        if (map.current.getLayer(initialJobsLayer)) {
          map.current.setLayoutProperty(initialJobsLayer, 'visibility', 'visible');
        }
        if (map.current.getLayer(outline2011)) {
          map.current.setLayoutProperty(outline2011, 'visibility', 'visible');
        }
        if (map.current.getLayer(baseOutline2011)) {
          map.current.setLayoutProperty(baseOutline2011, 'visibility', 'visible');
        }
        if (map.current.getLayer(dimMask2011)) {
          map.current.setLayoutProperty(dimMask2011, 'visibility', 'none');
        }
      } catch (_) { /* ignore */ }

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

      map.current.on('click', 'precincts-fill-layer', (e) => {
        const feature = e.features[0];
        if (!feature || !feature.properties.name) return;
        const precinctName = feature.properties.name;
        setPanelFocus({ type: 'precinct', name: precinctName });
        setTextHoveredPrecinct(null);
      });

      // Also allow clicking on the precinct boundary to show its narrative
      map.current.on('click', 'precincts-outline-layer', (e) => {
        const features = e.features || [];
        const feature = features[0];
        if (!feature || !feature.properties?.name) return;
        const precinctName = feature.properties.name;
        setPanelFocus({ type: 'precinct', name: precinctName });
        setTextHoveredPrecinct(null);
      });

      map.current.on('mouseenter', 'precincts-fill-layer', () => { map.current.getCanvas().style.cursor = 'pointer'; });
      map.current.on('mouseleave', 'precincts-fill-layer', () => { map.current.getCanvas().style.cursor = ''; });

      // Map-wide click handling to ensure precinct boundary is clickable regardless of layer stacking
      map.current.on('click', (e) => {
        const pt = e.point;
        const bbox = [ [pt.x - 4, pt.y - 4], [pt.x + 4, pt.y + 4] ];
        // Priority 1: Precinct boundary
        try {
          const precinctHits = map.current.queryRenderedFeatures(bbox, { layers: ['precincts-outline-layer'] });
          if (precinctHits && precinctHits.length) {
            const feat = precinctHits[0];
            const name = feat.properties?.name;
            if (name) {
              setPanelFocus({ type: 'precinct', name });
              setTextHoveredPrecinct(null);
              return; // handled as precinct
            }
          }
        } catch (_) { /* ignore */ }

        // Priority 2: DZN under click (current visible year layer)
        const jobsLayers = ['number-of-jobs-2011-layer','number-of-jobs-2016-layer','number-of-jobs-2021-layer'];
        const visibleJobs = jobsLayers.filter(lid => {
          try { return map.current.getLayer(lid) && map.current.getLayoutProperty(lid, 'visibility') === 'visible'; } catch { return false; }
        });
        for (const lid of visibleJobs) {
          const feats = map.current.queryRenderedFeatures(pt, { layers: [lid] });
          if (feats && feats.length) {
            const f = feats[0];
            const yearMatch = lid.match(/(2011|2016|2021)/);
            const yr = yearMatch ? parseInt(yearMatch[1], 10) : 2021;
            const codeProp = yr === 2011 ? 'DZN_CODE11' : yr === 2016 ? 'DZN_CODE16' : 'DZN_CODE21';

            setSelectedIndicator('Number of jobs');
            setPanelFocus({ type: 'indicator', name: 'Number of jobs' });
            setSelectedYear(yr);

            if (e.lngLat) {
              const { lng, lat } = e.lngLat;
              setSelectedDZNPoint([lng, lat]);
              const vals = computeJobsForPoint(lng, lat);
              setSelectedDZNJobs(vals);
            }
            const code = f.properties?.[codeProp] || '';
            setSelectedDZNCode(code);
            return; // handled as DZN selection
          }
        }
      });

      // Mark layers ready after all layers and handlers are added
      setLayersReady(true);
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
    if (!map.current || !mapLoaded || !layersReady) return;
    const allLayerIds = [
        'diversity-of-education-qualification-layer', 
        'diversity-of-income-layer', 
        'diversity-of-occupations-layer'
    ];
    const selectedLayerId = selectedIndicator ? `${selectedIndicator.toLowerCase().replace(/ /g, '-')}-layer` : null;

    if (map.current.getLayer('base-outline-layer')) {
        map.current.setLayoutProperty('base-outline-layer', 'visibility', selectedIndicator ? 'visible' : 'none');
    }

    allLayerIds.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        const vis = layerId === selectedLayerId ? 'visible' : 'none';
        map.current.setLayoutProperty(layerId, 'visibility', vis);
  const outlineId = `${layerId}-hover-outline`;
  const baseOutlineId = `${layerId}-base-outline`;
  const dimMaskId = `${layerId}-dim-mask`;
  if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
  if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
  if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      }
    });
  }, [selectedIndicator, mapLoaded, layersReady]);

  // Derive available years from metadata when panel focus changes (for jobs indicator and precinct view)
  useEffect(() => {
    if (panelFocus && ((panelFocus.type === 'indicator' && panelFocus.name === 'Number of jobs') || panelFocus.type === 'precinct')) {
      const meta = indicatorMetadata['Number of jobs'];
      const scale = meta && meta['Spatial scale'] ? String(meta['Spatial scale']) : '';
      const years = Array.from(new Set((scale.match(/20\d{2}/g) || []).map(y => parseInt(y, 10)))).sort((a,b)=>a-b);
      setAvailableYears(years.length ? years : [2011, 2016, 2021]);
    } else {
      setAvailableYears([]);
    }
  }, [panelFocus]);

  // Ensure a default selectedYear when viewing Number of jobs and reset when leaving
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Number of jobs') {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const preferred = years.includes(DEFAULT_JOBS_YEAR) ? DEFAULT_JOBS_YEAR : Math.max(...years);
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(preferred);
      }
    }
  }, [panelFocus, availableYears]);

  // Control visibility for Number of jobs layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2011: 'number-of-jobs-2011-layer',
      2016: 'number-of-jobs-2016-layer',
      2021: 'number-of-jobs-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (map.current.getLayer(id)) {
        map.current.setLayoutProperty(id, 'visibility', vis);
      }
      const outlineId = `${id}-hover-outline`;
      const dimMaskId = `${id}-dim-mask`;
      if (map.current.getLayer(outlineId)) {
        map.current.setLayoutProperty(outlineId, 'visibility', vis);
      }
      if (map.current.getLayer(dimMaskId)) {
        // Default hidden; shown during mouseenter
        map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      }
    };

    // Hide all by default
    [2011, 2016, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Number of jobs') {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const defaultYear = years.includes(DEFAULT_JOBS_YEAR) ? DEFAULT_JOBS_YEAR : Math.max(...years);
      const yearToShow = selectedYear || defaultYear;
      const layerToShow = layerIds[yearToShow];
      if (layerToShow) setVisibility(layerToShow, 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Highlight selected DZN on map using feature-state 'selected'
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    if (!(panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Number of jobs')) return;
    const year = selectedYear || 2021;
    const sourceIds = {
      2011: 'jobs-dzn-2011-data-source',
      2016: 'jobs-dzn-2016-data-source',
      2021: 'jobs-dzn-2021-data-source',
    };
    const sourceId = sourceIds[year];
    if (!sourceId) return;

    // Clear previous selection
    Object.entries(selectedStateBySource.current).forEach(([src, fid]) => {
      try { map.current.setFeatureState({ source: src, id: fid }, { selected: false }); } catch (_) {}
    });
    selectedStateBySource.current = {};

    if (!selectedDZNCode) return;

    // Find the feature ID either by matching code (if same vintage) or by point-in-polygon using the selected DZN centroid
    try {
      const features = map.current.querySourceFeatures(sourceId) || [];
      const codeProp = year === 2011 ? 'DZN_CODE11' : year === 2016 ? 'DZN_CODE16' : 'DZN_CODE21';
      let match = features.find(f => (f.properties?.[codeProp] === selectedDZNCode));
      if (!match && selectedDZNPoint) {
        // Fallback: locate by centroid in current year's polygons
        for (const f of features) {
          if (pointInPolygonGeom(selectedDZNPoint, f.geometry)) { match = f; break; }
        }
      }
      if (match && typeof match.id !== 'undefined') {
        map.current.setFeatureState({ source: sourceId, id: match.id }, { selected: true });
        selectedStateBySource.current[sourceId] = match.id;
      }
    } catch (e) {
      // Fallback: no-op if source not ready
    }
  }, [selectedDZNCode, selectedYear, panelFocus]);

  // Keep dim-mask visible when a DZN is selected (so others stay de-emphasized like hover)
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;
    const isJobs = panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Number of jobs';
    const layerIds = {
      2011: 'number-of-jobs-2011-layer',
      2016: 'number-of-jobs-2016-layer',
      2021: 'number-of-jobs-2021-layer'
    };
    // For all jobs layers, default dim-mask to none
    ['number-of-jobs-2011-layer','number-of-jobs-2016-layer','number-of-jobs-2021-layer'].forEach((lid) => {
      const dimId = `${lid}-dim-mask`;
      if (map.current.getLayer(dimId)) {
        try { map.current.setLayoutProperty(dimId, 'visibility', 'none'); } catch (_) {}
      }
    });
    if (!isJobs) return;
    const yr = selectedYear || 2011;
    const activeLayer = layerIds[yr];
    if (!activeLayer) return;
    const dimMaskId = `${activeLayer}-dim-mask`;
    if (map.current.getLayer(dimMaskId)) {
      const hasSelection = !!selectedDZNCode;
      // If there is a selection, keep the dim-mask visible so non-selected features are dimmed
      try { map.current.setLayoutProperty(dimMaskId, 'visibility', hasSelection ? 'visible' : 'none'); } catch (_) {}
    }
  }, [selectedDZNCode, selectedYear, panelFocus, layersReady]);

  // Generate LLM description when panel focus changes
  useEffect(() => {
    if (!panelFocus) {
      setDynamicDescription('');
      setIsDescriptionLoading(false);
      setPrecinctNarrative('');
      return;
    }

    const generateDescription = async () => {
        setIsDescriptionLoading(true);
        setDynamicDescription('');
  const { type, name } = panelFocus;
  // Include year in cache key for precinct narratives to avoid stale text when switching years
  const cacheKey = type === 'precinct' ? `${type}_${name}_${selectedYear || ''}` : `${type}_${name}`;

        if (descriptionCache.current[cacheKey]) {
            setDynamicDescription(descriptionCache.current[cacheKey]);
            setIsDescriptionLoading(false);
            return;
        }

        try {
            let prompt = '';
            if (type === 'indicator') {
                const metadata = indicatorMetadata[name];

                if (!metadata) {
                    throw new Error(`Metadata is missing for the "${name}" indicator.`);
                }
                
                prompt = `You are an expert urban data analyst providing a summary for a public-facing dashboard about Melbourne's Fishermans Bend.
Your task is to generate a clear, descriptive summary for the "${name}" indicator based ONLY on the metadata provided below.

Use the following information to structure your response. Present it as a cohesive and easy-to-read paragraph, not as a list. **Crucially, when you incorporate a piece of metadata from the list below into your paragraph, you must make that specific value bold using Markdown (e.g., the goal is **An inclusive community**).**

- **Alignment with Goals**: This indicator aligns with Fishermans Bend's goal of: "${metadata["FB's target"]}".
- **Measurement Method**: It is measured by this method: "${metadata["Note for measurement"]}".
- **Data Origin**: The data is sourced from "${metadata["Data sources"]}".
- **Geographic Coverage**: The data's spatial extent is "${metadata["Spatial extent"]}", presented at a "${metadata["Spatial scale"]}" level.
- **Timeliness**: The data is updated every "${metadata["Update frequency"]}". The current version is from "${metadata["Temporal currency"]}", and the historical data available covers the period "${metadata["Temporal extent"]}".

Synthesize this information into an engaging and informative paragraph of about 70-100 words. Start by explaining what this indicator is and why it's important for Fishermans Bend's goals. Then, provide context about the data itself. Remember to make all the specific metadata values bold in your final output. Do not invent or infer any data values, statistics, or trends.`;


            } else if (type === 'precinct') {
                // Deterministic narrative using computed overlay stats
                const yr = selectedYear || 2011;
                try {
                  const stats = await computePrecinctJobsOverlay(name, yr);
                  const text = generatePrecinctNarrativeDeterministic(stats);
                  descriptionCache.current[cacheKey] = text;
                  setPrecinctNarrative('');
                  setDynamicDescription(text);
                } catch (e) {
                  console.error('Failed to generate precinct narrative:', e);
                  setDynamicDescription('');
                }
                return; // bail out, we've set dynamicDescription already
            }

            if (prompt) {
                const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
                const result = await model.generateContent(prompt);
                const text = result.response.text();
                descriptionCache.current[cacheKey] = text;
                setDynamicDescription(text);
            }
        } catch (error) {
            console.error(`Error generating description for ${name}:`, error);
            const errorMessage = error.message.includes('429')
                ? 'Daily free API quota exceeded. Please try again tomorrow or upgrade to a paid plan.'
                : `An error occurred while generating the description: ${error.message}`;
            setDynamicDescription(errorMessage);
        } finally {
            setIsDescriptionLoading(false);
        }
    };
    generateDescription();
  }, [panelFocus]);

  // Recompute precinct narrative when year changes while a precinct is selected
  useEffect(() => {
    if (!(panelFocus && panelFocus.type === 'precinct')) return;
    const name = panelFocus.name;
    const yr = selectedYear || 2011;
    let canceled = false;
    (async () => {
      try {
        const stats = await computePrecinctJobsOverlay(name, yr);
        const text = generatePrecinctNarrativeDeterministic(stats);
        if (!canceled) {
          setDynamicDescription(text);
        }
      } catch (e) { /* ignore */ }
    })();
    return () => { canceled = true; };
  }, [selectedYear, panelFocus]);

  // Update map visual style when a precinct is highlighted from text
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    if (textHoveredPrecinct) {
      const fillColorExpression = [ 'case', ['==', ['get', 'name'], textHoveredPrecinct], PRECINCT_COLORS[textHoveredPrecinct], '#ffffffff' ];
      const fillOpacityExpression = [ 'case', ['==', ['get', 'name'], textHoveredPrecinct], 0.6, 0.15 ];
      const outlineColorExpression = [ 'case', ['==', ['get', 'name'], textHoveredPrecinct], PRECINCT_COLORS[textHoveredPrecinct], '#0868ac' ];

      map.current.setPaintProperty('precincts-fill-layer', 'fill-color', fillColorExpression);
      map.current.setPaintProperty('precincts-fill-layer', 'fill-opacity', fillOpacityExpression);
      map.current.setPaintProperty('precincts-outline-layer', 'line-color', outlineColorExpression);

    } else {
      map.current.setPaintProperty('precincts-fill-layer', 'fill-color', '#ffffffff');
      map.current.setPaintProperty('precincts-fill-layer', 'fill-opacity', 0.15);
      map.current.setPaintProperty('precincts-outline-layer', 'line-color', '#0868ac');
    }
  }, [textHoveredPrecinct, PRECINCT_COLORS]);

  // --- UI HANDLERS ---
  const handleSearchClick = async () => {
    if (!searchText.trim()) return;

    setIsSearching(true);
    setShowIndicators(false);
    setSearchError('');

    try {
      const response = await fetch('http://127.0.0.1:5000/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchText }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok.');
      }
      
      const rankedIndicators = await response.json();
      setIndicators(rankedIndicators); // Update state with ranked list
      setShowIndicators(true);

    } catch (error) {
      console.error("Failed to fetch indicators:", error);
      setSearchError("Failed to connect to the backend. Please ensure the Python server is running.");
      setIndicators([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleIndicatorSelect = (indicator) => {
    const isCurrentlySelected = selectedIndicator === indicator;
    const newIndicator = isCurrentlySelected ? null : indicator;
    setSelectedIndicator(newIndicator);
    setPanelFocus(newIndicator ? { type: 'indicator', name: newIndicator } : null);
    setTextHoveredPrecinct(null);
    if (newIndicator === 'Number of jobs' && (!selectedYear || selectedYear !== 2011)) {
      setSelectedYear(2011);
    }
  };

  const handlePrecinctHover = (precinctName) => {
    setTextHoveredPrecinct(precinctName);
  };

  // Map current jobs breaks to linguistic bins
  const jobsValueToClass = (val) => {
    const br = jobsBreaks && jobsBreaks.length === 4 ? jobsBreaks : [591, 1097, 1356, 2742];
    if (val < br[0]) return 0; // very low
    if (val < br[1]) return 1; // low
    if (val < br[2]) return 2; // medium
    if (val < br[3]) return 3; // high
    return 4; // very high
  };
  const CLASS_LABELS = ['very low', 'low', 'medium', 'high', 'very high'];

  // Compute per-DZN intersections and class distribution for a precinct and year
  const computePrecinctJobsOverlay = async (precinctName, year) => {
    // First try server-side overlay for robustness (Shapely + pyproj)
    try {
      const resp = await fetch('http://127.0.0.1:5000/api/precinct_overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precinctName, year })
      });
      if (resp.ok) {
        const res = await resp.json();
        if (res && typeof res.dznIntersectCount === 'number') {
          // Map server output to our stats shape
          const precinctArea = res.precinctArea || 0;
          const intersections = (res.intersections || []).map(i => ({
            code: i.code,
            value: i.value,
            classIndex: jobsValueToClass(i.value || 0),
            classLabel: CLASS_LABELS[jobsValueToClass(i.value || 0)],
            area: i.area,
            areaPct: precinctArea > 0 ? i.area / precinctArea : 0
          }));
          const areaByClass = [0,0,0,0,0];
          const countByClass = [0,0,0,0,0];
          intersections.forEach(it => { areaByClass[it.classIndex] += it.area; countByClass[it.classIndex] += 1; });
          const classes = CLASS_LABELS.map((label, idx) => ({ index: idx, label, areaShare: precinctArea>0? (areaByClass[idx]/precinctArea):0, count: countByClass[idx] }))
            .filter(c => c.areaShare > 0)
            .sort((a,b)=>b.areaShare-a.areaShare);
          const presentClasses = classes.map(c => c.label);
          intersections.sort((a,b)=>b.areaPct-a.areaPct);
          console.log(`[Server Overlay] ${precinctName} (${year}):`, res);
          return {
            precinct: precinctName,
            year,
            precinctArea,
            dznIntersectCount: res.dznIntersectCount || intersections.length,
            intersections,
            classes,
            presentClasses,
            totals: { areaByClass, countByClass, precinctArea }
          };
        }
      }
    } catch (_) {
      // Fall through to client-side fallback
    }

    // Fallback: client-side overlay using Turf (clean + project path below)
    // Prefer cached jobs data if available
    const propByYear = { 2011: 'TotJob_11', 2016: 'TotJob_16', 2021: 'TotJob_21' };
    const codeByYear = { 2011: 'DZN_CODE11', 2016: 'DZN_CODE16', 2021: 'DZN_CODE21' };
    const yrToUrl = { 2011: '/data/Number_of_Jobs_DZN_11.geojson', 2016: '/data/Number_of_Jobs_DZN_16.geojson', 2021: '/data/Number_of_Jobs_DZN_21.geojson' };
    const jobsProp = propByYear[year] || 'TotJob_21';
    const codeProp = codeByYear[year] || 'DZN_CODE21';
    let jobsFC = jobsGeoByYear.current[year];
    if (!jobsFC) {
      const resJ = await fetch(yrToUrl[year] || yrToUrl[2021]);
      if (!resJ.ok) throw new Error('Failed to fetch jobs');
      jobsFC = await resJ.json();
    }
    const resP = await fetch('/data/fb-precincts-official-boundary.geojson');
    if (!resP.ok) throw new Error('Failed to fetch precincts');
    const precincts = await resP.json();
    const precinctFeat = precincts.features.find(f => (f.properties?.name === precinctName));
    if (!precinctFeat) throw new Error('Precinct not found');

    // Ensure geometries are in WGS84 (EPSG:4326)
    // Check CRS and log for debugging
    const precinctCRS = precincts.crs?.properties?.name || 'unknown';
    const jobsCRS = jobsFC.crs?.properties?.name || 'unknown';
    console.log(`[CRS Check] Precinct CRS: ${precinctCRS}, Jobs CRS: ${jobsCRS}`);
    
    // GeoJSON spec assumes WGS84 if no CRS specified, but validate geometries
    // Helper: robustify geometry -> FeatureCollection of simple Polygons
    const toCleanPolygonParts = (geom, tagProps = {}) => {
      if (!geom) return [];
      const feat = turf.feature(geom, tagProps);
      // Rewind for proper ring orientation
      let rew = feat;
      try { rew = turf.rewind(feat, { reverse: false }); } catch (_) {}
      // Unkink to split self-intersections if any
      let unk;
      try { unk = turf.unkinkPolygon(rew); } catch (_) { unk = turf.featureCollection([rew]); }
      // Flatten MultiPolygons to individual Polygons
      const flat = [];
      for (const f of unk.features) {
        if (!f || !f.geometry) continue;
        if (f.geometry.type === 'Polygon') {
          flat.push(f);
        } else if (f.geometry.type === 'MultiPolygon') {
          for (const rings of f.geometry.coordinates) {
            flat.push(turf.polygon(rings, tagProps));
          }
        }
      }
      // Filter degenerate rings (very small or invalid)
      const cleaned = flat.filter((f) => {
        try { return turf.area(f) > 0; } catch { return false; }
      });
      return cleaned;
    };

    // Project lon/lat (deg) to Web Mercator meters for stable planar ops
    const R = 6378137.0;
    const lonLatToMerc = ([lon, lat]) => {
      const x = R * (lon * Math.PI / 180);
      const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
      return [x, y];
    };
    const mercToLonLat = ([x, y]) => {
      const lon = (x / R) * 180 / Math.PI;
      const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;
      return [lon, lat];
    };
    const projectCoords = (coords) => coords.map(pt => Array.isArray(pt[0]) ? projectCoords(pt) : lonLatToMerc(pt));
    const projectFeature = (feat) => {
      const g = feat.geometry;
      if (!g) return feat;
      if (g.type === 'Polygon') {
        return turf.polygon(projectCoords(g.coordinates), feat.properties || {});
      }
      if (g.type === 'MultiPolygon') {
        return turf.multiPolygon(projectCoords(g.coordinates), feat.properties || {});
      }
      return feat;
    };
    // Compute planar area in m^2 for projected Polygon/MultiPolygon
    const polygonRingArea = (ring) => {
      let sum = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
        sum += (xj * yi - xi * yj);
      }
      return Math.abs(sum) / 2;
    };
    const planarArea = (geom) => {
      if (!geom) return 0;
      const g = geom.type ? geom : { type: 'Polygon', coordinates: [] };
      if (g.type === 'Polygon') {
        const [outer, ...holes] = g.coordinates;
        let a = polygonRingArea(outer || []);
        for (const h of holes || []) a -= polygonRingArea(h);
        return Math.max(0, a);
      }
      if (g.type === 'MultiPolygon') {
        let a = 0;
        for (const poly of g.coordinates) {
          const [outer, ...holes] = poly;
          a += polygonRingArea(outer || []);
          for (const h of holes || []) a -= polygonRingArea(h);
        }
        return Math.max(0, a);
      }
      return 0;
    };

  const precinctParts = toCleanPolygonParts(precinctFeat.geometry, { name: precinctName });
    if (!precinctParts.length) throw new Error('Precinct geometry invalid after cleaning');
  // Project precinct parts to Mercator for robust clipping
  const precinctPartsMerc = precinctParts.map(projectFeature);
  // Merge parts for bbox purposes but keep array for per-part intersections
  const precinctPoly = precinctParts.length === 1 ? precinctParts[0] : turf.featureCollection(precinctParts);
    
  // Compute precinct area (sum of parts)
  // Compute precinct area in projected space (m^2)
  const precinctArea = precinctPartsMerc.reduce((acc, f) => acc + planarArea(f.geometry), 0);
    console.log(`[Precinct Area] ${precinctName}: ${precinctArea.toFixed(2)} m²`);
    if (!precinctArea) throw new Error('Zero precinct area');

    const areaByClass = [0,0,0,0,0];
    const countByClass = [0,0,0,0,0];
    let dznIntersectCount = 0;
    const intersections = [];
    
    console.log(`[Starting Intersection] Testing ${jobsFC.features?.length || 0} DZN features against ${precinctName}`);

    for (const f of (jobsFC.features || [])) {
      try {
        // Clean and flatten DZN geometry into polygon parts
        const dznParts = toCleanPolygonParts(f.geometry, { code: f.properties?.[codeProp] || '' });
        if (!dznParts.length) continue;
        const dznPartsMerc = dznParts.map(projectFeature);

        // Quick bbox precheck using overall precinct bbox vs each dzn part
        let accumArea = 0;
        for (let pi = 0; pi < precinctPartsMerc.length; pi++) {
          const pPartM = precinctPartsMerc[pi];
          const pB = turf.bbox(pPartM);
          for (let di = 0; di < dznPartsMerc.length; di++) {
            const dPartM = dznPartsMerc[di];
            const dB = turf.bbox(dPartM);
            const bboxOverlap = !(
              dB[2] < pB[0] || dB[0] > pB[2] || dB[3] < pB[1] || dB[1] > pB[3]
            );
            if (!bboxOverlap) continue;
            // Fast boolean intersects to skip costly intersect when disjoint
            let maybe;
            try { maybe = turf.booleanIntersects(pPartM, dPartM); } catch { maybe = true; }
            if (!maybe) continue;
            // Compute precise intersection
            let inter = null;
            try { inter = turf.intersect(pPartM, dPartM); } catch { inter = null; }
            if (!inter) continue;
            const aPart = (() => { try { return planarArea(inter.geometry) || 0; } catch { return 0; } })();
            if (aPart > 0) accumArea += aPart;
          }
        }
        if (accumArea <= 0) continue;
        const val = parseFloat(f.properties?.[jobsProp] ?? '0');
        const cls = jobsValueToClass(isFinite(val) ? val : 0);
        areaByClass[cls] += accumArea;
        countByClass[cls] += 1;
        dznIntersectCount += 1;
        const code = f.properties?.[codeProp] || '';
        intersections.push({
          code,
          value: isFinite(val) ? val : 0,
          classIndex: cls,
          classLabel: CLASS_LABELS[cls],
          area: accumArea,
          areaPct: accumArea / precinctArea
        });
      } catch (_) { /* skip invalid geometries */ }
    }

    const shareByClass = areaByClass.map(a => a / precinctArea);
    const classes = CLASS_LABELS.map((label, i) => ({ index: i, label, areaShare: shareByClass[i], count: countByClass[i] }))
      .filter(c => c.areaShare > 0);
    classes.sort((a,b) => b.areaShare - a.areaShare);
    intersections.sort((a,b) => b.areaPct - a.areaPct);
    const presentClasses = classes.map(c => c.label);
    
    // Debug log to verify spatial analysis
  console.log(`[Precinct Overlay] ${precinctName} (${year}):`);
  console.log(`  - Found ${dznIntersectCount} intersected DZN areas`);
  const totalInterArea = intersections.reduce((s,i)=>s+i.area,0);
  console.log(`  - Total intersection area: ${totalInterArea.toFixed(2)} m² (${(totalInterArea/precinctArea*100).toFixed(1)}% of precinct)`);
    console.log(`  - Classes present: ${presentClasses.join(', ')}`);
    console.log(`  - Top intersections:`, intersections.slice(0, 3).map(i => `${i.code} (${(i.areaPct*100).toFixed(1)}%, ${i.classLabel})`));
    
    return {
      precinct: precinctName,
      year,
      precinctArea,
      dznIntersectCount,
      intersections, // per-DZN with areaPct and class
      classes, // sorted by area share desc
      presentClasses,
      totals: { areaByClass, countByClass, precinctArea }
    };
  };

  // Deterministic precinct narrative generator (exact template, no LLM)
  const generatePrecinctNarrativeDeterministic = (stats) => {
    const { precinct, year, dznIntersectCount, classes } = stats || {};
    const hasData = Array.isArray(classes) && classes.length > 0;
    // Resolve spatial scale label from metadata when available; fallback to 'DZN'
    const meta = indicatorMetadata && indicatorMetadata['Number of jobs'];
    const spatialScaleFromMeta = meta && typeof meta['Spatial scale'] === 'string' ? meta['Spatial scale'] : '';
    let spatialScale = 'DZN';
    if (/\bDZN\b/i.test(spatialScaleFromMeta)) spatialScale = 'DZN';
    else if (/Destination\s*Zone/i.test(spatialScaleFromMeta)) spatialScale = 'Destination Zone (DZN)';

    const indicatorName = 'Number of jobs';

    if (!hasData) {
      return `The **${precinct}** precinct intersects with **0** **${spatialScale}** areas based on the **${year}** dataset. Within the precinct, the **${indicatorName}** classes include none. Therefore, the **${precinct}** precinct is dominantly characterized by a very low level of **${indicatorName}**.`;
    }

    // Helper formatters
    const fmtPct = (x) => {
      const n = (x || 0) * 100;
      const s = n.toFixed(1);
      return s.endsWith('.0') ? String(Math.round(n)) : s;
    };
    const joinList = (arr) => {
      if (!arr || !arr.length) return '';
      if (arr.length === 1) return arr[0];
      if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
      return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`;
    };

    // Classes are sorted by areaShare desc
    const presentLabels = classes.map((c) => `**${c.label}**`);
    const dominant = classes[0];
    const others = classes.slice(1);

    // Lead sentence per template
    const s1 = `The **${precinct}** precinct intersects with **${dznIntersectCount}** **${spatialScale}** area${dznIntersectCount === 1 ? '' : 's'} based on the **${year}** dataset.`;
    // Classes present
    const s2 = `Within the precinct, the **${indicatorName}** classes include ${joinList(presentLabels)}.`;
    // Dominant class coverage
    const s3 = `The “**${dominant.label}**” class covers **${fmtPct(dominant.areaShare)}%** of the precinct area.`;
    // Contrast sentence for other classes (if any)
    let s4 = '';
    if (others.length > 0) {
      const otherLabels = others.map((c) => `**${c.label}**`);
      const otherPcts = others.map((c) => `**${fmtPct(c.areaShare)}%**`);
      s4 = ` In contrast, ${joinList(otherLabels)} account for ${joinList(otherPcts)}, respectively.`;
    }
    // Therefore conclusion
    const s5 = ` Therefore, the **${precinct}** precinct is dominantly characterized by a **${dominant.label}** level of **${indicatorName}**.`;

    return `${s1} ${s2} ${s3}${s4}${s5}`;
  };

  const handleExportToPDF = async () => {
    if (!panelFocus || !map.current) return;
    setIsExporting(true);

    // The core of the fix is to wait for the 'idle' event.
    map.current.once('idle', async () => {
      try {
        // 1. Initialize jsPDF
        const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'px',
          format: 'a4'
        });

        // 2. Get map canvas image (now that the map is guaranteed to be ready)
        const mapImage = map.current.getCanvas().toDataURL('image/png');

        // 3. Get legend image (if it exists)
        let legendImage = null;
        if (selectedIndicator && legendRef.current) {
          const legendCanvas = await html2canvas(legendRef.current, {
            backgroundColor: null, // Make background transparent
            useCORS: true
          });
          legendImage = legendCanvas.toDataURL('image/png');
        }

        // 3b. Get chart image (if it exists and this is Number of jobs)
        let chartImage = null;
        let chartWidthPx = 0, chartHeightPx = 0;
        if (panelFocus && panelFocus.name === 'Number of jobs' && chartRef.current) {
          const chartCanvas = await html2canvas(chartRef.current, {
            backgroundColor: '#ffffff',
            useCORS: true
          });
          chartImage = chartCanvas.toDataURL('image/png');
          chartWidthPx = chartCanvas.width;
          chartHeightPx = chartCanvas.height;
        }

        // 4. Define PDF Layout
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        const contentWidth = pageWidth - (margin * 2);
        
        // 5. Add Content to PDF
        // --- Title & Subtitle ---
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Fishermans Bend Data Report', margin, margin);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'normal');
        doc.text(panelFocus.name, margin, margin + 25);
        
        const contentStartY = margin + 50;

        // --- Map Image (Left side) ---
        const mapAspectRatio = map.current.getCanvas().height / map.current.getCanvas().width;
        const mapWidth = contentWidth * 0.6; // Map takes 60% of width
        const mapHeight = mapWidth * mapAspectRatio;
        doc.addImage(mapImage, 'PNG', margin, contentStartY, mapWidth, mapHeight);

        // --- Text & Legend (Right side) ---
        const rightContentX = margin + mapWidth + 20;
        const rightContentWidth = contentWidth - mapWidth - 20;

        // --- Description Text ---
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const plainText = dynamicDescription.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove markdown
        const splitText = doc.splitTextToSize(plainText, rightContentWidth);
        doc.text(splitText, rightContentX, contentStartY);

        // --- Right column layout: Chart BELOW text and ABOVE legend (scale to fit on one page) ---
        const textHeight = doc.getTextDimensions(splitText).h;
        const rightYStart = contentStartY + textHeight + 20;
        const rightYEnd = pageHeight - margin;
        const availableRightHeight = Math.max(0, rightYEnd - rightYStart);

        // Base widths (respect right column width)
        const baseChartWidth = Math.min(200, rightContentWidth);
        const baseLegendWidth = Math.min(150, rightContentWidth);

        // Derive natural aspect ratios
        const chartAspect = chartHeightPx && chartWidthPx ? (chartHeightPx / chartWidthPx) : 0.6;
        // Prefer DOM size for legend aspect to avoid an extra canvas render
        const legendDom = legendRef.current;
        const legendAspectRatio = legendDom && legendDom.offsetWidth ? (legendDom.offsetHeight / legendDom.offsetWidth) : 0.6;

        // Natural heights at base widths
        const chartTitleHeight = chartImage ? 14 : 0; // space for chart title
        const chartGap = chartImage && legendImage ? 12 : 0; // gap between chart and legend
        const naturalChartHeight = chartImage ? baseChartWidth * chartAspect : 0;
        const naturalLegendHeight = legendImage ? baseLegendWidth * legendAspectRatio : 0;

        // Compute total height needed and scale factor to fit
        const totalNeeded = chartTitleHeight + naturalChartHeight + chartGap + naturalLegendHeight;
        const scale = totalNeeded > 0 ? Math.min(1, availableRightHeight / totalNeeded) : 1;

        let yCursor = rightYStart;
        if (chartImage) {
          const chartTitle = selectedDZNCode ? `Total jobs by year` : 'Total jobs by year';
          const chartW = baseChartWidth * scale;
          const chartH = naturalChartHeight * scale;
          doc.setFontSize(11);
          doc.text(chartTitle, rightContentX, yCursor - 6);
          doc.addImage(chartImage, 'PNG', rightContentX, yCursor, chartW, chartH);
          yCursor += chartH + (legendImage ? chartGap * scale : 0);
        }
        if (legendImage) {
          const legendW = baseLegendWidth * scale;
          const legendH = naturalLegendHeight * scale;
          doc.addImage(legendImage, 'PNG', rightContentX, yCursor, legendW, legendH);
          yCursor += legendH;
        }

        // 6. Save the PDF
        const filename = `report-${panelFocus.name.toLowerCase().replace(/ /g, '_')}.pdf`;
        doc.save(filename);

      } catch (error) {
        console.error("Error exporting to PDF:", error);
        alert("An error occurred while exporting the PDF. Please check the console for details.");
      } finally {
        setIsExporting(false);
      }
    }); // The entire process is wrapped in the 'idle' event listener
  };
  
  // Helper to render description with dynamic keywords (precincts + years)
  const renderInteractiveDescription = () => {
    const yearStrings = (panelFocus && panelFocus.name === 'Number of jobs' && availableYears.length)
      ? availableYears.map(y => String(y))
      : [];
    const keywords = [...PRECINCT_NAMES, ...yearStrings];
    const colors = { ...PRECINCT_COLORS };
    const onKwHover = (kw) => {
      if (!kw) {
        handlePrecinctHover(null);
        return;
      }
      if (PRECINCT_NAMES.includes(kw)) {
        handlePrecinctHover(kw);
      }
    };
    const onKwClick = (kw) => {
      if (yearStrings.includes(kw)) {
        setSelectedYear(parseInt(kw, 10));
      }
    };
    return (
      <InteractiveDescription
        text={dynamicDescription}
        keywords={keywords}
        colors={colors}
        onKeywordHover={onKwHover}
        onKeywordClick={onKwClick}
      />
    );
  };

  // --- RENDER METHOD ---
  return (
    <div style={{ display: 'flex', width: '100%', height: 'calc(100vh - 78px)' }}>
      {/* Map container */}
      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={mapContainer} style={{ position: 'absolute', width: '100%', height: '100%' }} />
        {/* === START: LEFT PANEL === */}
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', backgroundColor: 'white', padding: '1rem', borderRadius: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '288px', zIndex: 10 }}>
          
          {/* --- Search Functionality & Results --- */}
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>I'm interested in...</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="e.g., 'financial wellbeing' or 'jobs'" style={{ padding: '0.5rem', border: '1px solid #D1D5DB', borderRadius: '0.375rem', outline: 'none' }} />
              <button onClick={handleSearchClick} disabled={isSearching} style={{ backgroundColor: '#2563EB', color: 'white', fontWeight: 600, padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', opacity: isSearching ? 0.6 : 1 }}>
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            
            {/* Dynamic Search Results */}
            {searchError && <p style={{color: 'red', fontSize: '0.8rem', marginTop: '1rem'}}>{searchError}</p>}
            {showIndicators && indicators.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
                <h4 style={{ fontWeight: 600, color: '#1F2937', marginBottom: '0.5rem' }}>Suggested Indicators</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {indicators.slice(0, 3).map((item) => (
                    <div key={item.indicator} style={{ display: 'flex', alignItems: 'center' }}>
                      <input type="radio" id={item.indicator} name="indicator" checked={selectedIndicator === item.indicator} onChange={() => handleIndicatorSelect(item.indicator)} style={{ height: '1rem', width: '1rem' }} />
                      <label htmlFor={item.indicator} style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                        {item.indicator}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* === END: LEFT PANEL === */}
        {selectedIndicator && legendData[selectedIndicator] && (
          (() => {
            let items = legendData[selectedIndicator].items;
            if (selectedIndicator === 'Number of jobs') {
              const br = jobsBreaks && jobsBreaks.length === 4 ? jobsBreaks : [591, 1097, 1356, 2742];
              const maxV = jobsMax ?? 4127;
              const ranges = [
                { min: 0, max: br[0] },
                { min: br[0], max: br[1] },
                { min: br[1], max: br[2] },
                { min: br[2], max: br[3] },
                { min: br[3], max: maxV }
              ];
              items = ranges.map((b, i) => ({
                color: JOBS_PALETTE[i],
                label: `${Math.round(b.min).toLocaleString()} - ${Math.round(b.max).toLocaleString()} (${CLASS_LABELS[i]})`
              }));
            }
            return <Legend ref={legendRef} title={legendData[selectedIndicator].title} items={items} />;
          })()
        )}
      </div>
      {/* Text Explorer Panel */}
      <div style={{ width: '320px', backgroundColor: '#f8f9fa', padding: '1.5rem', borderLeft: '1px solid #dee2e6', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{flex: 1}}>
            {panelFocus ? (
            <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#495057', marginBottom: '0.75rem' }}>{panelFocus.name}</h4>
                {isDescriptionLoading ? (
                <p style={{ fontSize: '0.95rem', color: '#6c757d', fontStyle: 'italic' }}>🤖 Generating AI description...</p>
                ) : (
                  renderInteractiveDescription()
                )}
                {/* (chart moved to bottom section) */}
                {/* Year selector chips (click to switch) */}
                {((panelFocus.type === 'indicator' && panelFocus.name === 'Number of jobs') || panelFocus.type === 'precinct') && availableYears.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.9rem', color: '#495057', marginBottom: '0.25rem' }}>Select a year:</div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {availableYears.map((y) => {
                        const fallback = availableYears.includes(2011) ? 2011 : Math.max(...availableYears);
                        const isActive = (selectedYear || fallback) === y;
                        return (
                          <button
                            key={y}
                            onClick={() => setSelectedYear(y)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '16px',
                              border: isActive ? '2px solid #2563EB' : '1px solid #dee2e6',
                              backgroundColor: isActive ? '#eaf1fe' : '#ffffff',
                              cursor: 'pointer',
                              fontWeight: isActive ? 700 : 500
                            }}
                          >
                            {y}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
            ) : (
            <p style={{ fontSize: '0.95rem', color: '#6c757d', fontStyle: 'italic' }}>Select an indicator from the left panel or click on a precinct on the map to see its description.</p>
            )}
        </div>
        {/* DZN analytics: prefer selected (click) then hover for Number of jobs */}
        {panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Number of jobs' && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #dee2e6' }}>
            <div ref={chartRef}>
              {(selectedDZNJobs || hoveredDZNJobs) ? (
                (() => {
                  const src = selectedDZNJobs || hoveredDZNJobs;
                  const data = [
                    { year: 2011, value: src[2011] || 0 },
                    { year: 2016, value: src[2016] || 0 },
                    { year: 2021, value: src[2021] || 0 },
                  ];
                  const width = 260, height = 160, pad = { l: 64, r: 12, t: 12, b: 28 };

                  // Consistent axis domain across all charts/years: 0 -> global jobsMax
                  const fallbackMax = Math.max(1, ...data.map(d => d.value));
                  const axisMax = (jobsMax && isFinite(jobsMax)) ? jobsMax : fallbackMax;

                  const barW = (width - pad.l - pad.r) / data.length * 0.45;
                  const xStep = (width - pad.l - pad.r) / data.length;
                  const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - v / axisMax);
                  const dznLabel = selectedDZNCode || hoveredDZNCode;
                  const title = dznLabel ? `Total jobs by year` : 'Total jobs by year';
                  const yAxisLabel = (legendData['Total jobs'] && legendData['Total jobs'].title) || 'Total jobs (count)';
                  return (
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>{title}</div>
                      <svg width={width} height={height} style={{ background: '#fff', border: '1px solid #e9ecef', borderRadius: 6 }}>
                        <text x={pad.l - 44} y={height / 2} transform={`rotate(-90 ${pad.l - 44} ${height / 2})`} fontSize={11} textAnchor="middle" fill="#495057">{yAxisLabel}</text>
                        {Array.from({ length: 5 }).map((_, i) => {
                          const v = (axisMax / 4) * i; const y = yScale(v);
                          return (
                            <g key={i}>
                              <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="#f1f3f5" />
                              <text x={pad.l - 8} y={y + 4} fontSize={11} textAnchor="end" fill="#6c757d">{Math.round(v).toLocaleString()}</text>
                            </g>
                          );
                        })}
                        {data.map((d, idx) => (
                          <text key={`x-${d.year}`} x={pad.l + idx * xStep + xStep / 2} y={height - 6} fontSize={11} textAnchor="middle" fill="#6c757d">{d.year}</text>
                        ))}
                        {data.map((d, idx) => {
                          const x = pad.l + idx * xStep + (xStep - barW) / 2;
                          const y = yScale(d.value);
                          const h = height - pad.b - y;
                          const isActive = selectedYear === d.year;
                          const fill = isActive ? '#2563EB' : '#94a3b8';
                          return (
                            <g key={`b-${d.year}`}>
                              <rect x={x} y={y} width={barW} height={Math.max(0, h)} fill={fill} rx={3} />
                              <title>{`${d.year}: ${d.value.toLocaleString()}`}</title>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()
              ) : (
                <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>Click or hover a DZN on the map to see jobs over time.</div>
              )}
            </div>
          </div>
        )}

        {/* --- PDF Export Button --- */}
        {panelFocus && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #dee2e6' }}>
            <button 
              onClick={handleExportToPDF} 
              disabled={isExporting} 
              style={{ 
                backgroundColor: '#17A2B8', 
                color: 'white', 
                width: '100%',
                fontWeight: 600, 
                padding: '0.6rem 1rem', 
                borderRadius: '0.375rem', 
                border: 'none', 
                cursor: 'pointer', 
                opacity: isExporting ? 0.6 : 1 
              }}
            >
              {isExporting ? 'Exporting...' : 'Export to PDF'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
// --- END: MAP COMPONENT ---