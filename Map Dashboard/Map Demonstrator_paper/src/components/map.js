import React, { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';
import { GoogleGenerativeAI } from '@google/generative-ai';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import indicatorMetadata from './indicatorMetadata'; // IMPORTED METADATA
import * as turf from '@turf/turf';

// --- LLM API Setup ---
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);
const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000';

// --- START: INTERACTIVE DESCRIPTION COMPONENT ---
// This component finds and styles specified keywords in a block of text.
const InteractiveDescription = ({ text, keywords, colors, onKeywordHover, onKeywordClick, linkKeywords = [], pillKeywords = [], disabledKeywords = [] }) => {
  if (!text) return null;

  const isLinkKeyword = (kw) => {
    if (!kw) return false;
    return linkKeywords.some(lk => String(lk).toLowerCase() === String(kw).toLowerCase());
  };

  const isPillKeyword = (kw) => {
    if (!kw) return false;
    return pillKeywords.some(pk => String(pk).toLowerCase() === String(kw).toLowerCase());
  };

  const isDisabledKeyword = (kw) => {
    if (!kw) return false;
    return disabledKeywords.some(dk => String(dk).toLowerCase() === String(kw).toLowerCase());
  };

  // Split text into paragraphs by double newlines
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

  return (
    <div style={{ fontSize: '1rem', color: '#374151', lineHeight: 1.6, fontFamily: 'inherit' }}>
      {paragraphs.map((paragraph, paraIndex) => {
        if (paragraph.trim() === '---') {
          return (
            <hr
              key={paraIndex}
              style={{ border: 0, borderTop: '1px solid #E5E7EB', margin: '16px 0' }}
            />
          );
        }
        // Create a regex that matches either a keyword or a bolded section.
        const regex = new RegExp(`(${keywords.join('|')}|\\*\\*.+?\\*\\*)`, 'gi');
        const parts = paragraph.split(regex).filter(part => part);

        return (
          <p key={paraIndex} style={{ marginBottom: '1em' }}>
            {parts.map((part, index) => {
              // First, check if the part is a bolded section.
              if (part.startsWith('**') && part.endsWith('**')) {
                const inner = part.substring(2, part.length - 2);
                const kw = keywords.find(kw => kw.toLowerCase() === inner.toLowerCase());
                if (kw) {
                  const isYear = /^\d{4}$/.test(kw);

                  // If this keyword is disabled (e.g., current map year), show as plain text (not a link).
                  if (isDisabledKeyword(kw)) {
                    return (
                      <strong key={index} style={{ color: '#111827', fontWeight: 'bold' }}>
                        {inner}
                      </strong>
                    );
                  }

                  // Render selected keywords with the same "pill" look as available years.
                  if (isPillKeyword(kw)) {
                    return (
                      <a
                        key={index}
                        href="#"
                        style={{ color: 'black', backgroundColor: 'white', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: '2px 4px', borderRadius: '3px' }}
                        onMouseEnter={() => onKeywordHover(kw)}
                        onMouseLeave={() => onKeywordHover(null)}
                        onClick={(e) => { e.preventDefault(); onKeywordClick && onKeywordClick(kw); }}
                      >
                        {inner}
                      </a>
                    );
                  }

                  if (isYear) {
                    return (
                      <a
                        key={index}
                        href="#"
                        //style={{ color: '#111827', textDecoration: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                        style={{ color: 'black', backgroundColor: 'white', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: '2px 4px', borderRadius: '3px' }}

                        onClick={(e) => { e.preventDefault(); onKeywordClick && onKeywordClick(kw); }}
                      >
                        {inner}
                      </a>
                    );
                  }
                  // Treat bolded keywords as interactive too
                  if (isLinkKeyword(kw)) {
                    return (
                      <a
                        key={index}
                        href="#"
                        style={{ color: '#0b57d0', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
                        onMouseEnter={() => onKeywordHover(kw)}
                        onMouseLeave={() => onKeywordHover(null)}
                        onClick={(e) => { e.preventDefault(); onKeywordClick && onKeywordClick(kw); }}
                      >
                        {inner}
                      </a>
                    );
                  }
                  return (
                    <strong
                      key={index}
                      style={{
                        color: colors[kw] || '#000',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        padding: '2px 0'
                      }}
                      onMouseEnter={() => onKeywordHover(kw)}
                      onMouseLeave={() => onKeywordHover(null)}
                      onClick={() => onKeywordClick && onKeywordClick(kw)}
                    >
                      {inner}
                    </strong>
                  );
                }
                // If bolded text contains available years (e.g., "2011-2021"), make those year substrings clickable
                const yearRegex = /(19\d{2}|20\d{2})/g;
                const chunks = [];
                let lastIndex = 0; let m;
                while ((m = yearRegex.exec(inner)) !== null) {
                  const y = m[0];
                  // Push preceding text
                  if (m.index > lastIndex) chunks.push(inner.slice(lastIndex, m.index));
                  // If this year is in keywords (i.e., one of available years), make it a link; else keep as text
                  if (keywords.includes(y) && !isDisabledKeyword(y)) {
                    chunks.push(
                      <a
                        key={`b-${index}-${m.index}`}
                        href="#"
                        //style={{ color: '#111827', textDecoration: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                        style={{ color: 'black', backgroundColor: 'white', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: '2px 4px', borderRadius: '3px' }}

                        onClick={(e) => { e.preventDefault(); onKeywordClick && onKeywordClick(y); }}
                      >
                        {y}
                      </a>
                    );
                  } else {
                    chunks.push(y);
                  }
                  lastIndex = m.index + y.length;
                }
                if (lastIndex < inner.length) chunks.push(inner.slice(lastIndex));
                return (
                  <strong key={index}>
                    {chunks.length ? chunks : inner}
                  </strong>
                );
              }

              // Next, check if the part is an interactive keyword.
              const originalKeyword = keywords.find(kw => kw.toLowerCase() === part.toLowerCase());
              if (originalKeyword) {
                const isYear = /^\d{4}$/.test(originalKeyword);

                // If this keyword is disabled (e.g., current map year), show as plain text (not a link).
                if (isDisabledKeyword(originalKeyword)) {
                  return (
                    <strong key={index} style={{ color: '#111827', fontWeight: 'bold' }}>
                      {part}
                    </strong>
                  );
                }

                // Render selected keywords with the same "pill" look as available years.
                if (isPillKeyword(originalKeyword)) {
                  return (
                    <a
                      key={index}
                      href="#"
                      style={{ color: 'black', backgroundColor: 'white', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: '2px 4px', borderRadius: '3px' }}
                      onMouseEnter={() => onKeywordHover(originalKeyword)}
                      onMouseLeave={() => onKeywordHover(null)}
                      onClick={(e) => { e.preventDefault(); onKeywordClick && onKeywordClick(originalKeyword); }}
                    >
                      {part}
                    </a>
                  );
                }

                if (isYear) {
                  return (
                    <a
                      key={index}
                      href="#"
                      //style={{ color: '#111827', textDecoration: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                      style={{ color: 'black', backgroundColor: 'white', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: '2px 4px', borderRadius: '3px' }}

                      onClick={(e) => { e.preventDefault(); onKeywordClick && onKeywordClick(originalKeyword); }}
                    >
                      {part}
                    </a>
                  );
                }
                if (isLinkKeyword(originalKeyword)) {
                  return (
                    <a
                      key={index}
                      href="#"
                      style={{ color: '#0b57d0', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
                      onMouseEnter={() => onKeywordHover(originalKeyword)}
                      onMouseLeave={() => onKeywordHover(null)}
                      onClick={(e) => { e.preventDefault(); onKeywordClick && onKeywordClick(originalKeyword); }}
                    >
                      {part}
                    </a>
                  );
                }
                return (
                  <strong
                    key={index}
                    style={{
                      color: colors[originalKeyword] || '#000',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      padding: '2px 0'
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
      })}
    </div>
  );
};
// --- END: INTERACTIVE DESCRIPTION COMPONENT ---

const REGION_COLORS = {
  fishermans: '#0F766E',
  docklands: '#2563EB'
};

// --- START: LEGEND COMPONENT (MODIFIED FOR PDF EXPORT) ---
const Legend = React.forwardRef(({ title, items, narrative = '', comparisonChartData = null, placement = 'inline', topIndustriesByYear = null, selectedYear = null }, ref) => {
  const [windowSize, setWindowSize] = React.useState({ width: typeof window !== 'undefined' ? window.innerWidth : 1200, height: typeof window !== 'undefined' ? window.innerHeight : 800 });

  React.useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Dynamic sizing based on screen
  const isSmallScreen = windowSize.width < 1200;
  const isVerySmallScreen = windowSize.width < 900;
  const scaleFactor = isVerySmallScreen ? 0.75 : isSmallScreen ? 0.85 : 1;
  
  // Use full width when inline; cap width when floating
  const legendWidthValue = Math.min(300 * scaleFactor, windowSize.width * 0.30);
  const legendWidth = placement === 'inline' ? '100%' : `${legendWidthValue}px`;
  const legendMaxHeight = windowSize.height - 140;
  // Align legend font sizing with narrative text
  const baseFontSize = 16 * scaleFactor;
  const swatchSize = Math.round(16 * scaleFactor);
  const padding = 12 * scaleFactor;

  const isFloating = placement === 'floating';
  const containerStyle = isFloating
    ? {
        position: 'absolute',
        bottom: '2.5rem',
        right: '1rem',
        backgroundColor: 'white',
        padding: `${padding}px`,
        borderRadius: '0.5rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.12)',
        zIndex: 10,
        width: legendWidth,
        maxHeight: `${legendMaxHeight}px`,
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch'
      }
    : {
        position: 'relative',
        backgroundColor: 'white',
        padding: `${padding}px`,
        borderRadius: '0.5rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.12)',
        width: legendWidth,
        // Allow full content height in panel without internal scrolling
        maxHeight: 'none',
        overflowY: 'visible',
        overflowX: 'hidden'
      };

  return (
    <div ref={ref} style={{ ...containerStyle, fontFamily: 'inherit', color: '#374151' }}>
      {String(title || '').trim() ? (
        <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', fontSize: `${baseFontSize}px`, color: 'inherit', fontFamily: 'inherit' }}>{title}</h4>
      ) : null}
      {items.map((item, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: `${4 * scaleFactor}px` }}>
          <span style={{
            backgroundColor: item.color,
            width: `${swatchSize}px`,
            height: `${swatchSize}px`,
            display: 'inline-block',
            marginRight: `${6 * scaleFactor}px`,
            border: '1px solid #ccc',
            flexShrink: 0
          }}></span>
          <span style={{ fontSize: `${baseFontSize}px`, lineHeight: 1.6, color: 'inherit', fontFamily: 'inherit' }}>{item.label}</span>
        </div>
      ))}
      {narrative && (
        (() => {
          const paras = String(narrative).split(/\n\n+/).filter(p => p.trim().length);
          const isSpec = /specialisation/i.test(title) || !!topIndustriesByYear;
          const showFbNarrativeTitle = /Fishermans\s*Bend/i.test(String(narrative));
          const renderTopIndustries = () => {
            if (!isSpec || !topIndustriesByYear || !selectedYear) return null;
            const rows = topIndustriesByYear[selectedYear];
            if (!Array.isArray(rows) || rows.length === 0) return null;
            const sorted = [...rows].sort((a,b) => Number(b.pct||0) - Number(a.pct||0)).slice(0,5);
            const barHeight = Math.round(8 * scaleFactor);
            return (
              <div style={{ marginTop: `${10 * scaleFactor}px` }}>
                <div style={{ fontWeight: 600, color: '#111827', fontSize: `${baseFontSize}px`, marginBottom: `${6 * scaleFactor}px` }}>
                  Top 5 industries (% share) — {selectedYear}
                </div>
                <div style={{ display: 'grid', gap: `${6 * scaleFactor}px` }}>
                  {sorted.map((r) => {
                    const pct = Number(r.pct || 0);
                    // Visualize as proportion of 100% for consistency across years
                    const widthPct = Math.max(4, Math.min(100, Math.round(pct)));
                    return (
                      <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: `${8 * scaleFactor}px`, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: `${baseFontSize * 0.9}px`, color: '#111827', marginBottom: `${3 * scaleFactor}px` }}>{r.name}</div>
                          <div style={{ backgroundColor: '#E5E7EB', borderRadius: 999, height: barHeight, overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${widthPct}%`, backgroundColor: '#DC2626' }}></span>
                          </div>
                        </div>
                        <div style={{ fontSize: `${baseFontSize * 0.9}px`, color: '#374151', minWidth: Math.round(40 * scaleFactor), textAlign: 'right' }}>
                          {pct.toFixed(1).replace(/\.0$/, '')}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          };
          return (
            <div style={{
              marginTop: `${10 * scaleFactor}px`,
              borderTop: '1px solid #E5E7EB',
              paddingTop: `${8 * scaleFactor}px`
            }}>
              {showFbNarrativeTitle && (
                <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', fontSize: `${baseFontSize}px`, color: 'inherit', fontFamily: 'inherit' }}>Fishermans Bend Overview</h4>
              )}
              {/* First paragraph */}
              {paras[0] && (
                <p style={{
                  fontSize: `${baseFontSize}px`,
                  color: 'inherit',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  marginBottom: `${10 * scaleFactor}px`
                }}>
                  {paras[0]}
                </p>
              )}

              {/* Middle: Top industries chart (Industry specialisation only) */}
              {renderTopIndustries()}

              {/* Remaining paragraphs (e.g., comparison) */}
              {paras.slice(1).map((p, idx) => (
                <p key={idx} style={{
                  fontSize: `${baseFontSize}px`,
                  color: 'inherit',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  marginBottom: idx === paras.slice(1).length - 1 ? 0 : `${10 * scaleFactor}px`
                }}>
                  {p}
                </p>
              ))}
            </div>
          );
        })()
      )}
      {comparisonChartData && comparisonChartData.length > 0 && (
        null
      )}
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
  const legendExportRef = useRef(null); // Offscreen legend ref for PDF export
  const chartRef = useRef(null); // Ref for the jobs chart (for PDF export)
  const specChartRef = useRef(null); // Ref for the industry specialisation chart (for PDF export)
  const hoverStateBySource = useRef({}); // track hovered feature ids per source for outlines
  const selectedStateBySource = useRef({}); // track selected feature ids per source for outlines
  const jobsPopupRef = useRef(null); // popup for hover charts
  const precinctPopupRef = useRef(null); // popup for precinct name on hover

  // Definitions for interactive text highlighting
  const PRECINCT_NAMES = ['Montague', 'Sandridge', 'Lorimer', 'Wirraway', 'Employment Precinct'];
  const PRECINCT_COLORS = {
    // Match attached photo: Montague (cyan), Sandridge (orange), Lorimer (blue), Wirraway (green), Employment Precinct (red)
    'Montague': '#14b8a6',
    'Sandridge': '#f59e0b',
    'Lorimer': '#2563EB',
    'Wirraway': '#2ecc71',
    'Employment Precinct': '#e53935'
  };

  const PRECINCT_SUMMARIES = {
    'Montague': 'A diverse and well-connected mixed-use precinct celebrating its significant cultural and built heritage, and network of gritty streets and laneways',
    'Lorimer': 'A vibrant, mixed-use precinct close to the Yarra River and connected to Melbourne’s CBD, Docklands and emerging renewal areas',
    'Sandridge': 'One of Melbourne’s premium office and commercial centres, balanced with diverse housing and retail',
    'Wirraway': 'A predominantly family-friendly inner city neighbourhood close to the bay and Westgate Park',
    'Employment Precinct': 'Australia’s leading design, engineering and advanced manufacturing precinct'
  };

  const buildPrecinctColorExpression = () => {
    const expr = ['case'];
    PRECINCT_NAMES.forEach(name => {
      expr.push(['==', ['get', 'name'], name], PRECINCT_COLORS[name]);
    });
    expr.push('#CCC');
    return expr;
  };

  // Landing description for Fishermans Bend Framework (shown on first load in right panel)
  const LANDING_TEXT = `Fishermans Bend is Australia’s largest urban renewal precinct covering approximately 480 hectares in the heart of Melbourne. Fishermans Bend consists of five precincts across two municipalities – the City of Melbourne and the City of Port Phillip – and connects Melbourne's CBD to the bay. There are five distinct precincts in this area including:

1. **Employment Precinct**
2. **Lorimer**
3. **Wirraway**
4. **Sandridge**
5. **Montague**

---

To explore spatial indicators, search “jobs” in the search box and select Number of jobs to load the map and narrative.

Other examples:
- Land use mix
- Number of residents

---

{{PRECINCT_INFO}}`;

  // --- STATE MANAGEMENT ---
  const [searchText, setSearchText] = useState('');
  const [indicators, setIndicators] = useState([]); // Will now store {indicator, score} objects
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  // Keep current selectedIndicator for MapLibre event handlers (avoids stale closures)
  const selectedIndicatorRef = useRef(selectedIndicator);
  // Keep current selectedYear for MapLibre event handlers (avoids stale closures)
  const selectedYearRef = useRef(null);
  const [panelFocus, setPanelFocus] = useState(null);
  const [dynamicDescription, setDynamicDescription] = useState('');
  const [isDescriptionLoading, setIsDescriptionLoading] = useState(false);
  const [textHoveredPrecinct, setTextHoveredPrecinct] = useState(null);
  const [landingSelectedPrecinct, setLandingSelectedPrecinct] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isExporting, setIsExporting] = useState(false); // State for PDF export
  const [exportProgress, setExportProgress] = useState(0); // 0..100
  const [exportProgressText, setExportProgressText] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false); // Map style is loaded
  const [layersReady, setLayersReady] = useState(false); // All thematic layers added
  const [specDataError, setSpecDataError] = useState(false); // Industry specialisation file load error
  // Multi-year indicator support
  const [availableYears, setAvailableYears] = useState([]); // e.g., [2011, 2016, 2021]
  const [hoveredYear, setHoveredYear] = useState(null); // kept for precinct text hover only
  const [selectedYear, setSelectedYear] = useState(null); // persistent year selection
  // DZN selection and chart data
  const [selectedDZNPoint, setSelectedDZNPoint] = useState(null); // [lng, lat] (legacy selection - no longer used for UI)
  const [selectedDZNJobs, setSelectedDZNJobs] = useState(null); // legacy selection chart data (not shown)
  // Hover-driven chart data for DZN
  const [hoveredDZNJobs, setHoveredDZNJobs] = useState(null); // {2011:number,2016:number,2021:number}
  const [hoveredDZNSpec, setHoveredDZNSpec] = useState(null); // {2011:number,2016:number,2021:number}
  const [hoveredSA1Lum, setHoveredSA1Lum] = useState(null); // {2011:number,2016:number,2021:number}
  const [hoveredAgeMix, setHoveredAgeMix] = useState(null); // {2016:number,2021:number}
  const [hoveredIncomeMix, setHoveredIncomeMix] = useState(null); // {2016:number,2021:number}
  const [hoveredSocInfra, setHoveredSocInfra] = useState(null); // {2018:number,2021:number}
  const [hoveredHousingStress, setHoveredHousingStress] = useState(null); // {2018:number,2021:number}
  const [hoveredWalkability, setHoveredWalkability] = useState(null); // {2018:number,2021:number}
  const [hoveredMBCounts, setHoveredMBCounts] = useState(null); // {2011:{res,dwel},2016:{res,dwel},2021:{res,dwel}}
  const [hoveredDZNCode, setHoveredDZNCode] = useState('');
  const [jobsDataLoaded, setJobsDataLoaded] = useState(false);
  const jobsGeoByYear = useRef({}); // {2011: FeatureCollection, 2016: ..., 2021: ...}
  const specGeoByYear = useRef({}); // {2011: FeatureCollection, 2016: ..., 2021: ...}
  const [specDataReady, setSpecDataReady] = useState(false);
  const docklandsGeoByYear = useRef({});
  const [docklandsReady, setDocklandsReady] = useState(false);
  const [dznOptions, setDznOptions] = useState([]); // dropdown options from 2021
  const [selectedDZNCode, setSelectedDZNCode] = useState('');
  const dzn2021IndexRef = useRef({}); // code -> feature
  // Dynamic global classification (0 to global max across years)
  const [jobsBreaks, setJobsBreaks] = useState(null); // 4 thresholds for 5 classes
  const [jobsMax, setJobsMax] = useState(null);
  const [precinctNarrative, setPrecinctNarrative] = useState('');
  // (Removed) Info popover for indicator list

  // Panel widths for map padding
  // Increase left panel reserved width so legend/chart have room
  const leftPanelWidth = 240;
  const rightPanelWidth = 175;

  // --- DATA DEFINITIONS ---
  // Map UI indicator names to metadata keys where they differ
  const metadataKeyFor = (indicatorName) => {
    const aliases = {
      'Walkability': 'Walkability index'
    };
    return aliases[indicatorName] || indicatorName;
  };
  const legendData = {
  'Number of jobs': { title: 'Total jobs (count)', items: [] },
  'Industry specialisation': { title: 'Industry specialisation (index)', items: [] },
  'Land use mix': { title: 'Land use mix (index)', items: [] },
  'Number of residents': { title: 'Residents (count)', items: [] },
  'Number of dwellings': { title: 'Dwellings (count)', items: [] },
  'Number of residents_SA1': { title: 'Residents (count)', items: [] },
  'Diversity of residents’ age': { title: 'Age diversity (index)', items: [] }
  , 'Diversity of residents’ income': { title: 'Income diversity (index)', items: [] }
  , 'Accessibility of Social Infrastructure': { title: 'Social infrastructure accessibility (score)', items: [] }
  , 'Housing stress': { title: 'Housing stress (% households)', items: [] }
  , 'Walkability': { title: 'Walkability (score)', items: [] }
  };

  const indicatorConfig = {
  // Multi-year indicator uses separate sources per year; properties per dataset are provided below in layer configs
  'Number of jobs': { path: null, property: null },
  'Industry specialisation': { path: null, property: null },
  'Land use mix': { path: null, property: null },
  'Number of residents': { path: null, property: null },
  'Number of dwellings': { path: null, property: null },
  'Number of residents_SA1': { path: null, property: null },
  'Diversity of residents’ age': { path: null, property: null }
  , 'Diversity of residents’ income': { path: null, property: null }
  , 'Accessibility of Social Infrastructure': { path: null, property: null }
  , 'Housing stress': { path: null, property: null }
  , 'Walkability': { path: null, property: null }
  };

  const DEFAULT_JOBS_YEAR = 2021;

  useEffect(() => {
    selectedIndicatorRef.current = selectedIndicator;
  }, [selectedIndicator]);

  useEffect(() => {
    selectedYearRef.current = selectedYear;
  }, [selectedYear]);

  const getYearFromLayerId = (layerId) => {
    const m = String(layerId || '').match(/(2011|2016|2018|2021)/);
    return m ? parseInt(m[1], 10) : null;
  };

  // Keep precinct fill styling consistent between landing and indicator modes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const sourceId = 'precincts-data-source';
    const prev = hoverStateBySource.current[sourceId];
    if (prev !== undefined) {
      try { map.current.setFeatureState({ source: sourceId, id: prev }, { hover: false }); } catch (_) {}
      hoverStateBySource.current[sourceId] = undefined;
    }
    try { if (precinctPopupRef.current) { precinctPopupRef.current.remove(); precinctPopupRef.current = null; } } catch (_) {}

    // Indicator selected: subtle white fill for precincts
    if (selectedIndicator) {
      try {
        if (map.current.getLayer('precincts-fill-layer')) {
          map.current.setPaintProperty('precincts-fill-layer', 'fill-color', '#ffffffff');
          map.current.setPaintProperty('precincts-fill-layer', 'fill-opacity', 0.15);
        }
      } catch (_) { /* ignore */ }
      return;
    }

    // Landing: no fill for non-hovered precincts; hovered precinct gets its own color fill
    try {
      if (map.current.getLayer('precincts-fill-layer')) {
        map.current.setPaintProperty('precincts-fill-layer', 'fill-color', buildPrecinctColorExpression());
        map.current.setPaintProperty('precincts-fill-layer', 'fill-opacity', [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.35,
          0
        ]);
      }
    } catch (_) { /* ignore */ }
  }, [selectedIndicator]);

  // Landing: show Fishermans Bend Framework text in the right panel, but do not select any indicator
  useEffect(() => {
    setPanelFocus({ type: 'framework', name: 'Fishermans Bend Framework' });
    setDynamicDescription(LANDING_TEXT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preload Industry specialisation GeoJSONs for fast hover popups
  useEffect(() => {
    let canceled = false;
    const loadAll = async () => {
      try {
        const urls = {
          2011: '/data/Inudstry_Specialisation_DZN_11.geojson',
          2016: '/data/Inudstry_Specialisation_DZN_16.geojson',
          2021: '/data/Inudstry_Specialisation_DZN_21.geojson'
        };
        const entries = await Promise.all(Object.entries(urls).map(async ([yr, url]) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed to load spec ${yr}`);
          const json = await res.json();
          return [parseInt(yr, 10), json];
        }));
        if (!canceled) {
          entries.forEach(([yr, json]) => { specGeoByYear.current[yr] = json; });
          setSpecDataReady(true);
        }
      } catch (e) {
        // Non-fatal; hover popups will just be unavailable
        console.error('Failed to load industry specialisation GeoJSONs:', e);
        if (!canceled) setSpecDataReady(false);
      }
    };
    loadAll();
    return () => { canceled = true; };
  }, []);

  // Shared classes and palette for Number of jobs across all years
  const JOBS_BREAKS = [591, 1097, 1356, 2742, 3000];
  // Unified 5-class grayscale palette for all step-based indicators
  const JOBS_PALETTE = ['#f7f7f7','#d9d9d9','#bdbdbd','#969696','#636363'];
  const JOBS_YEAR_COLORS = { 2011: '#a50f15', 2016: '#08519c', 2021: '#006d2c' };
  // Industry specialisation: five equal classes across 0..1 => 4 thresholds
  const SPEC_BREAKS = [0.2, 0.4, 0.6, 0.8];
  const SPEC_PALETTE = ['#f7f7f7','#d9d9d9','#bdbdbd','#969696','#636363'];
  // Land use mix: also an index in [0..1], reuse equal intervals
  const LUM_BREAKS = [0.2, 0.4, 0.6, 0.8];
  const LUM_PALETTE = ['#f7f7f7','#d9d9d9','#bdbdbd','#969696','#636363'];
  // Social infrastructure: score range 0..16 → 5 equal classes
  const SOCINFRA_BREAKS = [3.2, 6.4, 9.6, 12.8];
  const SOCINFRA_PALETTE = ['#f7f7f7','#d9d9d9','#bdbdbd','#969696','#636363'];
  // Housing stress: percentage 0..100 → 5 equal classes (20 increments)
  const HOUSING_STRESS_BREAKS = [20, 40, 60, 80];
  const HOUSING_STRESS_PALETTE = ['#f7f7f7','#d9d9d9','#bdbdbd','#969696','#636363'];
  // Walkability (score): fixed classes and range per provided spec
  // Ranges: -2.8–-0.6, -0.6–1.5, 1.5–3.7, 3.7–5.8, 5.8–8.0
  const WALKABILITY_MIN = -2.8;
  const WALKABILITY_MAX = 8.0;
  const WALKABILITY_BREAKS = [-0.6, 1.5, 3.7, 5.8];
  const WALKABILITY_PALETTE = ['#f7f7f7','#d9d9d9','#bdbdbd','#969696','#636363'];
  // Residents/dwellings (MB) – counts based, five classes. Palette: white→red
  // Residents (MB) fixed classes per spec: 0–146, 146–293, 293–439, 439–586, 586–732
  const MB_DEFAULT_BREAKS = [146, 293, 439, 586];
  const MB_FIXED_MAX = 732;
  // White to red ramp (base + 4 classes)
  const MB_PALETTE = ['#f7f7f7','#d9d9d9','#bdbdbd','#969696','#636363'];
  const [mbBreaks, setMbBreaks] = useState(MB_DEFAULT_BREAKS);
  const [mbMax, setMbMax] = useState(MB_FIXED_MAX);
  // Dwellings (MB) fixed classes as requested: 0–84, 84–168, 168–253, 253–337, 337–421
  const DWELL_DEFAULT_BREAKS = [84, 168, 253, 337];
  const DWELL_FIXED_MAX = 421;
  const [dwellBreaks, setDwellBreaks] = useState(DWELL_DEFAULT_BREAKS);
  const [dwellMax, setDwellMax] = useState(DWELL_FIXED_MAX);
  // Residents (SA1) – dynamic classes computed from SA1 residents across years
  const [sa1ResBreaks, setSa1ResBreaks] = useState(null); // 4 thresholds for 5 classes
  const [sa1ResMax, setSa1ResMax] = useState(null);
  const fbBoundaryGeomsRef = useRef([]);
  const [fbBoundaryReady, setFbBoundaryReady] = useState(false);
  const [legendComparisonText, setLegendComparisonText] = useState('');
  const [legendComparisonChartData, setLegendComparisonChartData] = useState(null);
  // Top industries (% share) loader for Industry specialisation
  const [topIndustriesByYear, setTopIndustriesByYear] = useState(null);

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

  const isFeatureInsideFishermansBend = (feature) => {
    if (!feature || !feature.geometry) return false;
    if (!fbBoundaryGeomsRef.current.length) return true;
    const centroid = geomCentroid(feature.geometry);
    if (!centroid) return false;
    return fbBoundaryGeomsRef.current.some((geom) => pointInPolygonGeom(centroid, geom));
  };

  const computeRegionExtremes = (features, valueProp, valueToClassFn, filterFn) => {
    if (!Array.isArray(features) || !valueProp || typeof valueToClassFn !== 'function') return null;
    let min = null;
    let max = null;
    features.forEach((feat) => {
      if (!feat || !feat.properties) return;
      if (filterFn && !filterFn(feat)) return;
      const raw = parseFloat(feat.properties[valueProp]);
      if (!isFinite(raw)) return;
      const clsIdx = valueToClassFn(raw);
      const entry = {
        value: raw,
        classIndex: clsIdx,
        classLabel: CLASS_LABELS[clsIdx] || ''
      };
      if (!min || raw < min.value) min = entry;
      if (!max || raw > max.value) max = entry;
    });
    return (min && max) ? { min, max } : null;
  };

  const computeRegionClassDistribution = (features, valueProp, valueToClassFn, filterFn) => {
    if (!Array.isArray(features) || !valueProp || typeof valueToClassFn !== 'function') return null;

    // Approximate per-feature area from its geometry (Polygon/MultiPolygon),
    // using the outer ring and treating coordinates as planar. This is sufficient
    // for relative area shares within the same small region.
    const geomAreaApprox = (geom) => {
      if (!geom) return 0;
      if (geom.type === 'Polygon') {
        const outer = geom.coordinates && geom.coordinates[0];
        return outer ? Math.abs(ringArea(outer)) : 0;
      }
      if (geom.type === 'MultiPolygon') {
        let sum = 0;
        for (const poly of geom.coordinates || []) {
          const outer = poly && poly[0];
          if (outer) sum += Math.abs(ringArea(outer));
        }
        return sum;
      }
      return 0;
    };

    const totals = [0, 0, 0, 0, 0];
    let totalArea = 0;

    features.forEach((feat) => {
      if (!feat || !feat.properties || !feat.geometry) return;
      if (filterFn && !filterFn(feat)) return;
      const raw = parseFloat(feat.properties[valueProp]);
      if (!isFinite(raw)) return;
      const area = geomAreaApprox(feat.geometry);
      if (!area || area <= 0) return;
      const idx = valueToClassFn(raw);
      totals[idx] = (totals[idx] || 0) + area;
      totalArea += area;
    });

    if (!totalArea) return null;
    return totals.map((area) => ({
      // Keep the "count" field name for downstream compatibility; it now
      // represents area units rather than feature counts.
      count: area,
      share: area / totalArea
    }));
  };

  const pickShareExtremes = (distribution, type = 'max') => {
    if (!distribution) return null;
    const filtered = distribution
      .map((entry, idx) => ({ ...entry, index: idx }))
      .filter(entry => typeof entry.share === 'number' && entry.share >= 0);
    if (!filtered.length) return null;
    let targetShare = type === 'max'
      ? Math.max(...filtered.map(e => e.share))
      : Math.min(...filtered.map(e => e.share));
    // When looking for minima, ignore zero shares if there is at least one non-zero share
    if (type === 'min') {
      const nonZero = filtered.filter(e => e.share > 0);
      if (nonZero.length) {
        targetShare = Math.min(...nonZero.map(e => e.share));
        return nonZero
          .filter(e => Math.abs(e.share - targetShare) < 1e-6)
          .map(e => ({ label: CLASS_LABELS[e.index] || '', share: e.share || 0 }));
      }
    }
    return filtered
      .filter(e => Math.abs(e.share - targetShare) < 1e-6)
      .map(e => ({ label: CLASS_LABELS[e.index] || '', share: e.share || 0 }));
  };

  const formatIndicatorValue = (indicatorName, value) => {
    if (!isFinite(value)) return 'n/a';
    if (indicatorName === 'Number of jobs') {
      return `${Math.round(value).toLocaleString()} jobs`;
    }
    return value.toFixed(2);
  };

  const describeClassDifference = (fbLabel, dockLabel, positionPhrase) => {
    if (!fbLabel || !dockLabel) return '';
    if (fbLabel === dockLabel) {
      return `Both areas sit in the ${fbLabel} class ${positionPhrase}.`;
    }
    return `Fishermans Bend is in the ${fbLabel} class ${positionPhrase}, while Docklands reaches the ${dockLabel} class.`;
  };

  const buildLegendComparisonStats = (indicatorName, year) => {
    if (!indicatorName || !year) return null;
    const docklandsFC = docklandsGeoByYear.current[year];
    const fishermansFC = indicatorName === 'Number of jobs'
      ? jobsGeoByYear.current[year]
      : specGeoByYear.current[year];
    if (!docklandsFC || !fishermansFC) return null;
    const fishermansProp = indicatorName === 'Number of jobs'
      ? JOB_PROP_BY_YEAR[year]
      : SPEC_PROP_FB_BY_YEAR[year];
    const docklandsProp = indicatorName === 'Number of jobs'
      ? JOB_PROP_BY_YEAR[year]
      : SPEC_PROP_DOCK_BY_YEAR[year];
    if (!fishermansProp || !docklandsProp) return null;
    const valueToClassFn = indicatorName === 'Number of jobs' ? jobsValueToClass : specValueToClass;
    const fishermansStats = computeRegionExtremes(
      fishermansFC.features || [],
      fishermansProp,
      valueToClassFn,
      isFeatureInsideFishermansBend
    );
    const docklandsStats = computeRegionExtremes(
      docklandsFC.features || [],
      docklandsProp,
      valueToClassFn,
      null
    );
    const fishermansDistribution = computeRegionClassDistribution(
      fishermansFC.features || [],
      fishermansProp,
      valueToClassFn,
      isFeatureInsideFishermansBend
    );
    const docklandsDistribution = computeRegionClassDistribution(
      docklandsFC.features || [],
      docklandsProp,
      valueToClassFn,
      null
    );
    if (!fishermansStats || !docklandsStats || !fishermansDistribution || !docklandsDistribution) return null;
    const fbRange = `${formatIndicatorValue(indicatorName, fishermansStats.min.value)} (${fishermansStats.min.classLabel}) – ${formatIndicatorValue(indicatorName, fishermansStats.max.value)} (${fishermansStats.max.classLabel})`;
    const dockRange = `${formatIndicatorValue(indicatorName, docklandsStats.min.value)} (${docklandsStats.min.classLabel}) – ${formatIndicatorValue(indicatorName, docklandsStats.max.value)} (${docklandsStats.max.classLabel})`;
    const indicatorDescriptor = indicatorName === 'Number of jobs' ? 'job counts' : 'industry specialisation values';
    const lowCompare = describeClassDifference(fishermansStats.min.classLabel, docklandsStats.min.classLabel, 'at the low end');
    const highCompare = describeClassDifference(fishermansStats.max.classLabel, docklandsStats.max.classLabel, 'at the top end');
    const pct = (value) => `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
    const fbTop = pickShareExtremes(fishermansDistribution, 'max') || [];
    const dockTop = pickShareExtremes(docklandsDistribution, 'max') || [];
    const formatTopClasses = (entries) => {
      if (!entries.length) return { percentage: '0%', classNames: 'n/a' };
      const percentage = pct(entries[0].share);
      const classNames = entries.map(entry => entry.label).join(' and ');
      return { percentage, classNames };
    };
    const fbTopInfo = formatTopClasses(fbTop);
    const dockTopInfo = formatTopClasses(dockTop);
    const chart = CLASS_LABELS.map((label, idx) => ({
      label,
      fishermansShare: fishermansDistribution[idx]?.share ?? 0,
      fishermansCount: fishermansDistribution[idx]?.count ?? 0,
      docklandsShare: docklandsDistribution[idx]?.share ?? 0,
      docklandsCount: docklandsDistribution[idx]?.count ?? 0
    }));
    // --- New: Compute Fishermans Bend medians for 2011/2016/2021 and build a leading paragraph ---
    const yearsAll = [2011, 2016, 2021];
    const propByYear = indicatorName === 'Number of jobs' ? JOB_PROP_BY_YEAR : SPEC_PROP_FB_BY_YEAR;
    const fcByYear = indicatorName === 'Number of jobs' ? jobsGeoByYear.current : specGeoByYear.current;
    const median = (arr) => {
      const a = (arr || []).filter(v => typeof v === 'number' && isFinite(v)).sort((x,y)=>x-y);
      if (!a.length) return null;
      const mid = Math.floor(a.length/2);
      return a.length % 2 ? a[mid] : (a[mid-1] + a[mid]) / 2;
    };
    const fbMedians = {};
    yearsAll.forEach((yr) => {
      const fc = fcByYear[yr];
      const prop = propByYear[yr];
      if (!fc || !prop) { fbMedians[yr] = null; return; }
      const vals = (fc.features || [])
        .filter(f => isFeatureInsideFishermansBend(f))
        .map(f => parseFloat(f.properties?.[prop]))
        .filter(v => isFinite(v));
      fbMedians[yr] = median(vals);
    });
    const selectedMedian = fbMedians[year];
    const termForValue = (val) => {
      if (!isFinite(val)) return 'n/a';
      if (indicatorName === 'Industry specialisation') {
        if (val >= 0.8) return 'highly specialised';
        if (val >= 0.6) return 'specialised';
        if (val >= 0.4) return 'moderately specialised';
        return 'less specialised';
      }
      if (indicatorName === 'Number of jobs') {
        // Map median to qualitative term using equal quintile-ish buckets against jobsMax when available
        const maxV = (jobsMax && isFinite(jobsMax) && jobsMax > 0) ? jobsMax : Math.max(selectedMedian || 0, 1);
        const ratio = (selectedMedian || 0) / maxV;
        if (ratio >= 0.8) return 'very high';
        if (ratio >= 0.6) return 'high';
        if (ratio >= 0.4) return 'moderate';
        if (ratio >= 0.2) return 'low';
        return 'very low';
      }
      return 'n/a';
    };
    const fmt = (v) => indicatorName === 'Number of jobs' ? `${Math.round(v).toLocaleString()}` : `${Number(v).toFixed(2)}`;
    const med2011 = fbMedians[2011];
    const med2016 = fbMedians[2016];
    const med2021 = fbMedians[2021];
    const selectedYearLine = `In ${year}, Fishermans Bend precincts have median ${indicatorName.toLowerCase()}${indicatorName === 'Number of jobs' ? '' : ' index'} of ${isFinite(selectedMedian) ? fmt(selectedMedian) : 'n/a'}, which is classified as ${termForValue(selectedMedian)}.`;
    const changeLineParts = [];
    if (isFinite(med2011)) changeLineParts.push(`${fmt(med2011)} in 2011`);
    if (isFinite(med2016)) changeLineParts.push(`${fmt(med2016)} in 2016`);
    if (isFinite(med2021)) changeLineParts.push(`${fmt(med2021)} in 2021`);
    const changeLine = changeLineParts.length ? ` The median ${indicatorName.toLowerCase()}${indicatorName === 'Number of jobs' ? '' : ' index'} has changed from ${changeLineParts.join(' to ')}.` : '';
    const firstParagraph = `${selectedYearLine}${changeLine}`.trim();
    const indicatorLabel = indicatorName.toLowerCase();
    const secondParagraph = `In ${year}, ${fbTopInfo.percentage} of Fishermans Bend precincts are classified as ${fbTopInfo.classNames} ${indicatorLabel}, compared with ${dockTopInfo.percentage} of Docklands precincts are classified as ${dockTopInfo.classNames} ${indicatorLabel}.`.trim();
    return {
      text: `${firstParagraph}\n\n${secondParagraph}`,
      chart
    };
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

  useEffect(() => {
    let canceled = false;
    const loadBoundary = async () => {
      try {
        const res = await fetch('/data/fb-precincts-official-boundary.geojson');
        if (!res.ok) throw new Error('Failed to fetch Fishermans Bend boundary');
        const json = await res.json();
        if (!canceled) {
          const geoms = (json.features || []).map((f) => f.geometry).filter(Boolean);
          fbBoundaryGeomsRef.current = geoms;
          setFbBoundaryReady(geoms.length > 0);
        }
      } catch (e) {
        console.error('Failed to load Fishermans Bend boundary:', e);
        if (!canceled) setFbBoundaryReady(false);
      }
    };
    loadBoundary();
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    let canceled = false;
    const urls = {
      2011: '/data/Docklands_DZN_TotalJobs_IndustSpec_11.geojson',
      2016: '/data/Docklands_DZN_TotalJobs_IndustSpec_16.geojson',
      2021: '/data/Docklands_DZN_TotalJobs_IndustSpec_21.geojson'
    };
    const loadDocklands = async () => {
      try {
        const entries = await Promise.all(
          Object.entries(urls).map(async ([yr, url]) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to load Docklands ${yr}`);
            const json = await res.json();
            return [parseInt(yr, 10), json];
          })
        );
        if (!canceled) {
          const obj = {};
          entries.forEach(([yr, json]) => { obj[yr] = json; });
          docklandsGeoByYear.current = obj;
          setDocklandsReady(true);
        }
      } catch (e) {
        console.error('Failed to load Docklands comparison data:', e);
        if (!canceled) setDocklandsReady(false);
      }
    };
    loadDocklands();
    return () => { canceled = true; };
  }, []);

  // Preload Residents/Dwellings MB GeoJSONs; apply fixed breaks/palette for residents and dwellings counts
  useEffect(() => {
    let canceled = false;
    const loadAll = async () => {
      try {
        const urls = {
          2011: '/data/Number_of_Residents_and_Dwellings_MB_11.geojson',
          2016: '/data/Number_of_Residents_and_Dwellings_MB_16.geojson',
          2021: '/data/Number_of_Residents_and_Dwellings_MB_21.geojson'
        };
        const entries = await Promise.all(Object.entries(urls).map(async ([yr, url]) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed to load residents/dwellings ${yr}`);
          const json = await res.json();
          return [parseInt(yr, 10), json];
        }));
        if (!canceled) {
          // Apply fixed classes and max per spec for both residents and dwellings
          setMbBreaks(MB_DEFAULT_BREAKS);
          setMbMax(MB_FIXED_MAX);
          setDwellBreaks(DWELL_DEFAULT_BREAKS);
          setDwellMax(DWELL_FIXED_MAX);

          // If map is ready, update layer paint expressions separately
          const m = map.current;
          if (m && m.isStyleLoaded()) {
            const RES = [
              { id: 'number-of-residents-2011-layer', prop: 'Person_11' },
              { id: 'number-of-residents-2016-layer', prop: 'Person_16' },
              { id: 'number-of-residents-2021-layer', prop: 'Person_21' }
            ];
            const DWEL = [
              { id: 'number-of-dwellings-2011-layer', prop: 'Dwell_11' },
              { id: 'number-of-dwellings-2016-layer', prop: 'Dwel_16' },
              { id: 'number-of-dwellings-2021-layer', prop: 'Dwell_21' }
            ];
            RES.forEach(({ id, prop }) => {
              if (!m.getLayer(id)) return;
              const base = MB_PALETTE[0];
              const stepExpr = ['step', ['to-number', ['get', prop]], base];
              MB_DEFAULT_BREAKS.forEach((b, i) => { stepExpr.push(b, MB_PALETTE[i + 1] || MB_PALETTE[MB_PALETTE.length - 1]); });
              m.setPaintProperty(id, 'fill-color', stepExpr);
            });
            DWEL.forEach(({ id, prop }) => {
              if (!m.getLayer(id)) return;
              const base = MB_PALETTE[0];
              const stepExpr = ['step', ['to-number', ['get', prop]], base];
              DWELL_DEFAULT_BREAKS.forEach((b, i) => { stepExpr.push(b, MB_PALETTE[i + 1] || MB_PALETTE[MB_PALETTE.length - 1]); });
              m.setPaintProperty(id, 'fill-color', stepExpr);
            });
          }
        }
      } catch (e) {
        console.error('Failed to load residents/dwellings MB GeoJSONs:', e);
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

  // Reapply fixed breaks to MB paint once layers are ready (residents and dwellings)
  useEffect(() => {
    if (!layersReady || !map.current || !map.current.isStyleLoaded()) return;
    if (!mbBreaks || mbBreaks.length !== 4 || !dwellBreaks || dwellBreaks.length !== 4) return;
    try {
      const m = map.current;
      const RES = [
        { id: 'number-of-residents-2011-layer', prop: 'Person_11' },
        { id: 'number-of-residents-2016-layer', prop: 'Person_16' },
        { id: 'number-of-residents-2021-layer', prop: 'Person_21' }
      ];
      const DWEL = [
        { id: 'number-of-dwellings-2011-layer', prop: 'Dwell_11' },
        { id: 'number-of-dwellings-2016-layer', prop: 'Dwel_16' },
        { id: 'number-of-dwellings-2021-layer', prop: 'Dwell_21' }
      ];
      RES.forEach(({ id, prop }) => {
        if (!m.getLayer(id)) return;
        const base = MB_PALETTE[0];
        const stepExpr = ['step', ['to-number', ['get', prop]], base];
        mbBreaks.forEach((b, i) => { stepExpr.push(b, MB_PALETTE[i + 1] || MB_PALETTE[MB_PALETTE.length - 1]); });
        m.setPaintProperty(id, 'fill-color', stepExpr);
      });
      DWEL.forEach(({ id, prop }) => {
        if (!m.getLayer(id)) return;
        const base = MB_PALETTE[0];
        const stepExpr = ['step', ['to-number', ['get', prop]], base];
        dwellBreaks.forEach((b, i) => { stepExpr.push(b, MB_PALETTE[i + 1] || MB_PALETTE[MB_PALETTE.length - 1]); });
        m.setPaintProperty(id, 'fill-color', stepExpr);
      });
    } catch (_) { /* ignore */ }
  }, [layersReady, mbBreaks, dwellBreaks]);

  // Preload Residents (SA1) GeoJSON and compute dynamic breaks across years (0..global max)
  useEffect(() => {
    let canceled = false;
    const loadSa1Residents = async () => {
      try {
        const url = '/data/Number_of_Residents_and_Dwellings_SA1_11_16_21.geojson';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load SA1 residents');
        const fc = await res.json();
        // Compute global max across Person_11/16/21
        let globalMax = 0;
        (fc.features || []).forEach((f) => {
          const p11 = parseFloat(f.properties?.Person_11 ?? '0') || 0;
          const p16 = parseFloat(f.properties?.Person_16 ?? '0') || 0;
          const p21 = parseFloat(f.properties?.Person_21 ?? '0') || 0;
          globalMax = Math.max(globalMax, p11, p16, p21);
        });
        let maxV = Math.max(0, globalMax);

        // Guard against degenerate distributions (e.g., all zeros or missing values)
        if (!isFinite(maxV) || maxV <= 0) {
          const fallbackBreaks = [100, 200, 300, 400];
          if (!canceled) {
            setSa1ResBreaks(fallbackBreaks);
            setSa1ResMax(0);
          }
          // Nothing else to do; paint will use placeholders/fallbacks
          return;
        }

        // Equal-interval breaks across 0..maxV (5 classes -> 4 thresholds)
        const step = maxV / 5;
        let breaks = [step, 2 * step, 3 * step, 4 * step];
        // Ensure strictly increasing thresholds (protect against float quirks)
        const EPS = 1e-9;
        for (let i = 1; i < breaks.length; i++) {
          if (!(breaks[i] > breaks[i - 1])) {
            breaks[i] = breaks[i - 1] + EPS;
          }
        }
        if (!canceled) {
          setSa1ResBreaks(breaks);
          setSa1ResMax(maxV);
        }

        // If map is ready, update SA1 residents layer paints
        const m = map.current;
        if (m && m.isStyleLoaded()) {
          const L = [
            { id: 'number-of-residents_sa1-2011-layer', prop: 'Person_11' },
            { id: 'number-of-residents_sa1-2016-layer', prop: 'Person_16' },
            { id: 'number-of-residents_sa1-2021-layer', prop: 'Person_21' }
          ];
          L.forEach(({ id, prop }) => {
            if (!m.getLayer(id)) return;
            const base = MB_PALETTE[0];
            const stepExpr = ['step', ['to-number', ['get', prop]], base];
            breaks.forEach((b, i) => { stepExpr.push(b, MB_PALETTE[i + 1] || MB_PALETTE[MB_PALETTE.length - 1]); });
            m.setPaintProperty(id, 'fill-color', stepExpr);
          });
        }
      } catch (e) {
        console.error('Failed to prepare SA1 residents:', e);
      }
    };
    loadSa1Residents();
    return () => { canceled = true; };
  }, []);

  // Reapply SA1 residents breaks to paint once layers are ready or breaks computed
  useEffect(() => {
    if (!layersReady || !map.current || !map.current.isStyleLoaded()) return;
    if (!sa1ResBreaks || sa1ResBreaks.length !== 4) return;
    try {
      const m = map.current;
      const L = [
        { id: 'number-of-residents_sa1-2011-layer', prop: 'Person_11' },
        { id: 'number-of-residents_sa1-2016-layer', prop: 'Person_16' },
        { id: 'number-of-residents_sa1-2021-layer', prop: 'Person_21' }
      ];
      L.forEach(({ id, prop }) => {
        if (!m.getLayer(id)) return;
        const base = MB_PALETTE[0];
        const stepExpr = ['step', ['to-number', ['get', prop]], base];
        sa1ResBreaks.forEach((b, i) => { stepExpr.push(b, MB_PALETTE[i + 1] || MB_PALETTE[MB_PALETTE.length - 1]); });
        m.setPaintProperty(id, 'fill-color', stepExpr);
      });
    } catch (_) { /* ignore */ }
  }, [layersReady, sa1ResBreaks]);

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

  // Build an SVG string for the jobs chart (for popup), consistent with panel chart styles
  const buildJobsChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2011, value: vals[2011] || 0 },
      { year: 2016, value: vals[2016] || 0 },
      { year: 2021, value: vals[2021] || 0 },
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear] || 0 }])
      : dataAll;
  // Dimensions/padding: keep chart close to left while leaving space for y tick labels and title
  const width = 200, height = 170, pad = { l: 55, r: 10, t: 22, b: 46 };
    const fallbackMax = Math.max(1, ...data.map(d => d.value));
    const axisMax = (jobsMax && isFinite(jobsMax)) ? jobsMax : fallbackMax;
    const barW = (width - pad.l - pad.r) / data.length * 0.45;
    const xStep = (width - pad.l - pad.r) / data.length;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - (axisMax ? v / axisMax : 0));

    const yGrids = Array.from({ length: 5 }).map((_, i) => {
      const v = (axisMax / 4) * i; const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${Math.round(v).toLocaleString()}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;

  // x-axis tick labels (years)
  const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
  // x-axis title centered under tick labels
  const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;

    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
  const y = yScale(d.value);
  let h = Math.max(0, height - pad.b - y);
  // Ensure tiny non-zero bars remain visible
  if (d.value > 0 && h > 0 && h < 2) h = 2;
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${d.value.toLocaleString()}</title>\n      </g>`;
    }).join('');

    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <!-- y-axis title rotated and placed in left margin; moved further left to avoid tick value overlap -->\n      <text x="${pad.l - 44}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 44} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Total jobs (count)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Compute clicked point's industry specialisation across years by point-in-polygon search
  const computeSpecForPoint = (lng, lat) => {
    const pt = [lng, lat];
    const years = [2011, 2016, 2021];
    const propsByYear = { 2011: 'Special_11', 2016: 'Special_16', 2021: 'Special_21' };
    const out = {};
    years.forEach((yr) => {
      const fc = specGeoByYear.current[yr];
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

  // Build an SVG string for the industry specialisation chart (index 0..1)
  const buildSpecChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2011, value: vals[2011] ?? 0 },
      { year: 2016, value: vals[2016] ?? 0 },
      { year: 2021, value: vals[2021] ?? 0 },
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear] ?? 0 }])
      : dataAll;
    const width = 200, height = 170, pad = { l: 55, r: 10, t: 22, b: 46 };
    const axisMax = 1.0; // fixed scale for index
    const barW = (width - pad.l - pad.r) / data.length * 0.45;
    const xStep = (width - pad.l - pad.r) / data.length;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - (axisMax ? v / axisMax : 0));
    const ticks = [0, 0.25, 0.5, 0.75, 1.0];
    const yGrids = ticks.map(v => {
      const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${v.toFixed(2)}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;
    const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
    const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;
    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
      const y = yScale(d.value);
      let h = Math.max(0, height - pad.b - y);
      if (d.value > 0 && h > 0 && h < 2) h = 2;
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${d.value.toFixed(2)}</title>\n      </g>`;
    }).join('');
    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <text x="${pad.l - 44}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 44} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Industry specialisation (index)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Build an SVG string for the land use mix chart (index 0..1)
  const buildLumChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2011, value: vals[2011] ?? 0 },
      { year: 2016, value: vals[2016] ?? 0 },
      { year: 2021, value: vals[2021] ?? 0 },
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear] ?? 0 }])
      : dataAll;
    const width = 200, height = 170, pad = { l: 55, r: 10, t: 22, b: 46 };
    const axisMax = 1.0; // fixed scale for index
    const barW = (width - pad.l - pad.r) / data.length * 0.45;
    const xStep = (width - pad.l - pad.r) / data.length;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - (axisMax ? v / axisMax : 0));
    const ticks = [0, 0.25, 0.5, 0.75, 1.0];
    const yGrids = ticks.map(v => {
      const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${v.toFixed(2)}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;
    const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
    const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;
    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
      const y = yScale(d.value);
      let h = Math.max(0, height - pad.b - y);
      if (d.value > 0 && h > 0 && h < 2) h = 2;
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${Number(d.value || 0).toFixed(2)}</title>\n      </g>`;
    }).join('');
    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <text x="${pad.l - 44}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 44} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Land use mix (index)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Build an SVG string for age diversity (years 2016, 2021; index 0..1)
  const buildAgeMixChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2016, value: vals[2016] ?? 0 },
      { year: 2021, value: vals[2021] ?? 0 }
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear] ?? 0 }])
      : dataAll;
    const width = 200, height = 170, pad = { l: 55, r: 10, t: 22, b: 46 };
    const axisMax = 1.0;
    const barW = (width - pad.l - pad.r) / data.length * 0.45;
    const xStep = (width - pad.l - pad.r) / data.length;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - (axisMax ? v / axisMax : 0));
    const ticks = [0, 0.25, 0.5, 0.75, 1.0];
    const yGrids = ticks.map(v => {
      const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${v.toFixed(2)}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;
    const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
    const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;
    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
      const y = yScale(d.value);
      let h = Math.max(0, height - pad.b - y);
      if (d.value > 0 && h > 0 && h < 2) h = 2;
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${Number(d.value || 0).toFixed(2)}</title>\n      </g>`;
    }).join('');
    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <text x="${pad.l - 44}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 44} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Age diversity (index)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Build SVG for income diversity (mirror age diversity styling)
  const buildIncomeMixChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2016, value: vals[2016] ?? 0 },
      { year: 2021, value: vals[2021] ?? 0 }
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear] ?? 0 }])
      : dataAll;
    const width = 200, height = 170, pad = { l: 55, r: 10, t: 22, b: 46 };
    const axisMax = 1.0;
    const barW = (width - pad.l - pad.r) / data.length * 0.45;
    const xStep = (width - pad.l - pad.r) / data.length;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - (axisMax ? v / axisMax : 0));
    const ticks = [0, 0.25, 0.5, 0.75, 1.0];
    const yGrids = ticks.map(v => {
      const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${v.toFixed(2)}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;
    const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
    const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;
    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
      const y = yScale(d.value);
      let h = Math.max(0, height - pad.b - y);
      if (d.value > 0 && h > 0 && h < 2) h = 2;
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${Number(d.value || 0).toFixed(2)}</title>\n      </g>`;
    }).join('');
    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <text x="${pad.l - 44}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 44} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Income diversity (index)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Build SVG for Social Infrastructure accessibility (years 2018, 2021; score 0..16)
  const buildSocInfraChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2018, value: vals[2018] ?? 0 },
      { year: 2021, value: vals[2021] ?? 0 }
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear] ?? 0 }])
      : dataAll;
    const width = 200, height = 170, pad = { l: 55, r: 10, t: 22, b: 46 };
    const axisMax = 16.0;
    const barW = (width - pad.l - pad.r) / data.length * 0.45;
    const xStep = (width - pad.l - pad.r) / data.length;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - (axisMax ? v / axisMax : 0));
    const ticks = [0, 4, 8, 12, 16];
    const yGrids = ticks.map(v => {
      const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${v.toFixed(0)}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;
    const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
    const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;
    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
      const y = yScale(d.value);
      let h = Math.max(0, height - pad.b - y);
      if (d.value > 0 && h > 0 && h < 2) h = 2;
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${Number(d.value || 0).toFixed(2)}</title>\n      </g>`;
    }).join('');
    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <text x="${pad.l - 44}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 44} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Social infrastructure (score)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Build SVG for Housing stress (years 2018, 2021; percent 0..100)
  const buildHousingStressChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2018, value: vals[2018] ?? 0 },
      { year: 2021, value: vals[2021] ?? 0 }
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear] ?? 0 }])
      : dataAll;
    const width = 200, height = 170, pad = { l: 60, r: 10, t: 22, b: 46 };
    const axisMax = 100.0;
    const barW = (width - pad.l - pad.r) / data.length * 0.45;
    const xStep = (width - pad.l - pad.r) / data.length;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - (axisMax ? v / axisMax : 0));
    const ticks = [0, 20, 40, 60, 80, 100];
    const yGrids = ticks.map(v => {
      const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${v.toFixed(0)}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;
    const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
    const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;
    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
      const y = yScale(d.value);
      let h = Math.max(0, height - pad.b - y);
      if (d.value > 0 && h > 0 && h < 2) h = 2;
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${Number(d.value || 0).toFixed(2)}%</title>\n      </g>`;
    }).join('');
    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <text x="${pad.l - 48}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 48} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Housing stress (%)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Build SVG for Walkability (years 2018, 2021; fixed axis range with zero baseline and positive/negative bars)
  const buildWalkabilityChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2018, value: vals[2018] ?? 0 },
      { year: 2021, value: vals[2021] ?? 0 }
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear] ?? 0 }])
      : dataAll;
    const width = 200, height = 170, pad = { l: 55, r: 10, t: 22, b: 46 };
    // Fixed domain for chart display uses -3 to 8 (extends classification min slightly)
    const domainMin = -3.0;
    const domainMax = 8.0;
    const span = domainMax - domainMin;
    const barW = (width - pad.l - pad.r) / data.length * 0.45;
    const xStep = (width - pad.l - pad.r) / data.length;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - ((v - domainMin) / span));
    const baselineY = yScale(0);
    // Custom ticks: negatives (-3,-2,-1), zero, positives (0..8 by 2s except duplicate 0)
    const ticks = [-3,-2,-1,0,2,4,6,8];
    const yGrids = ticks.map(v => {
      const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${Number(v).toFixed(0)}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;
    const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
    const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;
    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
      const v = Number(d.value || 0);
      const yVal = yScale(v);
      let y, h;
      if (v >= 0) {
        // Positive bar: rise above baseline
        y = yVal;
        h = baselineY - yVal;
        if (v > 0 && h < 2) h = 2; // ensure visibility for tiny positives
      } else {
        // Negative bar: extend below baseline
        y = baselineY;
        h = yVal - baselineY;
        if (h < 2) h = 2; // minimal visible height for tiny negatives
      }
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      // Unified color scheme: active year blue, inactive neutral gray (no red for negatives)
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${Math.abs(h)}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${v.toFixed(1)}</title>\n      </g>`;
    }).join('');
    const baselineLine = `\n      <line x1="${pad.l}" x2="${width - pad.r}" y1="${baselineY}" y2="${baselineY}" stroke="#6b7280" stroke-width="1" />`;
    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <text x="${pad.l - 44}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 44} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Walkability (score)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${baselineLine}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Build an SVG for Residents (single series by year)
  const buildResidentsChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2011, value: vals[2011]?.res || 0 },
      { year: 2016, value: vals[2016]?.res || 0 },
      { year: 2021, value: vals[2021]?.res || 0 }
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear]?.res || 0 }])
      : dataAll;
    const width = 220, height = 180, pad = { l: 55, r: 14, t: 22, b: 46 };
    const fallbackMax = Math.max(1, ...data.map(d => d.value));
    // Use the best available max across MB and SA1 contexts so the chart scales sensibly in both cases
    const finiteCandidates = [mbMax, sa1ResMax, fallbackMax].filter(v => typeof v === 'number' && isFinite(v));
    const axisMax = finiteCandidates.length ? Math.max(...finiteCandidates) : fallbackMax;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - (axisMax ? v / axisMax : 0));
    const xStep = (width - pad.l - pad.r) / data.length;
    const barW = xStep * 0.45;
    const yGrids = Array.from({ length: 5 }).map((_, i) => {
      const v = (axisMax / 4) * i; const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${Math.round(v).toLocaleString()}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;
    const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
    const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;
    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
      const y = yScale(d.value);
      let h = Math.max(0, height - pad.b - y);
      if (d.value > 0 && h > 0 && h < 2) h = 2;
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${Math.round(d.value).toLocaleString()}</title>\n      </g>`;
    }).join('');
    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <text x="${pad.l - 44}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 44} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Residents (count)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Build an SVG for Dwellings (single series by year)
  const buildDwellingsChartSVG = (vals, year = null) => {
    if (!vals) return '';
    const activeYear = (year === null || typeof year === 'undefined') ? null : Number(year);
    const dataAll = [
      { year: 2011, value: vals[2011]?.dwel || 0 },
      { year: 2016, value: vals[2016]?.dwel || 0 },
      { year: 2021, value: vals[2021]?.dwel || 0 }
    ];
    const data = (activeYear && isFinite(activeYear))
      ? (dataAll.some(d => d.year === activeYear) ? dataAll.filter(d => d.year === activeYear) : [{ year: activeYear, value: vals[activeYear]?.dwel || 0 }])
      : dataAll;
    const width = 220, height = 180, pad = { l: 55, r: 14, t: 22, b: 46 };
    const fallbackMax = Math.max(1, ...data.map(d => d.value));
  const axisMax = (dwellMax && isFinite(dwellMax)) ? dwellMax : fallbackMax;
    const yScale = (v) => pad.t + (height - pad.t - pad.b) * (1 - (axisMax ? v / axisMax : 0));
    const xStep = (width - pad.l - pad.r) / data.length;
    const barW = xStep * 0.45;
    const yGrids = Array.from({ length: 5 }).map((_, i) => {
      const v = (axisMax / 4) * i; const y = yScale(v);
      return `\n      <g>\n        <line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="#f1f3f5" />\n        <text x="${pad.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#6c757d">${Math.round(v).toLocaleString()}</text>\n      </g>`;
    }).join('');
    const yAxisLine = `\n      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" stroke="#adb5bd" />`;
    const xLabels = data.map((d, idx) => `\n      <text x="${pad.l + idx * xStep + xStep / 2}" y="${height - 26}" font-size="12" text-anchor="middle" fill="#374151">${d.year}</text>`).join('');
    const xAxisTitle = `\n      <text x="${pad.l + (width - pad.l - pad.r) / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#495057">Year</text>`;
    const bars = data.map((d, idx) => {
      const x = pad.l + idx * xStep + (xStep - barW) / 2;
      const y = yScale(d.value);
      let h = Math.max(0, height - pad.b - y);
      if (d.value > 0 && h > 0 && h < 2) h = 2;
      const isActive = (activeYear && isFinite(activeYear)) ? (activeYear === d.year) : false;
      const fill = isActive ? '#2563EB' : '#94a3b8';
      return `\n      <g>\n        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="3" />\n        <title>${d.year}: ${Math.round(d.value).toLocaleString()}</title>\n      </g>`;
    }).join('');
    return `\n    <svg width="${width}" height="${height}" style="display:block;background:#fff;border:1px solid #e9ecef;border-radius:6px">\n      <text x="${pad.l - 44}" y="${(height - pad.b + pad.t) / 2}" transform="rotate(-90 ${pad.l - 44} ${(height - pad.b + pad.t) / 2})" font-size="11" text-anchor="middle" fill="#495057">Dwellings (count)</text>\n      ${yAxisLine}\n      ${yGrids}\n      ${xLabels}\n      ${xAxisTitle}\n      ${bars}\n    </svg>`;
  };

  // Refresh hover popup content when selected year changes.
  // We now show ONLY the currently visualised year in the hover popup.
  useEffect(() => {
    if (!jobsPopupRef.current) return;
    try {
      const popupYear = selectedYear && isFinite(Number(selectedYear)) ? Number(selectedYear) : null;
      const yearSuffix = popupYear ? ` — ${popupYear}` : '';
      let title = '';
      let svg = '';
      if (hoveredDZNJobs) {
        title = `Total jobs${yearSuffix}`;
        svg = buildJobsChartSVG(hoveredDZNJobs, popupYear);
      } else if (hoveredDZNSpec) {
        title = `Industry specialisation${yearSuffix}`;
        svg = buildSpecChartSVG(hoveredDZNSpec, popupYear);
      } else if (hoveredSA1Lum) {
        title = `Land use mix${yearSuffix}`;
        svg = buildLumChartSVG(hoveredSA1Lum, popupYear);
      } else if (hoveredMBCounts) {
        if (selectedIndicator === 'Number of dwellings') {
          title = `Dwellings${yearSuffix}`;
          svg = buildDwellingsChartSVG(hoveredMBCounts, popupYear);
        } else {
          title = `Residents${yearSuffix}`;
          svg = buildResidentsChartSVG(hoveredMBCounts, popupYear);
        }
      } else if (hoveredAgeMix) {
        title = `Age diversity${yearSuffix}`;
        svg = buildAgeMixChartSVG(hoveredAgeMix, popupYear);
      } else if (hoveredIncomeMix) {
        title = `Income diversity${yearSuffix}`;
        svg = buildIncomeMixChartSVG(hoveredIncomeMix, popupYear);
      } else if (hoveredSocInfra) {
        title = `Social infrastructure accessibility${yearSuffix}`;
        svg = buildSocInfraChartSVG(hoveredSocInfra, popupYear);
      } else if (hoveredHousingStress) {
        title = `Housing stress${yearSuffix}`;
        svg = buildHousingStressChartSVG(hoveredHousingStress, popupYear);
      } else if (hoveredWalkability) {
        title = `Walkability${yearSuffix}`;
        svg = buildWalkabilityChartSVG(hoveredWalkability, popupYear);
      } else {
        return;
      }
      const container = document.createElement('div');
      container.style.maxWidth = '280px';
      container.innerHTML = `\n        <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n        ${svg}\n      `;
      jobsPopupRef.current.setDOMContent(container);
    } catch (_) { /* ignore */ }
  }, [selectedYear, hoveredDZNJobs, hoveredDZNSpec, hoveredSA1Lum, hoveredMBCounts, hoveredAgeMix, hoveredIncomeMix, hoveredSocInfra, hoveredHousingStress, hoveredWalkability]);

  // --- HOOKS for Map Lifecycle & Effects ---

  // Main Map Initialization
  useEffect(() => {
    const headingEl = document.querySelector('.heading');
    if (headingEl) {
      const previousDisplay = headingEl.style.display;
      headingEl.style.display = 'none';
      return () => {
        headingEl.style.display = previousDisplay;
      };
    }
    return undefined;
  }, []);

  useEffect(() => { 
    if (map.current) return;
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      scrollZoom: false, boxZoom: false, dragRotate: false, dragPan: false,
      keyboard: false, doubleClickZoom: false, touchZoomRotate: false,
      // Required for exporting map canvas (MapLibre v3+ uses canvasContextAttributes)
      preserveDrawingBuffer: true,
      canvasContextAttributes: { preserveDrawingBuffer: true }
    });

    map.current.on('error', (e) => {
      const msg = e.error ? (e.error.message || String(e.error)) : 'Unknown error';
      console.error('A map error occurred:', msg);
      try {
        const m = String(msg);
        if (m.includes('Inudstry_Specialisation') || m.includes('Specialisation_DZN')) {
          // Flag industry specialisation data load issue so we can show a helpful UI note
          setSpecDataError(true);
        }
      } catch (_) { /* ignore */ }
    });

    map.current.on('load', () => {
      adjustMapBounds();
      setMapLoaded(true);
      // Add sources
      const sources = [
        { name: 'base-outline', path: '/data/fb-sa1-2021-WGS84-boundary.geojson' },
        // Removed legacy single-year SA1 sources: education, income, occupation
        { name: 'precincts', path: '/data/fb-precincts-official-boundary.geojson', promoteId: 'name' },
        // Number of jobs (DZN)
        { name: 'jobs-dzn-2011', path: '/data/Number_of_Jobs_DZN_11.geojson', promoteId: 'DZN_CODE11' },
        { name: 'jobs-dzn-2016', path: '/data/Number_of_Jobs_DZN_16.geojson', promoteId: 'DZN_CODE16' },
        { name: 'jobs-dzn-2021', path: '/data/Number_of_Jobs_DZN_21.geojson', promoteId: 'DZN_CODE21' },
        // Industry specialisation (DZN)
        { name: 'spec-dzn-2011', path: '/data/Inudstry_Specialisation_DZN_11.geojson', promoteId: 'DZN_CODE11' },
        { name: 'spec-dzn-2016', path: '/data/Inudstry_Specialisation_DZN_16.geojson', promoteId: 'DZN_CODE16' }, 
        { name: 'spec-dzn-2021', path: '/data/Inudstry_Specialisation_DZN_21.geojson', promoteId: 'DZN_CODE21' }
        ,
  // Land use mix (SA1, one file with all years properties)
  // Note: Property name in data is SA1_CODE_2, use that as promoteId for stable feature ids
  { name: 'land-use-mix', path: '/data/Land_Use_Mix__SA1_11_16_21.geojson', promoteId: 'SA1_CODE_2' }
    ,
    // Residents (SA1, one file with all years properties)
    { name: 'residents-sa1', path: '/data/Number_of_Residents_and_Dwellings_SA1_11_16_21.geojson', promoteId: 'SA1_CODE_2' }
    ,
    // Residents and Dwellings (MB)
    { name: 'mb-2011', path: '/data/Number_of_Residents_and_Dwellings_MB_11.geojson', promoteId: 'MB_CODE11' },
    { name: 'mb-2016', path: '/data/Number_of_Residents_and_Dwellings_MB_16.geojson', promoteId: 'MB_CODE16' },
    { name: 'mb-2021', path: '/data/Number_of_Residents_and_Dwellings_MB_21.geojson', promoteId: 'MB_CODE21' }
    ,
    // Age diversity (SA1)
    { name: 'age-mix', path: '/data/Age_Mix__SA1_16_21.geojson', promoteId: 'SA1_CODE_2' }
  ,
  // Income diversity (SA1 2016 & 2021)
  { name: 'income-mix', path: '/data/Income_Mix_SA1_16_21.geojson', promoteId: 'SA1_CODE_2' }
    ,
    // Accessibility of Social Infrastructure (SA1, 2018 & 2021)
    { name: 'social-infra', path: '/data/Social_Infrastructure_Index_SA1_18_21.geojson', promoteId: 'SA1_CODE_2' },
    // Housing stress (SA1, 2018 & 2021)
    { name: 'housing-stress', path: '/data/Housing_Stress_SA1_18_21.geojson', promoteId: 'SA1_CODE_2' }
    ,
    // Walkability (SA1, 2018 & 2021)
    { name: 'walkability', path: '/data/Walkability_SA1_16_21.geojson', promoteId: 'SA1_CODE_2' }
      ];
      sources.forEach(s => {
        const spec = { type: 'geojson', data: s.path };
        if (s.promoteId) spec.promoteId = s.promoteId;
        map.current.addSource(`${s.name}-data-source`, spec);
      });

      // Define layers including Number of jobs with requested bins/colors
      const layers = [
  // Use the same color palette and classes across years for better comparison
  { id: 'number-of-jobs-2011-layer', indicatorName: 'Number of jobs', source: 'jobs-dzn-2011-data-source', property: 'TotJob_11', type: 'step', breaks: JOBS_BREAKS, colors: JOBS_PALETTE },
  { id: 'number-of-jobs-2016-layer', indicatorName: 'Number of jobs', source: 'jobs-dzn-2016-data-source', property: 'TotJob_16', type: 'step', breaks: JOBS_BREAKS, colors: JOBS_PALETTE },
  { id: 'number-of-jobs-2021-layer', indicatorName: 'Number of jobs', source: 'jobs-dzn-2021-data-source', property: 'TotJob_21', type: 'step', breaks: JOBS_BREAKS, colors: JOBS_PALETTE },
  // Industry specialisation (five equal classes)
  { id: 'industry-specialisation-2011-layer', indicatorName: 'Industry specialisation', source: 'spec-dzn-2011-data-source', property: 'Special_11', type: 'step', breaks: SPEC_BREAKS, colors: SPEC_PALETTE },
  { id: 'industry-specialisation-2016-layer', indicatorName: 'Industry specialisation', source: 'spec-dzn-2016-data-source', property: 'Special_16', type: 'step', breaks: SPEC_BREAKS, colors: SPEC_PALETTE },
  { id: 'industry-specialisation-2021-layer', indicatorName: 'Industry specialisation', source: 'spec-dzn-2021-data-source', property: 'Special_21', type: 'step', breaks: SPEC_BREAKS, colors: SPEC_PALETTE }
  ,
  // Land use mix (five equal classes 0..1)
  { id: 'land-use-mix-2011-layer', indicatorName: 'Land use mix', source: 'land-use-mix-data-source', property: 'LUM_11', type: 'step', breaks: LUM_BREAKS, colors: LUM_PALETTE },
  { id: 'land-use-mix-2016-layer', indicatorName: 'Land use mix', source: 'land-use-mix-data-source', property: 'LUM_16', type: 'step', breaks: LUM_BREAKS, colors: LUM_PALETTE },
  { id: 'land-use-mix-2021-layer', indicatorName: 'Land use mix', source: 'land-use-mix-data-source', property: 'LUM_21', type: 'step', breaks: LUM_BREAKS, colors: LUM_PALETTE }
  ,
  // Age diversity (five equal classes 0..1, years 2016 & 2021)
  { id: 'diversity-of-residents-age-2016-layer', indicatorName: 'Diversity of residents’ age', source: 'age-mix-data-source', property: 'Age_Mix_16', type: 'step', breaks: LUM_BREAKS, colors: LUM_PALETTE },
  { id: 'diversity-of-residents-age-2021-layer', indicatorName: 'Diversity of residents’ age', source: 'age-mix-data-source', property: 'Age_Mix_21', type: 'step', breaks: LUM_BREAKS, colors: LUM_PALETTE }
  ,
  // Income diversity (index, 2016 & 2021) reuse same breaks/palette
  { id: 'diversity-of-residents-income-2016-layer', indicatorName: 'Diversity of residents’ income', source: 'income-mix-data-source', property: 'Inc_Mix_16', type: 'step', breaks: LUM_BREAKS, colors: LUM_PALETTE },
  { id: 'diversity-of-residents-income-2021-layer', indicatorName: 'Diversity of residents’ income', source: 'income-mix-data-source', property: 'Inc_Mix_21', type: 'step', breaks: LUM_BREAKS, colors: LUM_PALETTE }
  ,
  // Accessibility of Social Infrastructure (score 0..16; 2018 & 2021)
  { id: 'accessibility-of-social-infrastructure-2018-layer', indicatorName: 'Accessibility of Social Infrastructure', source: 'social-infra-data-source', property: 'SoInfra_18', type: 'step', breaks: SOCINFRA_BREAKS, colors: SOCINFRA_PALETTE },
  { id: 'accessibility-of-social-infrastructure-2021-layer', indicatorName: 'Accessibility of Social Infrastructure', source: 'social-infra-data-source', property: 'SoInfra_21', type: 'step', breaks: SOCINFRA_BREAKS, colors: SOCINFRA_PALETTE }
  ,
  // Housing stress (percent of households >30% income on housing; 0..100; 2018 & 2021)
  { id: 'housing-stress-2018-layer', indicatorName: 'Housing stress', source: 'housing-stress-data-source', property: 'HouStre_18', type: 'step', breaks: HOUSING_STRESS_BREAKS, colors: HOUSING_STRESS_PALETTE },
  { id: 'housing-stress-2021-layer', indicatorName: 'Housing stress', source: 'housing-stress-data-source', property: 'HouStre_21', type: 'step', breaks: HOUSING_STRESS_BREAKS, colors: HOUSING_STRESS_PALETTE }
  ,
  // Walkability (score; 2018 & 2021)
  { id: 'walkability-2018-layer', indicatorName: 'Walkability', source: 'walkability-data-source', property: 'Walkabi_18', type: 'step', breaks: WALKABILITY_BREAKS, colors: WALKABILITY_PALETTE },
  { id: 'walkability-2021-layer', indicatorName: 'Walkability', source: 'walkability-data-source', property: 'Walkabi_21', type: 'step', breaks: WALKABILITY_BREAKS, colors: WALKABILITY_PALETTE }
  ,
  // Number of residents (SA1)
  // Use safer placeholder breaks; dynamic breaks will be computed and applied after load
  { id: 'number-of-residents_sa1-2011-layer', indicatorName: 'Number of residents_SA1', source: 'residents-sa1-data-source', property: 'Person_11', type: 'step', breaks: [100,200,300,400], colors: MB_PALETTE },
  { id: 'number-of-residents_sa1-2016-layer', indicatorName: 'Number of residents_SA1', source: 'residents-sa1-data-source', property: 'Person_16', type: 'step', breaks: [100,200,300,400], colors: MB_PALETTE },
  { id: 'number-of-residents_sa1-2021-layer', indicatorName: 'Number of residents_SA1', source: 'residents-sa1-data-source', property: 'Person_21', type: 'step', breaks: [100,200,300,400], colors: MB_PALETTE }
  ,
  // Residents (counts) and Dwellings (counts)
  { id: 'number-of-residents-2011-layer', indicatorName: 'Number of residents', source: 'mb-2011-data-source', property: 'Person_11', type: 'step', breaks: MB_DEFAULT_BREAKS, colors: MB_PALETTE },
  { id: 'number-of-residents-2016-layer', indicatorName: 'Number of residents', source: 'mb-2016-data-source', property: 'Person_16', type: 'step', breaks: MB_DEFAULT_BREAKS, colors: MB_PALETTE },
  { id: 'number-of-residents-2021-layer', indicatorName: 'Number of residents', source: 'mb-2021-data-source', property: 'Person_21', type: 'step', breaks: MB_DEFAULT_BREAKS, colors: MB_PALETTE },
  { id: 'number-of-dwellings-2011-layer', indicatorName: 'Number of dwellings', source: 'mb-2011-data-source', property: 'Dwell_11', type: 'step', breaks: DWELL_DEFAULT_BREAKS, colors: MB_PALETTE },
  { id: 'number-of-dwellings-2016-layer', indicatorName: 'Number of dwellings', source: 'mb-2016-data-source', property: 'Dwel_16', type: 'step', breaks: DWELL_DEFAULT_BREAKS, colors: MB_PALETTE },
  { id: 'number-of-dwellings-2021-layer', indicatorName: 'Number of dwellings', source: 'mb-2021-data-source', property: 'Dwell_21', type: 'step', breaks: DWELL_DEFAULT_BREAKS, colors: MB_PALETTE }
      ];

      layers.forEach(layer => {
        // Fill paint
        let paint;
        if (layer.type === 'step') {
          const base = layer.colors && layer.colors.length ? layer.colors[0] : '#ffffff';
          const stepExpr = ['step', ['to-number', ['get', layer.property]], base];
          // For N breaks and N+1 colors, use colors[i+1] for the range >= break[i]
          layer.breaks.forEach((b, i) => { stepExpr.push(b, layer.colors[i + 1] || layer.colors[layer.colors.length - 1]); });
          // Make hovered area transparent for residents; otherwise keep default highlight opacity
          const fillOpacityExpr = [
            'case',
            ['any', ['boolean', ['feature-state', 'hover'], false], ['boolean', ['feature-state', 'selected'], false]],
            1,
            0.7
          ];
          paint = {
            'fill-color': stepExpr,
            'fill-opacity': fillOpacityExpr
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
          // paint: { 'line-color': '#666', 'line-width': 0.4, 'line-opacity': 0.7 }
          paint: { 'line-color': '#666', 'line-width': 1.0, 'line-opacity': 0.9 }

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
          layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#000',
            'line-width': (layer.indicatorName === 'Land use mix' || layer.indicatorName === 'Number of residents' || layer.indicatorName === 'Number of dwellings' || layer.indicatorName === 'Number of residents_SA1' || layer.indicatorName === 'Diversity of residents’ age' || layer.indicatorName === 'Diversity of residents’ income') ? 3.5 : 2.5,
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
          // Determine a stable feature id using promoted properties where applicable
          const getFeatureId = () => {
            if (typeof f.id !== 'undefined') return f.id;
            if (layer.indicatorName === 'Land use mix') {
              return f.properties?.SA1_CODE_2;
            }
            if (layer.indicatorName === 'Number of residents_SA1') {
              return f.properties?.SA1_CODE_2;
            }
            if (layer.indicatorName === 'Number of jobs' || layer.indicatorName === 'Industry specialisation') {
              const yearMatch = layer.id.match(/(2011|2016|2021)/);
              const yr = yearMatch ? parseInt(yearMatch[1], 10) : 2021;
              const codeProp = yr === 2011 ? 'DZN_CODE11' : yr === 2016 ? 'DZN_CODE16' : 'DZN_CODE21';
              return f.properties?.[codeProp];
            }
            return undefined;
          };
          const fid = getFeatureId();
          const prev = hoverStateBySource.current[sourceId];
          if (prev !== undefined) {
            try { map.current.setFeatureState({ source: sourceId, id: prev }, { hover: false }); } catch (_) {}
          }
          hoverStateBySource.current[sourceId] = fid;
          try { map.current.setFeatureState({ source: sourceId, id: fid }, { hover: true }); } catch (_) {}

          // If hovering over a Number of jobs layer, compute and show hover chart
          if (layer.indicatorName === 'Number of jobs') {
            try {
              const c = geomCentroid(f.geometry);
              if (c) {
                const vals = computeJobsForPoint(c[0], c[1]);
                setHoveredDZNJobs(vals);
                // Create/update a popup with the hover chart (no ID in title)
                const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
                const title = popupYear ? `Total jobs — ${popupYear}` : 'Total jobs';
                const svg = buildJobsChartSVG(vals, popupYear);
                const container = document.createElement('div');
                container.style.maxWidth = '280px';
                // do not set overflow here; CSS will enforce hidden to keep content within popup
                container.innerHTML = `\n                  <div style="font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px">${title}</div>\n                  ${svg}\n                `;
                if (!jobsPopupRef.current) {
                  jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                    .setLngLat(e.lngLat)
                    .setDOMContent(container)
                    .addTo(map.current);
                } else {
                  jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
                }
              }
              // Get the DZN code for label from current layer's year-specific property
              const yearMatch = layer.id.match(/(2011|2016|2021)/);
              const yr = yearMatch ? parseInt(yearMatch[1], 10) : null;
              const codeProp = yr === 2011 ? 'DZN_CODE11' : yr === 2016 ? 'DZN_CODE16' : 'DZN_CODE21';
              setHoveredDZNCode(f.properties?.[codeProp] || '');
            } catch (_) {
              // no-op
            }
          } else if (layer.indicatorName === 'Industry specialisation') {
            try {
              const c = geomCentroid(f.geometry);
              if (c) {
                const vals = computeSpecForPoint(c[0], c[1]);
                setHoveredDZNSpec(vals);
                setHoveredDZNJobs(null);
                setHoveredSA1Lum(null);
                const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
                const title = popupYear ? `Industry specialisation — ${popupYear}` : 'Industry specialisation';
                const svg = buildSpecChartSVG(vals, popupYear);
                const container = document.createElement('div');
                container.style.maxWidth = '280px';
                container.innerHTML = `\n                  <div style="font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px">${title}</div>\n                  ${svg}\n                `;
                if (!jobsPopupRef.current) {
                  jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                    .setLngLat(e.lngLat)
                    .setDOMContent(container)
                    .addTo(map.current);
                } else {
                  jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
                }
              }
            } catch (_) {
              // no-op
            }
          } else if (layer.indicatorName === 'Land use mix') {
            try {
              const vals = {
                2011: parseFloat(f.properties?.LUM_11 ?? '0') || 0,
                2016: parseFloat(f.properties?.LUM_16 ?? '0') || 0,
                2021: parseFloat(f.properties?.LUM_21 ?? '0') || 0,
              };
              setHoveredSA1Lum(vals);
              setHoveredDZNJobs(null);
              setHoveredDZNSpec(null);
              const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
              const title = popupYear ? `Land use mix — ${popupYear}` : 'Land use mix';
              const svg = buildLumChartSVG(vals, popupYear);
              const container = document.createElement('div');
              container.style.maxWidth = '280px';
              container.innerHTML = `\n                  <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                  ${svg}\n                `;
              if (!jobsPopupRef.current) {
                jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map.current);
              } else {
                jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
              }
            } catch (_) {
              // no-op
            }
          } else if (layer.indicatorName === 'Number of residents') {
            try {
              const c = geomCentroid(f.geometry);
              let centroidPoint = null;
              if (c) centroidPoint = { type: 'Point', coordinates: c };

              // For popup trends, treat 0 as a real value (not "missing") and always render 2011/2016/2021.
              // MB codes change by census year, so we sample each year's MB dataset at the hovered feature's centroid.
              const pointInPoly = (pt, poly) => {
                const [x, y] = pt.coordinates;
                let inside = false;
                const coords = poly.type === 'Polygon' ? [poly.coordinates] : poly.coordinates;
                coords.forEach(rings => {
                  const ring = rings[0];
                  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                    const xi = ring[i][0], yi = ring[i][1];
                    const xj = ring[j][0], yj = ring[j][1];
                    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
                    if (intersect) inside = !inside;
                  }
                });
                return inside;
              };

              const safeNum = (raw) => {
                const n = Number(raw);
                return (raw === null || typeof raw === 'undefined' || !isFinite(n)) ? 0 : n;
              };

              const readMbResidentsAtCentroid = (sourceId, propName) => {
                try {
                  if (!centroidPoint) return null;
                  const src = map.current.getSource(sourceId);
                  const fc = src && src._data ? src._data : null;
                  if (!fc || !Array.isArray(fc.features)) return null;
                  for (const feat of fc.features) {
                    if (!feat || !feat.geometry) continue;
                    if (pointInPoly(centroidPoint, feat.geometry)) {
                      return safeNum(feat.properties?.[propName]);
                    }
                  }
                } catch (_) { /* ignore */ }
                return null;
              };

              const v11 = readMbResidentsAtCentroid('mb-2011-data-source', 'Person_11');
              const v16 = readMbResidentsAtCentroid('mb-2016-data-source', 'Person_16');
              const v21 = readMbResidentsAtCentroid('mb-2021-data-source', 'Person_21');

              const vals = {
                2011: { res: (v11 === null ? safeNum(f.properties?.Person_11) : v11) },
                2016: { res: (v16 === null ? safeNum(f.properties?.Person_16) : v16) },
                2021: { res: (v21 === null ? safeNum(f.properties?.Person_21) : v21) }
              };

              setHoveredMBCounts(vals);
              setHoveredDZNJobs(null);
              setHoveredDZNSpec(null);
              setHoveredSA1Lum(null);
              const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
              const title = popupYear ? `Residents — ${popupYear}` : 'Residents';
              const svg = buildResidentsChartSVG(vals, popupYear);
              const container = document.createElement('div');
              container.style.maxWidth = '280px';
              container.innerHTML = `\n                  <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                  ${svg}\n                `;
              if (!jobsPopupRef.current) {
                jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map.current);
              } else {
                jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
              }
            } catch (_) {
              // no-op
            }
          } else if (layer.indicatorName === 'Number of residents_SA1') {
            try {
              const vals = {
                2011: { res: parseFloat(f.properties?.Person_11 ?? '0') || 0 },
                2016: { res: parseFloat(f.properties?.Person_16 ?? '0') || 0 },
                2021: { res: parseFloat(f.properties?.Person_21 ?? '0') || 0 }
              };
              setHoveredMBCounts(vals);
              setHoveredDZNJobs(null);
              setHoveredDZNSpec(null);
              setHoveredSA1Lum(null);
              const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
              const title = popupYear ? `Residents — ${popupYear}` : 'Residents';
              const svg = buildResidentsChartSVG(vals, popupYear);
              const container = document.createElement('div');
              container.style.maxWidth = '280px';
              container.innerHTML = `\n                  <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                  ${svg}\n                `;
              if (!jobsPopupRef.current) {
                jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map.current);
              } else {
                jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
              }
            } catch (_) {
              // no-op
            }
          } else if (layer.indicatorName === 'Number of dwellings') {
            try {
              const c = geomCentroid(f.geometry);
              let centroidPoint = null;
              if (c) centroidPoint = { type: 'Point', coordinates: c };

              // MB codes change by census year, so we sample each year's MB dataset at the hovered feature's centroid.
              // This ensures 2016 dwellings come from the 2016 dataset (property: Dwel_16), not from the 2021 feature.
              const pointInPoly = (pt, poly) => {
                const [x, y] = pt.coordinates;
                let inside = false;
                const coords = poly.type === 'Polygon' ? [poly.coordinates] : poly.coordinates;
                coords.forEach(rings => {
                  const ring = rings[0];
                  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                    const xi = ring[i][0], yi = ring[i][1];
                    const xj = ring[j][0], yj = ring[j][1];
                    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
                    if (intersect) inside = !inside;
                  }
                });
                return inside;
              };

              const safeNum = (raw) => {
                const n = Number(raw);
                return (raw === null || typeof raw === 'undefined' || !isFinite(n)) ? 0 : n;
              };

              const readMbAtCentroid = (sourceId, propName) => {
                try {
                  if (!centroidPoint) return null;
                  const src = map.current.getSource(sourceId);
                  const fc = src && src._data ? src._data : null;
                  if (!fc || !Array.isArray(fc.features)) return null;
                  for (const feat of fc.features) {
                    if (!feat || !feat.geometry) continue;
                    if (pointInPoly(centroidPoint, feat.geometry)) {
                      return safeNum(feat.properties?.[propName]);
                    }
                  }
                } catch (_) { /* ignore */ }
                return null;
              };

              const p11 = readMbAtCentroid('mb-2011-data-source', 'Person_11');
              const p16 = readMbAtCentroid('mb-2016-data-source', 'Person_16');
              const p21 = readMbAtCentroid('mb-2021-data-source', 'Person_21');

              const d11 = readMbAtCentroid('mb-2011-data-source', 'Dwell_11');
              const d16 = readMbAtCentroid('mb-2016-data-source', 'Dwel_16');
              const d21 = readMbAtCentroid('mb-2021-data-source', 'Dwell_21');

              const vals = {
                2011: { res: (p11 === null ? safeNum(f.properties?.Person_11) : p11), dwel: (d11 === null ? safeNum(f.properties?.Dwell_11) : d11) },
                2016: { res: (p16 === null ? safeNum(f.properties?.Person_16) : p16), dwel: (d16 === null ? safeNum(f.properties?.Dwel_16) : d16) },
                2021: { res: (p21 === null ? safeNum(f.properties?.Person_21) : p21), dwel: (d21 === null ? safeNum(f.properties?.Dwell_21) : d21) }
              };
              setHoveredMBCounts(vals);
              setHoveredDZNJobs(null);
              setHoveredDZNSpec(null);
              setHoveredSA1Lum(null);
              const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
              const title = popupYear ? `Dwellings — ${popupYear}` : 'Dwellings';
              const svg = buildDwellingsChartSVG(vals, popupYear);
              const container = document.createElement('div');
              container.style.maxWidth = '280px';
              container.innerHTML = `\n                  <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                  ${svg}\n                `;
              if (!jobsPopupRef.current) {
                jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map.current);
              } else {
                jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
              }
            } catch (_) {
              // no-op
            }
          } else if (layer.indicatorName === 'Diversity of residents’ age') {
            try {
              const vals = {
                2016: parseFloat(f.properties?.Age_Mix_16 ?? '0') || 0,
                2021: parseFloat(f.properties?.Age_Mix_21 ?? '0') || 0
              };
              setHoveredAgeMix(vals);
              setHoveredDZNJobs(null);
              setHoveredDZNSpec(null);
              setHoveredSA1Lum(null);
              setHoveredMBCounts(null);
              const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
              const title = popupYear ? `Age diversity — ${popupYear}` : 'Age diversity';
              const svg = buildAgeMixChartSVG(vals, popupYear);
              const container = document.createElement('div');
              container.style.maxWidth = '280px';
              container.innerHTML = `\n                  <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                  ${svg}\n                `;
              if (!jobsPopupRef.current) {
                jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map.current);
              } else {
                jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
              }
            } catch (_) {
              // no-op
            }
          } else if (layer.indicatorName === 'Diversity of residents’ income') {
            try {
              const vals = {
                2016: parseFloat(f.properties?.Inc_Mix_16 ?? '0') || 0,
                2021: parseFloat(f.properties?.Inc_Mix_21 ?? '0') || 0
              };
              setHoveredIncomeMix(vals);
              setHoveredDZNJobs(null);
              setHoveredDZNSpec(null);
              setHoveredSA1Lum(null);
              setHoveredMBCounts(null);
              setHoveredAgeMix(null);
              const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
              const title = popupYear ? `Income diversity — ${popupYear}` : 'Income diversity';
              const svg = buildIncomeMixChartSVG(vals, popupYear);
              const container = document.createElement('div');
              container.style.maxWidth = '280px';
              container.innerHTML = `\n                  <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                  ${svg}\n                `;
              if (!jobsPopupRef.current) {
                jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map.current);
              } else {
                jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
              }
            } catch (_) {
              // no-op
            }
          } else if (layer.indicatorName === 'Accessibility of Social Infrastructure') {
            try {
              const vals = {
                2018: parseFloat(f.properties?.SoInfra_18 ?? '0') || 0,
                2021: parseFloat(f.properties?.SoInfra_21 ?? '0') || 0
              };
              setHoveredSocInfra(vals);
              setHoveredDZNJobs(null);
              setHoveredDZNSpec(null);
              setHoveredSA1Lum(null);
              setHoveredMBCounts(null);
              setHoveredAgeMix(null);
              setHoveredIncomeMix(null);
              const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
              const title = popupYear ? `Social infrastructure accessibility — ${popupYear}` : 'Social infrastructure accessibility';
              const svg = buildSocInfraChartSVG(vals, popupYear);
              const container = document.createElement('div');
              container.style.maxWidth = '280px';
              container.innerHTML = `\n                  <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                  ${svg}\n                `;
              if (!jobsPopupRef.current) {
                jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map.current);
              } else {
                jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
              }
            } catch (_) {
              // no-op
            }
          } else if (layer.indicatorName === 'Housing stress') {
            try {
              const vals = {
                2018: parseFloat(f.properties?.HouStre_18 ?? '0') || 0,
                2021: parseFloat(f.properties?.HouStre_21 ?? '0') || 0
              };
              setHoveredHousingStress(vals);
              setHoveredDZNJobs(null);
              setHoveredDZNSpec(null);
              setHoveredSA1Lum(null);
              setHoveredMBCounts(null);
              setHoveredAgeMix(null);
              setHoveredIncomeMix(null);
              setHoveredSocInfra(null);
              const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
              const title = popupYear ? `Housing stress — ${popupYear}` : 'Housing stress';
              const svg = buildHousingStressChartSVG(vals, popupYear);
              const container = document.createElement('div');
              container.style.maxWidth = '280px';
              container.innerHTML = `\n                  <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                  ${svg}\n                `;
              if (!jobsPopupRef.current) {
                jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map.current);
              } else {
                jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
              }
            } catch (_) { /* no-op */ }
          } else if (layer.indicatorName === 'Walkability') {
            try {
              const vals = {
                2018: parseFloat(f.properties?.Walkabi_18 ?? '0') || 0,
                2021: parseFloat(f.properties?.Walkabi_21 ?? '0') || 0
              };
              setHoveredWalkability(vals);
              setHoveredDZNJobs(null);
              setHoveredDZNSpec(null);
              setHoveredSA1Lum(null);
              setHoveredMBCounts(null);
              setHoveredAgeMix(null);
              setHoveredIncomeMix(null);
              setHoveredSocInfra(null);
              setHoveredHousingStress(null);
              const popupYear = getYearFromLayerId(layer.id) || (selectedYearRef.current && isFinite(Number(selectedYearRef.current)) ? Number(selectedYearRef.current) : null);
              const title = popupYear ? `Walkability — ${popupYear}` : 'Walkability';
              const svg = buildWalkabilityChartSVG(vals, popupYear);
              const container = document.createElement('div');
              container.style.maxWidth = '280px';
              container.innerHTML = `\n                  <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                  ${svg}\n                `;
              if (!jobsPopupRef.current) {
                jobsPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map.current);
              } else {
                jobsPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
              }
            } catch (_) { /* no-op */ }
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
            // Remove popup on leave
            try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
          } else if (layer.indicatorName === 'Industry specialisation') {
            setHoveredDZNSpec(null);
            // Remove popup on leave
            try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
          } else if (layer.indicatorName === 'Land use mix') {
            setHoveredSA1Lum(null);
            try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
          } else if (layer.indicatorName === 'Number of residents' || layer.indicatorName === 'Number of dwellings' || layer.indicatorName === 'Number of residents_SA1') {
            setHoveredMBCounts(null);
            try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
          } else if (layer.indicatorName === 'Diversity of residents’ age') {
            setHoveredAgeMix(null);
            try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
          } else if (layer.indicatorName === 'Diversity of residents’ income') {
            setHoveredIncomeMix(null);
            try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
          } else if (layer.indicatorName === 'Accessibility of Social Infrastructure') {
            setHoveredSocInfra(null);
            try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
          } else if (layer.indicatorName === 'Housing stress') {
            setHoveredHousingStress(null);
            try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
          } else if (layer.indicatorName === 'Walkability') {
            setHoveredWalkability(null);
            try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
          }
          // Hide dim mask when leaving layer
          if (map.current.getLayer(dimMaskId)) {
            map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
          }
          map.current.getCanvas().style.cursor = '';
        });
      });

      // Default: start with NO indicator layers visible (basemap + precincts only)
      const initialJobsLayer = 'number-of-jobs-2021-layer';
      const outline2021 = `${initialJobsLayer}-hover-outline`;
      const baseOutline2021 = `${initialJobsLayer}-base-outline`;
      const dimMask2021 = `${initialJobsLayer}-dim-mask`;
      try {
        if (map.current.getLayer(initialJobsLayer)) {
          map.current.setLayoutProperty(initialJobsLayer, 'visibility', 'none');
        }
        if (map.current.getLayer(outline2021)) {
          map.current.setLayoutProperty(outline2021, 'visibility', 'none');
        }
        if (map.current.getLayer(baseOutline2021)) {
          map.current.setLayoutProperty(baseOutline2021, 'visibility', 'none');
        }
        if (map.current.getLayer(dimMask2021)) {
          map.current.setLayoutProperty(dimMask2021, 'visibility', 'none');
        }
      } catch (_) { /* ignore */ }

      map.current.addLayer({
        id: 'base-outline-layer', type: 'line', source: 'base-outline-data-source',
        paint: { 'line-color': '#444', 'line-width': 0.2 }
      });
      
        const precinctColorExpression = buildPrecinctColorExpression();

     map.current.addLayer({
        id: 'precincts-fill-layer', type: 'fill', source: 'precincts-data-source',
        // Landing default: only hovered precinct is filled
        paint: {
          'fill-color': precinctColorExpression,
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.35,
            0
          ]
        }
      });
      map.current.addLayer({
        id: 'precincts-shadow-layer', type: 'line', source: 'precincts-data-source',
        paint: { 'line-color': 'rgba(0, 0, 0, 0.4)', 'line-width': 7, 'line-translate': [2, 2], 'line-blur': 4 }
      });
    map.current.addLayer({
      id: 'precincts-outline-layer', type: 'line', source: 'precincts-data-source',
      paint: { 'line-color': precinctColorExpression, 'line-width': 2.5, 'line-opacity': 0.9 }
    });

    // Solid hover outline (same idea as DZN hover-outline)
    map.current.addLayer({
      id: 'precincts-hover-outline',
      type: 'line',
      source: 'precincts-data-source',
      layout: { visibility: 'visible', 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': precinctColorExpression,
        'line-width': 3.5,
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          1,
          0
        ]
      }
    });

      // Remove fill click -> precinct selection to avoid accidental precinct narratives when clicking inside DZNs

      // Also allow clicking on the precinct boundary to show its narrative
      map.current.on('click', 'precincts-outline-layer', (e) => {
        const features = e.features || [];
        const feature = features[0];
        if (!feature || !feature.properties?.name) return;
        const precinctName = feature.properties.name;
        if (!selectedIndicatorRef.current) {
          // Landing: show static precinct info (do not enter precinct narrative mode)
          setLandingSelectedPrecinct(precinctName);
          setPanelFocus({ type: 'framework', name: 'Fishermans Bend Framework' });
          setDynamicDescription(LANDING_TEXT);
          setTextHoveredPrecinct(null);
          return;
        }
        setPanelFocus({ type: 'precinct', name: precinctName });
        setTextHoveredPrecinct(null);
      });

  // Pointer cursor only on precise boundary to reinforce boundary-only selection
  map.current.on('mouseenter', 'precincts-outline-layer', () => { map.current.getCanvas().style.cursor = 'pointer'; });
  map.current.on('mouseleave', 'precincts-outline-layer', () => { map.current.getCanvas().style.cursor = ''; });

      // Landing: hover precincts to highlight + show precinct name popup
      map.current.on('mousemove', 'precincts-fill-layer', (e) => {
        if (!e.features || !e.features.length) return;

        // Only on landing page (no selected indicator)
        if (selectedIndicatorRef.current) return;

        const f = e.features[0];
        const precinctName = f.properties?.name;
        if (!precinctName) return;

        const sourceId = 'precincts-data-source';
        const fid = (typeof f.id !== 'undefined') ? f.id : precinctName;
        const prev = hoverStateBySource.current[sourceId];
        if (prev !== undefined && prev !== fid) {
          try { map.current.setFeatureState({ source: sourceId, id: prev }, { hover: false }); } catch (_) {}
        }
        hoverStateBySource.current[sourceId] = fid;
        try { map.current.setFeatureState({ source: sourceId, id: fid }, { hover: true }); } catch (_) {}

        // Popup with precinct name
        const container = document.createElement('div');
        container.style.maxWidth = '220px';
        container.innerHTML = `<div style="font-weight:700;color:#111827;font-size:0.95rem">${precinctName}</div>`;
        if (!precinctPopupRef.current) {
          precinctPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'jobs-popup' })
            .setLngLat(e.lngLat)
            .setDOMContent(container)
            .addTo(map.current);
        } else {
          precinctPopupRef.current.setLngLat(e.lngLat).setDOMContent(container);
        }
      });

      map.current.on('mouseleave', 'precincts-fill-layer', () => {
        const sourceId = 'precincts-data-source';
        const prev = hoverStateBySource.current[sourceId];
        if (prev !== undefined) {
          try { map.current.setFeatureState({ source: sourceId, id: prev }, { hover: false }); } catch (_) {}
          hoverStateBySource.current[sourceId] = undefined;
        }
        try { if (precinctPopupRef.current) { precinctPopupRef.current.remove(); precinctPopupRef.current = null; } } catch (_) {}
      });

      // Map-wide click handling to ensure precinct boundary is clickable regardless of layer stacking
      map.current.on('click', (e) => {
        const pt = e.point;
        const bbox = [ [pt.x - 4, pt.y - 4], [pt.x + 4, pt.y + 4] ];
        // Priority 1: Precinct selection (landing: inside or boundary; indicator mode: boundary only)
        try {
          const precinctLayersToQuery = selectedIndicatorRef.current
            ? ['precincts-outline-layer']
            : ['precincts-fill-layer', 'precincts-outline-layer'];
          const precinctHits = map.current.queryRenderedFeatures(bbox, { layers: precinctLayersToQuery });
          if (precinctHits && precinctHits.length) {
            const feat = precinctHits[0];
            const name = feat.properties?.name;
            if (name) {
              if (!selectedIndicatorRef.current) {
                // Landing: show static precinct info (do not enter precinct narrative mode)
                setLandingSelectedPrecinct(name);
                setPanelFocus({ type: 'framework', name: 'Fishermans Bend Framework' });
                setDynamicDescription(LANDING_TEXT);
                setTextHoveredPrecinct(null);
                return; // handled as landing precinct info
              }
              setPanelFocus({ type: 'precinct', name });
              setTextHoveredPrecinct(null);
              return; // handled as precinct narrative
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

  // Compute Fishermans Bend bounds from loaded precinct geometries; fallback to static
  const getFBBounds = () => {
    try {
      if (fbBoundaryGeomsRef.current && fbBoundaryGeomsRef.current.length) {
        const fc = {
          type: 'FeatureCollection',
          features: fbBoundaryGeomsRef.current.map((geom) => ({ type: 'Feature', properties: {}, geometry: geom }))
        };
        const b = turf.bbox(fc); // [minX, minY, maxX, maxY]
        return [[b[0], b[1]], [b[2], b[3]]];
      }
    } catch (_) { /* ignore and fall back */ }
    // Fallback static bounds covering all FB precincts
    return [[144.900, -37.855], [144.950, -37.810]];
  };

  // Adjust map bounds on load and when called explicitly
  const getFitPadding = () => {
    // IMPORTANT: The left/right panels are outside the map container (flex layout),
    // so we should NOT reserve their widths as padding. Doing so forces fitBounds
    // to zoom out more on small screens (e.g., laptop), reducing basemap detail.
    const rect = mapContainer.current?.getBoundingClientRect?.();
    const w = rect?.width || window.innerWidth || 1200;
    const h = rect?.height || window.innerHeight || 800;

    // Use a small proportional margin so the FB boundary isn't clipped.
    const pad = Math.max(8, Math.round(Math.min(w, h) * 0.05));
    return { top: pad, bottom: pad, left: pad, right: pad };
  };

  const adjustMapBounds = () => {
    if (!map.current) return;
    const bounds = getFBBounds();
    map.current.fitBounds(bounds, {
      padding: getFitPadding(),
      duration: 200, essential: true
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
      // Ensure MapLibre recalculates transform for the new container size
      // (critical when moving between monitors / changing device pixel ratio).
      try { map.current.resize(); } catch (_) { /* ignore */ }
      const bounds = getFBBounds();
      map.current.fitBounds(bounds, { padding: getFitPadding(), duration: 0 });
    };
    const debouncedResizeListener = debounce(debouncedAdjustBounds, 150);
    window.addEventListener('resize', debouncedResizeListener);
    return () => window.removeEventListener('resize', debouncedResizeListener);
  }, []);

  // Re-fit once the Fishermans Bend boundary data is ready
  useEffect(() => {
    if (!map.current) return;
    if (fbBoundaryReady) adjustMapBounds();
  }, [fbBoundaryReady]);

  // Toggle visibility of indicator layers
  useEffect(() => {
    if (!map.current || !mapLoaded || !layersReady) return;
  // Legacy diversity single-year layers removed; dynamic multi-year layers handled elsewhere.
  const allLayerIds = [];
  const selectedLayerId = null;

  if (map.current.getLayer('base-outline-layer')) {
        const hideBaseOutlineIndicators = ['Number of residents', 'Number of dwellings', 'Number of jobs', 'Industry specialisation'];
        const shouldShow = !!selectedIndicator && !hideBaseOutlineIndicators.includes(selectedIndicator);
        map.current.setLayoutProperty('base-outline-layer', 'visibility', shouldShow ? 'visible' : 'none');
    }

    // No-op now; multi-year indicators have their own visibility effects.
  }, [selectedIndicator, mapLoaded, layersReady]);

  // Close hover popup when switching indicator or year to prevent stale popups
  useEffect(() => {
    try { if (jobsPopupRef.current) { jobsPopupRef.current.remove(); jobsPopupRef.current = null; } } catch (_) {}
    // Clear hovered data for indicators
    setHoveredDZNJobs(null);
    setHoveredDZNSpec(null);
    setHoveredSA1Lum(null);
    setHoveredMBCounts(null);
  setHoveredAgeMix(null);
  setHoveredIncomeMix(null);
    try { setHoveredSocInfra(null); } catch (_) {}
    try { setHoveredHousingStress(null); } catch (_) {}
  }, [selectedIndicator, selectedYear]);

  // Derive available years from metadata when panel focus changes (indicator or precinct view)
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Number of jobs') {
      setAvailableYears([2011, 2016, 2021]);
    } else if (panelFocus && panelFocus.type === 'precinct') {
      // Precinct view: years depend on currently selected indicator
      if (selectedIndicator === 'Number of jobs') setAvailableYears([2011, 2016, 2021]);
      else if (selectedIndicator === 'Industry specialisation') setAvailableYears([2011, 2016, 2021]);
      else if (selectedIndicator === 'Land use mix') setAvailableYears([2011, 2016, 2021]);
      else if (selectedIndicator === 'Number of residents' || selectedIndicator === 'Number of dwellings' || selectedIndicator === 'Number of residents_SA1') setAvailableYears([2011, 2016, 2021]);
      else if (selectedIndicator === 'Diversity of residents’ age') setAvailableYears([2016, 2021]);
      else if (selectedIndicator === 'Diversity of residents’ income') setAvailableYears([2016, 2021]);
      else if (selectedIndicator === 'Accessibility of Social Infrastructure') setAvailableYears([2018, 2021]);
      else if (selectedIndicator === 'Housing stress') setAvailableYears([2018, 2021]);
      else if (selectedIndicator === 'Walkability') setAvailableYears([2018, 2021]);
      else setAvailableYears([]);
    } else if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Industry specialisation') {
      // Industry specialisation has fixed three vintages
      setAvailableYears([2011, 2016, 2021]);
    } else if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Land use mix') {
      // Land use mix uses the same three vintages
      setAvailableYears([2011, 2016, 2021]);
    } else if (panelFocus && panelFocus.type === 'indicator' && (panelFocus.name === 'Number of residents' || panelFocus.name === 'Number of dwellings' || panelFocus.name === 'Number of residents_SA1')) {
      setAvailableYears([2011, 2016, 2021]);
    } else if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Diversity of residents’ age') {
      setAvailableYears([2016, 2021]);
    } else if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Diversity of residents’ income') {
      setAvailableYears([2016, 2021]);
    } else if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Accessibility of Social Infrastructure') {
      setAvailableYears([2018, 2021]);
    } else if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Housing stress') {
      setAvailableYears([2018, 2021]);
    } else if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Walkability') {
      setAvailableYears([2018, 2021]);
    } else {
      setAvailableYears([]);
    }
  }, [panelFocus, selectedIndicator]);

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

  // Ensure a default selectedYear when viewing Industry specialisation
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Industry specialisation') {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const preferred = years.includes(2021) ? 2021 : Math.max(...years);
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(preferred);
      }
    }
  }, [panelFocus, availableYears]);

  // Ensure a default selectedYear when viewing Land use mix
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Land use mix') {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const preferred = years.includes(2021) ? 2021 : Math.max(...years);
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(preferred);
      }
    }
  }, [panelFocus, availableYears]);

  // Ensure a default selectedYear when viewing Number of residents or Number of dwellings
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && (panelFocus.name === 'Number of residents' || panelFocus.name === 'Number of dwellings' || panelFocus.name === 'Number of residents_SA1')) {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const preferred = years.includes(2021) ? 2021 : Math.max(...years);
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(preferred);
      }
    }
  }, [panelFocus, availableYears]);

  // Ensure a default selectedYear when viewing Diversity of residents’ age
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Diversity of residents’ age') {
      const years = availableYears.length ? availableYears : [2016, 2021];
      const preferred = years.includes(2021) ? 2021 : Math.max(...years);
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(preferred);
      }
    }
  }, [panelFocus, availableYears]);

  // Ensure a default selectedYear when viewing Diversity of residents’ income
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Diversity of residents’ income') {
      const years = availableYears.length ? availableYears : [2016, 2021];
      const preferred = years.includes(2021) ? 2021 : Math.max(...years);
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(preferred);
      }
    }
  }, [panelFocus, availableYears]);

  // Ensure a default selectedYear when viewing Accessibility of Social Infrastructure
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Accessibility of Social Infrastructure') {
      const years = availableYears.length ? availableYears : [2018, 2021];
      const preferred = years.includes(2021) ? 2021 : Math.max(...years);
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(preferred);
      }
    }
  }, [panelFocus, availableYears]);

  // Ensure a default selectedYear when viewing Housing stress
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Housing stress') {
      const years = availableYears.length ? availableYears : [2018, 2021];
      const preferred = years.includes(2021) ? 2021 : Math.max(...years);
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(preferred);
      }
    }
  }, [panelFocus, availableYears]);

  // Ensure a default selectedYear when viewing Walkability
  useEffect(() => {
    if (panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Walkability') {
      const years = availableYears.length ? availableYears : [2018, 2021];
      const preferred = years.includes(2021) ? 2021 : Math.max(...years);
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(preferred);
      }
    }
  }, [panelFocus, availableYears]);

  // Guard: if Social Infrastructure is selected anywhere and year is invalid, coerce to 2018
  useEffect(() => {
    if (selectedIndicator === 'Accessibility of Social Infrastructure') {
      if (selectedYear !== 2018 && selectedYear !== 2021) {
        setSelectedYear(2021);
      }
    }
  }, [selectedIndicator, selectedYear]);

  // Guard: if Housing stress is selected and year invalid, coerce to 2018
  useEffect(() => {
    if (selectedIndicator === 'Housing stress') {
      if (selectedYear !== 2018 && selectedYear !== 2021) {
        setSelectedYear(2021);
      }
    }
  }, [selectedIndicator, selectedYear]);

  // Guard: if Walkability is selected and year invalid, coerce to 2018
  useEffect(() => {
    if (selectedIndicator === 'Walkability') {
      if (selectedYear !== 2018 && selectedYear !== 2021) {
        setSelectedYear(2021);
      }
    }
  }, [selectedIndicator, selectedYear]);

  // Control visibility for Number of residents (SA1) layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2011: 'number-of-residents_sa1-2011-layer',
      2016: 'number-of-residents_sa1-2016-layer',
      2021: 'number-of-residents_sa1-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (!id) return;
      try {
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis);
        const baseOutlineId = `${id}-base-outline`;
        const outlineId = `${id}-hover-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    };

    // Hide all by default
    [2011, 2016, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Number of residents_SA1') {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : Math.max(...years));
      setVisibility(layerIds[y], 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

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
      const baseOutlineId = `${id}-base-outline`;
      const dimMaskId = `${id}-dim-mask`;
      if (map.current.getLayer(outlineId)) {
        map.current.setLayoutProperty(outlineId, 'visibility', vis);
      }
      if (map.current.getLayer(baseOutlineId)) {
        map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
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

  // Control visibility for Number of residents layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2011: 'number-of-residents-2011-layer',
      2016: 'number-of-residents-2016-layer',
      2021: 'number-of-residents-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (!id) return;
      try {
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis);
        const baseOutlineId = `${id}-base-outline`;
        const outlineId = `${id}-hover-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    };

    // Hide all by default
    [2011, 2016, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Number of residents') {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : Math.max(...years));
      setVisibility(layerIds[y], 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Control visibility for Number of dwellings layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2011: 'number-of-dwellings-2011-layer',
      2016: 'number-of-dwellings-2016-layer',
      2021: 'number-of-dwellings-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (!id) return;
      try {
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis);
        const baseOutlineId = `${id}-base-outline`;
        const outlineId = `${id}-hover-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    };

    [2011, 2016, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Number of dwellings') {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : Math.max(...years));
      setVisibility(layerIds[y], 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Hide SA1 base outline when showing MB or DZN-based indicators so only their own boundaries are visible
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;
    try {
      const id = 'base-outline-layer';
      if (!map.current.getLayer(id)) return;
      const hideBaseOutlineIndicators = ['Number of residents', 'Number of dwellings', 'Number of jobs', 'Industry specialisation'];
      const vis = hideBaseOutlineIndicators.includes(selectedIndicator) ? 'none' : 'visible';
      map.current.setLayoutProperty(id, 'visibility', vis);
    } catch (_) { /* ignore */ }
  }, [selectedIndicator, mapLoaded, layersReady]);

  // When MB indicators (residents or dwellings) are active, ensure any SA1 indicator layers stay hidden.
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;
    const mbIndicators = ['Number of residents', 'Number of dwellings'];
    if (!mbIndicators.includes(selectedIndicator)) return;
    const sa1Ids = [
      'number-of-residents_sa1-2011-layer',
      'number-of-residents_sa1-2016-layer',
      'number-of-residents_sa1-2021-layer'
    ];
    sa1Ids.forEach((id) => {
      if (!map.current.getLayer(id)) return;
      map.current.setLayoutProperty(id, 'visibility', 'none');
      const baseOutlineId = `${id}-base-outline`;
      const outlineId = `${id}-hover-outline`;
      const dimMaskId = `${id}-dim-mask`;
      if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', 'none');
      if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'none');
      if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
    });
  }, [selectedIndicator, mapLoaded, layersReady]);

  // Control visibility for Industry specialisation layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2011: 'industry-specialisation-2011-layer',
      2016: 'industry-specialisation-2016-layer',
      2021: 'industry-specialisation-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (map.current.getLayer(id)) {
        map.current.setLayoutProperty(id, 'visibility', vis);
      }
      const outlineId = `${id}-hover-outline`;
      const baseOutlineId = `${id}-base-outline`;
      const dimMaskId = `${id}-dim-mask`;
      if (map.current.getLayer(outlineId)) {
        map.current.setLayoutProperty(outlineId, 'visibility', vis);
      }
      if (map.current.getLayer(baseOutlineId)) {
        map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
      }
      if (map.current.getLayer(dimMaskId)) {
        // Default hidden; shown during mouseenter
        map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      }
    };

    // Hide all by default
    [2011, 2016, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Industry specialisation') {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const defaultYear = years.includes(2021) ? 2021 : Math.max(...years);
      const yearToShow = selectedYear || defaultYear;
      const layerToShow = layerIds[yearToShow];
      if (layerToShow) setVisibility(layerToShow, 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Control visibility for Land use mix layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2011: 'land-use-mix-2011-layer',
      2016: 'land-use-mix-2016-layer',
      2021: 'land-use-mix-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (!id) return;
      try {
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis);
        const baseOutlineId = `${id}-base-outline`;
        const outlineId = `${id}-hover-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
        // Default hidden; shown during mouseenter like other indicators
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    };

    // Hide all by default
    [2011, 2016, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Land use mix') {
      const years = availableYears.length ? availableYears : [2011, 2016, 2021];
      const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : Math.max(...years));
      setVisibility(layerIds[y], 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Control visibility for Diversity of residents’ age layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2016: 'diversity-of-residents-age-2016-layer',
      2021: 'diversity-of-residents-age-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (!id) return;
      try {
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis);
        const baseOutlineId = `${id}-base-outline`;
        const outlineId = `${id}-hover-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    };

    [2016, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Diversity of residents’ age') {
      const years = availableYears.length ? availableYears : [2016, 2021];
      const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : Math.max(...years));
      setVisibility(layerIds[y], 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Control visibility for Diversity of residents’ income layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2016: 'diversity-of-residents-income-2016-layer',
      2021: 'diversity-of-residents-income-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (!id) return;
      try {
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis);
        const baseOutlineId = `${id}-base-outline`;
        const outlineId = `${id}-hover-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    };

    [2016, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Diversity of residents’ income') {
      const years = availableYears.length ? availableYears : [2016, 2021];
      const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : Math.max(...years));
      setVisibility(layerIds[y], 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Control visibility for Accessibility of Social Infrastructure layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2018: 'accessibility-of-social-infrastructure-2018-layer',
      2021: 'accessibility-of-social-infrastructure-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (!id) return;
      try {
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis);
        const baseOutlineId = `${id}-base-outline`;
        const outlineId = `${id}-hover-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    };

    [2018, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Accessibility of Social Infrastructure') {
      const years = availableYears.length ? availableYears : [2018, 2021];
      const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : Math.max(...years));
      setVisibility(layerIds[y], 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Control visibility for Housing stress layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2018: 'housing-stress-2018-layer',
      2021: 'housing-stress-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (!id) return;
      try {
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis);
        const baseOutlineId = `${id}-base-outline`;
        const outlineId = `${id}-hover-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    };

    [2018, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Housing stress') {
      const years = availableYears.length ? availableYears : [2018, 2021];
      const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : Math.max(...years));
      setVisibility(layerIds[y], 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Control visibility for Walkability layers based on selected indicator and selected year
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;

    const layerIds = {
      2018: 'walkability-2018-layer',
      2021: 'walkability-2021-layer'
    };

    const setVisibility = (id, vis) => {
      if (!id) return;
      try {
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis);
        const baseOutlineId = `${id}-base-outline`;
        const outlineId = `${id}-hover-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', vis);
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', vis);
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    };

    [2018, 2021].forEach(y => setVisibility(layerIds[y], 'none'));

    if (selectedIndicator === 'Walkability') {
      const years = availableYears.length ? availableYears : [2018, 2021];
      const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : Math.max(...years));
      setVisibility(layerIds[y], 'visible');
    }
  }, [selectedIndicator, selectedYear, availableYears, mapLoaded, layersReady]);

  // Safety: ensure only the selected indicator's layers are visible (hide the other group immediately)
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;
    const hideGroup = (prefix) => {
      [2011, 2016, 2021].forEach(y => {
        const id = `${prefix}-${y}-layer`;
        const outlineId = `${id}-hover-outline`;
        const baseOutlineId = `${id}-base-outline`;
        const dimMaskId = `${id}-dim-mask`;
        if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', 'none');
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'none');
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', 'none');
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      });
    };
    // Hide both groups first
    hideGroup('number-of-jobs');
    hideGroup('industry-specialisation');
    hideGroup('land-use-mix');
  hideGroup('number-of-residents');
  hideGroup('number-of-dwellings');
    hideGroup('number-of-residents_sa1');
    hideGroup('housing-stress');
    hideGroup('walkability');
    // Hide age diversity layers explicitly
    ['diversity-of-residents-age-2016-layer','diversity-of-residents-age-2021-layer'].forEach(id => {
      const outlineId = `${id}-hover-outline`;
      const baseOutlineId = `${id}-base-outline`;
      const dimMaskId = `${id}-dim-mask`;
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', 'none');
      if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'none');
      if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', 'none');
      if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
    });
    // Hide income diversity layers explicitly
    ['diversity-of-residents-income-2016-layer','diversity-of-residents-income-2021-layer'].forEach(id => {
      const outlineId = `${id}-hover-outline`;
      const baseOutlineId = `${id}-base-outline`;
      const dimMaskId = `${id}-dim-mask`;
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', 'none');
      if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'none');
      if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', 'none');
      if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
    });
    // The dedicated effects above will then show the right layer for the active indicator & year
  }, [selectedIndicator]);

  // Final guard: on any indicator/year change, enforce exactly one visible dynamic layer
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !layersReady) return;
    // Supported years depend on indicator: include 2018 for Social Infrastructure, Housing stress, and Walkability
    const years = ((selectedIndicator === 'Accessibility of Social Infrastructure') || (selectedIndicator === 'Housing stress') || (selectedIndicator === 'Walkability')) ? [2018, 2021] : [2011, 2016, 2021];
    const style = map.current.getStyle();
    const layerIds = (style && style.layers) ? style.layers.map(l => l.id) : [];
  const prefixes = ['number-of-jobs-', 'industry-specialisation-', 'land-use-mix-', 'number-of-residents-', 'number-of-dwellings-', 'number-of-residents_sa1-', 'diversity-of-residents-age-', 'diversity-of-residents-income-', 'accessibility-of-social-infrastructure-', 'housing-stress-', 'walkability-'];
    // Hide everything that matches our dynamic prefixes (fills/outlines/masks)
    layerIds.forEach(id => {
      if (prefixes.some(p => id.startsWith(p))) {
        try { map.current.setLayoutProperty(id, 'visibility', 'none'); } catch (_) {}
      }
    });
    // Show exactly one depending on selection
    const y = years.includes(selectedYear) ? selectedYear : (years.includes(2021) ? 2021 : years[0]);
    const baseId = (() => {
      if (selectedIndicator === 'Number of jobs') return `number-of-jobs-${y}-layer`;
      if (selectedIndicator === 'Industry specialisation') return `industry-specialisation-${y}-layer`;
      if (selectedIndicator === 'Land use mix') return `land-use-mix-${y}-layer`;
      if (selectedIndicator === 'Number of residents') return `number-of-residents-${y}-layer`;
      if (selectedIndicator === 'Number of dwellings') return `number-of-dwellings-${y}-layer`;
      if (selectedIndicator === 'Number of residents_SA1') return `number-of-residents_sa1-${y}-layer`;
      if (selectedIndicator === 'Diversity of residents’ age') return `diversity-of-residents-age-${(y===2011?2016:y)}-layer`;
      if (selectedIndicator === 'Diversity of residents’ income') return `diversity-of-residents-income-${(y===2011?2016:y)}-layer`;
      if (selectedIndicator === 'Accessibility of Social Infrastructure') return `accessibility-of-social-infrastructure-${(y===2011?2018:y)}-layer`;
      if (selectedIndicator === 'Housing stress') return `housing-stress-${(y===2011?2018:y)}-layer`;
      if (selectedIndicator === 'Walkability') return `walkability-${(y===2011?2018:y)}-layer`;
      return null;
    })();
    if (baseId) {
      try {
        if (map.current.getLayer(baseId)) map.current.setLayoutProperty(baseId, 'visibility', 'visible');
        const baseOutlineId = `${baseId}-base-outline`;
        const outlineId = `${baseId}-hover-outline`;
        const dimMaskId = `${baseId}-dim-mask`;
        if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', 'visible');
        if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'visible');
        if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
      } catch (_) { /* ignore */ }
    }
  }, [selectedIndicator, selectedYear, mapLoaded, layersReady]);

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
    const yr = selectedYear || 2021;
    const activeLayer = layerIds[yr];
    if (!activeLayer) return;
    const dimMaskId = `${activeLayer}-dim-mask`;
    if (map.current.getLayer(dimMaskId)) {
      const hasSelection = !!selectedDZNCode;
      // If there is a selection, keep the dim-mask visible so non-selected features are dimmed
      try { map.current.setLayoutProperty(dimMaskId, 'visibility', hasSelection ? 'visible' : 'none'); } catch (_) {}
    }
  }, [selectedDZNCode, selectedYear, panelFocus, layersReady]);

  // Generate LLM description when panel focus or available years change
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
  // Include indicator and year in cache key for precinct narratives to avoid stale text when switching indicator/years
  const cacheKey = type === 'precinct'
    ? `${type}_${name}_${selectedIndicator || ''}_${selectedYear || ''}`
    : `${type}_${name}`;

        if (descriptionCache.current[cacheKey]) {
            setDynamicDescription(descriptionCache.current[cacheKey]);
            setIsDescriptionLoading(false);
            return;
        }

        try {
            let prompt = '';
      if (type === 'indicator') {
        const metadata = indicatorMetadata[metadataKeyFor(name)];

        if (!metadata) {
          throw new Error(`Metadata is missing for the "${name}" indicator.`);
        }
        const getDefaultYears = (indicatorName) => {
          if (indicatorName === 'Accessibility of Social Infrastructure') return [2018, 2021];
          if (indicatorName === 'Housing stress') return [2018, 2021];
          if (indicatorName === 'Walkability') return [2018, 2021];
          if (indicatorName === 'Diversity of residents’ age' || indicatorName === 'Diversity of residents’ income') return [2016, 2021];
          return [2011, 2016, 2021];
        };
        const years = getDefaultYears(name).map(String);
        const yearsLine = `Available years: ${years.map(y => `**${y}**`).join(', ')}`;
                
        prompt = `You are an expert urban data analyst providing a summary for a public-facing dashboard about Melbourne's Fishermans Bend.
Your task is to generate a clear, descriptive summary for the "${name}" indicator based ONLY on the metadata provided below.

Use the following information to structure your response. **Crucially, when you incorporate a piece of metadata from the list below into your paragraph, you must make that specific value bold using Markdown (e.g., the goal is **An inclusive community**).**

- **Alignment with Goals**: This indicator aligns with Fishermans Bend's goal of: "${metadata["FB's target"]}".
- **Measurement Method**: It is measured by this method: "${metadata["Note for measurement"]}".
- **Data Origin**: The data is sourced from "${metadata["Data sources"]}".
- **Geographic Coverage**: The data's spatial extent is "${metadata["Spatial extent"]}", presented at a "${metadata["Spatial scale"]}" level.
- **Timeliness**: The data is updated every "${metadata["Update frequency"]}".

Important formatting rules:
- Bold the values you use from the metadata.
- **Do NOT make the final output in one paragraph. Make it in several short paragraphs where each paragraph covers a specific aspect of the metadata.**
- **Structure the output exactly as follows:**
  - Paragraph 1: Explain what the indicator tracks and its alignment with Fishermans Bend's goals.
  - Paragraph 2: Explain how it is measured and quantified.
  - Paragraph 3: Explain the data source and geographic coverage.
  - Paragraph 4: State the update frequency. Then, on the same line, add exactly: ${yearsLine}.
- **Ensure each paragraph is separated by a blank line (double newline).**
- **Do not add extra text, introductions, or conclusions beyond the required paragraphs.**

Do not invent or infer any data values, statistics, or trends.`;


            } else if (type === 'precinct') {
                // Deterministic narrative using computed overlay stats for the active indicator
                const yr = selectedYear || 2021;
                try {
                  const indicatorNameToUse = selectedIndicator || 'Number of jobs';
                  const stats = await computePrecinctOverlay(name, yr, indicatorNameToUse);
                  const baseText = generatePrecinctNarrativeDeterministic(stats, indicatorNameToUse);
                  const changePara = await buildPrecinctMedianChangeParagraph(name, indicatorNameToUse);
                  const combined = changePara ? `${baseText}\n\n${changePara}` : baseText;
                  descriptionCache.current[cacheKey] = combined;
                  setPrecinctNarrative('');
                  setDynamicDescription(combined);
                } catch (e) {
                  console.error('Failed to generate precinct narrative:', e);
                  setDynamicDescription('');
                }
                return; // bail out, we've set dynamicDescription already
            } else if (type === 'framework') {
              // Static landing description for Fishermans Bend Framework
              descriptionCache.current[cacheKey] = LANDING_TEXT;
              setDynamicDescription(LANDING_TEXT);
              setIsDescriptionLoading(false);
              return;
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
  }, [panelFocus, availableYears, selectedIndicator, selectedYear]);

  // Recompute precinct narrative when year or indicator changes while a precinct is selected
  useEffect(() => {
    if (!(panelFocus && panelFocus.type === 'precinct')) return;
    const name = panelFocus.name;
    const yr = selectedYear || 2021;
    let canceled = false;
    (async () => {
      try {
        const indicatorNameToUse = selectedIndicator || 'Number of jobs';
        const stats = await computePrecinctOverlay(name, yr, indicatorNameToUse);
        const baseText = generatePrecinctNarrativeDeterministic(stats, indicatorNameToUse);
        const changePara = await buildPrecinctMedianChangeParagraph(name, indicatorNameToUse);
        const combined = changePara ? `${baseText}\n\n${changePara}` : baseText;
        if (!canceled) {
          setDynamicDescription(combined);
        }
      } catch (e) { /* ignore */ }
    })();
    return () => { canceled = true; };
  }, [selectedYear, selectedIndicator, panelFocus]);

  useEffect(() => {
    const relevantIndicators = ['Number of jobs', 'Industry specialisation'];
    if (!selectedIndicator || !relevantIndicators.includes(selectedIndicator) || !selectedYear) {
      setLegendComparisonText('');
      setLegendComparisonChartData(null);
      return;
    }
    if ((selectedIndicator === 'Number of jobs' && !jobsDataLoaded) ||
        (selectedIndicator === 'Industry specialisation' && !specDataReady)) {
      setLegendComparisonText('');
      setLegendComparisonChartData(null);
      return;
    }
    if (!docklandsReady || !fbBoundaryReady) {
      setLegendComparisonText('');
      setLegendComparisonChartData(null);
      return;
    }
    const stats = buildLegendComparisonStats(selectedIndicator, selectedYear);
    setLegendComparisonText(stats?.text || '');
    setLegendComparisonChartData(stats?.chart || null);
  }, [selectedIndicator, selectedYear, jobsDataLoaded, specDataReady, docklandsReady, fbBoundaryReady, jobsBreaks]);

  // Load top industries JSON when Industry specialisation is active
  useEffect(() => {
    let canceled = false;
    const loadTopIndustries = async () => {
      if (selectedIndicator !== 'Industry specialisation') { setTopIndustriesByYear(null); return; }
      try {
        const res = await fetch('/data/top_industries_fb.json');
        if (!res.ok) throw new Error('Failed to load top industries JSON');
        const arr = await res.json();
        // Transform to {year: [{name,pct}, ...]}
        const byYear = { 2011: [], 2016: [], 2021: [] };
        (arr || []).forEach((row) => {
          const name = row.Industry || row.industry || '';
          ['2011','2016','2021'].forEach((yr) => {
            const raw = row[yr];
            if (typeof raw === 'string' && raw.trim()) {
              const pct = parseFloat(raw.replace('%',''));
              if (isFinite(pct)) byYear[parseInt(yr,10)].push({ name, pct });
            }
          });
        });
        if (!canceled) setTopIndustriesByYear(byYear);
      } catch (e) {
        console.error('Top industries data load error:', e);
        if (!canceled) setTopIndustriesByYear(null);
      }
    };
    loadTopIndustries();
    return () => { canceled = true; };
  }, [selectedIndicator]);

  // Update map visual style when a precinct is highlighted from text
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    if (textHoveredPrecinct) {
      const otherOpacity = selectedIndicator ? 0.15 : 0;
      const fillColorExpression = [ 'case', ['==', ['get', 'name'], textHoveredPrecinct], PRECINCT_COLORS[textHoveredPrecinct], '#ffffffff' ];
      const fillOpacityExpression = [ 'case', ['==', ['get', 'name'], textHoveredPrecinct], 0.6, otherOpacity ];
      // Keep outline color per precinct at all times; only bump width on hover
      const outlineWidthExpression = [ 'case', ['==', ['get', 'name'], textHoveredPrecinct], 3.5, 2.5 ];

      map.current.setPaintProperty('precincts-fill-layer', 'fill-color', fillColorExpression);
      map.current.setPaintProperty('precincts-fill-layer', 'fill-opacity', fillOpacityExpression);
      map.current.setPaintProperty('precincts-outline-layer', 'line-width', outlineWidthExpression);

    } else {
      if (selectedIndicator) {
        map.current.setPaintProperty('precincts-fill-layer', 'fill-color', '#ffffffff');
        map.current.setPaintProperty('precincts-fill-layer', 'fill-opacity', 0.15);
        map.current.setPaintProperty('precincts-outline-layer', 'line-width', 2.5);
      } else {
        // Landing: only hovered precinct is filled (map hover uses feature-state)
        map.current.setPaintProperty('precincts-fill-layer', 'fill-color', buildPrecinctColorExpression());
        map.current.setPaintProperty('precincts-fill-layer', 'fill-opacity', [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.35,
          0
        ]);
        map.current.setPaintProperty('precincts-outline-layer', 'line-width', 2.5);
      }
    }
  }, [textHoveredPrecinct, selectedIndicator]);

  // --- UI HANDLERS ---
  const handleSearchClick = async () => {
    if (!searchText.trim()) return;

    setIsSearching(true);
    setSearchError('');

    try {
      const response = await fetch(`${API_URL}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchText }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok.');
      }
      
      let rankedIndicators = await response.json();
  // Filter out any indicators not supported by the UI (ensures legacy ones never appear)
  const allowed = new Set(Object.keys(indicatorConfig));
  rankedIndicators = (Array.isArray(rankedIndicators) ? rankedIndicators : []).filter(r => r && allowed.has(r.indicator));
      // Ensure both MB and SA1 residents options appear when user searches for residents
      try {
        const q = (searchText || '').toLowerCase();
        if (/resident/.test(q)) {
          const ensure = ['Number of residents', 'Number of residents_SA1'];
          const names = new Set(rankedIndicators.map(r => r.indicator));
          ensure.forEach(name => {
            if (indicatorConfig[name] && !names.has(name)) {
              rankedIndicators.unshift({ indicator: name, score: 1.0 });
              names.add(name);
            }
          });
          // De-duplicate while preserving order
          const seen = new Set();
          rankedIndicators = rankedIndicators.filter(r => {
            if (seen.has(r.indicator)) return false;
            seen.add(r.indicator); return true;
          });
        }
        // Boost exact or strong matches for Housing stress
        if (/housing/.test(q)) {
          const names = rankedIndicators.map(r => r.indicator);
          const hsIndex = names.findIndex(n => n.toLowerCase() === 'housing stress');
          const containsWords = /housing\s*stress/.test(q) || (/housing/.test(q) && /stress/.test(q));
          if (hsIndex >= 0 && (containsWords || q.trim() === 'housing')) {
            const [hs] = rankedIndicators.splice(hsIndex, 1);
            rankedIndicators.unshift(hs);
          } else if (allowed.has('Housing stress') && containsWords) {
            // If not present due to embedding score, inject it at top
            rankedIndicators.unshift({ indicator: 'Housing stress', score: 1.0 });
            const seen = new Set();
            rankedIndicators = rankedIndicators.filter(r => {
              if (seen.has(r.indicator)) return false;
              seen.add(r.indicator); return true;
            });
          }
        }
        // Boost for Walkability queries
        if (/(\bwalk\b|walkability)/.test(q)) {
          const names = rankedIndicators.map(r => r.indicator);
          const wIndex = names.findIndex(n => n.toLowerCase() === 'walkability');
          if (wIndex >= 0) {
            const [w] = rankedIndicators.splice(wIndex, 1);
            rankedIndicators.unshift(w);
          } else if (allowed.has('Walkability')) {
            rankedIndicators.unshift({ indicator: 'Walkability', score: 1.0 });
            const seen = new Set();
            rankedIndicators = rankedIndicators.filter(r => {
              if (seen.has(r.indicator)) return false;
              seen.add(r.indicator); return true;
            });
          }
        }
      } catch (_) { /* non-fatal */ }
      setIndicators(rankedIndicators);


    } catch (error) {
      console.error("Failed to fetch indicators:", error);
      setSearchError("Failed to connect to the backend. Please ensure the Python server is running.");
      setIndicators([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleIndicatorSelect = (indicator) => {
    const newIndicator = indicator;
    // Always select the indicator and focus the indicator panel
    setSelectedIndicator(newIndicator);
    setPanelFocus({ type: 'indicator', name: newIndicator });
    setTextHoveredPrecinct(null);
    setLandingSelectedPrecinct(null);
    // Reflect choice in search UI and suggestions
    setSearchText(newIndicator);
    // Hide suggestions after selection
    setIndicators([]);
    const defaultYearFor = (indName) => {
      // Default visualization year across the dashboard
      return 2021;
    };
    setSelectedYear(defaultYearFor(newIndicator));
    // Immediate enforcement: hide all dynamic layers and show only base layer for the selected indicator
    try {
      if (map.current && map.current.isStyleLoaded() && newIndicator) {
        const style = map.current.getStyle();
        const layerIds = (style && style.layers) ? style.layers.map(l => l.id) : [];
        const prefixes = ['number-of-jobs-', 'industry-specialisation-', 'land-use-mix-', 'number-of-residents-', 'number-of-dwellings-', 'number-of-residents_sa1-', 'diversity-of-residents-age-', 'diversity-of-residents-income-', 'accessibility-of-social-infrastructure-', 'housing-stress-', 'walkability-'];
        layerIds.forEach(id => {
          if (prefixes.some(p => id.startsWith(p))) {
            try { map.current.setLayoutProperty(id, 'visibility', 'none'); } catch (_) {}
          }
        });
        const baseId = (() => {
          if (newIndicator === 'Number of jobs') return 'number-of-jobs-2021-layer';
          if (newIndicator === 'Industry specialisation') return 'industry-specialisation-2021-layer';
          if (newIndicator === 'Land use mix') return 'land-use-mix-2021-layer';
          if (newIndicator === 'Number of residents') return 'number-of-residents-2021-layer';
          if (newIndicator === 'Number of dwellings') return 'number-of-dwellings-2021-layer';
          if (newIndicator === 'Number of residents_SA1') return 'number-of-residents_sa1-2021-layer';
          if (newIndicator === 'Diversity of residents’ age') return 'diversity-of-residents-age-2021-layer';
          if (newIndicator === 'Diversity of residents’ income') return 'diversity-of-residents-income-2021-layer';
          if (newIndicator === 'Accessibility of Social Infrastructure') return 'accessibility-of-social-infrastructure-2021-layer';
          if (newIndicator === 'Housing stress') return 'housing-stress-2021-layer';
          if (newIndicator === 'Walkability') return 'walkability-2021-layer';
          return null;
        })();
        if (baseId) {
          try {
            if (map.current.getLayer(baseId)) map.current.setLayoutProperty(baseId, 'visibility', 'visible');
            const baseOutlineId = `${baseId}-base-outline`;
            const outlineId = `${baseId}-hover-outline`;
            const dimMaskId = `${baseId}-dim-mask`;
            if (map.current.getLayer(baseOutlineId)) map.current.setLayoutProperty(baseOutlineId, 'visibility', 'visible');
            if (map.current.getLayer(outlineId)) map.current.setLayoutProperty(outlineId, 'visibility', 'visible');
            if (map.current.getLayer(dimMaskId)) map.current.setLayoutProperty(dimMaskId, 'visibility', 'none');
          } catch (_) { /* ignore */ }
        }
      }
    } catch (_) { /* ignore */ }
  };

  const handlePrecinctHover = (precinctName) => {
    setTextHoveredPrecinct(precinctName);
  };

  // Map current jobs breaks to linguistic bins
  const jobsValueToClass = (val) => {
    const br = jobsBreaks && jobsBreaks.length === 4 ? jobsBreaks : [591, 1097, 1356, 2742];
    if (val < br[0]) return 0; // lowest
    if (val < br[1]) return 1; // low
    if (val < br[2]) return 2; // medium
    if (val < br[3]) return 3; // high
    return 4; // highest
  };
  const CLASS_LABELS = ['lowest', 'low', 'medium', 'high', 'highest'];
  const JOB_PROP_BY_YEAR = { 2011: 'TotJob_11', 2016: 'TotJob_16', 2021: 'TotJob_21' };
  const SPEC_PROP_FB_BY_YEAR = { 2011: 'Special_11', 2016: 'Special_16', 2021: 'Special_21' };
  const SPEC_PROP_DOCK_BY_YEAR = { 2011: 'IS_11', 2016: 'IS_16', 2021: 'IS_21' };

  // Map residents (MB) values to classes using fixed MB breaks
  const mbValueToClass = (val) => {
    const br = (mbBreaks && mbBreaks.length === 4) ? mbBreaks : MB_DEFAULT_BREAKS;
    if (val < br[0]) return 0; // lowest
    if (val < br[1]) return 1; // low
    if (val < br[2]) return 2; // medium
    if (val < br[3]) return 3; // high
    return 4; // highest
  };

  // Map dwellings (MB) values to classes using dwellings fixed breaks
  const dwellValueToClass = (val) => {
    const br = (dwellBreaks && dwellBreaks.length === 4) ? dwellBreaks : DWELL_DEFAULT_BREAKS;
    if (val < br[0]) return 0;
    if (val < br[1]) return 1;
    if (val < br[2]) return 2;
    if (val < br[3]) return 3;
    return 4;
  };

  // Map social infrastructure (0..16) to classes using SOCINFRA_BREAKS
  const socInfraValueToClass = (val) => {
    const br = SOCINFRA_BREAKS;
    if (val < br[0]) return 0;
    if (val < br[1]) return 1;
    if (val < br[2]) return 2;
    if (val < br[3]) return 3;
    return 4;
  };
  // Map housing stress percentage (0..100) to classes using HOUSING_STRESS_BREAKS
  const housingStressValueToClass = (val) => {
    const br = HOUSING_STRESS_BREAKS;
    if (val < br[0]) return 0;
    if (val < br[1]) return 1;
    if (val < br[2]) return 2;
    if (val < br[3]) return 3;
    return 4;
  };

  // Map walkability (score) to classes using WALKABILITY_BREAKS
  const walkabilityValueToClass = (val) => {
    const br = WALKABILITY_BREAKS;
    if (val < br[0]) return 0;
    if (val < br[1]) return 1;
    if (val < br[2]) return 2;
    if (val < br[3]) return 3;
    return 4;
  };

  // Map residents (SA1) values to classes using dynamic SA1 breaks
  const sa1ResValueToClass = (val) => {
    const br = (sa1ResBreaks && sa1ResBreaks.length === 4) ? sa1ResBreaks : (sa1ResMax ? [sa1ResMax/5, 2*sa1ResMax/5, 3*sa1ResMax/5, 4*sa1ResMax/5] : [100,200,300,400]);
    if (val < br[0]) return 0;
    if (val < br[1]) return 1;
    if (val < br[2]) return 2;
    if (val < br[3]) return 3;
    return 4;
  };

  // Map industry specialisation values (0..1) to classes using SPEC_BREAKS
  const specValueToClass = (val) => {
    const br = SPEC_BREAKS;
    if (val < br[0]) return 0;
    if (val < br[1]) return 1;
    if (val < br[2]) return 2;
    if (val < br[3]) return 3;
    return 4;
  };

  // Unified precinct overlay (server-first) for any indicator
  const computePrecinctOverlay = async (precinctName, year, indicatorName) => {
    const ind = (indicatorName || selectedIndicator || 'Number of jobs');
    try {
      const resp = await fetch(`${API_URL}/api/precinct_overlay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precinctName, year, indicator: ind })
      });
      if (resp.ok) {
        const res = await resp.json();
        if (res && typeof res.dznIntersectCount === 'number') {
          const precinctArea = res.precinctArea || 0;
          const isSpec = /industry|special/i.test(ind);
          const isLum = /(land\s*use\s*mix|land\s*use|lum)/i.test(ind);
          const isDwell = /dwell/i.test(ind);
          const isRes = /resident/i.test(ind);
          const isSa1 = /sa1/i.test(ind);
          const isResSa1 = isRes && isSa1;
          const isAgeMix = /(age\s*diversity|diversity\s*of\s*residents.?\s*age|age\s*mix|age\b)/i.test(ind);
          const isIncomeMix = /(income\s*diversity|diversity\s*of\s*residents.?\s*income|income\s*mix)/i.test(ind);
          const isSocInfra = /(social\s*infrastructure|accessibility\s*of\s*social|social\s*infra)/i.test(ind);
          const isHousingStress = /(housing\s*stress)/i.test(ind);
          const isWalkability = /(\bwalk\b|walkability)/i.test(ind);
          // If Social Infrastructure returned with a DZN spatial unit, ignore and compute SA1 overlay locally
          if (isSocInfra && (!res.spatialUnit || /dzn/i.test(res.spatialUnit))) {
            return await computePrecinctSocInfraOverlay(precinctName, year);
          }
          // If Walkability returned with a DZN spatial unit, ignore and compute SA1 overlay locally
          if (isWalkability && (!res.spatialUnit || /dzn/i.test(res.spatialUnit))) {
            return await computePrecinctWalkabilityOverlay(precinctName, year);
          }
          const toClass = isSpec
            ? specValueToClass
            : (isLum || isAgeMix || isIncomeMix)
              ? specValueToClass
              : isSocInfra
                ? socInfraValueToClass
                : isHousingStress
                  ? housingStressValueToClass
                  : isWalkability
                    ? walkabilityValueToClass
                  : (isDwell
                    ? dwellValueToClass
                    : (isResSa1 ? sa1ResValueToClass : (isRes ? mbValueToClass : jobsValueToClass)));
          const intersections = (res.intersections || []).map(i => ({
            code: i.code,
            value: i.value,
            classIndex: toClass(i.value || 0),
            classLabel: CLASS_LABELS[toClass(i.value || 0)],
            area: i.area,
            areaPct: (typeof i.areaPctPrecinct === 'number') ? i.areaPctPrecinct : ((typeof i.areaPct === 'number') ? i.areaPct : (precinctArea > 0 ? i.area / precinctArea : 0))
          }));
          const areaByClass = [0,0,0,0,0];
          const countByClass = [0,0,0,0,0];
          intersections.forEach(it => { areaByClass[it.classIndex] += it.area; countByClass[it.classIndex] += 1; });
          const classes = CLASS_LABELS.map((label, idx) => ({ index: idx, label, areaShare: precinctArea>0? (areaByClass[idx]/precinctArea):0, count: countByClass[idx] }))
            .filter(c => c.areaShare > 0)
            .sort((a,b)=>b.areaShare-a.areaShare);
          const presentClasses = classes.map(c => c.label);
          intersections.sort((a,b)=>b.areaPct-a.areaPct);
          return {
            precinct: precinctName,
            year,
            precinctArea,
            dznIntersectCount: res.dznIntersectCount || intersections.length,
            spatialUnit: res.spatialUnit || undefined,
            intersections,
            classes,
            presentClasses,
            totals: { areaByClass, countByClass, precinctArea }
          };
        }
      }
    } catch (err) {
      console.warn('Precinct overlay server call failed; falling back to client overlay:', err);
    }
    if (/industry|special/i.test(ind)) {
      return await computePrecinctSpecOverlay(precinctName, year);
    }
    if (/(social\s*infrastructure|accessibility\s*of\s*social|social\s*infra)/i.test(ind)) {
      return await computePrecinctSocInfraOverlay(precinctName, year);
    }
    if (/(\bwalk\b|walkability)/i.test(ind)) {
      return await computePrecinctWalkabilityOverlay(precinctName, year);
    }
    return await computePrecinctJobsOverlay(precinctName, year);
  };

  // Build a median-change paragraph using ONLY intersected areas across years for a precinct
  const buildPrecinctMedianChangeParagraph = async (precinctName, indicatorNameArg) => {
    try {
      const ind = indicatorNameArg || selectedIndicator || 'Number of jobs';
      // Use the same available years logic as indicator narrative
      const getDefaultYears = (indicatorName) => {
        if (indicatorName === 'Accessibility of Social Infrastructure') return [2018, 2021];
        if (indicatorName === 'Housing stress') return [2018, 2021];
        if (indicatorName === 'Walkability') return [2018, 2021];
        if (indicatorName === 'Diversity of residents’ age' || indicatorName === 'Diversity of residents’ income') return [2016, 2021];
        return [2011, 2016, 2021];
      };
      const years = getDefaultYears(ind);
      const isJobs = /job/i.test(ind);
      const isSpec = /(industry|special)/i.test(ind);
      const median = (arr) => {
        const a = (arr || []).filter(v => typeof v === 'number' && isFinite(v)).sort((x,y)=>x-y);
        if (!a.length) return null;
        const mid = Math.floor(a.length/2);
        return a.length % 2 ? a[mid] : (a[mid-1] + a[mid]) / 2;
      };
      const vals = {};
      for (const yr of years) {
        try {
          const overlay = await computePrecinctOverlay(precinctName, yr, ind);
          const arr = (overlay && Array.isArray(overlay.intersections))
            ? overlay.intersections.map(i => isFinite(i?.value) ? Number(i.value) : NaN).filter(v => isFinite(v))
            : [];
          vals[yr] = median(arr);
        } catch (_) {
          vals[yr] = null;
        }
      }
      const fmtVal = (v) => {
        if (!isFinite(v)) return 'n/a';
        if (isJobs) return `${Math.round(v).toLocaleString()}`;
        if (isSpec) return `${Number(v).toFixed(2)}`;
        return `${Number(v).toFixed(2)}`;
      };
      const parts = [];
      years.forEach((yr) => { if (isFinite(vals[yr])) parts.push(`${fmtVal(vals[yr])} in ${yr}`); });
      if (!parts.length) return '';
      const indLower = isJobs ? 'number of jobs' : (isSpec ? 'industry specialisation index' : ind.toLowerCase());
      const noun = isJobs ? 'value' : (isSpec ? 'index' : 'value');
      // Include precinct name and remove the note about intersected areas
      return `The median ${indLower} for ${precinctName} ${noun} has changed from ${parts.join(' to ')}.`;
    } catch (_) {
      return '';
    }
  };

  // Compute SA1-based overlay for Social Infrastructure indicator
  const computePrecinctSocInfraOverlay = async (precinctName, year) => {
    try {
      const resP = await fetch('/data/fb-precincts-official-boundary.geojson');
      if (!resP.ok) throw new Error('Failed to fetch precincts');
      const precincts = await resP.json();
      const precinctFeat = precincts.features.find(f => (f.properties?.name === precinctName));
      if (!precinctFeat) throw new Error('Precinct not found');
      const resSI = await fetch('/data/Social_Infrastructure_Index_SA1_18_21.geojson');
      if (!resSI.ok) throw new Error('Failed to fetch social infrastructure');
      const siFC = await resSI.json();

      // Reuse cleaning helpers via turf (simple area-based intersection using bbox prefilter)
      const toCleanPolygonParts = (geom, tagProps = {}) => {
        if (!geom) return [];
        const feat = turf.feature(geom, tagProps);
        let rew = feat; try { rew = turf.rewind(feat, { reverse: false }); } catch (_) {}
        let unk; try { unk = turf.unkinkPolygon(rew); } catch (_) { unk = turf.featureCollection([rew]); }
        const flat = [];
        for (const f of unk.features) {
          if (!f || !f.geometry) continue;
            if (f.geometry.type === 'Polygon') flat.push(f);
            else if (f.geometry.type === 'MultiPolygon') {
              for (const rings of f.geometry.coordinates) { flat.push(turf.polygon(rings, tagProps)); }
            }
        }
        return flat.filter(f => { try { return turf.area(f) > 0; } catch { return false; } });
      };

      const R = 6378137.0;
      const lonLatToMerc = ([lon, lat]) => [R * (lon * Math.PI / 180), R * Math.log(Math.tan(Math.PI/4 + (lat * Math.PI/180)/2))];
      const projectCoords = (coords) => coords.map(pt => Array.isArray(pt[0]) ? projectCoords(pt) : lonLatToMerc(pt));
      const projectFeature = (feat) => {
        const g = feat.geometry; if (!g) return feat;
        if (g.type === 'Polygon') return turf.polygon(projectCoords(g.coordinates), feat.properties || {});
        if (g.type === 'MultiPolygon') return turf.multiPolygon(projectCoords(g.coordinates), feat.properties || {});
        return feat;
      };
      const polygonRingArea = (ring) => {
        let sum = 0; for (let i=0,j=ring.length-1;i<ring.length;j=i++) { const [xi,yi]=ring[i]; const [xj,yj]=ring[j]; sum += (xj*yi - xi*yj); }
        return Math.abs(sum)/2;
      };
      const planarArea = (geom) => {
        if (!geom) return 0; const g = geom;
        if (g.type === 'Polygon') { const [outer,...holes]=g.coordinates; let a=polygonRingArea(outer||[]); for (const h of holes||[]) a -= polygonRingArea(h); return Math.max(0,a); }
        if (g.type === 'MultiPolygon') { let a=0; for (const poly of g.coordinates){ const [outer,...holes]=poly; a+=polygonRingArea(outer||[]); for (const h of holes||[]) a -= polygonRingArea(h);} return Math.max(0,a);} return 0;
      };

      const precinctParts = toCleanPolygonParts(precinctFeat.geometry, { name: precinctName });
      if (!precinctParts.length) throw new Error('Invalid precinct geometry');
      const precinctPartsMerc = precinctParts.map(projectFeature);
      const precinctArea = precinctPartsMerc.reduce((a,f)=>a+planarArea(f.geometry),0);
      if (!precinctArea) throw new Error('Zero precinct area');

      const prop = year === 2018 ? 'SoInfra_18' : 'SoInfra_21';
      const areaByClass = [0,0,0,0,0];
      const countByClass = [0,0,0,0,0];
      const intersections = [];
      let sa1IntersectCount = 0;

      for (const f of (siFC.features || [])) {
        try {
          const sa1Parts = toCleanPolygonParts(f.geometry, { code: f.properties?.SA1_CODE_2 || '' });
          if (!sa1Parts.length) continue;
          const sa1PartsMerc = sa1Parts.map(projectFeature);
          let accumArea = 0;
          for (const pPart of precinctPartsMerc) {
            const pB = turf.bbox(pPart);
            for (const sPart of sa1PartsMerc) {
              const sB = turf.bbox(sPart);
              const bboxOverlap = !(sB[2]<pB[0] || sB[0]>pB[2] || sB[3]<pB[1] || sB[1]>pB[3]);
              if (!bboxOverlap) continue;
              let maybe; try { maybe = turf.booleanIntersects(pPart, sPart); } catch { maybe = true; }
              if (!maybe) continue;
              let inter=null; try { inter = turf.intersect(pPart, sPart); } catch { inter=null; }
              if (!inter) continue;
              const aPart = planarArea(inter.geometry) || 0;
              if (aPart>0) accumArea += aPart;
            }
          }
          if (accumArea <= 0) continue;
          const val = parseFloat(f.properties?.[prop] ?? '0');
          const cls = socInfraValueToClass(isFinite(val)?val:0);
          areaByClass[cls] += accumArea;
          countByClass[cls] += 1;
          sa1IntersectCount += 1;
          intersections.push({
            code: f.properties?.SA1_CODE_2 || '',
            value: isFinite(val)?val:0,
            classIndex: cls,
            classLabel: CLASS_LABELS[cls],
            area: accumArea,
            areaPct: accumArea / precinctArea
          });
        } catch (_) { /* skip */ }
      }

      intersections.sort((a,b)=>b.areaPct-a.areaPct);
      const shareByClass = areaByClass.map(a=>a/precinctArea);
      const classes = CLASS_LABELS.map((label,i)=>({ index:i,label,areaShare:shareByClass[i],count:countByClass[i] }))
        .filter(c=>c.areaShare>0).sort((a,b)=>b.areaShare-a.areaShare);
      const presentClasses = classes.map(c=>c.label);

      return {
        precinct: precinctName,
        year,
        precinctArea,
        dznIntersectCount: sa1IntersectCount, // reuse field name for downstream compatibility
        spatialUnit: 'SA1',
        intersections,
        classes,
        presentClasses,
        totals: { areaByClass, countByClass, precinctArea }
      };
    } catch (e) {
      console.warn('Failed Social Infrastructure overlay fallback:', e);
      return { precinct: precinctName, year, precinctArea: 0, dznIntersectCount: 0, intersections: [], classes: [], presentClasses: [], totals: { areaByClass:[0,0,0,0,0], countByClass:[0,0,0,0,0], precinctArea:0 } };
    }
  };

  // Compute SA1-based overlay for Walkability indicator
  const computePrecinctWalkabilityOverlay = async (precinctName, year) => {
    try {
      const resP = await fetch('/data/fb-precincts-official-boundary.geojson');
      if (!resP.ok) throw new Error('Failed to fetch precincts');
      const precincts = await resP.json();
      const precinctFeat = precincts.features.find(f => (f.properties?.name === precinctName));
      if (!precinctFeat) throw new Error('Precinct not found');
      const resWK = await fetch('/data/Walkability_SA1_16_21.geojson');
      if (!resWK.ok) throw new Error('Failed to fetch walkability');
      const wkFC = await resWK.json();

      const toCleanPolygonParts = (geom, tagProps = {}) => {
        if (!geom) return [];
        const feat = turf.feature(geom, tagProps);
        let rew = feat; try { rew = turf.rewind(feat, { reverse: false }); } catch (_) {}
        let unk; try { unk = turf.unkinkPolygon(rew); } catch (_) { unk = turf.featureCollection([rew]); }
        const flat = [];
        for (const f of unk.features) {
          if (!f || !f.geometry) continue;
          if (f.geometry.type === 'Polygon') flat.push(f);
          else if (f.geometry.type === 'MultiPolygon') {
            for (const rings of f.geometry.coordinates) { flat.push(turf.polygon(rings, tagProps)); }
          }
        }
        return flat.filter(f => { try { return turf.area(f) > 0; } catch { return false; } });
      };

      const R = 6378137.0;
      const lonLatToMerc = ([lon, lat]) => [R * (lon * Math.PI / 180), R * Math.log(Math.tan(Math.PI/4 + (lat * Math.PI/180)/2))];
      const projectCoords = (coords) => coords.map(pt => Array.isArray(pt[0]) ? projectCoords(pt) : lonLatToMerc(pt));
      const projectFeature = (feat) => {
        const g = feat.geometry; if (!g) return feat;
        if (g.type === 'Polygon') return turf.polygon(projectCoords(g.coordinates), feat.properties || {});
        if (g.type === 'MultiPolygon') return turf.multiPolygon(projectCoords(g.coordinates), feat.properties || {});
        return feat;
      };
      const polygonRingArea = (ring) => { let sum=0; for (let i=0,j=ring.length-1;i<ring.length;j=i++){ const [xi,yi]=ring[i]; const [xj,yj]=ring[j]; sum += (xj*yi - xi*yj);} return Math.abs(sum)/2; };
      const planarArea = (geom) => {
        if (!geom) return 0; const g = geom;
        if (g.type === 'Polygon') { const [outer,...holes]=g.coordinates; let a=polygonRingArea(outer||[]); for (const h of holes||[]) a -= polygonRingArea(h); return Math.max(0,a); }
        if (g.type === 'MultiPolygon') { let a=0; for (const poly of g.coordinates){ const [outer,...holes]=poly; a+=polygonRingArea(outer||[]); for (const h of holes||[]) a -= polygonRingArea(h);} return Math.max(0,a);} return 0;
      };

      const precinctParts = toCleanPolygonParts(precinctFeat.geometry, { name: precinctName });
      if (!precinctParts.length) throw new Error('Invalid precinct geometry');
      const precinctPartsMerc = precinctParts.map(projectFeature);
      const precinctArea = precinctPartsMerc.reduce((a,f)=>a+planarArea(f.geometry),0);
      if (!precinctArea) throw new Error('Zero precinct area');

      const prop = year === 2018 ? 'Walkabi_18' : 'Walkabi_21';
      const areaByClass = [0,0,0,0,0];
      const countByClass = [0,0,0,0,0];
      const intersections = [];
      let sa1IntersectCount = 0;

      for (const f of (wkFC.features || [])) {
        try {
          const sa1Parts = toCleanPolygonParts(f.geometry, { code: f.properties?.SA1_CODE_2 || '' });
          if (!sa1Parts.length) continue;
          const sa1PartsMerc = sa1Parts.map(projectFeature);
          let accumArea = 0;
          for (const pPart of precinctPartsMerc) {
            const pB = turf.bbox(pPart);
            for (const sPart of sa1PartsMerc) {
              const sB = turf.bbox(sPart);
              const bboxOverlap = !(sB[2]<pB[0] || sB[0]>pB[2] || sB[3]<pB[1] || sB[1]>pB[3]);
              if (!bboxOverlap) continue;
              let maybe; try { maybe = turf.booleanIntersects(pPart, sPart); } catch { maybe = true; }
              if (!maybe) continue;
              let inter=null; try { inter = turf.intersect(pPart, sPart); } catch { inter=null; }
              if (!inter) continue;
              const aPart = planarArea(inter.geometry) || 0;
              if (aPart>0) accumArea += aPart;
            }
          }
          if (accumArea <= 0) continue;
          const val = parseFloat(f.properties?.[prop] ?? '0');
          const cls = walkabilityValueToClass(isFinite(val)?val:0);
          areaByClass[cls] += accumArea;
          countByClass[cls] += 1;
          sa1IntersectCount += 1;
          intersections.push({
            code: f.properties?.SA1_CODE_2 || '',
            value: isFinite(val)?val:0,
            classIndex: cls,
            classLabel: CLASS_LABELS[cls],
            area: accumArea,
            areaPct: accumArea / precinctArea
          });
        } catch (_) { /* skip */ }
      }

      intersections.sort((a,b)=>b.areaPct-a.areaPct);
      const shareByClass = areaByClass.map(a=>a/precinctArea);
      const classes = CLASS_LABELS.map((label,i)=>({ index:i,label,areaShare:shareByClass[i],count:countByClass[i] }))
        .filter(c=>c.areaShare>0).sort((a,b)=>b.areaShare-a.areaShare);
      const presentClasses = classes.map(c=>c.label);

      return {
        precinct: precinctName,
        year,
        precinctArea,
        dznIntersectCount: sa1IntersectCount,
        spatialUnit: 'SA1',
        intersections,
        classes,
        presentClasses,
        totals: { areaByClass, countByClass, precinctArea }
      };
    } catch (e) {
      console.warn('Failed Walkability overlay fallback:', e);
      return { precinct: precinctName, year, precinctArea: 0, dznIntersectCount: 0, intersections: [], classes: [], presentClasses: [], totals: { areaByClass:[0,0,0,0,0], countByClass:[0,0,0,0,0], precinctArea:0 } };
    }
  };

  // Compute per-DZN intersections and class distribution for a precinct and year
  const computePrecinctJobsOverlay = async (precinctName, year) => {
    // First try server-side overlay for robustness (Shapely + pyproj)
    try {
      const resp = await fetch(`${API_URL}/api/precinct_overlay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precinctName, year, indicator: 'Number of jobs' })
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

  // Compute per-DZN intersections and class distribution for a precinct and year (Industry specialisation)
  const computePrecinctSpecOverlay = async (precinctName, year) => {
    // First try server-side overlay for robustness (Shapely + pyproj)
    try {
      const resp = await fetch(`${API_URL}/api/precinct_overlay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precinctName, year, indicator: 'Industry specialisation' })
      });
      if (resp.ok) {
        const res = await resp.json();
        if (res && typeof res.dznIntersectCount === 'number') {
          // Map server output to our stats shape
          const precinctArea = res.precinctArea || 0;
          const intersections = (res.intersections || []).map(i => ({
            code: i.code,
            value: i.value,
            classIndex: specValueToClass(i.value || 0),
            classLabel: CLASS_LABELS[specValueToClass(i.value || 0)],
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
          console.log(`[Server Overlay SPEC] ${precinctName} (${year}):`, res);
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
    const propByYear = { 2011: 'Special_11', 2016: 'Special_16', 2021: 'Special_21' };
    const codeByYear = { 2011: 'DZN_CODE11', 2016: 'DZN_CODE16', 2021: 'DZN_CODE21' };
    const yrToUrl = {
      2011: '/data/Inudstry_Specialisation_DZN_11.geojson',
      2016: '/data/Inudstry_Specialisation_DZN_16.geojson',
      2021: '/data/Inudstry_Specialisation_DZN_21.geojson'
    };
    const specProp = propByYear[year] || 'Special_21';
    const codeProp = codeByYear[year] || 'DZN_CODE21';

    let specFC = specGeoByYear.current && specGeoByYear.current[year];
    if (!specFC) {
      const resS = await fetch(yrToUrl[year] || yrToUrl[2021]);
      if (!resS.ok) throw new Error('Failed to fetch industry specialisation');
      specFC = await resS.json();
    }
    const resP = await fetch('/data/fb-precincts-official-boundary.geojson');
    if (!resP.ok) throw new Error('Failed to fetch precincts');
    const precincts = await resP.json();
    const precinctFeat = precincts.features.find(f => (f.properties?.name === precinctName));
    if (!precinctFeat) throw new Error('Precinct not found');

    const toCleanPolygonParts = (geom, tagProps = {}) => {
      if (!geom) return [];
      const feat = turf.feature(geom, tagProps);
      let rew = feat;
      try { rew = turf.rewind(feat, { reverse: false }); } catch (_) {}
      let unk;
      try { unk = turf.unkinkPolygon(rew); } catch (_) { unk = turf.featureCollection([rew]); }
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
      const cleaned = flat.filter((f) => {
        try { return turf.area(f) > 0; } catch { return false; }
      });
      return cleaned;
    };

    const R = 6378137.0;
    const lonLatToMerc = ([lon, lat]) => {
      const x = R * (lon * Math.PI / 180);
      const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
      return [x, y];
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
    const precinctPartsMerc = precinctParts.map(projectFeature);
    const precinctArea = precinctPartsMerc.reduce((acc, f) => acc + planarArea(f.geometry), 0);
    if (!precinctArea) throw new Error('Zero precinct area');

    const areaByClass = [0,0,0,0,0];
    const countByClass = [0,0,0,0,0];
    let dznIntersectCount = 0;
    const intersections = [];

    for (const f of (specFC.features || [])) {
      try {
        const dznParts = toCleanPolygonParts(f.geometry, { code: f.properties?.[codeProp] || '' });
        if (!dznParts.length) continue;
        const dznPartsMerc = dznParts.map(projectFeature);
        let accumArea = 0;
        for (let pi = 0; pi < precinctPartsMerc.length; pi++) {
          const pPartM = precinctPartsMerc[pi];
          const pB = turf.bbox(pPartM);
          for (let di = 0; di < dznPartsMerc.length; di++) {
            const dPartM = dznPartsMerc[di];
            const dB = turf.bbox(dPartM);
            const bboxOverlap = !(dB[2] < pB[0] || dB[0] > pB[2] || dB[3] < pB[1] || dB[1] > pB[3]);
            if (!bboxOverlap) continue;
            let maybe;
            try { maybe = turf.booleanIntersects(pPartM, dPartM); } catch { maybe = true; }
            if (!maybe) continue;
            let inter = null;
            try { inter = turf.intersect(pPartM, dPartM); } catch { inter = null; }
            if (!inter) continue;
            const aPart = (() => { try { return planarArea(inter.geometry) || 0; } catch { return 0; } })();
            if (aPart > 0) accumArea += aPart;
          }
        }
        if (accumArea <= 0) continue;
        const val = parseFloat(f.properties?.[specProp] ?? '0');
        const cls = specValueToClass(isFinite(val) ? val : 0);
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
      .filter(c => c.areaShare > 0)
      .sort((a,b) => b.areaShare - a.areaShare);
    intersections.sort((a,b) => b.areaPct - a.areaPct);
    const presentClasses = classes.map(c => c.label);

    return {
      precinct: precinctName,
      year,
      precinctArea,
      dznIntersectCount,
      intersections,
      classes,
      presentClasses,
      totals: { areaByClass, countByClass, precinctArea }
    };
  };

  // Deterministic precinct narrative generator (exact template, no LLM)
  const generatePrecinctNarrativeDeterministic = (stats, indicatorNameArg) => {
    const { precinct, year, dznIntersectCount, classes } = stats || {};
    const hasData = Array.isArray(classes) && classes.length > 0;
    // Resolve spatial scale label from metadata when available; fallback to 'DZN'
    const indicatorName = indicatorNameArg || 'Number of jobs';
    const indicatorLower = String(indicatorName || '').toLowerCase();
    const meta = indicatorMetadata && indicatorMetadata[metadataKeyFor(indicatorName)];
    const spatialScaleFromMeta = meta && typeof meta['Spatial scale'] === 'string' ? meta['Spatial scale'] : '';
    // Prefer server-reported spatial unit when available
    // Determine spatial scale prioritizing server-provided unit, then metadata, then indicator name heuristic
    const normalizeUnit = (s) => {
      if (!s) return '';
      if (/mesh\s*block/i.test(s)) return 'MB';
      if (/Statistical\s*Area\s*Level\s*1/i.test(s)) return 'SA1';
      if (/Destination\s*Zone/i.test(s)) return 'DZN';
      return s.toUpperCase();
    };
    let spatialScale = normalizeUnit(stats && stats.spatialUnit ? stats.spatialUnit : '');
    if (!spatialScale) {
      if (/\bSA1\b/i.test(spatialScaleFromMeta)) spatialScale = 'SA1';
      else if (/\bDZN\b/i.test(spatialScaleFromMeta)) spatialScale = 'DZN';
      else if (/mesh\s*block|\bMB\b/i.test(spatialScaleFromMeta)) spatialScale = 'MB';
    }
    if (!spatialScale) {
      if (/social\s*infrastructure|accessibility\s*of\s*social|social\s*infra/i.test(indicatorName)) spatialScale = 'SA1';
      else if (/land\s*use\s*mix|\bLUM\b/i.test(indicatorName)) spatialScale = 'SA1';
      else if (/(resident|dwell)/i.test(indicatorName)) spatialScale = 'MB';
      else spatialScale = 'DZN';
    }

    const spatialUnitPhrase = (() => {
      if (spatialScale === 'DZN') return 'destination zone (DZN)';
      if (spatialScale === 'SA1') return 'Statistical Area Level 1 (SA1)';
      if (spatialScale === 'MB') return 'mesh block (MB)';
      return spatialScale;
    })();

    if (!hasData) {
      return `The **${precinct}** precinct intersects with **0** **${spatialScale}** areas based on the **${year}** dataset. Within the precinct, ${spatialUnitPhrase} areas are classified as none. Overall, the **${precinct}** precinct is characterised by a lowest ${indicatorLower}.`;
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
    const dominant = classes[0];
    const others = classes.slice(1);

    const classRank = (label) => {
      const l = String(label || '').toLowerCase().trim();
      if (!l) return 0;
      // Common 5-class scheme
      if (l === 'highest') return 50;
      if (l === 'high') return 40;
      if (l === 'medium') return 30;
      if (l === 'low') return 20;
      if (l === 'lowest') return 10;
      // Other variants seen in some indicators
      if (l === 'very high') return 45;
      if (l === 'very low') return 15;
      if (l === 'none') return 0;
      return 0;
    };

    const presentPlainLabels = classes
      .map((c) => String(c?.label || '').trim())
      .filter(Boolean);
    const uniquePresent = [...new Set(presentPlainLabels)];
    const ranked = [...uniquePresent].sort((a, b) => classRank(b) - classRank(a));
    const hiLabel = ranked[0] || (dominant && dominant.label) || '';
    const loLabel = ranked[ranked.length - 1] || (dominant && dominant.label) || '';
    const useLowestWord = /lowest/i.test(loLabel);
    const rangeTailWord = useLowestWord ? 'lowest' : 'low';

    const isSingularArea = dznIntersectCount === 1;
    const areaNoun = isSingularArea ? 'area' : 'areas';
    const classifyVerb = isSingularArea ? 'is' : 'are';
    const coverVerb = isSingularArea ? 'covers' : 'cover';

    // Narrative-ready indicator label (used in coverage sentences)
    const indicatorPhrase = indicatorLower;

    // Lead sentence per template
    const s1 = `The **${precinct}** precinct intersects with **${dznIntersectCount}** **${spatialScale}** area${dznIntersectCount === 1 ? '' : 's'} based on the **${year}** dataset.`;
    // Classification range (avoid listing all class labels)
    const isSingleClass = uniquePresent.length <= 1;
    const s2 = isSingleClass
      ? `Within the precinct, ${spatialUnitPhrase} ${areaNoun} ${classifyVerb} classified with ${hiLabel} ${indicatorLower}.`
      : `Within the precinct, ${spatialUnitPhrase} ${areaNoun} ${classifyVerb} classified from ${hiLabel} to ${rangeTailWord} ${indicatorLower}.`;
    // Overall characterisation (placed before coverage details)
    const s3 = ` Overall, the **${precinct}** precinct is characterised by a **${dominant.label}** ${indicatorLower}.`;
    // Dominant class coverage
    const dominantLabelLower = String(dominant.label || '').toLowerCase();
    const s4 = ` Areas with **${dominantLabelLower}** ${indicatorPhrase} ${coverVerb} **${fmtPct(dominant.areaShare)}%** of the precinct area.`;
    // Contrast sentence for other classes (if any)
    let s5 = '';
    if (others.length > 0) {
      const otherLabels = others.map((c) => `**${String(c.label || '').toLowerCase()}**`);
      const otherPcts = others.map((c) => `**${fmtPct(c.areaShare)}%**`);
      s5 = ` In contrast, areas with ${joinList(otherLabels)} ${indicatorPhrase} account for ${joinList(otherPcts)}, respectively.`;
    }

    // Build change paragraph comparing medians across years using ONLY intersected areas
    const buildChangeParagraph = async () => {
      const yearsAll = [2011, 2016, 2021];
      const indicatorName = indicatorNameArg || 'Number of jobs';
      const median = (arr) => {
        const a = (arr || []).filter(v => typeof v === 'number' && isFinite(v)).sort((x,y)=>x-y);
        if (!a.length) return null;
        const mid = Math.floor(a.length/2);
        return a.length % 2 ? a[mid] : (a[mid-1] + a[mid]) / 2;
      };
      const valsByYear = {};
      for (const yr of yearsAll) {
        try {
          let overlay;
          if (indicatorName === 'Number of jobs') {
            overlay = await computePrecinctJobsOverlay(precinct, yr);
          } else if (indicatorName === 'Industry specialisation') {
            overlay = await computePrecinctSpecOverlay(precinct, yr);
          } else {
            overlay = null;
          }
          if (overlay && Array.isArray(overlay.intersections) && overlay.intersections.length) {
            const arr = overlay.intersections
              .map(i => i && isFinite(i.value) ? Number(i.value) : NaN)
              .filter(v => isFinite(v));
            valsByYear[yr] = median(arr);
          } else {
            valsByYear[yr] = null;
          }
        } catch (_) {
          valsByYear[yr] = null;
        }
      }
      const fmtVal = (v) => {
        if (!isFinite(v)) return 'n/a';
        return indicatorName === 'Number of jobs' ? `${Math.round(v).toLocaleString()}` : `${Number(v).toFixed(2)}`;
      };
      const v11 = valsByYear[2011];
      const v16 = valsByYear[2016];
      const v21 = valsByYear[2021];
      const parts = [];
      if (isFinite(v11)) parts.push(`${fmtVal(v11)} in 2011`);
      if (isFinite(v16)) parts.push(`${fmtVal(v16)} in 2016`);
      if (isFinite(v21)) parts.push(`${fmtVal(v21)} in 2021`);
      if (!parts.length) return '';
      const indLower = indicatorName.toLowerCase();
      return `The median ${indLower} ${indicatorName === 'Number of jobs' ? 'value' : 'index'} (computed from intersected areas only) has changed from ${parts.join(' to ')}.`;
    };

    const firstParagraph = `${s1} ${s2}${s3}${s4}${s5}`;
    // Since buildChangeParagraph is async, return combined text via placeholder; caller handles async rendering.
    // For synchronous usage, fall back to first paragraph only and update when async result resolves elsewhere.
    // Here, we optimistically attempt to resolve synchronously if possible.
    // Note: generatePrecinctNarrativeDeterministic is used synchronously; to avoid UI disruption, we will not await here.
    // The UI already shows available years separately.
    // Return first paragraph; the async change paragraph is computed in overlay-driven narrative elsewhere.
    return firstParagraph;
  };

  const handleExportToPDF = async () => {
    if (!panelFocus || !map.current) return;
    setIsExporting(true);
    setExportProgress(0);
    setExportProgressText('Preparing…');

    try {
      const stripMarkdown = (text) => String(text || '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\r\n/g, '\n')
        .trim();

      const waitForMapIdleOrTimeout = (timeoutMs = 2500) => new Promise((resolve) => {
        if (!map.current) return resolve();
        let done = false;
        const finish = (t) => {
          if (done) return;
          done = true;
          if (t) clearTimeout(t);
          resolve();
        };
        const onIdle = () => {
          try { map.current && map.current.off && map.current.off('idle', onIdle); } catch (_) { /* ignore */ }
          finish();
        };
        try {
          map.current.once('idle', onIdle);
        } catch (_) {
          finish();
          return;
        }
        const t = setTimeout(() => {
          try { map.current && map.current.off && map.current.off('idle', onIdle); } catch (_) { /* ignore */ }
          finish(t);
        }, timeoutMs);
      });

      const waitForMapRenderOrTimeout = (timeoutMs = 1200) => new Promise((resolve) => {
        if (!map.current) return resolve();
        let done = false;
        const finish = (t) => {
          if (done) return;
          done = true;
          if (t) clearTimeout(t);
          resolve();
        };
        const onRender = () => {
          try { map.current && map.current.off && map.current.off('render', onRender); } catch (_) { /* ignore */ }
          finish();
        };
        try {
          map.current.once('render', onRender);
        } catch (_) {
          finish();
          return;
        }
        const t = setTimeout(() => {
          try { map.current && map.current.off && map.current.off('render', onRender); } catch (_) { /* ignore */ }
          finish(t);
        }, timeoutMs);
      });

      const waitForMapFullyReady = async (timeoutMs = 7000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const m = map.current;
          if (!m) return;

          const styleOk = typeof m.isStyleLoaded === 'function' ? m.isStyleLoaded() : true;
          const tilesOk = typeof m.areTilesLoaded === 'function' ? m.areTilesLoaded() : true;
          if (styleOk && tilesOk) {
            // Ensure at least one render after things are ready
            // eslint-disable-next-line no-await-in-loop
            await waitForMapRenderOrTimeout(1200);
            return;
          }

          // eslint-disable-next-line no-await-in-loop
          await waitForNextFrame();
        }

        // Fallback: don't hang forever
        await waitForMapRenderOrTimeout(800);
      };

      const setYearAndWait = async (yr) => {
        if (!map.current) return;
        setSelectedYear(yr);
        // Let React commit year-driven layer changes, then wait for map to render.
        await waitForNextFrame();
        try { map.current && map.current.triggerRepaint && map.current.triggerRepaint(); } catch (_) { /* ignore */ }
        await waitForMapFullyReady(8000);
      };

      const waitForNextFrame = () => new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(resolve);
          return;
        }
        setTimeout(resolve, 0);
      });

      const fitTextLinesToBox = (doc, text, boxWidth, boxHeight, startFontSize = 10, minFontSize = 8) => {
        const plain = stripMarkdown(text);
        for (let fs = startFontSize; fs >= minFontSize; fs -= 1) {
          doc.setFontSize(fs);
          const lines = doc.splitTextToSize(plain, boxWidth);
          const h = doc.getTextDimensions(lines).h;
          if (h <= boxHeight) return { fontSize: fs, lines };
        }
        doc.setFontSize(minFontSize);
        return { fontSize: minFontSize, lines: doc.splitTextToSize(plain, boxWidth) };
      };

      // 1. Initialize jsPDF
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: 'a4'
      });

      // 4. Define PDF Layout
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);

      const getDefaultYearsForIndicator = (indicatorName) => {
        if (indicatorName === 'Accessibility of Social Infrastructure') return [2018, 2021];
        if (indicatorName === 'Housing stress') return [2018, 2021];
        if (indicatorName === 'Walkability') return [2018, 2021];
        if (indicatorName === 'Diversity of residents’ age' || indicatorName === 'Diversity of residents’ income') return [2016, 2021];
        return [2011, 2016, 2021];
      };

      const normalizeSpatialUnit = (s) => {
        if (!s) return '';
        if (/mesh\s*block/i.test(s)) return 'MB';
        if (/Statistical\s*Area\s*Level\s*1/i.test(s)) return 'SA1';
        if (/Destination\s*Zone/i.test(s)) return 'DZN';
        const up = String(s).toUpperCase();
        if (up === 'MB' || up === 'SA1' || up === 'DZN') return up;
        return up;
      };

      const fmtValueForIndicator = (indicatorName, v) => {
        if (!isFinite(v)) return 'n/a';
        if (indicatorName === 'Number of jobs') return `${Math.round(v).toLocaleString()}`;
        if (indicatorName === 'Number of residents' || indicatorName === 'Number of dwellings' || indicatorName === 'Number of residents_SA1') return `${Math.round(v).toLocaleString()}`;
        if (indicatorName === 'Housing stress') return `${Number(v).toFixed(1)}%`;
        // Most indices are 0..1 or small scores; keep concise.
        return `${Number(v).toFixed(2)}`;
      };

      const getSourceDataOrFetch = async (sourceId, url) => {
        try {
          const src = map.current && map.current.getSource ? map.current.getSource(sourceId) : null;
          if (src && src._data && src._data.features) return src._data;
        } catch (_) { /* ignore */ }
        if (!url) return null;
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          return await r.json();
        } catch (_) {
          return null;
        }
      };

      // Simple point-in-polygon for Polygon/MultiPolygon (WGS84) without turf.
      const pointInPolygon = (pt, geom) => {
        try {
          if (!pt || !geom) return false;
          const [x, y] = pt;
          const testRing = (ring) => {
            let inside = false;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
              const xi = ring[i][0], yi = ring[i][1];
              const xj = ring[j][0], yj = ring[j][1];
              const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
              if (intersect) inside = !inside;
            }
            return inside;
          };
          if (geom.type === 'Polygon') {
            const ring = (geom.coordinates && geom.coordinates[0]) || [];
            return testRing(ring);
          }
          if (geom.type === 'MultiPolygon') {
            for (const poly of (geom.coordinates || [])) {
              const ring = (poly && poly[0]) || [];
              if (testRing(ring)) return true;
            }
          }
        } catch (_) { /* ignore */ }
        return false;
      };

      const hexToRgb = (hex) => {
        try {
          const h = String(hex || '').replace('#', '').trim();
          if (h.length === 3) {
            const r = parseInt(h[0] + h[0], 16);
            const g = parseInt(h[1] + h[1], 16);
            const b = parseInt(h[2] + h[2], 16);
            return [r, g, b];
          }
          if (h.length >= 6) {
            const r = parseInt(h.slice(0, 2), 16);
            const g = parseInt(h.slice(2, 4), 16);
            const b = parseInt(h.slice(4, 6), 16);
            return [r, g, b];
          }
        } catch (_) { /* ignore */ }
        return [0, 0, 0];
      };

      const drawMiniBarChart = (doc, x, y, w, h, series, opts = {}) => {
        const activeYear = Number(opts.activeYear);
        const title = String(opts.title || '').trim();
        const yLabel = String(opts.yLabel || '').trim();
        const isFixed01 = !!opts.fixed01;
        const years = (Array.isArray(series) ? series : []).map(d => Number(d?.year)).filter(Boolean);
        const data = (Array.isArray(series) ? series : [])
          .map(d => ({ year: Number(d?.year), value: (d?.value === null || typeof d?.value === 'undefined' || !isFinite(d?.value)) ? 0 : Number(d.value) }))
          .filter(d => isFinite(d.year));
        if (!data.length) return;

        // Card background
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(233, 236, 239);
        doc.setLineWidth(1);
        doc.roundedRect(x, y, w, h, 6, 6, 'FD');

        // Title
        const titleH = title ? 14 : 0;
        if (title) {
          doc.setTextColor(31, 41, 55);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text(title, x + 10, y + 14);
        }

        // Plot area
        const pad = { l: 42, r: 10, t: 10 + titleH, b: 22 };
        const plotX = x + pad.l;
        const plotY = y + pad.t;
        const plotW = Math.max(1, w - pad.l - pad.r);
        const plotH = Math.max(1, h - pad.t - pad.b);

        const maxVal = isFixed01 ? 1.0 : Math.max(1, ...data.map(d => d.value));
        const axisMax = maxVal;
        const yScale = (v) => plotY + plotH * (1 - (axisMax ? (v / axisMax) : 0));

        // Y grid + ticks
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const ticks = isFixed01 ? [0, 0.25, 0.5, 0.75, 1.0] : [0, 0.25, 0.5, 0.75, 1.0].map(t => t * axisMax);
        for (const tv of ticks) {
          const yy = yScale(tv);
          doc.setDrawColor(241, 243, 245);
          doc.setLineWidth(1);
          doc.line(plotX, yy, plotX + plotW, yy);
          doc.setTextColor(108, 117, 125);
          const label = isFixed01 ? Number(tv).toFixed(2) : `${Math.round(tv).toLocaleString()}`;
          doc.text(label, x + pad.l - 8, yy + 3, { align: 'right' });
        }
        // Y axis
        doc.setDrawColor(173, 181, 189);
        doc.line(plotX, plotY, plotX, plotY + plotH);

        // Y label (rotated)
        if (yLabel) {
          doc.setTextColor(73, 80, 87);
          doc.setFontSize(8);
          // place within left margin
          doc.text(yLabel, x + 12, plotY + plotH / 2, { angle: 90, align: 'center' });
        }

        // X labels and bars
        const n = data.length;
        const xStep = plotW / n;
        const barW = xStep * 0.45;
        const activeFill = hexToRgb('#2563EB');
        const inactiveFill = hexToRgb('#94a3b8');

        for (let i = 0; i < n; i++) {
          const d = data[i];
          const bx = plotX + i * xStep + (xStep - barW) / 2;
          const by = yScale(d.value);
          let bh = Math.max(0, (plotY + plotH) - by);
          if (d.value > 0 && bh > 0 && bh < 2) bh = 2;
          const isActive = isFinite(activeYear) && d.year === activeYear;
          const fill = isActive ? activeFill : inactiveFill;
          doc.setFillColor(fill[0], fill[1], fill[2]);
          doc.rect(bx, by, barW, bh, 'F');

          doc.setTextColor(55, 65, 81);
          doc.setFontSize(9);
          doc.text(String(d.year), plotX + i * xStep + xStep / 2, y + h - 8, { align: 'center' });
        }

        // X axis title
        doc.setTextColor(73, 80, 87);
        doc.setFontSize(8);
        doc.text('Year', plotX + plotW / 2, y + h - 2, { align: 'center' });
      };

      const buildIntersectedAreaCalloutModels = async (overlayStats, indicatorName, years) => {
        const stats = overlayStats || {};
        const overlayYear = Number(stats.year) || (years && years.length ? years[years.length - 1] : selectedYear) || 2021;
        const unit = normalizeSpatialUnit(stats.spatialUnit || '') || (() => {
          const meta = indicatorMetadata && indicatorMetadata[metadataKeyFor(indicatorName)];
          const s = meta && typeof meta['Spatial scale'] === 'string' ? meta['Spatial scale'] : '';
          return normalizeSpatialUnit(s);
        })() || (/resident|dwell/i.test(indicatorName) ? 'MB' : (/land\s*use|age|income|social|housing|walk/i.test(indicatorName) ? 'SA1' : 'DZN'));

        const intersections = Array.isArray(stats.intersections) ? stats.intersections : [];
        const ordered = [...intersections].sort((a, b) => (Number(b?.areaPct) || 0) - (Number(a?.areaPct) || 0));
        if (!ordered.length) return { unit, models: [] };

        // SA1 combined sources (single file, multi-year properties)
        const sa1Config = {
          'Land use mix': { sourceId: 'land-use-mix-data-source', url: '/data/Land_Use_Mix__SA1_11_16_21.geojson', codeProp: 'SA1_CODE_2', propByYear: { 2011: 'LUM_11', 2016: 'LUM_16', 2021: 'LUM_21' } },
          'Number of residents_SA1': { sourceId: 'residents-sa1-data-source', url: '/data/Number_of_Residents_and_Dwellings_SA1_11_16_21.geojson', codeProp: 'SA1_CODE_2', propByYear: { 2011: 'Person_11', 2016: 'Person_16', 2021: 'Person_21' } },
          'Diversity of residents’ age': { sourceId: 'age-mix-data-source', url: '/data/Age_Mix__SA1_16_21.geojson', codeProp: 'SA1_CODE_2', propByYear: { 2016: 'Age_Mix_16', 2021: 'Age_Mix_21' } },
          'Diversity of residents’ income': { sourceId: 'income-mix-data-source', url: '/data/Income_Mix_SA1_16_21.geojson', codeProp: 'SA1_CODE_2', propByYear: { 2016: 'Inc_Mix_16', 2021: 'Inc_Mix_21' } },
          'Accessibility of Social Infrastructure': { sourceId: 'social-infra-data-source', url: '/data/Social_Infrastructure_Index_SA1_18_21.geojson', codeProp: 'SA1_CODE_2', propByYear: { 2018: 'SoInfra_18', 2021: 'SoInfra_21' } },
          'Housing stress': { sourceId: 'housing-stress-data-source', url: '/data/Housing_Stress_SA1_18_21.geojson', codeProp: 'SA1_CODE_2', propByYear: { 2018: 'HouStre_18', 2021: 'HouStre_21' } },
          'Walkability': { sourceId: 'walkability-data-source', url: '/data/Walkability_SA1_16_21.geojson', codeProp: 'SA1_CODE_2', propByYear: { 2018: 'Walkabi_18', 2021: 'Walkabi_21' } }
        };

        const mbConfig = {
          'Number of residents': {
            sourcesByYear: {
              2011: { sourceId: 'mb-2011-data-source', url: '/data/Number_of_Residents_and_Dwellings_MB_11.geojson', codeProp: 'MB_CODE11', valProp: 'Person_11' },
              2016: { sourceId: 'mb-2016-data-source', url: '/data/Number_of_Residents_and_Dwellings_MB_16.geojson', codeProp: 'MB_CODE16', valProp: 'Person_16' },
              2021: { sourceId: 'mb-2021-data-source', url: '/data/Number_of_Residents_and_Dwellings_MB_21.geojson', codeProp: 'MB_CODE21', valProp: 'Person_21' }
            }
          },
          'Number of dwellings': {
            sourcesByYear: {
              2011: { sourceId: 'mb-2011-data-source', url: '/data/Number_of_Residents_and_Dwellings_MB_11.geojson', codeProp: 'MB_CODE11', valProp: 'Dwell_11' },
              2016: { sourceId: 'mb-2016-data-source', url: '/data/Number_of_Residents_and_Dwellings_MB_16.geojson', codeProp: 'MB_CODE16', valProp: 'Dwel_16' },
              2021: { sourceId: 'mb-2021-data-source', url: '/data/Number_of_Residents_and_Dwellings_MB_21.geojson', codeProp: 'MB_CODE21', valProp: 'Dwell_21' }
            }
          }
        };

        const isJobs = indicatorName === 'Number of jobs';
        const isSpec = indicatorName === 'Industry specialisation';
        const isSA1 = !!sa1Config[indicatorName];
        const isMB = !!mbConfig[indicatorName];

        // Preload required feature collections once per page.
        let jobsFc = null;
        let specFc = null;
        let sa1Fc = null;
        const mbFcsByYear = {};

        if (isJobs) {
          const yr = overlayYear;
          jobsFc = jobsGeoByYear.current[yr] || await getSourceDataOrFetch(
            `jobs-dzn-${yr}-data-source`,
            yr === 2011 ? '/data/Number_of_Jobs_DZN_11.geojson' : yr === 2016 ? '/data/Number_of_Jobs_DZN_16.geojson' : '/data/Number_of_Jobs_DZN_21.geojson'
          );
          if (jobsFc && !jobsGeoByYear.current[yr]) jobsGeoByYear.current[yr] = jobsFc;
        } else if (isSpec) {
          const yr = overlayYear;
          specFc = specGeoByYear.current[yr] || await getSourceDataOrFetch(
            `spec-dzn-${yr}-data-source`,
            yr === 2011 ? '/data/Inudstry_Specialisation_DZN_11.geojson' : yr === 2016 ? '/data/Inudstry_Specialisation_DZN_16.geojson' : '/data/Inudstry_Specialisation_DZN_21.geojson'
          );
          if (specFc && (!specGeoByYear.current || !specGeoByYear.current[yr])) {
            try {
              if (specGeoByYear.current) specGeoByYear.current[yr] = specFc;
            } catch (_) { /* ignore */ }
          }
        } else if (isSA1) {
          const cfg = sa1Config[indicatorName];
          sa1Fc = await getSourceDataOrFetch(cfg.sourceId, cfg.url);
        } else if (isMB) {
          const cfg = mbConfig[indicatorName];
          for (const y of years) {
            const ys = cfg.sourcesByYear[y];
            if (!ys) continue;
            // eslint-disable-next-line no-await-in-loop
            mbFcsByYear[y] = await getSourceDataOrFetch(ys.sourceId, ys.url);
          }
          // Ensure we at least have the overlayYear dataset loaded for centroid lookup.
          if (!mbFcsByYear[overlayYear] && cfg.sourcesByYear[overlayYear]) {
            mbFcsByYear[overlayYear] = await getSourceDataOrFetch(cfg.sourcesByYear[overlayYear].sourceId, cfg.sourcesByYear[overlayYear].url);
          }
        }

        const models = [];
        for (const it of ordered) {
          const code = it.code || '';
          const pct = isFinite(it.areaPct) ? (it.areaPct * 100) : 0;
          const pctText = isFinite(pct) ? `${pct.toFixed(1)}%` : 'n/a';
          const cls = it.classLabel || '';

          let valsByYear = null;
          let anchorLngLat = null;
          if (isJobs) {
            // Compute trend for a representative point inside this intersected area.
            try {
              const yr = overlayYear;
              const feats = jobsFc && jobsFc.features ? jobsFc.features : [];
              const codePropYr = yr === 2011 ? 'DZN_CODE11' : yr === 2016 ? 'DZN_CODE16' : 'DZN_CODE21';
              const f = feats.find(ff => (ff.properties && String(ff.properties[codePropYr] || '') === String(code)));
              const c = f && f.geometry ? geomCentroid(f.geometry) : null;
              if (c) {
                valsByYear = computeJobsForPoint(c[0], c[1]);
                anchorLngLat = [c[0], c[1]];
              }
            } catch (_) { valsByYear = null; }
          } else if (isSpec) {
            try {
              const yr = overlayYear;
              const feats = specFc && specFc.features ? specFc.features : [];
              const codePropYr = yr === 2011 ? 'DZN_CODE11' : yr === 2016 ? 'DZN_CODE16' : 'DZN_CODE21';
              const f = feats.find(ff => (ff.properties && String(ff.properties[codePropYr] || '') === String(code)));
              const c = f && f.geometry ? geomCentroid(f.geometry) : null;
              if (c) {
                valsByYear = computeSpecForPoint(c[0], c[1]);
                anchorLngLat = [c[0], c[1]];
              }
            } catch (_) { valsByYear = null; }
          } else if (isSA1) {
            try {
              const cfg = sa1Config[indicatorName];
              const feats = sa1Fc && sa1Fc.features ? sa1Fc.features : [];
              const f = feats.find(ff => String(ff.properties?.[cfg.codeProp] || '') === String(code));
              if (f) {
                valsByYear = {};
                for (const y of years) {
                  const prop = cfg.propByYear[y];
                  valsByYear[y] = prop ? Number(f.properties?.[prop]) : null;
                }
                const c = f.geometry ? geomCentroid(f.geometry) : null;
                if (c) anchorLngLat = [c[0], c[1]];
              }
            } catch (_) { valsByYear = null; }
          } else if (isMB) {
            try {
              const cfg = mbConfig[indicatorName];
              const lastYear = years[years.length - 1];
              const y0 = overlayYear || lastYear;
              const y0Spec = cfg.sourcesByYear[y0] || cfg.sourcesByYear[lastYear];
              const fc0 = mbFcsByYear[y0] || mbFcsByYear[lastYear];
              const feats0 = fc0 && fc0.features ? fc0.features : [];
              const f0 = feats0.find(ff => String(ff.properties?.[y0Spec.codeProp] || '') === String(code));
              const c = f0 && f0.geometry ? geomCentroid(f0.geometry) : null;
              if (c) {
                valsByYear = {};
                for (const y of years) {
                  const ys = cfg.sourcesByYear[y];
                  if (!ys) { valsByYear[y] = null; continue; }
                  const fcY = mbFcsByYear[y];
                  const featsY = fcY && fcY.features ? fcY.features : [];
                  const match = featsY.find(ff => ff.geometry && pointInPolygon(c, ff.geometry));
                  valsByYear[y] = match ? Number(match.properties?.[ys.valProp]) : null;
                }
                anchorLngLat = [c[0], c[1]];
              }
            } catch (_) { valsByYear = null; }
          }

          const series = (valsByYear && years && years.length)
            ? years.map(y => ({ year: y, value: (valsByYear[y] === null || typeof valsByYear[y] === 'undefined') ? null : Number(valsByYear[y]) }))
            : (years && years.length)
              ? [{ year: years[years.length - 1], value: (it.value === null || typeof it.value === 'undefined') ? null : Number(it.value) }]
              : [];

          models.push({
            unit,
            code,
            areaPctText: pctText,
            classLabel: cls,
            series,
            anchorLngLat
          });
        }

        return { unit, models };
      };

      const originalYear = selectedYear;

      const effectiveIndicator = selectedIndicator || (panelFocus.type === 'indicator' ? panelFocus.name : null) || 'Number of jobs';
      const yearsToExport = (Array.isArray(availableYears) && availableYears.length)
        ? [...availableYears]
        : (selectedYear ? [selectedYear] : getDefaultYearsForIndicator(effectiveIndicator));

      const exportIndicatorPages = panelFocus.type === 'indicator' && yearsToExport.length > 0;
      const exportPrecinctPages = panelFocus.type === 'precinct' && yearsToExport.length > 0;

      const totalPages = (exportIndicatorPages || exportPrecinctPages) ? yearsToExport.length : 1;
      const setProgress = (pct, text) => {
        setExportProgress(Math.max(0, Math.min(100, Math.round(pct))));
        if (typeof text === 'string') setExportProgressText(text);
      };

      // Give the map a moment to settle before starting
      await waitForMapIdleOrTimeout(1200);

      const buildFbOverviewTextForYear = (indicatorName, yr) => {
        if (indicatorName === 'Number of jobs' || indicatorName === 'Industry specialisation') {
          try {
            const stats = buildLegendComparisonStats(indicatorName, yr);
            return stats?.text || '';
          } catch (_) {
            return '';
          }
        }
        return '';
      };

      const captureLegendIfPresent = async () => {
        try {
          if (!legendExportRef.current) return null;
          await waitForNextFrame();
          const canvas = await html2canvas(legendExportRef.current, {
            backgroundColor: '#ffffff',
            useCORS: true,
            scale: 1
          });
          return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
        } catch (_) {
          return null;
        }
      };

      const legendVariesByYear = selectedIndicator === 'Number of jobs' || selectedIndicator === 'Industry specialisation';
      let cachedLegendCapture = null;

      const addYearPage = async (yr, pageIndex) => {
        if (pageIndex > 0) doc.addPage();

        setProgress(((pageIndex + 0.05) / totalPages) * 100, `Preparing page ${pageIndex + 1} of ${totalPages}…`);
        await setYearAndWait(yr);

        setProgress(((pageIndex + 0.25) / totalPages) * 100, `Rendering map for ${yr}…`);
        await waitForMapFullyReady(8000);

        // Give React a moment to render year-specific legend content
        await waitForNextFrame();

        setProgress(((pageIndex + 0.45) / totalPages) * 100, 'Capturing legend…');
        // eslint-disable-next-line no-await-in-loop
        const legendCapture = (!legendVariesByYear && cachedLegendCapture)
          ? cachedLegendCapture
          : await captureLegendIfPresent();
        if (!legendVariesByYear && !cachedLegendCapture && legendCapture) cachedLegendCapture = legendCapture;

        setProgress(((pageIndex + 0.60) / totalPages) * 100, 'Composing PDF page…');

        let mapImage = '';
        try {
          mapImage = map.current.getCanvas().toDataURL('image/png');
        } catch (_) {
          mapImage = '';
        }

        // --- Title & Subtitle ---
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Fishermans Bend Data Report', margin, margin);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'normal');
        doc.text(`${panelFocus.name} — ${yr}`, margin, margin + 25);

        const contentStartY = margin + 50;
        const availableHeight = pageHeight - contentStartY - margin;

        // Layout: top row (map + indicator narrative), bottom row (FB overview under map)
        const topRowHeight = Math.max(160, Math.round(availableHeight * 0.62));
        const bottomRowHeight = Math.max(0, availableHeight - topRowHeight);

        // --- Map Image (Left side, top row) ---
        const canvas = map.current.getCanvas();
        const mapAspectRatio = canvas.height / canvas.width;
        let mapWidth = contentWidth * 0.6;
        let mapHeight = mapWidth * mapAspectRatio;
        if (mapHeight > topRowHeight) {
          mapHeight = topRowHeight;
          mapWidth = mapHeight / mapAspectRatio;
        }
        doc.addImage(mapImage, 'PNG', margin, contentStartY, mapWidth, mapHeight);

        // --- Indicator Narrative (Right side, top row) ---
        const rightContentX = margin + mapWidth + 20;
        const rightContentWidth = Math.max(120, contentWidth - mapWidth - 20);

        // Reserve space for legend (includes charts) strictly below narrative (no overlap)
        const legendGap = legendCapture ? 10 : 0;
        const maxLegendW = Math.min(rightContentWidth, 320);
        const legendAspect = (legendCapture && legendCapture.width) ? (legendCapture.height / legendCapture.width) : 0.75;
        const legendMaxH = legendCapture ? Math.min(260, Math.round(topRowHeight * 0.55)) : 0;
        const legendH = legendCapture ? legendMaxH : 0;
        const legendW = legendCapture ? Math.min(maxLegendW, legendH / legendAspect) : 0;
        const indicatorBoxHeight = Math.max(40, topRowHeight - (legendH + legendGap));

        doc.setFont('helvetica', 'normal');
        const indicatorText = `Year: ${yr}\n\n${dynamicDescription || ''}`;
        const indFit = fitTextLinesToBox(
          doc,
          indicatorText,
          rightContentWidth,
          Math.max(10, indicatorBoxHeight - 6),
          10,
          8
        );

        // Compute FB fit too (if present), then force same font size for both blocks
        const fbText = buildFbOverviewTextForYear(selectedIndicator, yr);
        const hasFbText = bottomRowHeight > 30 && String(fbText || '').trim().length;
        let fbFit = null;
        if (hasFbText) {
          doc.setFont('helvetica', 'normal');
          const fbBoxYTmp = (contentStartY + topRowHeight + 18) + 12;
          const fbBoxHeightTmp = Math.max(0, (pageHeight - margin) - fbBoxYTmp);
          fbFit = fitTextLinesToBox(
            doc,
            fbText,
            mapWidth,
            Math.max(10, fbBoxHeightTmp - 2),
            10,
            8
          );
        }
        const unifiedFs = fbFit ? Math.min(indFit.fontSize, fbFit.fontSize) : indFit.fontSize;
        doc.setFontSize(unifiedFs);
        // Ensure the indicator narrative does not overflow into the legend area
        const clampLinesToHeight = (lines, maxHeightPx) => {
          if (!Array.isArray(lines) || lines.length === 0) return [];
          let out = lines;
          try {
            // Trim from the end until it fits in the box
            while (out.length && doc.getTextDimensions(out).h > maxHeightPx) {
              out = out.slice(0, -1);
            }
          } catch (_) { /* ignore */ }
          return out;
        };

        const rawIndLines = doc.splitTextToSize(stripMarkdown(indicatorText), rightContentWidth);
        const indLines = clampLinesToHeight(rawIndLines, indicatorBoxHeight);
        doc.text(indLines, rightContentX, contentStartY);
        let renderedIndHeight = 0;
        try { renderedIndHeight = doc.getTextDimensions(indLines).h; } catch (_) { renderedIndHeight = 0; }

        if (legendCapture) {
          // Place legend immediately below the indicator narrative (no overlap)
          const legendY = contentStartY + renderedIndHeight + legendGap;
          doc.addImage(legendCapture.dataUrl, 'PNG', rightContentX, legendY, legendW, legendH);
        }

        // --- Fishermans Bend Overview (Bottom row, under map, as TEXT) ---
        const fbTitleY = contentStartY + topRowHeight + 18;
        if (bottomRowHeight > 30) {
          if (String(fbText || '').trim().length) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('Fishermans Bend Overview', margin, fbTitleY);

            doc.setFont('helvetica', 'normal');
            const fbBoxY = fbTitleY + 12;
            doc.setFontSize(unifiedFs);
            const fbLines = doc.splitTextToSize(stripMarkdown(fbText), mapWidth);
            if (fbLines && fbLines.length) {
              doc.text(fbLines, margin, fbBoxY);
            }
          }
        }

        setProgress(((pageIndex + 1) / totalPages) * 100, `Finished page ${pageIndex + 1} of ${totalPages}`);
      };

      const addPrecinctYearPage = async (yr, pageIndex) => {
        if (pageIndex > 0) doc.addPage();

        setProgress(((pageIndex + 0.05) / totalPages) * 100, `Preparing page ${pageIndex + 1} of ${totalPages}…`);
        await setYearAndWait(yr);

        setProgress(((pageIndex + 0.25) / totalPages) * 100, `Rendering map for ${yr}…`);
        await waitForMapFullyReady(8000);

        setProgress(((pageIndex + 0.45) / totalPages) * 100, 'Computing intersected areas…');
        const precinctName = panelFocus.name;
        const ind = effectiveIndicator;
        // eslint-disable-next-line no-await-in-loop
        const overlay = await computePrecinctOverlay(precinctName, yr, ind);
        const precinctText = generatePrecinctNarrativeDeterministic(overlay, ind);
        // eslint-disable-next-line no-await-in-loop
        const callouts = await buildIntersectedAreaCalloutModels({ ...overlay, year: yr }, ind, yearsToExport);

        setProgress(((pageIndex + 0.60) / totalPages) * 100, 'Composing PDF page…');

        let mapImage = '';
        try {
          mapImage = map.current.getCanvas().toDataURL('image/png');
        } catch (_) {
          mapImage = '';
        }

        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Fishermans Bend Data Report', margin, margin);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'normal');
        doc.text(`${precinctName} — ${ind} — ${yr}`, margin, margin + 25);

        const contentStartY = margin + 50;
        const availableHeight = pageHeight - contentStartY - margin;
        const topRowHeight = Math.max(160, Math.round(availableHeight * 0.62));
        const bottomRowHeight = Math.max(0, availableHeight - topRowHeight);

        // Map left
        const canvas = map.current.getCanvas();
        const mapAspectRatio = canvas.height / canvas.width;
        let mapWidth = contentWidth * 0.6;
        let mapHeight = mapWidth * mapAspectRatio;
        if (mapHeight > topRowHeight) {
          mapHeight = topRowHeight;
          mapWidth = mapHeight / mapAspectRatio;
        }
        doc.addImage(mapImage, 'PNG', margin, contentStartY, mapWidth, mapHeight);

        // Right side: precinct narrative
        const rightContentX = margin + mapWidth + 20;
        const rightContentWidth = Math.max(120, contentWidth - mapWidth - 20);

        const narrativeBoxHeight = Math.max(70, topRowHeight);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const narrativeLinesRaw = doc.splitTextToSize(stripMarkdown(precinctText), rightContentWidth);
        const clampLinesToHeight = (lines, maxHeightPx) => {
          if (!Array.isArray(lines) || !lines.length) return [];
          let out = lines;
          try {
            while (out.length && doc.getTextDimensions(out).h > maxHeightPx) {
              out = out.slice(0, -1);
            }
          } catch (_) { /* ignore */ }
          return out;
        };
        const narrativeLines = clampLinesToHeight(narrativeLinesRaw, narrativeBoxHeight);
        doc.text(narrativeLines, rightContentX, contentStartY);
        let narrativeH = 0;
        try { narrativeH = doc.getTextDimensions(narrativeLines).h; } catch (_) { narrativeH = 0; }

        // Bottom section: list intersected-area values as text (no charts)
        try {
          const models = (callouts && Array.isArray(callouts.models)) ? callouts.models : [];
          if (bottomRowHeight > 70 && models.length) {
            const bottomStartY = contentStartY + topRowHeight + 12;
            const bottomH = Math.max(0, pageHeight - margin - bottomStartY);

            const valueForYear = (series, year) => {
              try {
                const s = (Array.isArray(series) ? series : []).find(d => Number(d?.year) === Number(year));
                const v = (s && isFinite(s.value)) ? Number(s.value) : null;
                return fmtValueForIndicator(ind, v);
              } catch (_) {
                return 'n/a';
              }
            };

            // Section title
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(17, 24, 39);
            doc.text('Intersected areas', margin, bottomStartY - 2);

            // Two-column flowing text
            const gap = 14;
            const cols = 2;
            const colW = (contentWidth - gap * (cols - 1)) / cols;
            const colX = (c) => margin + c * (colW + gap);
            const startY = bottomStartY + 14;
            const maxY = bottomStartY + bottomH;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(55, 65, 81);

            let c = 0;
            let y = startY;

            for (const m of models) {
              const header = `${m.unit} ${m.code} (${m.areaPctText})`;
              const classSuffix = m.classLabel ? ` — ${String(m.classLabel)}` : '';
              const valText = valueForYear(m.series, yr);
              const itemText = `- ${header}: ${valText}${classSuffix}`;
              const lines = doc.splitTextToSize(itemText, colW);
              let h = 0;
              try { h = doc.getTextDimensions(lines).h; } catch (_) { h = 10; }

              if (y + h > maxY && c === 0) {
                c = 1;
                y = startY;
              }
              if (y + h > maxY) break;

              doc.text(lines, colX(c), y);
              y += h + 2;
            }
          }
        } catch (_) {
          // Keep export working even if text rendering fails
        }

        setProgress(((pageIndex + 1) / totalPages) * 100, `Finished page ${pageIndex + 1} of ${totalPages}`);
      };

      if (exportIndicatorPages) {
        for (let i = 0; i < yearsToExport.length; i++) {
          // eslint-disable-next-line no-await-in-loop
          await addYearPage(yearsToExport[i], i);
        }
      } else if (exportPrecinctPages) {
        for (let i = 0; i < yearsToExport.length; i++) {
          // eslint-disable-next-line no-await-in-loop
          await addPrecinctYearPage(yearsToExport[i], i);
        }
      } else {
        // Fallback: single-page export (existing behaviour) for non-indicator panels
        setProgress(35, 'Capturing map…');
        const mapImage = map.current.getCanvas().toDataURL('image/png');

        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Fishermans Bend Data Report', margin, margin);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'normal');
        doc.text(panelFocus.name, margin, margin + 25);

        const contentStartY = margin + 50;
        const canvas = map.current.getCanvas();
        const mapAspectRatio = canvas.height / canvas.width;
        const mapWidth = contentWidth * 0.6;
        const mapHeight = mapWidth * mapAspectRatio;
        doc.addImage(mapImage, 'PNG', margin, contentStartY, mapWidth, mapHeight);

        const rightContentX = margin + mapWidth + 20;
        const rightContentWidth = contentWidth - mapWidth - 20;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const plainText = stripMarkdown(dynamicDescription);
        const splitText = doc.splitTextToSize(plainText, rightContentWidth);
        doc.text(splitText, rightContentX, contentStartY);
        setProgress(90, 'Finalising…');
      }

      try {
        if (originalYear) setSelectedYear(originalYear);
      } catch (_) { /* ignore */ }

      // 6. Save the PDF
      setProgress(98, 'Saving PDF…');
      const filename = `report-${panelFocus.name.toLowerCase().replace(/ /g, '_')}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      alert("An error occurred while exporting the PDF. Please check the console for details.");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportProgressText('');
    }
  };
  
  // Helper to render description with dynamic keywords (precincts + years)
  const renderInteractiveDescription = () => {
    // Only make years clickable if they are available in data (e.g., 2011, 2016, 2021)
    const yearStrings = ((panelFocus && (panelFocus.type === 'indicator' || panelFocus.type === 'precinct')) && (availableYears && availableYears.length))
      ? availableYears.map(String)
      : [];
    // Keep precinct names highlighted/styled (same as before) on landing as well.
    // Add landing-only example indicator links.
    const landingIndicatorExamples = ['Number of jobs', 'Land use mix', 'Number of residents'];
    const isLandingFramework = panelFocus && panelFocus.type === 'framework' && !selectedIndicator;
    const keywords = isLandingFramework
      ? [...PRECINCT_NAMES, ...yearStrings, ...landingIndicatorExamples]
      : [...PRECINCT_NAMES, ...yearStrings];
    const colors = isLandingFramework
      ? { ...PRECINCT_COLORS, ...Object.fromEntries(landingIndicatorExamples.map((k) => [k, '#0b57d0'])) }
      : { ...PRECINCT_COLORS };
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
      if (isLandingFramework && landingIndicatorExamples.includes(kw)) {
        handleIndicatorSelect(kw);
        return;
      }
      if (PRECINCT_NAMES.includes(kw)) {
        if (!selectedIndicator && isLandingFramework) {
          setLandingSelectedPrecinct(kw);
          return;
        }
        // Indicator mode: precinct narrative
        if (!selectedIndicator) return;
        setPanelFocus({ type: 'precinct', name: kw });
        return;
      }
      if (/^\d{4}$/.test(kw)) {
        const y = parseInt(kw, 10);
        const years = (availableYears && availableYears.length) ? availableYears : [2011, 2016, 2021];
        if (years.includes(y)) {
          setSelectedYear(y);
        }
        return;
      }
    };
  // Ensure an "Available years" line is always present and clickable
  let augmentedText = dynamicDescription || '';

  // Landing: inject selected precinct summary right below the examples block.
  if (isLandingFramework) {
    const selected = landingSelectedPrecinct;
    const summary = selected && PRECINCT_SUMMARIES[selected]
      ? `**${selected}**\n${PRECINCT_SUMMARIES[selected]}`
      : `Select a precinct on the map (Employment Precinct, Lorimer, Wirraway, Sandridge, Montague) to see a short summary.`;
    augmentedText = augmentedText.includes('{{PRECINCT_INFO}}')
      ? augmentedText.replace('{{PRECINCT_INFO}}', summary)
      : `${augmentedText}\n\n${summary}`;
  } else {
    // Non-landing: remove any landing-only placeholder if present.
    augmentedText = augmentedText.replace('{{PRECINCT_INFO}}', '').trim();
  }
  try {
    // Only append 'Available years' for indicator narratives, not precinct narratives
    const shouldShowYears = (panelFocus && panelFocus.type === 'indicator') && (availableYears && availableYears.length);
    const alreadyHasYears = /available\s*years\s*:/i.test(augmentedText);
    if (shouldShowYears && !alreadyHasYears) {
      const yearsLine = `Available years: ${availableYears.map(y => `**${y}**`).join(', ')}`;
      augmentedText = (augmentedText ? `${augmentedText}\n\n` : '') + yearsLine;
    }
  } catch (_) { /* ignore */ }
    return (
      <InteractiveDescription
        text={augmentedText}
        keywords={keywords}
        colors={colors}
        linkKeywords={isLandingFramework ? landingIndicatorExamples : []}
        pillKeywords={isLandingFramework ? landingIndicatorExamples : []}
        disabledKeywords={(() => {
          const yrs = (availableYears && availableYears.length) ? availableYears : [];
          const active = selectedYear || (yrs.length ? Math.max(...yrs) : null);
          return active ? [String(active)] : [];
        })()}
        onKeywordHover={onKwHover}
        onKeywordClick={onKwClick}
      />
    );
  };

  const shouldShowComparisonNarrative =
    selectedIndicator &&
    (selectedIndicator === 'Number of jobs' || selectedIndicator === 'Industry specialisation') &&
    legendComparisonText;
  const comparisonNarrativeText = shouldShowComparisonNarrative
    ? legendComparisonText
    : 'Select \'Number of jobs\' or \'Industry specialisation\' indicators to see comparison narrative with Docklands.';

  // --- RENDER METHOD ---
  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh' }}>
      {/* Left panel: legend + comparison narrative */}
      <div
        style={{
          width: '320px',
          backgroundColor: '#f8f9fa',
          padding: '1rem',
          borderRight: '1px solid #dee2e6',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Search (left panel) */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                // Prevent showing stale suggestions while the user is typing
                if (indicators.length) setIndicators([]);
                if (searchError) setSearchError('');
              }}
              placeholder="I'm interested in..."
              style={{ flex: 1, padding: '0.5rem', border: '1px solid #D1D5DB', borderRadius: '0.375rem', outline: 'none', fontSize: '0.9rem' }}
            />
            <button
              onClick={handleSearchClick}
              disabled={isSearching}
              style={{ backgroundColor: '#2563EB', color: 'white', fontWeight: 600, padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', opacity: isSearching ? 0.6 : 1, fontSize: '0.85rem' }}
            >
              {isSearching ? '...' : 'Search'}
            </button>
          </div>
          {searchError && <p style={{ color: 'red', fontSize: '0.8rem', marginTop: '0.25rem' }}>{searchError}</p>}
          {/* Show only the top 3 most-related indicators (no full list). */}
          {indicators.length > 0 && searchText.trim() && (
            <div style={{ marginTop: '0.5rem', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '0.5rem', padding: '0.75rem 0.9rem', boxShadow: '0 4px 10px rgba(0,0,0,0.12)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.35rem' }}>
                Top matches
              </div>
              <ul style={{ margin: '0 0 0.15rem 1rem', padding: 0 }}>
                {indicators.slice(0, 3).map((item) => (
                  <li key={`suggest-${item.indicator}`} style={{ marginBottom: '0.3rem', listStyle: 'disc' }}>
                    <button
                      type="button"
                      onClick={() => handleIndicatorSelect(item.indicator)}
                      aria-label={`Show ${item.indicator}`}
                      style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', padding: 0, fontSize: '0.85rem' }}
                    >
                      {item.indicator}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {selectedIndicator && legendData[selectedIndicator] && (
          <div style={{ width: '100%' }}>
            {(() => {
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
              } else if (selectedIndicator === 'Industry specialisation') {
                // Five equal classes across 0..1 using SPEC_BREAKS
                const br = SPEC_BREAKS;
                const ranges = [
                  { min: 0.0, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: 1.0 }
                ];
                items = ranges.map((b, i) => ({
                  color: SPEC_PALETTE[i],
                  label: `${b.min.toFixed(2)} - ${b.max.toFixed(2)} (${CLASS_LABELS[i]})`
                }));
              } else if (selectedIndicator === 'Land use mix') {
                // Five equal classes across 0..1 using LUM_BREAKS
                const br = LUM_BREAKS;
                const ranges = [
                  { min: 0.0, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: 1.0 }
                ];
                items = ranges.map((b, i) => ({
                  color: LUM_PALETTE[i],
                  label: `${b.min.toFixed(2)} - ${b.max.toFixed(2)} (${CLASS_LABELS[i]})`
                }));
              } else if (selectedIndicator === 'Number of residents') {
                const br = (mbBreaks && mbBreaks.length === 4) ? mbBreaks : MB_DEFAULT_BREAKS;
                const maxV = mbMax ?? (br[3] * 1.2);
                const ranges = [
                  { min: 0, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: maxV }
                ];
                items = ranges.map((b, i) => ({
                  color: MB_PALETTE[i],
                  label: `${Math.round(b.min).toLocaleString()} - ${Math.round(b.max).toLocaleString()} (${CLASS_LABELS[i]})`
                }));
              } else if (selectedIndicator === 'Number of dwellings') {
                const br = (dwellBreaks && dwellBreaks.length === 4) ? dwellBreaks : DWELL_DEFAULT_BREAKS;
                const maxV = dwellMax ?? (br[3] * 1.2);
                const ranges = [
                  { min: 0, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: maxV }
                ];
                items = ranges.map((b, i) => ({
                  color: MB_PALETTE[i],
                  label: `${Math.round(b.min).toLocaleString()} - ${Math.round(b.max).toLocaleString()} (${CLASS_LABELS[i]})`
                }));
              } else if (selectedIndicator === 'Number of residents_SA1') {
                const br = (sa1ResBreaks && sa1ResBreaks.length === 4) ? sa1ResBreaks : (sa1ResMax ? [sa1ResMax/5, 2*sa1ResMax/5, 3*sa1ResMax/5, 4*sa1ResMax/5] : [100, 200, 300, 400]);
                const maxV = sa1ResMax ?? (br[3] * 1.2);
                const ranges = [
                  { min: 0, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: maxV }
                ];
                items = ranges.map((b, i) => ({
                  color: MB_PALETTE[i],
                  label: `${Math.round(b.min).toLocaleString()} - ${Math.round(b.max).toLocaleString()} (${CLASS_LABELS[i]})`
                }));
              } else if (selectedIndicator === 'Diversity of residents’ age') {
                const br = LUM_BREAKS;
                const ranges = [
                  { min: 0.0, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: 1.0 }
                ];
                items = ranges.map((b, i) => ({
                  color: LUM_PALETTE[i],
                  label: `${b.min.toFixed(2)} - ${b.max.toFixed(2)} (${CLASS_LABELS[i]})`
                }));
              } else if (selectedIndicator === 'Diversity of residents’ income') {
                // Mirror age diversity: index 0..1 with equal interval breaks
                const br = LUM_BREAKS;
                const ranges = [
                  { min: 0.0, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: 1.0 }
                ];
                items = ranges.map((b, i) => ({
                  color: LUM_PALETTE[i],
                  label: `${b.min.toFixed(2)} - ${b.max.toFixed(2)} (${CLASS_LABELS[i]})`
                }));
              } else if (selectedIndicator === 'Accessibility of Social Infrastructure') {
                // Score 0..16 using SOCINFRA_BREAKS
                const br = SOCINFRA_BREAKS;
                const ranges = [
                  { min: 0.0, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: 16.0 }
                ];
                items = ranges.map((b, i) => ({
                  color: SOCINFRA_PALETTE[i],
                  label: `${b.min.toFixed(1)} - ${b.max.toFixed(1)} (${CLASS_LABELS[i]})`
                }));
              } else if (selectedIndicator === 'Housing stress') {
                // Percent 0..100 using HOUSING_STRESS_BREAKS
                const br = HOUSING_STRESS_BREAKS;
                const ranges = [
                  { min: 0.0, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: 100.0 }
                ];
                items = ranges.map((b, i) => ({
                  color: HOUSING_STRESS_PALETTE[i],
                  label: `${b.min.toFixed(0)}% - ${b.max.toFixed(0)}% (${CLASS_LABELS[i]})`
                }));
              } else if (selectedIndicator === 'Walkability') {
                // Score using WALKABILITY_BREAKS with fixed min/max as specified
                const br = WALKABILITY_BREAKS;
                const ranges = [
                  { min: WALKABILITY_MIN, max: br[0] },
                  { min: br[0], max: br[1] },
                  { min: br[1], max: br[2] },
                  { min: br[2], max: br[3] },
                  { min: br[3], max: WALKABILITY_MAX }
                ];
                items = ranges.map((b, i) => ({
                  color: WALKABILITY_PALETTE[i],
                  label: `${b.min.toFixed(1)} - ${b.max.toFixed(1)} (${CLASS_LABELS[i]})`
                }));
              }

              return (
                <>
                  {selectedIndicator === 'Industry specialisation' && specDataError && (
                    <div style={{ marginBottom: '0.5rem', background: '#fff3cd', color: '#664d03', border: '1px solid #ffe69c', borderRadius: 6, padding: '0.5rem 0.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
                      <strong style={{ display: 'block', marginBottom: 4 }}>Data failed to load</strong>
                      <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                        The Industry specialisation GeoJSON could not be served (HTTP 500). Try restarting the dev server or moving the files out of OneDrive sync.
                      </div>
                    </div>
                  )}
                  <Legend
                    ref={legendRef}
                    placement="panel"
                    title={legendData[selectedIndicator].title}
                    items={items}
                    // Keep left panel as search + legend only (no narrative text).
                    // Preserve the top-industries mini chart for Industry specialisation by passing a whitespace narrative.
                    narrative={selectedIndicator === 'Industry specialisation' ? ' ' : ''}
                    // Charts are rendered in the right panel.
                    comparisonChartData={null}
                    topIndustriesByYear={null}
                    selectedYear={selectedYear}
                  />
                  {/* Offscreen copy of the legend for PDF capture (kept out of scroll clipping). */}
                  <div
                    style={{
                      position: 'fixed',
                      left: '-10000px',
                      top: '0px',
                      width: '340px',
                      backgroundColor: '#ffffff',
                      pointerEvents: 'none',
                      zIndex: -1
                    }}
                  >
                    <Legend
                      ref={legendExportRef}
                      placement="inline"
                      title={legendData[selectedIndicator].title}
                      items={items}
                      // Keep narrative minimal for export; still enables top-industries chart for specialisation.
                      narrative={selectedIndicator === 'Industry specialisation' ? ' ' : ''}
                      comparisonChartData={
                        legendComparisonChartData && (selectedIndicator === 'Number of jobs' || selectedIndicator === 'Industry specialisation')
                          ? legendComparisonChartData
                          : null
                      }
                      topIndustriesByYear={selectedIndicator === 'Industry specialisation' ? topIndustriesByYear : null}
                      selectedYear={selectedYear}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        )}
        </div>

        {/* --- PDF Export Button (bottom-left) --- */}
        {panelFocus && (
          <div style={{ paddingTop: '1rem', borderTop: '1px solid #dee2e6' }}>
            <button
              onClick={handleExportToPDF}
              disabled={isExporting}
              style={{
                backgroundColor: '#2563EB',
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
              {isExporting ? `Exporting… ${exportProgress}%` : 'Export to PDF'}
            </button>
            {isExporting && (
              <div style={{ marginTop: '0.6rem' }}>
                {exportProgressText ? (
                  <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.35rem' }}>{exportProgressText}</div>
                ) : null}
                <div style={{ width: '100%', height: '8px', backgroundColor: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, exportProgress))}%`,
                      height: '100%',
                      backgroundColor: '#1D4ED8'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Map container (center) */}
      <div style={{ position: 'relative', flex: 1 }}>
        <div
          ref={mapContainer}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            // Important: do not apply CSS color filters here.
            // Precinct colors (and thematic legend colors) must match exactly between map + text.
          }}
        />
      </div>

      {/* Text Explorer Panel (right) */}
      <div style={{ width: '360px', backgroundColor: '#f8f9fa', padding: '1.5rem', borderLeft: '1px solid #dee2e6', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{flex: 1}}>
            {panelFocus ? (
            <div>
                {/* Breadcrumb: Fisherman Bend / Indicator / Year / Precinct */}
                {(() => {
                  const parts = [];
                  const crumbStyle = { color: '#374151', textDecoration: 'underline', cursor: 'pointer' };
                  const sep = <span key="sep-root" style={{ margin: '0 4px', color: '#9CA3AF' }}>/</span>;
                  // Root
                  parts.push(
                    <a key="root" href="#" style={crumbStyle} onClick={(e) => {
                      e.preventDefault();
                      // Return to landing/framework view
                      setSelectedIndicator(null);
                      setSelectedYear(null);
                      setPanelFocus({ type: 'framework', name: 'Fishermans Bend Framework' });
                      setDynamicDescription(LANDING_TEXT);
                      setTextHoveredPrecinct(null);
                      setLandingSelectedPrecinct(null);
                    }}>
                      Fishermans Bend
                    </a>
                  );
                  // Indicator
                  const ind = selectedIndicator || (panelFocus.type === 'indicator' ? panelFocus.name : null);
                  if (ind) {
                    parts.push(<span key="sep-1" style={{ margin: '0 4px', color: '#9CA3AF' }}>/</span>);
                    parts.push(
                      <a key="indicator" href="#" style={crumbStyle} onClick={(e) => { e.preventDefault(); handleIndicatorSelect(ind); }}>
                        {ind}
                      </a>
                    );
                  }
                  // Year
                  if (selectedYear) {
                    parts.push(<span key="sep-2" style={{ margin: '0 4px', color: '#9CA3AF' }}>/</span>);
                    parts.push(
                      <span key="year" style={{ color: '#111827' }}>{selectedYear}</span>
                    );
                  }
                  // Precinct (only when viewing a precinct narrative)
                  if (panelFocus.type === 'precinct') {
                    parts.push(<span key="sep-3" style={{ margin: '0 4px', color: '#9CA3AF' }}>/</span>);
                    parts.push(
                      <span key="precinct" style={{ color: '#111827' }}>{panelFocus.name}</span>
                    );
                  }
                  return (
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontStyle: 'italic' }}>
                      {parts}
                    </div>
                  );
                })()}
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#495057', marginBottom: '0.75rem' }}>{panelFocus.name}</h4>
                {isDescriptionLoading ? (
                <p style={{ fontSize: '0.95rem', color: '#6c757d', fontStyle: 'italic' }}>🤖 Generating AI description...</p>
                ) : (
                  <>
                    {renderInteractiveDescription()}

                    {/* Fishermans Bend Overview (indicator narratives only) */}
                    {panelFocus && panelFocus.type === 'indicator' && selectedIndicator && shouldShowComparisonNarrative && legendComparisonText ? (
                      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
                        <h4 style={{ margin: '0 0 0.75rem 0', fontWeight: 700, fontSize: '1rem', color: '#374151' }}>
                          Fishermans Bend Overview
                        </h4>
                        <InteractiveDescription
                          text={legendComparisonText}
                          keywords={[...PRECINCT_NAMES, ...(((availableYears && availableYears.length) ? availableYears : [2011, 2016, 2021]).map(String))]}
                          colors={{ ...PRECINCT_COLORS }}
                          disabledKeywords={(() => {
                            const yrs = (availableYears && availableYears.length) ? availableYears : [2011, 2016, 2021];
                            const active = selectedYear || Math.max(...yrs);
                            return active ? [String(active)] : [];
                          })()}
                          onKeywordHover={(kw) => {
                            if (!kw) {
                              handlePrecinctHover(null);
                              return;
                            }
                            if (PRECINCT_NAMES.includes(kw)) {
                              handlePrecinctHover(kw);
                            }
                          }}
                          onKeywordClick={(kw) => {
                            if (PRECINCT_NAMES.includes(kw)) {
                              // Require an indicator selection before navigating to precinct narrative
                              if (!selectedIndicator) return;
                              setPanelFocus({ type: 'precinct', name: kw });
                              return;
                            }
                            if (/^\d{4}$/.test(kw)) {
                              const y = parseInt(kw, 10);
                              const years = (availableYears && availableYears.length) ? availableYears : [2011, 2016, 2021];
                              if (years.includes(y)) setSelectedYear(y);
                            }
                          }}
                        />
                      </div>
                    ) : null}

                    {/* Charts (moved from left panel to right panel) */}
                    {panelFocus && panelFocus.type === 'indicator' && selectedIndicator === 'Industry specialisation' && selectedYear && topIndustriesByYear && Array.isArray(topIndustriesByYear[selectedYear]) && topIndustriesByYear[selectedYear].length > 0 ? (
                      <div style={{ marginTop: '1rem' }}>
                        <Legend
                          placement="inline"
                          title={''}
                          items={[]}
                          // For Industry specialisation, passing whitespace enables the top-industries mini chart inside Legend.
                          narrative={selectedIndicator === 'Industry specialisation' ? ' ' : ''}
                          comparisonChartData={null}
                          topIndustriesByYear={selectedIndicator === 'Industry specialisation' ? topIndustriesByYear : null}
                          selectedYear={selectedYear}
                        />
                      </div>
                    ) : null}
                  </>
                )}
                {/* (chart moved to bottom section) */}
                {/* Year selector chips removed: years are clickable links in description now */}
            </div>
            ) : (
            <p style={{ fontSize: '0.95rem', color: '#6c757d', fontStyle: 'italic' }}>Select an indicator from the left panel or click on a precinct on the map to see its description.</p>
            )}
        </div>
        {/* Chart moved to map popup on hover; right panel visualization removed as requested */}

      </div>
      {/* End right-hand text panel */}

      {/* Hidden offscreen chart container for PDF export (kept out of view) */}
      {panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Number of jobs' && (
        <div
          ref={chartRef}
          style={{ position: 'absolute', left: -10000, top: -10000, width: 280, height: 180, visibility: 'hidden' }}
          aria-hidden="true"
        >
          {(() => {
            const src = selectedDZNJobs || hoveredDZNJobs;
            if (!src) return null;
            const svg = buildJobsChartSVG(src);
            const title = 'Total jobs by year';
            return (
              <div
                dangerouslySetInnerHTML={{
                  __html: `\n                    <div style=\"font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px\">${title}</div>\n                    ${svg}\n                  `,
                }}
              />
            );
          })()}
        </div>
      )}

      {panelFocus && panelFocus.type === 'indicator' && panelFocus.name === 'Industry specialisation' && (
        <div
          ref={specChartRef}
          style={{ position: 'absolute', left: -10000, top: -10000, width: 280, height: 180, visibility: 'hidden' }}
          aria-hidden="true"
        >
          {(() => {
            const src = hoveredDZNSpec;
            if (!src) return null;
            const svg = buildSpecChartSVG(src);
            const title = 'Industry specialisation index by year';
            return (
              <div
                dangerouslySetInnerHTML={{
                  __html: `
                    <div style="font-weight:600;color:#374151;font-size:0.95rem;margin-bottom:4px">${title}</div>
                    ${svg}
                  `,
                }}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}
// --- END: MAP COMPONENT ---