import { type CSSResult, css } from 'lit';

export const cardLayoutStyles: CSSResult = css`
  :host {
    --route-tracker-header-height: 56px;
    --route-tracker-edit-header-height: 114px;
    --route-tracker-edit-panel-height: 65px;
    --route-tracker-standard-available-height: calc(
      100dvh - var(--route-tracker-header-height)
    );
    --route-tracker-edit-available-height: calc(
      100dvh
      - var(--route-tracker-edit-header-height)
      - var(--route-tracker-edit-panel-height)
    );

    display: block;
    position: relative;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 400px;
    max-height: var(--route-tracker-standard-available-height);
    aspect-ratio: 16 / 9;
    border-radius: var(--ha-card-border-radius, 12px);
    overflow: hidden;
    box-shadow: var(--ha-card-box-shadow, 0px 2px 4px 0px rgba(0,0,0,0.16));
  }
  :host(.is-editing-panel) {
    min-height: 0;
    max-height: var(--route-tracker-edit-available-height);
  }
  .card-content {
    position: absolute;
    inset: 0;
    container-type: inline-size;
  }
  #map {
    position: absolute;
    inset: 0;
    z-index: 1;
  }
`;
