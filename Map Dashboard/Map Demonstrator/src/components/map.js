import React, { useState, useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- LLM API Setup ---
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);

// --- START: INTERACTIVE DESCRIPTION COMPONENT ---
// This component finds and styles specified keywords in a block of text.
const InteractiveDescription = ({ text, keywords, colors, onKeywordHover }) => {
  const parts = useMemo(() => {
    if (!text || !keywords.length) {
      return [text];
    }
    const regex = new RegExp(`(${keywords.join('|')})`, 'gi');
    return text.split(regex).filter(part => part !== '');
  }, [text, keywords]);

  return (
    <p style={{ fontSize: '0.95rem', color: '#6c757d', lineHeight: 1.6 }}>
      {parts.map((part, index) => {
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
              onMouseLeave={() => onKeywordHover(null)} // Clear hover on exit
            >
              {part}
            </strong>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </p>
  );
};
// --- END: INTERACTIVE DESCRIPTION COMPONENT ---

// --- START: LEGEND COMPONENT ---
const Legend = ({ title, items }) => {
  return (
    <div style={{
      position: 'absolute',
      bottom: '1rem',
      right: '0rem',
      backgroundColor: 'white',
      padding: '1rem',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: 10,
      width: '180px'
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
};
// --- END: LEGEND COMPONENT ---


// --- START: MAP COMPONENT ---
export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const descriptionCache = useRef({});

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
  const [indicators, setIndicators] = useState([]);
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const [showIndicators, setShowIndicators] = useState(false);
  const [panelFocus, setPanelFocus] = useState(null);
  const [dynamicDescription, setDynamicDescription] = useState('');
  const [isDescriptionLoading, setIsDescriptionLoading] = useState(false);
  const [textHoveredPrecinct, setTextHoveredPrecinct] = useState(null);

  // Panel widths for map padding
  const leftPanelWidth = 288;
  const rightPanelWidth = 175;

  // --- DATA DEFINITIONS ---
  const legendData = {
    Employment: {
      title: 'Employment (Total)',
      items: [ { color: '#edf8e9', label: '0 - 100' }, { color: '#c7e9c0', label: '101 - 200' }, { color: '#a1d99b', label: '201 - 300' }, { color: '#74c476', label: '301 - 400' }, { color: '#31a354', label: '401 - 500' }, { color: '#006d2c', label: '> 500' } ]
    },
    Education: {
      title: 'Education (Total)',
      items: [ { color: '#fee5d9', label: '0 - 100' }, { color: '#fcbba1', label: '101 - 200' }, { color: '#fc9272', label: '201 - 300' }, { color: '#fb6a4a', label: '301 - 400' }, { color: '#ef3b2c', label: '401 - 500' }, { color: '#cb181d', label: '> 500' } ]
    },
    Income: {
        title: 'Income (Total)',
        items: [ { color: '#fcfbfd', label: '0 - 100' }, { color: '#efedf5', label: '101 - 200' }, { color: '#dadaeb', label: '201 - 300' }, { color: '#bcbddc', label: '301 - 400' }, { color: '#9e9ac8', label: '401 - 500' }, { color: '#807dba', label: '501 - 600' }, { color: '#6a51a3', label: '601 - 700' }, { color: '#54278f', label: '701 - 800' }, { color: '#3f007d', label: '> 800' } ]
    },
    Occupation: {
      title: 'Occupation (Total)',
      items: [ { color: '#f7fbff', label: '0 - 100' }, { color: '#deebf7', label: '101 - 200' }, { color: '#c6dbef', label: '201 - 300' }, { color: '#9ecae1', label: '301 - 400' }, { color: '#6baed6', label: '401 - 500' }, { color: '#4292c6', label: '501 - 600' }, { color: '#2171b5', label: '601 - 700' }, { color: '#08519c', label: '701 - 800' }, { color: '#08306b', label: '> 800' } ]
    }
  };

  const indicatorConfig = {
    Employment: { path: '/data/employment-fb-sa1.geojson', property: 'employment-VIC_Total' },
    Education: { path: '/data/education-fb-sa1.geojson', property: 'Education-VIC_Total' },
    Income: { path: '/data/income-fb-sa1.geojson', property: 'Income-VIC1_Total' },
    Occupation: { path: '/data/occupation-fb-sa1.geojson', property: 'Occupation-VIC_Total' }
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
    });

    map.current.on('error', (e) => console.error('A map error occurred:', e.error ? e.error.message : 'Unknown error'));

    map.current.on('load', () => {
      adjustMapBounds();

      const sources = [
        { name: 'base-outline', path: '/data/fb-sa1-2021-WGS84-boundary.geojson' },
        { name: 'employment', path: '/data/employment-fb-sa1.geojson' },
        { name: 'education', path: '/data/education-fb-sa1.geojson' },
        { name: 'pob', path: '/data/POB-fb-sa1.geojson' },
        { name: 'income', path: '/data/income-fb-sa1.geojson' },
        { name: 'occupation', path: '/data/occupation-fb-sa1.geojson' },
        { name: 'precincts', path: '/data/fb-precincts-official-boundary.geojson' },
      ];
      sources.forEach(s => map.current.addSource(`${s.name}-data-source`, { type: 'geojson', data: s.path }));

      const layers = [
        { id: 'employment-layer', indicatorName: 'Employment', source: 'employment-data-source', property: indicatorConfig.Employment.property, colors: legendData.Employment.items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500] },
        { id: 'education-layer', indicatorName: 'Education', source: 'education-data-source', property: indicatorConfig.Education.property, colors: legendData.Education.items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500]  },
        { id: 'income-layer', indicatorName: 'Income', source: 'income-data-source', property: indicatorConfig.Income.property, colors: legendData.Income.items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500, 600, 700, 800] },
        { id: 'occupation-layer', indicatorName: 'Occupation', source: 'occupation-data-source', property: indicatorConfig.Occupation.property, colors: legendData.Occupation.items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500, 600, 700, 800] }
      ];

      layers.forEach(layer => {
        const colorStops = layer.stops.flatMap((stop, i) => [stop, layer.colors[i] || layer.colors[layer.colors.length - 1]]);
        map.current.addLayer({
          id: layer.id, type: 'fill', source: layer.source, layout: { visibility: 'none' },
          paint: {
            'fill-color': ['interpolate', ['linear'], ['to-number', ['get', layer.property]], ...colorStops],
            'fill-opacity': 0.6
          }
        });
        map.current.on('click', layer.id, (e) => {
          const feature = e.features[0];
          if (feature) {
            const regionName = feature.properties['SA1_CODE21'];
            const value = feature.properties[layer.property];
            const formattedValue = !isNaN(value) ? Number(value).toLocaleString() : 'N/A';
            // new maplibregl.Popup()
            //   .setLngLat(e.lngLat)
            //   .setHTML(`<div style="font-family: sans-serif; padding: 5px; text-align: left;"><h4 style="margin: 0 0 5px 0; font-weight: bold;">SA1: ${regionName}</h4><strong>${layer.indicatorName}:</strong> ${formattedValue}</div>`)
            //   .addTo(map.current);
          }
        });
        map.current.on('mouseenter', layer.id, () => { map.current.getCanvas().style.cursor = 'pointer'; });
        map.current.on('mouseleave', layer.id, () => { map.current.getCanvas().style.cursor = ''; });
      });

      map.current.addLayer({
        id: 'base-outline-layer', type: 'line', source: 'base-outline-data-source',
        paint: { 'line-color': '#444', 'line-width': 0.2 }
      });

      map.current.addLayer({
        id: 'precincts-fill-layer', type: 'fill', source: 'precincts-data-source',
        paint: { 'fill-color': '#0868ac', 'fill-opacity': 0.15 }
      });
      map.current.addLayer({
        id: 'precincts-shadow-layer', type: 'line', source: 'precincts-data-source',
        paint: { 'line-color': 'rgba(0, 0, 0, 0.4)', 'line-width': 3, 'line-translate': [2, 2], 'line-blur': 2 }
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
    const allLayerIds = ['employment-layer', 'education-layer', 'pob-layer', 'income-layer', 'occupation-layer'];
    const selectedLayerId = selectedIndicator ? `${selectedIndicator.toLowerCase().replace(/ /g, '-')}-layer` : null;

    if (map.current.getLayer('base-outline-layer')) {
        map.current.setLayoutProperty('base-outline-layer', 'visibility', selectedIndicator ? 'visible' : 'none');
    }

    allLayerIds.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', layerId === selectedLayerId ? 'visible' : 'none');
      }
    });
  }, [selectedIndicator]);

  // Generate LLM description when panel focus changes
  useEffect(() => {
    if (!panelFocus) {
      setDynamicDescription('');
      setIsDescriptionLoading(false);
      return;
    }

    const generateDescription = async () => {
        setIsDescriptionLoading(true);
        setDynamicDescription('');
        const { type, name } = panelFocus;
        const cacheKey = `${type}_${name}`;

        if (descriptionCache.current[cacheKey]) {
            setDynamicDescription(descriptionCache.current[cacheKey]);
            setIsDescriptionLoading(false);
            return;
        }

        try {
            let prompt = '';
            if (type === 'indicator') {
                const config = indicatorConfig[name];
                if (!config || !config.property) {
                    throw new Error(`Configuration is missing for the "${name}" indicator.`);
                }
                const response = await fetch(config.path);
                const geojsonData = await response.json();
                let minFeature = null, maxFeature = null, sum = 0, count = 0;
                geojsonData.features.forEach(feature => {
                    if (feature && feature.properties && feature.properties.hasOwnProperty(config.property)) {
                        const value = Number(feature.properties[config.property]);
                        if (!isNaN(value)) {
                            if (minFeature === null || value < Number(minFeature.properties[config.property])) minFeature = feature;
                            if (maxFeature === null || value > Number(maxFeature.properties[config.property])) maxFeature = feature;
                            sum += value;
                            count++;
                        }
                    }
                });
                if (count === 0) { throw new Error(`No valid data found for "${name}".`); }
                const average = (sum / count).toFixed(2);
                const minValue = Number(minFeature.properties[config.property]);
                const maxValue = Number(maxFeature.properties[config.property]);
                const minRegion = minFeature.properties['SA1_CODE21'];
                const maxRegion = maxFeature.properties['SA1_CODE21'];
                prompt = `You are a concise data analyst for a public-facing dashboard. Based on the following data for the "${name}" indicator in Melbourne's inner suburbs, write a short, engaging summary (around 50-70 words). Do not just list the numbers; provide a brief insight into what the data shows (e.g., "a significant disparity," "a wide range," "a concentration of..."). Key Statistics: - Highest value: ${maxValue.toLocaleString()} (in SA1 area ${maxRegion}) - Lowest value: ${minValue.toLocaleString()} (in SA1 area ${minRegion}) - Average value across all areas: ${Number(average).toLocaleString()}`;
            } else if (type === 'precinct') {
                prompt = `You are a concise urban planning analyst. Write a short, engaging summary (around 60-80 words) about the "${name}" precinct within Melbourne's Fishermans Bend. Describe its key vision or main characteristics. If relevant, mention its relationship to the other precincts like Montague, Sandridge, and the Employment Precinct.`;
            }
            if (prompt) {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
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

  // Update map visual style when a precinct is highlighted from text
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const fillOpacity = textHoveredPrecinct
      ? ['case', ['==', ['get', 'name'], textHoveredPrecinct], 0.75, 0.1]
      : 0.15;
    map.current.setPaintProperty('precincts-fill-layer', 'fill-opacity', fillOpacity);

    const highlightFilter = textHoveredPrecinct
      ? ['==', 'name', textHoveredPrecinct]
      : ['==', 'name', ''];
    map.current.setFilter('precincts-highlight-outline-layer', highlightFilter);

  }, [textHoveredPrecinct]);

  // --- UI HANDLERS ---
  const handleSearchClick = () => {
    setIndicators(['Employment', 'Education', 'Income', 'Occupation']);
    setShowIndicators(true);
  };

  const handleIndicatorSelect = (indicator) => {
    const isCurrentlySelected = selectedIndicator === indicator;
    const newIndicator = isCurrentlySelected ? null : indicator;
    setSelectedIndicator(newIndicator);
    setPanelFocus(newIndicator ? { type: 'indicator', name: newIndicator } : null);
    setTextHoveredPrecinct(null);
  };

  const handlePrecinctHover = (precinctName) => {
    setTextHoveredPrecinct(precinctName);
  };

  // --- RENDER METHOD ---
  return (
    <div style={{ display: 'flex', width: '100%', height: 'calc(100vh - 78px)' }}>
      {/* Map container */}
      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={mapContainer} style={{ position: 'absolute', width: '100%', height: '100%' }} />
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', backgroundColor: 'white', padding: '1rem', borderRadius: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '288px', zIndex: 10 }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>I'm interested in ...</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="e.g., 'jobs' or 'housing'" style={{ padding: '0.5rem', border: '1px solid #D1D5DB', borderRadius: '0.375rem', outline: 'none' }} />
            <button onClick={handleSearchClick} style={{ backgroundColor: '#2563EB', color: 'white', fontWeight: 600, padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}>Search</button>
          </div>
          {showIndicators && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
              <h4 style={{ fontWeight: 600, color: '#1F2937', marginBottom: '0.5rem' }}>Suggested Indicators</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {indicators.map((indicator) => (
                  <div key={indicator} style={{ display: 'flex', alignItems: 'center' }}>
                    <input type="radio" id={indicator} name="indicator" checked={selectedIndicator === indicator} onChange={() => handleIndicatorSelect(indicator)} style={{ height: '1rem', width: '1rem' }} />
                    <label htmlFor={indicator} style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>{indicator}</label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {selectedIndicator && legendData[selectedIndicator] && <Legend title={legendData[selectedIndicator].title} items={legendData[selectedIndicator].items} />}
      </div>
      {/* Text Explorer Panel */}
      <div style={{ width: '320px', backgroundColor: '#f8f9fa', padding: '1.5rem', borderLeft: '1px solid #dee2e6', overflowY: 'auto' }}>
        {panelFocus ? (
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#495057', marginBottom: '0.75rem' }}>{panelFocus.name}</h4>
            {isDescriptionLoading ? (
              <p style={{ fontSize: '0.95rem', color: '#6c757d', fontStyle: 'italic' }}>🤖 Generating AI description...</p>
            ) : (
              <InteractiveDescription
                text={dynamicDescription}
                keywords={PRECINCT_NAMES}
                colors={PRECINCT_COLORS}
                onKeywordHover={handlePrecinctHover}
              />
            )}
          </div>
        ) : (
          <p style={{ fontSize: '0.95rem', color: '#6c757d', fontStyle: 'italic' }}>Select an indicator from the left panel or click on a precinct on the map to see its description.</p>
        )}
      </div>
    </div>
  );
}
// --- END: MAP COMPONENT ---