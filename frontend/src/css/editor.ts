import { type CSSResult, css } from 'lit';

export const editorStyles: CSSResult = css`
  .card-config {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .info {
    padding: 16px;
    background-color: var(--secondary-background-color, #f5f5f5);
    border-radius: 8px;
    color: var(--primary-text-color, #212121);
    font-size: 14px;
    line-height: 1.5;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .section-header h4 {
    margin: 0;
    color: var(--primary-text-color, #212121);
  }
  .entity-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
    padding: 8px;
    border-radius: 8px;
    background: var(--secondary-background-color, #f5f5f5);
    transition: background 0.2s, opacity 0.2s, border-color 0.2s;
    border: 2px solid transparent;
    cursor: default;
  }
  .entity-row.drag-over {
    border-color: var(--primary-color, #03a9f4);
  }
  .entity-row.dragging {
    opacity: 0.4;
  }
  .drag-handle {
    cursor: grab;
    color: var(--secondary-text-color, #999);
    font-size: 18px;
    padding: 4px;
    user-select: none;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .entity-row ha-entity-picker {
    flex: 2;
    min-width: 0;
  }
  .entity-row input {
    flex: 1;
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--divider-color, #ccc);
    border-radius: 4px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #000);
  }
  .entity-error {
    color: var(--error-color, #f44336);
    font-size: 12px;
    margin: 0 0 8px;
  }
  .btn-add {
    padding: 8px 16px;
    background: var(--primary-color, #03a9f4);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  }
  .btn-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--secondary-text-color, #999);
    font-size: 20px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.2s, background 0.2s;
    display: flex;
    align-items: center;
  }
  .btn-remove:hover {
    color: var(--error-color, #f44336);
    background: rgba(244, 67, 54, 0.1);
  }
  hr {
    border: none;
    border-top: 1px solid var(--divider-color, #ccc);
    margin: 4px 0;
  }
  a {
    color: var(--primary-color, #03a9f4);
  }
  a:visited {
    color: var(--primary-color, #03a9f4);
  }
  .form-select {
    width: 100%;
    padding: 8px;
    border: 1px solid var(--divider-color, #ccc);
    border-radius: 4px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #000);
  }
  .form-select.margin-bottom {
    margin-bottom: 8px;
  }
  .warning-alert {
    margin-bottom: 16px;
  }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    cursor: pointer;
  }
  .checkbox-description {
    margin: 0 0 16px 24px;
    font-size: 12px;
    color: var(--secondary-text-color, #727272);
  }
  .routing-settings-container {
    margin: 8px 0 16px 24px;
  }
  .origin-device-info {
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--secondary-text-color, #727272);
  }
  .routing-provider-info {
    margin: 0;
    font-size: 12px;
    color: var(--secondary-text-color, #727272);
  }
`;
