import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';
import { localize } from './localize';
import {
  getRouteEntityEligibility,
  isEligibleRouteEntity,
} from './tracker-eligibility';

@customElement('route-tracker-card-editor')
export class RouteTrackerCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config: any;
  @state() private _dragIndex: number | null = null;
  @state() private _dragSection: 'entities' | 'zones' | null = null;

  public setConfig(config: any): void {
    this._config = config;
  }

  static override styles = css`
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
  `;

  private _fireConfigChanged() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    }));
  }

  private _addItem(section: 'entities' | 'zones') {
    const items = [...(this._config[section] || [])];
    items.push({ entity: '', name: '' });
    this._config = { ...this._config, [section]: items };
    this._fireConfigChanged();
  }

  private _removeItem(section: 'entities' | 'zones', index: number) {
    const items = [...(this._config[section] || [])];
    items.splice(index, 1);
    this._config = { ...this._config, [section]: items };
    this._fireConfigChanged();
  }

  private _updateItem(section: 'entities' | 'zones', index: number, field: 'entity' | 'name', value: string) {
    const items = [...(this._config[section] || [])];
    items[index] = { ...items[index], [field]: value };
    this._config = { ...this._config, [section]: items };
    this._fireConfigChanged();
  }

  private _onDragStart(index: number, section: 'entities' | 'zones', e: DragEvent) {
    this._dragIndex = index;
    this._dragSection = section;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
    (e.target as HTMLElement).classList.add('dragging');
  }

  private _onDragEnd(e: DragEvent) {
    this._dragIndex = null;
    this._dragSection = null;
    (e.target as HTMLElement).classList.remove('dragging');
    this.shadowRoot?.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  private _onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    const row = (e.target as HTMLElement).closest('.entity-row');
    this.shadowRoot?.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (row) {
      row.classList.add('drag-over');
    }
  }

  private _onDragLeave(e: DragEvent) {
    const row = (e.target as HTMLElement).closest('.entity-row');
    if (row) {
      row.classList.remove('drag-over');
    }
  }

  private _onDrop(targetIndex: number, section: 'entities' | 'zones', e: DragEvent) {
    e.preventDefault();
    this.shadowRoot?.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

    if (this._dragIndex === null || this._dragSection !== section || this._dragIndex === targetIndex) {
      return;
    }

    const items = [...(this._config[section] || [])];
    const [moved] = items.splice(this._dragIndex, 1);
    items.splice(targetIndex, 0, moved);

    this._config = { ...this._config, [section]: items };
    this._fireConfigChanged();
    this._dragIndex = null;
    this._dragSection = null;
  }

  private _routeEntityError(entityId: string): string | undefined {
    if (!entityId) {
      return undefined;
    }

    const eligibility = getRouteEntityEligibility(entityId, this.hass.states);
    if (eligibility === 'unsupported_person') {
      return localize('editor.unsupported_person', this.hass.language);
    }
    if (eligibility === 'unsupported_tracker') {
      return localize('editor.unsupported_tracker', this.hass.language);
    }
    if (eligibility === 'unsupported_entity') {
      return localize('editor.unsupported_entity', this.hass.language);
    }

    return undefined;
  }

  private _renderEntityList(
    section: 'entities' | 'zones',
    title: string,
    addLabel: string,
    domains: string[],
    entityFilter?: (stateObj: any) => boolean
  ) {
    const items = this._config[section] || [];

    return html`
      <div class="entities-list">
        <div class="section-header">
          <h4>${title}</h4>
        </div>
        ${items.map((ent: any, index: number) => html`
          <div class="entity-row"
               draggable="true"
               @dragstart=${(e: DragEvent) => this._onDragStart(index, section, e)}
               @dragend=${(e: DragEvent) => this._onDragEnd(e)}
               @dragover=${(e: DragEvent) => this._onDragOver(e)}
               @dragleave=${(e: DragEvent) => this._onDragLeave(e)}
               @drop=${(e: DragEvent) => this._onDrop(index, section, e)}>
            <span class="drag-handle">☰</span>
            <ha-entity-picker
              .hass=${this.hass}
              .value=${ent.entity}
              .includeDomains=${domains}
              .entityFilter=${entityFilter}
              @value-changed=${(e: any) => this._updateItem(section, index, 'entity', e.detail.value)}
              allow-custom-entity
            ></ha-entity-picker>
            <input type="text"
                   .value=${ent.name || ''}
                   @input=${(e: Event) => this._updateItem(section, index, 'name', (e.target as HTMLInputElement).value)}
                   placeholder="${localize('editor.placeholder_name', this.hass.language)}" />
            <button class="btn-remove" @click=${() => this._removeItem(section, index)} title="Remove">🗑</button>
          </div>
          ${section === 'entities' && this._routeEntityError(ent.entity || '')
            ? html`<p class="entity-error">${this._routeEntityError(ent.entity || '')}</p>`
            : ''}
        `)}
        <button class="btn-add" @click=${() => this._addItem(section)}>${addLabel}</button>
      </div>
    `;
  }

  protected override render() {
    if (!this.hass || !this._config) {
      return html``;
    }

    const lang = this.hass.language;

    const trackerFilter = (stateObj: { entity_id: string }) =>
      isEligibleRouteEntity(stateObj.entity_id, this.hass.states);

    return html`
      <div class="card-config">
        <div>
          <h4>${localize('editor.map_provider', lang)}</h4>
          <select
            .value=${this._config.map_provider || 'osm_default'}
            @change=${(e: Event) => {
              this._config = { ...this._config, map_provider: (e.target as HTMLSelectElement).value };
              this._fireConfigChanged();
            }}
            style="width: 100%; padding: 8px; border: 1px solid var(--divider-color, #ccc); border-radius: 4px; background: var(--card-background-color, #fff); color: var(--primary-text-color, #000);"
          >
            <option value="osm_default">OpenStreetMap DE</option>
            <option value="carto_voyager">CartoDB Voyager</option>
            <option value="esri_satellite">Esri Satellite</option>
          </select>
        </div>

        <div>
          <h4>${localize('editor.theme_mode', lang)}</h4>
          <select
            .value=${this._config.theme_mode || 'auto'}
            @change=${(e: Event) => {
              this._config = { ...this._config, theme_mode: (e.target as HTMLSelectElement).value };
              this._fireConfigChanged();
            }}
            style="width: 100%; padding: 8px; border: 1px solid var(--divider-color, #ccc); border-radius: 4px; background: var(--card-background-color, #fff); color: var(--primary-text-color, #000);"
          >
            <option value="auto">${localize('editor.theme_auto', lang)}</option>
            <option value="light">${localize('editor.theme_light', lang)}</option>
            <option value="dark">${localize('editor.theme_dark', lang)}</option>
          </select>
        </div>

        <hr />

        <p class="info">${localize('editor.info', lang)}</p>

        ${this._renderEntityList(
          'entities',
          localize('editor.trackers', lang),
          localize('editor.add_tracker', lang),
          ['device_tracker', 'person'],
          trackerFilter
        )}

        <hr />

        ${this._renderEntityList(
          'zones',
          localize('editor.zones', lang),
          localize('editor.add_zone', lang),
          ['zone']
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'route-tracker-card-editor': RouteTrackerCardEditor;
  }
}
