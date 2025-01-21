import React, { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';

export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [layerVisibility, setLayerVisibility] = useState({
    'fb-precincts-layer': true,
    'FishermansBendTrees-layer': true,
    'fb-mb-2021-layer': true,
    'fb-precincts-labels-layer': true,
    'fb-sa1-2016-layer': true,
    'fb-sa1-2021-layer': true,
    'fb-sold-price-sa1-2017-layer': true,
    'fb-worker-commute-distance-layer': true,
  });

  const lng = 144.920019;
  const lat = -37.829211;
  const zoom = 13;
  const API_KEY = 'aD3c6FK7mFgnwvoWhlAs';


  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${API_KEY}`, // Replace with your MapTiler API key
      center: [lng, lat],
      zoom: zoom,
    });

    map.current.on('load', () => {
      // Define datasets with their respective configurations
      const datasets = [
        {
          id: 'fb-precincts-layer',
          source: 'fb-precincts',
          data: '/data/fb-precincts.geojson',
          type: 'fill',
          paint: { 'fill-color': '#088', 'fill-opacity': 0.5 },
        },
        {
          id: 'FishermansBendTrees-layer',
          source: 'FishermansBendTrees',
          data: '/data/Fishermans Bend Trees.geojson',
          type: 'circle',
          paint: {
            'circle-color': '#00091a',
            'circle-radius': 4,
            'circle-opacity': 0.8,
          },
        },
        {
          id: 'fb-mb-2021-layer',
          source: 'fb-mb-2021',
          data: '/data/fb-mb-2021-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#FFD700', 'fill-opacity': 0.5 },
        },
        
        {
          id: 'fb-sa1-2016-layer',
          source: 'fb-sa1-2016',
          data: '/data/fb-sa1-2016-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#1E90FF', 'fill-opacity': 0.5 },
        },
        {
          id: 'fb-sa1-2021-layer',
          source: 'fb-sa1-2021',
          data: '/data/fb-sa1-2021-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#FF69B4', 'fill-opacity': 0.5 },
        },
        {
          id: 'fb-sold-price-sa1-2017-layer',
          source: 'fb-sold-price-sa1-2017',
          data: '/data/fb-sold-price-sa1-2017-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#8A2BE2', 'fill-opacity': 0.5 },
        },
        {
          id: 'fb-worker-commute-distance-layer',
          source: 'fb-worker-commute',
          data: '/data/fb-worker-commute-distance-sa2-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#FFA500', 'fill-opacity': 0.5 },
        },
        {
          id: 'fb-precincts-labels-layer',
          source: 'fb-precincts-labels',
          data: '/data/fb-precincts-labels.geojson',
          type: 'symbol',
          layout: {
            'text-field': ['get', 'precinctname'], 
            'text-size': 12,
          },
          paint: { 'text-color': '#000000' },
        },
      ];

      // Add all datasets to the map
      datasets.forEach(({ id, source, data, type, paint, layout = {} }) => {
        map.current.addSource(source, {
          type: 'geojson',
          data: data,
        });

        map.current.addLayer({
          id: id,
          type: type,
          source: source,
          paint: paint,
          layout: { visibility: 'visible', ...layout },
        });
      });
    });
  }, [lng, lat, zoom]);

  const toggleLayerVisibility = (layerId) => {
    const visibility = map.current.getLayoutProperty(layerId, 'visibility');
    const newVisibility = visibility === 'visible' ? 'none' : 'visible';
    map.current.setLayoutProperty(layerId, 'visibility', newVisibility);
    setLayerVisibility({
      ...layerVisibility,
      [layerId]: newVisibility === 'visible',
    });
  };

  return (
    <div className="map-wrap">
      <div ref={mapContainer} className="map" />
      <div className="layer-control">
        <h4>Fisherman Bend Layers</h4>
        {Object.keys(layerVisibility).map((layerId) => (
          <div key={layerId}>
            <input
              type="checkbox"
              checked={layerVisibility[layerId]}
              onChange={() => toggleLayerVisibility(layerId)}
            />{' '}
            {layerId.replace('-layer', '').replace(/_/g, ' ')}
          </div>
        ))}
      </div>
    </div>
  );
}
