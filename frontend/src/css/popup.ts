import { css } from 'lit';

export const popupStyles = css`
  .rt-popup-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 14px;
  }
  .rt-popup-title {
    font-weight: bold;
  }
  .rt-popup-coords {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    white-space: nowrap;
  }
  .rt-popup-coords span {
    font-family: monospace;
  }
  .rt-popup-extra-attrs {
    display: flex;
    gap: 6px 16px;
    justify-content: flex-start;
    padding-top: 10px;
    border-top: 1px solid #d8d8d8;
    font-family: monospace;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    color: #333333;
    margin-top: 2px;
  }
  .rt-popup-attr {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #333333;
  }
  .rt-popup-attr svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
    opacity: 0.5;
    flex-shrink: 0;
  }
  .rt-popup-attr-value {
    white-space: nowrap;
  }
  .rt-popup-copy-btn {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    display: flex;
    align-items: center;
    opacity: 0.7;
    transition: opacity 0.2s;
  }
  .rt-popup-divider {
    height: 1px;
    margin: 4px 0 0;
    background: #d8d8d8;
  }
  .rt-popup-copy-btn:hover {
    opacity: 1;
  }
  .rt-popup-copy-btn svg {
    width: 16px;
    height: 16px;
  }
  .rt-popup-copy-btn.copied svg {
    color: #4caf50;
  }
  .rt-popup-geocode-btn {
    cursor: pointer;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--primary-color, #03a9f4);
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    transition: opacity 0.2s;
  }
  .rt-popup-geocode-btn:hover {
    opacity: 0.8;
    text-decoration: underline;
  }
  .rt-popup-geocode-btn svg {
    width: 16px;
    height: 16px;
  }
  .rt-popup-address {
    max-width: 280px;
    white-space: normal;
    line-height: 1.4;
  }
  .leaflet-popup-content {
    margin: 16px !important;
  }
`;
