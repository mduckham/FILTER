import React, { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';

export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [layerVisibility, setLayerVisibility] = useState({
    'fb-precincts-layer': true,
    'fb-precincts-outline': true,
    'FishermansBendTrees-layer': false,
    'fb-mb-2021-layer': false,
    'fb-mb-2021-outline': false,
    'fb-precincts-labels-layer': true,
    'fb-sa1-2016-layer': false,
    'fb-sa1-2021-layer': true,
    'fb-sa1-2021-outline': true,
    'fb-sold-price-sa1-2017-layer': false,
    'fb-worker-commute-distance-layer': false,
  });

  const lng = 144.920019;
  const lat = -37.829211;
  const zoom = 13;
  const API_KEY = 'aD3c6FK7mFgnwvoWhlAs';


  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`, // Replace with your MapTiler API key
      center: [lng, lat],
      zoom: zoom,
    });

    map.current.on('load', () => {
      // Define datasets with their respective configurations
      const datasets = [
        {
          id: 'fb-precincts-layer',
          source: 'fb-precincts',
          data: '/data/fb-precincts-official.geojson',
          type: 'fill',
          paint: { 'fill-color': '#088', 'fill-opacity': 0.5},
          layout: {visibility: 'visible'},
        },
        {
          id: 'fb-precincts-outline',
          source: 'fb-precincts-outline',
          data: '/data/fb-precincts-official.geojson',
          type: 'line',
          paint: { 'line-color': '#022', 'line-opacity': 0.8, 'line-width': 1},
          layout: {visibility: 'visible'},
        },
        {
          id: 'FishermansBendTrees-layer',
          source: 'Fishermans Bend Trees',
          data: '/data/Fishermans Bend Trees.geojson',
          type: 'circle',
          paint: {
            'circle-color': '#229922',
            'circle-radius': 5,
            'circle-opacity': 0.8,
          },
          layout: {visibility: 'none'},
        },
        {
          id: 'fb-mb-2021-layer',
          source: 'fb-mb-2021-layer',
          data: '/data/fb-mb-2021-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#FFD700', 'fill-opacity': 0.5 },
          layout: {visibility: 'none'},
        },
        {
          id: 'fb-mb-2021-outline',
          source: 'fb-mb-2021-outline',
          data: '/data/fb-mb-2021-WGS84.geojson',
          type: 'line',
          paint: { 'line-color': '#022', 'line-opacity': 0.8, 'line-width': 1},
          layout: {visibility: 'none'},
        },
        {
          id: 'fb-sa1-2016-layer',
          source: 'fb-sa1-2016',
          data: '/data/fb-sa1-2016-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#1E90FF', 'fill-opacity': 0.5 },
          layout: {visibility: 'none'},
        },
        {
          id: 'fb-sa1-2021-layer',
          source: 'fb-sa1-2021',
          data: '/data/fb-sa1-2021-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#FF69B4', 'fill-opacity': 0.5 },
          layout: {visibility: 'visible'},
        },
        {
          id: 'fb-sa1-2021-outline',
          source: 'fb-sa1-2021-outline',
          data: '/data/fb-sa1-2021-WGS84.geojson',
          type: 'line',
          paint: { 'line-color': '#222222', 'line-opacity': 1, 'line-width': 1 },
          layout: {visibility: 'visible'},
        },
        {
          id: 'fb-sold-price-sa1-2017-layer',
          source: 'fb-sold-price-sa1-2017',
          data: '/data/fb-sold-price-sa1-2017-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#8A2BE2', 'fill-opacity': 0.5 },
          layout: {visibility: 'none'},
        },
        {
          id: 'fb-worker-commute-distance-layer',
          source: 'fb-worker-commute',
          data: '/data/fb-worker-commute-distance-sa2-WGS84.geojson',
          type: 'fill',
          paint: { 'fill-color': '#FFA500', 'fill-opacity': 0.5 },
          layout: {visibility: 'none'},
        },
        {
          id: 'fb-precincts-labels-layer',
          source: 'fb-precincts-labels',
          data: '/data/fb-precincts-labels.geojson',
          type: 'symbol',
          layout: {
            'text-field': ['get', 'precinctname'], 
            'text-size': 12,
            'visibility': 'visible',
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
          layout: { ...layout },
        });
      });

      // Update paint for precincts layer
      map.current.setPaintProperty('fb-precincts-layer','fill-color', ['match', ['get', 'name'], 'Employment Precinct', '#FF0000', 'Lorimer', '#0000FF', 'Montague', '#00FFFF', 'Sandridge', '#FF5A00', 'Wirraway', '#00FF00', '#339933'])
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
        <h4>FILTER Layers</h4>
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
