import leafletCss from 'leaflet/dist/leaflet.css?inline';
import { type CSSResult, unsafeCSS } from 'lit';

export const leafletBaseStyles: CSSResult = unsafeCSS(leafletCss);
