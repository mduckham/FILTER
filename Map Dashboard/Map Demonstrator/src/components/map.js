import React, { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GoogleGenerativeAI } from '@google/generative-ai';
import indicatorMetadata from './indicatorMetadata'; // IMPORTED METADATA

// --- LLM API Setup ---
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);

// --- START: INTERACTIVE DESCRIPTION COMPONENT ---
// This component finds and styles specified keywords in a block of text.
const InteractiveDescription = ({ text, keywords, colors, onKeywordHover }) => {
  if (!text) return null;

  // Create a regex that matches either a keyword or a bolded section.
  const regex = new RegExp(`(${keywords.join('|')}|\\*\\*.+?\\*\\*)`, 'gi');
  const parts = text.split(regex).filter(part => part);

  return (
    <p style={{ fontSize: '0.95rem', color: '#6c757d', lineHeight: 1.6 }}>
      {parts.map((part, index) => {
        // First, check if the part is a bolded section.
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.substring(2, part.length - 2)}</strong>;
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
  const [indicators, setIndicators] = useState([]); // Will now store {indicator, score} objects
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const [showIndicators, setShowIndicators] = useState(false);
  const [panelFocus, setPanelFocus] = useState(null);
  const [dynamicDescription, setDynamicDescription] = useState('');
  const [isDescriptionLoading, setIsDescriptionLoading] = useState(false);
  const [textHoveredPrecinct, setTextHoveredPrecinct] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

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
    }
  };

  const indicatorConfig = {
    'Diversity of Education Qualification': { path: '/data/education-fb-sa1.geojson', property: 'Education-VIC_Total' },
    'Diversity of Income': { path: '/data/income-fb-sa1.geojson', property: 'Income-VIC1_Total' },
    'Diversity of Occupations': { path: '/data/occupation-fb-sa1.geojson', property: 'Occupation-VIC_Total' }
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
        { id: 'diversity-of-education-qualification-layer', indicatorName: 'Diversity of Education Qualification', source: 'education-data-source', property: indicatorConfig['Diversity of Education Qualification'].property, colors: legendData['Diversity of Education Qualification'].items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500]  },
        { id: 'diversity-of-income-layer', indicatorName: 'Diversity of Income', source: 'income-data-source', property: indicatorConfig['Diversity of Income'].property, colors: legendData['Diversity of Income'].items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500, 600, 700, 800] },
        { id: 'diversity-of-occupations-layer', indicatorName: 'Diversity of Occupations', source: 'occupation-data-source', property: indicatorConfig['Diversity of Occupations'].property, colors: legendData['Diversity of Occupations'].items.map(i => i.color), stops: [0, 100, 200, 300, 400, 500, 600, 700, 800] }
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
          }
        });
        map.current.on('mouseenter', layer.id, () => { map.current.getCanvas().style.cursor = 'pointer'; });
        map.current.on('mouseleave', layer.id, () => { map.current.getCanvas().style.cursor = ''; });
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
                const metadata = indicatorMetadata[name];

                if (!metadata) {
                    throw new Error(`Metadata is missing for the "${name}" indicator.`);
                }
                
                prompt = `You are an expert urban data analyst providing a summary for a public-facing dashboard about Melbourne's Fishermans Bend.
Your task is to generate a clear, descriptive summary for the "${name}" indicator based ONLY on the metadata provided below.

Use the following information to structure your response. Present it as a cohesive and easy-to-read paragraph, not as a list. **Crucially, when you incorporate a piece of metadata from the list below into your paragraph, you must make that specific value bold using Markdown (e.g., the goal is **An inclusive community**).**

- **Alignment with Goals**: This indicator aligns with Fishermans Bend's goal of: "${metadata["FB's goals"]}".
- **Measurement Method**: It is measured by this method: "${metadata["Note for measurement"]}".
- **Data Origin**: The data is sourced from "${metadata["Data sources"]}".
- **Geographic Coverage**: The data's spatial extent is "${metadata["Spatial extent"]}", presented at a "${metadata["Spatial scale"]}" level.
- **Timeliness**: The data is updated every "${metadata["Update frequency"]}". The current version is from "${metadata["Temporal currency"]}", and the historical data available covers the period "${metadata["Temporal extent"]}".

Synthesize this information into an engaging and informative paragraph of about 70-100 words. Start by explaining what this indicator is and why it's important for Fishermans Bend's goals. Then, provide context about the data itself. Remember to make all the specific metadata values bold in your final output. Do not invent or infer any data values, statistics, or trends.`;


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
        {/* === START: MODIFIED LEFT PANEL === */}
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
        {/* === END: MODIFIED LEFT PANEL === */}

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