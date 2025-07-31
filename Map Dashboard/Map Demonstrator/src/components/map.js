import React, { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GoogleGenerativeAI } from '@google/generative-ai'; // Import the Google AI SDK

// --- LLM API Setup ---
// IMPORTANT: Store your API key in an environment variable.
// Create a .env.local file in your project root and add:
// REACT_APP_GEMINI_API_KEY='AIzaSyDUR-ANDhOe5fl_s7SBt9VPFQDuznLt8j8'
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);


// --- Legend Component ---
// A reusable component to display the map legend.
const Legend = ({ title, items }) => {
  return (
    <div style={{
      position: 'absolute',
      bottom: '2rem',
      right: '1rem',
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


// --- Map Component ---
// This version visualizes all five of your provided datasets.
export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);

  // State for the new search functionality
  const [searchText, setSearchText] = useState('');
  const [indicators, setIndicators] = useState([]);
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const [showIndicators, setShowIndicators] = useState(false);
  
  // State for the dynamically generated description
  const [dynamicDescription, setDynamicDescription] = useState('');
  const [isDescriptionLoading, setIsDescriptionLoading] = useState(false);

  // --- Data for the Legends ---
  const legendData = {
    Employment: {
      title: 'Employment (Total)',
      items: [ { color: '#edf8e9', label: '0 - 500' }, { color: '#c7e9c0', label: '501 - 1000' }, { color: '#a1d99b', label: '1001 - 1500' }, { color: '#74c476', label: '1501 - 2000' }, { color: '#31a354', label: '2001 - 2500' }, { color: '#006d2c', label: '> 2500' } ]
    },
    Education: {
      title: 'Education (Total)',
      items: [ { color: '#fee5d9', label: '0 - 250' }, { color: '#fcbba1', label: '251 - 500' }, { color: '#fc9272', label: '501 - 750' }, { color: '#fb6a4a', label: '751 - 1000' }, { color: '#ef3b2c', label: '1001 - 1500' }, { color: '#cb181d', label: '> 1500' } ]
    },
    'Place of Birth': {
      title: 'Place of Birth (Total)',
      items: [ { color: '#feedde', label: '0 - 500' }, { color: '#fdd0a2', label: '501 - 1000' }, { color: '#fdae6b', label: '1001 - 1500' }, { color: '#fd8d3c', label: '1501 - 2000' }, { color: '#f16913', label: '2001 - 2500' }, { color: '#d94801', label: '> 2500' } ]
    },
    Income: {
        title: 'Income (Total)',
        items: [ { color: '#f2f0f7', label: '0 - 500' }, { color: '#dadaeb', label: '500 - 1000' }, { color: '#bcbddc', label: '1000 - 2000' }, { color: '#9e9ac8', label: '2000 - 3000' }, { color: '#756bb1', label: '3000 - 3500' }, { color: '#54278f', label: '> 3500' } ]
    },
    Occupation: {
      title: 'Occupation (Total)',
      items: [ { color: '#f7fbff', label: '0 - 250' }, { color: '#deebf7', label: '251 - 500' }, { color: '#c6dbef', label: '501 - 750' }, { color: '#9ecae1', label: '751 - 1000' }, { color: '#6baed6', label: '1001 - 1500' }, { color: '#4292c6', label: '1501 - 2000' }, { color: '#2171b5', label: '2001 - 2500' }, { color: '#084594', label: '> 2500' } ]
    }
  };

  // --- Data configuration for each indicator ---
  const indicatorConfig = {
    Employment: { path: '/data/employment-fb-sa1.geojson', property: 'employment-VIC_Total' },
    Education: { path: '/data/education-fb-sa1.geojson', property: 'Education-VIC_Total' },
    'Place of Birth': { path: '/data/POB-fb-sa1.geojson', property: 'POB-VIC1_Total' },
    Income: { path: '/data/income-fb-sa1.geojson', property: 'Income-VIC1_Total' },
    Occupation: { path: '/data/occupation-fb-sa1.geojson', property: 'Occupation-VIC_Total' }
  };


  // --- Main useEffect for Map Initialization ---
  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      scrollZoom: false, boxZoom: false, dragRotate: false, dragPan: false,
      keyboard: false, doubleClickZoom: false, touchZoomRotate: false,
    });

    map.current.on('error', (e) => {
        console.error('A map error occurred:', e.error ? e.error.message : 'Unknown error');
    });

    map.current.on('load', () => {
      const bounds = [
        [144.888484, -37.853104],
        [144.956026, -37.814502 ]
      ];
      map.current.fitBounds(bounds, { padding: 20 });

      // --- Data Sources ---
      const sources = [
        { name: 'base-outline', path: '/data/fb-sa1-2021-WGS84.geojson' },
        { name: 'employment', path: '/data/employment-fb-sa1.geojson' },
        { name: 'education', path: '/data/education-fb-sa1.geojson' },
        { name: 'pob', path: '/data/POB-fb-sa1.geojson' },
        { name: 'income', path: '/data/income-fb-sa1.geojson' },
        { name: 'occupation', path: '/data/occupation-fb-sa1.geojson' },
      ];
      sources.forEach(s => {
        map.current.addSource(`${s.name}-data-source`, { type: 'geojson', data: s.path });
      });
      
      // Add the default outline layer, always visible
      map.current.addLayer({
        id: 'base-outline-layer',
        type: 'line',
        source: 'base-outline-data-source',
        paint: {
          'line-color': '#000',
          'line-width': 1.5
        }
      });

      // --- Indicator Layers ---
      const layers = [
        { id: 'employment-layer', indicatorName: 'Employment', source: 'employment-data-source', property: indicatorConfig.Employment.property, colors: legendData.Employment.items.map(i => i.color), stops: [0, 500, 1000, 1500, 2000, 2500] },
        { id: 'education-layer', indicatorName: 'Education', source: 'education-data-source', property: indicatorConfig.Education.property, colors: legendData.Education.items.map(i => i.color), stops: [0, 250, 500, 750, 1000, 1500] },
        { id: 'pob-layer', indicatorName: 'Place of Birth', source: 'pob-data-source', property: indicatorConfig['Place of Birth'].property, colors: legendData['Place of Birth'].items.map(i => i.color), stops: [0, 500, 1000, 1500, 2000, 2500] },
        { id: 'income-layer', indicatorName: 'Income', source: 'income-data-source', property: indicatorConfig.Income.property, colors: legendData.Income.items.map(i => i.color), stops: [0, 500, 1000, 2000, 3000, 3500] },
        { id: 'occupation-layer', indicatorName: 'Occupation', source: 'occupation-data-source', property: indicatorConfig.Occupation.property, colors: legendData.Occupation.items.map(i => i.color), stops: [0, 250, 500, 750, 1000, 1500, 2000, 2500] }
      ];

      layers.forEach(layer => {
        const colorStops = layer.stops.flatMap((stop, i) => [stop, layer.colors[i] || layer.colors[layer.colors.length - 1]]);
        map.current.addLayer({
          id: layer.id,
          type: 'fill',
          source: layer.source,
          layout: { visibility: 'none' },
          paint: {
            'fill-color': ['interpolate', ['linear'], ['to-number', ['get', layer.property]], ...colorStops],
            'fill-opacity': 0.75,
            'fill-outline-color': '#000'
          }
        });

        // Add click listener for each layer to show a popup
        map.current.on('click', layer.id, (e) => {
          const feature = e.features[0];
          if (feature) {
            const regionName = feature.properties['SA1_CODE21'];
            const value = feature.properties[layer.property];
            const formattedValue = !isNaN(value) ? Number(value).toLocaleString() : 'N/A';
            
            new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-family: sans-serif; padding: 5px; text-align: left;">
                  <h4 style="margin: 0 0 5px 0; font-weight: bold;">SA1: ${regionName}</h4>
                  <strong>${layer.indicatorName}:</strong> ${formattedValue}
                </div>
              `)
              .addTo(map.current);
          }
        });
        
        // Change cursor to pointer on hover
        map.current.on('mouseenter', layer.id, () => {
          map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', layer.id, () => {
          map.current.getCanvas().style.cursor = '';
        });
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // --- useEffect to Toggle Layer Visibility ---
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const allLayerIds = ['employment-layer', 'education-layer', 'pob-layer', 'income-layer', 'occupation-layer'];
    const selectedLayerId = selectedIndicator ? `${selectedIndicator.toLowerCase().replace(/ /g, '')}-layer` : null;

    allLayerIds.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', layerId === selectedLayerId ? 'visible' : 'none');
      }
    });
  }, [selectedIndicator]);
  
  // --- [REVISED] useEffect to generate description with the Gemini LLM ---
  useEffect(() => {
    if (!selectedIndicator) {
      setDynamicDescription('');
      return;
    }

    const generateLLMDescription = async () => {
      setIsDescriptionLoading(true);
      setDynamicDescription('');

      const config = indicatorConfig[selectedIndicator];
      if (!config) {
        setIsDescriptionLoading(false);
        return;
      }

      try {
        // Step 1: Fetch and analyze the data to get key statistics
        const response = await fetch(config.path);
        const geojsonData = await response.json();

        let minFeature = null;
        let maxFeature = null;
        let sum = 0;
        let count = 0;

        geojsonData.features.forEach(feature => {
          const value = Number(feature.properties[config.property]);
          if (!isNaN(value)) {
            if (minFeature === null || value < Number(minFeature.properties[config.property])) {
              minFeature = feature;
            }
            if (maxFeature === null || value > Number(maxFeature.properties[config.property])) {
              maxFeature = feature;
            }
            sum += value;
            count++;
          }
        });
        
        if (count === 0) {
            setDynamicDescription('No valid data found to generate a description.');
            setIsDescriptionLoading(false);
            return;
        }

        const average = (sum / count).toFixed(2);
        const minValue = Number(minFeature.properties[config.property]);
        const maxValue = Number(maxFeature.properties[config.property]);
        const minRegion = minFeature.properties['SA1_CODE21'];
        const maxRegion = maxFeature.properties['SA1_CODE21'];

        // Step 2: Create a prompt for the LLM
        const prompt = `
          You are a concise data analyst for a public-facing dashboard.
          Based on the following data for the "${selectedIndicator}" indicator in Melbourne's inner suburbs, write a short, engaging summary (around 50-70 words).
          Do not just list the numbers; provide a brief insight into what the data shows (e.g., "a significant disparity," "a wide range," "a concentration of...").
          
          Key Statistics:
          - Highest value: ${maxValue.toLocaleString()} (in SA1 area ${maxRegion})
          - Lowest value: ${minValue.toLocaleString()} (in SA1 area ${minRegion})
          - Average value across all areas: ${Number(average).toLocaleString()}
        `;

        // Step 3: Call the Gemini API
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent(prompt);
        const llmResponse = await result.response;
        const text = llmResponse.text();
        
        setDynamicDescription(text);

      } catch (error) {
        console.error("Error generating LLM description:", error);
        setDynamicDescription('An error occurred while generating the description. Please check your API key and network connection.');
      } finally {
        setIsDescriptionLoading(false);
      }
    };

    generateLLMDescription();
  }, [selectedIndicator]); // Re-run when selectedIndicator changes


  // --- UI Handlers ---
  const handleSearchClick = () => {
    setIndicators(['Employment', 'Education', 'Place of Birth', 'Income', 'Occupation']);
    setShowIndicators(true);
  };

  const handleIndicatorSelect = (indicator) => {
    setSelectedIndicator(prev => (prev === indicator ? null : indicator));
  };

  // --- Component Render ---
  return (
    <div style={{ display: 'flex', width: '100%', height: 'calc(100vh - 78px)' }}>
      {/* Map container on the left */}
      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={mapContainer} style={{ position: 'absolute', width: '100%', height: '100%' }} />

        {/* Search Panel */}
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', backgroundColor: 'white', padding: '1rem', borderRadius: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '288px', zIndex: 10 }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Indicator Search</h3>
          <p style={{ fontSize: '0.875rem', color: '#4B5563', marginBottom: '1rem' }}>Enter a topic to find relevant indicators.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="e.g., 'jobs' or 'housing'"
              style={{ padding: '0.5rem', border: '1px solid #D1D5DB', borderRadius: '0.375rem', outline: 'none' }}
            />
            <button
              onClick={handleSearchClick}
              style={{ backgroundColor: '#2563EB', color: 'white', fontWeight: 600, padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}
            >
              Search
            </button>
          </div>

          {showIndicators && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
              <h4 style={{ fontWeight: 600, color: '#1F2937', marginBottom: '0.5rem' }}>Suggested Indicators</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {indicators.map((indicator) => (
                  <div key={indicator} style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="radio"
                      id={indicator}
                      name="indicator"
                      checked={selectedIndicator === indicator}
                      onChange={() => handleIndicatorSelect(indicator)}
                      style={{ height: '1rem', width: '1rem' }}
                    />
                    <label htmlFor={indicator} style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                      {indicator}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Conditionally render the Legend */}
        {selectedIndicator && legendData[selectedIndicator] && (
          <Legend title={legendData[selectedIndicator].title} items={legendData[selectedIndicator].items} />
        )}
      </div>

      {/* Text Explorer Panel on the right */}
      <div style={{ width: '320px', backgroundColor: '#f8f9fa', padding: '1.5rem', borderLeft: '1px solid #dee2e6', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#343a40', marginBottom: '1rem' }}>
          Indicator Details
        </h3>
        {selectedIndicator ? (
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#495057', marginBottom: '0.75rem' }}>
              {selectedIndicator}
            </h4>
            {isDescriptionLoading ? (
              <p style={{ fontSize: '0.95rem', color: '#6c757d', fontStyle: 'italic' }}>
                🤖 Generating AI description...
              </p>
            ) : (
              <p style={{ fontSize: '0.95rem', color: '#6c757d', lineHeight: 1.6 }}>
                {dynamicDescription}
              </p>
            )}
          </div>
        ) : (
          <p style={{ fontSize: '0.95rem', color: '#6c757d', fontStyle: 'italic' }}>
            Select an indicator from the panel on the left to see its description.
          </p>
        )}
      </div>
    </div>
  );
}