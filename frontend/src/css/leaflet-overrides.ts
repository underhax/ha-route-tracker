import { type CSSResult, css } from 'lit';

export const leafletOverridesStyles: CSSResult = css`
  .leaflet-bar {
    border: 1px solid rgba(0, 0, 0, 0.07) !important;
  }
  .leaflet-bar a {
    background-color: #f7f7f7 !important;
    color: #222324 !important;
    border-bottom: 1px solid rgba(0, 0, 0, 0.07) !important;
  }
  .leaflet-bar a:hover {
    background-color: #e6e6e6 !important;
    color: #000 !important;
  }
  .leaflet-bar a.leaflet-disabled,
  .leaflet-bar a.leaflet-disabled:hover {
    color: #737373 !important;
    cursor: default !important;
    background-color: #e5e5e5 !important;
  }
`;
