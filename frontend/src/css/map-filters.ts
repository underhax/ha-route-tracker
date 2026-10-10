import { type CSSResult, css } from 'lit';

export const mapFiltersStyles: CSSResult = css`
  #map.dark-mode {
    filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
  }

  #map.dark-mode .leaflet-bar {
    filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(111%);
  }
  #map.dark-mode .zone-label {
    filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(111%);
  }
`;
