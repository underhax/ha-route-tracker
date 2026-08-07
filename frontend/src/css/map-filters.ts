import { css } from 'lit';

export const mapFiltersStyles = css`
  #map.dark-mode {
    filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
  }
  #map.dark-mode.carto-provider {
    filter: invert(100%) hue-rotate(180deg) brightness(150%) contrast(90%);
  }
  #map.dark-mode.carto-provider .leaflet-overlay-pane,
  #map.dark-mode.carto-provider .leaflet-marker-pane {
    filter: contrast(111%) brightness(66.6%) hue-rotate(180deg) invert(100%);
  }
  #map.dark-mode .leaflet-bar {
    filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(111%);
  }
  #map.dark-mode:not(.carto-provider) .zone-label {
    filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(111%);
  }
`;
