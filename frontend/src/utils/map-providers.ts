import * as L from 'leaflet';

const OSM_DE: L.TileLayer = L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">OpenStreetMap</a> contributors',
  maxZoom: 19,
});

const CARTO_VOYAGER: L.TileLayer = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions" rel="noopener noreferrer" target="_blank">CARTO</a>',
    maxZoom: 19,
  },
);

const ESRI_SATELLITE: L.TileLayer = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/" rel="noopener noreferrer" target="_blank">Esri</a>',
    maxZoom: 19,
  },
);

export const getBaseMaps = (): Record<string, L.TileLayer> =>
  Object.fromEntries([
    ['OpenStreetMap DE', OSM_DE],
    ['CartoDB Voyager', CARTO_VOYAGER],
    ['Esri Satellite', ESRI_SATELLITE],
  ]);
