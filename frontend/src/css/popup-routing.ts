import { css } from 'lit';

export const popupRoutingStyles = css`
  .rt-popup-route-btn {
    cursor: pointer;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--primary-color, #03a9f4) !important;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    transition: opacity 0.2s;
    text-decoration: none;
  }
  .rt-popup-route-btn:hover {
    opacity: 0.8;
    text-decoration: underline;
  }
  .rt-popup-route-btn svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
`;
