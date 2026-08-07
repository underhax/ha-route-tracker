import { css } from 'lit';

export const uiControlsStyles = css`
  .attribution-outside {
    position: absolute !important;
    bottom: 0px !important;
    right: 0px !important;
    z-index: 3 !important;
    background-color: rgb(247, 247, 247);
    border-radius: 3px 0px;
    font-size: 12px;
  }
  .attribution-outside a {
    color: #3289ce;
    font-size: 12px;
  }

  .control-panel, .provider-selector, .controls-toggle {
    background-color: #333334 !important;
    backdrop-filter: blur(10px) !important;
  }
  .control-panel {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 3;
    box-sizing: border-box;
    width: 284px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    color: #fff;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif);
  }
  .control-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .control-panel h3 {
    margin: 0;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #64b5f6;
  }
  .control-panel-close,
  .controls-toggle {
    display: none;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    font: inherit;
  }
  .control-panel-close {
    width: 32px;
    height: 32px;
    margin: -4px -4px -4px 8px;
    background: transparent;
    font-size: 28px;
    line-height: 1;
  }
  .controls-toggle {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 3;
    width: 44px;
    height: 44px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    font-size: 24px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    padding: 0;
  }
  .control-panel-close:focus-visible,
  .controls-toggle:focus-visible {
    outline: 2px solid #64b5f6;
    outline-offset: 2px;
  }
  @container (max-width: 640px) {
    .control-panel {
      display: none;
      width: min(284px, calc(100% - 32px));
    }
    .control-panel.is-open {
      display: block;
    }
    .control-panel-close {
      display: flex;
    }
  }
  .input-group {
    display: flex;
    flex-direction: column;
    margin-bottom: 12px;
  }
  .input-group label {
    font-size: 12px;
    margin-bottom: 4px;
    color: #aaa;
  }
  select, input[type="date"] {
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 8px;
    border-radius: 6px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.3s;
  }
  select:focus, input[type="date"]:focus {
    border-color: #64b5f6;
  }

  .provider-selector {
    position: absolute !important;
    bottom: 16px !important;
    left: 16px !important;
    z-index: 3 !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 12px !important;
    color: #fff !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
    padding: 6px !important;
  }
  .provider-selector .leaflet-control-layers-toggle {
    width: 44px !important;
    height: 44px !important;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath fill='%23999999' d='M199.39 225.91 14.93 321.64c-20.055 10.407-19.864 39.165.324 49.301l185.59 93.211a122.9 122.9 0 0 0 110.312 0l185.586-93.21c20.192-10.141 20.383-38.895.328-49.301l-184.465-95.73a122.9 122.9 0 0 0-113.214 0'/%3E%3Cpath fill='%23cccccc' d='M199.39 119.86 14.93 215.593c-20.055 10.406-19.864 39.16.324 49.3l185.59 93.211a122.9 122.9 0 0 0 110.312 0l185.586-93.21c20.192-10.141 20.383-38.895.328-49.301l-184.465-95.73a122.9 122.9 0 0 0-113.214-.005'/%3E%3Cpath fill='%23b3b3b3' d='m311.156 358.105 130.188-65.386-128.739-66.809a122.89 122.89 0 0 0-113.21 0L70.656 292.72l130.188 65.386a122.9 122.9 0 0 0 110.312 0'/%3E%3Cpath fill='%23ffffff' d='m199.39 13.813-184.46 95.73c-20.055 10.41-19.864 39.164.324 49.305l185.59 93.21a122.9 122.9 0 0 0 110.312 0l185.586-93.21c20.192-10.141 20.383-38.895.328-49.305l-184.465-95.73a122.9 122.9 0 0 0-113.214 0'/%3E%3Cpath fill='%23e6e6e6' d='m311.156 252.059 130.188-65.387-128.739-66.813a122.89 122.89 0 0 0-113.21 0L70.656 186.672l130.188 65.387a122.9 122.9 0 0 0 110.312 0'/%3E%3Cpath fill='%23cccccc' d='m311.156 252.059 26.344-13.23-24.895-12.919a122.9 122.9 0 0 0-113.214 0L174.5 238.828l26.344 13.23a122.9 122.9 0 0 0 110.312 0'/%3E%3C/svg%3E") !important;
    background-size: 26px 26px !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
  }
  .provider-selector.leaflet-control-layers-expanded {
    padding: 8px !important;
  }
  .provider-selector .leaflet-control-layers-list,
  .provider-selector .leaflet-control-layers-scrollbar {
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
  .provider-selector label {
    display: flex !important;
    align-items: center !important;
    padding: 10px 12px !important;
    margin: 2px 0 !important;
    cursor: pointer !important;
    border-radius: 8px !important;
    transition: background 0.2s !important;
  }
  .provider-selector label:hover {
    background: rgba(255, 255, 255, 0.1) !important;
  }
  .provider-selector input[type="radio"] {
    margin: 0 12px 0 0 !important;
    accent-color: #64b5f6 !important;
    width: 18px !important;
    height: 18px !important;
    cursor: pointer !important;
  }
  .provider-selector span {
    font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif) !important;
    font-size: 14px !important;
    line-height: 1 !important;
  }
  .provider-selector .leaflet-control-layers-separator {
    display: none !important;
  }
`;
