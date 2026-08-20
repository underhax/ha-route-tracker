import type { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';
import type { TemplateResult } from 'lit';
import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { editorStyles } from './css/editor.ts';
import { localize } from './localize.ts';
import { getRouteEntityEligibility, isEligibleRouteEntity } from './tracker-eligibility.ts';
import {
  DEFAULT_ROUTING_PROVIDER,
  ROUTING_PROVIDERS,
  resolveRoutingProvider,
} from './utils/routing-providers.ts';

interface EditorConfig {
  entities?: ConfiguredEditorItem[];
  zones?: ConfiguredEditorItem[];
  map_provider?: string;
  theme_mode?: string;
  enable_geocoding?: boolean;
  enable_routing?: boolean;
  route_origin?: string;
  routing_provider?: string;
  [key: string]: unknown;
}

interface ConfiguredEditorItem {
  entity?: string;
  name?: string;
}

@customElement('route-tracker-card-editor')
export class RouteTrackerCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config: EditorConfig = {};
  @state() private _dragIndex: number | null = null;
  @state() private _dragSection: 'entities' | 'zones' | null = null;

  public setConfig(config: EditorConfig): void {
    this._config = config;
  }

  static override styles = editorStyles;

  private _fireConfigChanged(): void {
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        bubbles: true,
        composed: true,
        detail: { config: this._config },
      }),
    );
  }

  private _addItem(section: 'entities' | 'zones'): void {
    const items = [...(this._config[section] || [])];
    items.push({ entity: '', name: '' });
    this._config = { ...this._config, [section]: items };
    this._fireConfigChanged();
  }

  private _removeItem(section: 'entities' | 'zones', index: number): void {
    const items = [...(this._config[section] || [])];
    items.splice(index, 1);
    this._config = { ...this._config, [section]: items };
    this._fireConfigChanged();
  }

  private _updateItem(
    section: 'entities' | 'zones',
    index: number,
    field: 'entity' | 'name',
    value: string,
  ): void {
    const items = [...(this._config[section] || [])];
    items[index] = { ...items[index], [field]: value };
    this._config = { ...this._config, [section]: items };
    this._fireConfigChanged();
  }

  private _onDragStart(index: number, section: 'entities' | 'zones', e: DragEvent): void {
    this._dragIndex = index;
    this._dragSection = section;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
    (e.target as HTMLElement).classList.add('dragging');
  }

  private _onDragEnd(e: DragEvent): void {
    this._dragIndex = null;
    this._dragSection = null;
    (e.target as HTMLElement).classList.remove('dragging');
    for (const el of this.shadowRoot?.querySelectorAll('.drag-over') ?? []) {
      el.classList.remove('drag-over');
    }
  }

  private _onDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    const row = (e.target as HTMLElement).closest('.entity-row');
    for (const el of this.shadowRoot?.querySelectorAll('.drag-over') ?? []) {
      el.classList.remove('drag-over');
    }
    if (row) {
      row.classList.add('drag-over');
    }
  }

  private _onDragLeave(e: DragEvent): void {
    const row = (e.target as HTMLElement).closest('.entity-row');
    if (row && this.shadowRoot?.contains(row)) {
      row.classList.remove('drag-over');
    }
  }

  private _onDrop(targetIndex: number, section: 'entities' | 'zones', e: DragEvent): void {
    e.preventDefault();
    for (const el of this.shadowRoot?.querySelectorAll('.drag-over') ?? []) {
      el.classList.remove('drag-over');
    }

    if (
      this._dragIndex === null ||
      this._dragSection !== section ||
      this._dragIndex === targetIndex
    ) {
      return;
    }

    const items = [...(this._config[section] || [])];
    const [moved] = items.splice(this._dragIndex, 1);
    if (!moved) return;
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
    entityFilter?: (stateObj: { entity_id: string }) => boolean,
  ): TemplateResult {
    const items = this._config[section] || [];

    return html`
      <div class="entities-list">
        <div class="section-header">
          <h4>${title}</h4>
        </div>
        ${items.map((ent: ConfiguredEditorItem, index: number) => {
          const entityError =
            section === 'entities' ? this._routeEntityError(ent.entity ?? '') : undefined;
          return html`
          <div class="entity-row"
               draggable="true"
               @dragstart=${(e: DragEvent): void => this._onDragStart(index, section, e)}
               @dragend=${(e: DragEvent): void => this._onDragEnd(e)}
               @dragover=${(e: DragEvent): void => this._onDragOver(e)}
               @dragleave=${(e: DragEvent): void => this._onDragLeave(e)}
               @drop=${(e: DragEvent): void => this._onDrop(index, section, e)}>
            <span class="drag-handle">☰</span>
            <ha-entity-picker
              .hass=${this.hass}
              .value=${ent.entity}
              .includeDomains=${domains}
              .entityFilter=${entityFilter}
              @value-changed=${(e: CustomEvent): void => this._updateItem(section, index, 'entity', (e.detail as { value: string }).value)}
              allow-custom-entity
            ></ha-entity-picker>
            <input type="text"
                   .value=${ent.name ?? ''}
                    @input=${(e: Event): void => this._updateItem(section, index, 'name', (e.target as HTMLInputElement).value)}
                   placeholder="${localize('editor.placeholder_name', this.hass.language)}" />
            <button class="btn-remove" @click=${(): void => this._removeItem(section, index)} title="Remove">🗑</button>
          </div>
          ${entityError ? html`<p class="entity-error">${entityError}</p>` : ''}
        `;
        })}
        <button class="btn-add" @click=${(): void => this._addItem(section)}>${addLabel}</button>
      </div>
    `;
  }

  private _trackerFilter(stateObj: { entity_id: string }): boolean {
    return isEligibleRouteEntity(stateObj.entity_id, this.hass.states);
  }

  private _onMapProviderChange(e: Event): void {
    this._config = {
      ...this._config,
      map_provider: (e.target as HTMLSelectElement).value,
    };
    this._fireConfigChanged();
  }

  private _onThemeModeChange(e: Event): void {
    this._config = { ...this._config, theme_mode: (e.target as HTMLSelectElement).value };
    this._fireConfigChanged();
  }

  private _onGeocodingChange(e: Event): void {
    this._config = {
      ...this._config,
      enable_geocoding: (e.target as HTMLInputElement).checked,
    };
    this._fireConfigChanged();
  }

  private _onRoutingChange(e: Event): void {
    this._config = {
      ...this._config,
      enable_routing: (e.target as HTMLInputElement).checked,
    };
    this._fireConfigChanged();
  }

  private _onRouteOriginChange(e: Event): void {
    this._config = {
      ...this._config,
      route_origin: (e.target as HTMLSelectElement).value,
    };
    this._fireConfigChanged();
  }

  private _onRoutingProviderChange(e: Event): void {
    this._config = {
      ...this._config,
      routing_provider: (e.target as HTMLSelectElement).value,
    };
    this._fireConfigChanged();
  }

  private _renderZoneOption(entityId: string): TemplateResult {
    const stateObj = this.hass.states[entityId];
    const name = stateObj?.attributes?.friendly_name ?? entityId;
    return html`
      <option value="${entityId}" ?selected=${this._config.route_origin === entityId}>
        ${name}
      </option>
    `;
  }

  protected override render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    const lang = this.hass.language;

    return html`
      <div class="card-config">
        <div>
          <h4>${localize('editor.map_provider', lang)}</h4>
          <select
            .value=${this._config.map_provider ?? 'osm_default'}
            @change=${this._onMapProviderChange}
            class="form-select"
          >
            <option value="osm_default">OpenStreetMap DE</option>
            <option value="carto_voyager">CartoDB Voyager</option>
            <option value="esri_satellite">Esri Satellite</option>
          </select>
        </div>
        <div>
          <h4>${localize('editor.theme_mode', lang)}</h4>
          <select
            .value=${this._config.theme_mode ?? 'auto'}
            @change=${this._onThemeModeChange}
            class="form-select"
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
          (stateObj: { entity_id: string }): boolean => this._trackerFilter(stateObj),
        )}

        <hr />

        ${this._renderEntityList(
          'zones',
          localize('editor.zones', lang),
          localize('editor.add_zone', lang),
          ['zone'],
        )}

        <hr />

        <div class="section-header">
          <h4>${localize('editor.external_services', lang)}</h4>
        </div>

        <ha-alert alert-type="warning" class="warning-alert">
          ${localize('editor.warning_external_services', lang)}
        </ha-alert>

        <div>
          <label class="checkbox-label">
            <input type="checkbox"
              .checked=${this._config.enable_geocoding === true}
              @change=${this._onGeocodingChange}
            />
            <span>${localize('editor.enable_geocoding', lang)}</span>
          </label>
          ${
            this._config.enable_geocoding === true
              ? html`
            <p class="checkbox-description">
              ${localize('editor.info_geocoding', lang)} <a href="https://nominatim.openstreetmap.org" target="_blank" rel="noopener noreferrer">https://nominatim.openstreetmap.org</a>
            </p>
          `
              : ''
          }
        </div>

        <div>
          <label class="checkbox-label">
            <input type="checkbox"
              .checked=${this._config.enable_routing === true}
              @change=${this._onRoutingChange}
            />
            <span>${localize('editor.enable_routing', lang)}</span>
          </label>

          ${this._config.enable_routing === true ? this._renderRoutingSettings() : ''}
        </div>
      </div>
    `;
  }

  private _renderRoutingSettings(): TemplateResult {
    const lang = this.hass.language;
    const routeOrigin = this._config.route_origin ?? 'device';
    const providerKey = this._config.routing_provider ?? DEFAULT_ROUTING_PROVIDER;
    const provider = resolveRoutingProvider(providerKey);
    const providerUrl = provider.url;

    return html`
      <div class="routing-settings-container">
        <select
          .value=${routeOrigin}
          @change=${this._onRouteOriginChange}
          class="form-select margin-bottom"
        >
          <option value="device" ?selected=${routeOrigin === 'device'}>
            ${localize('editor.origin_device', lang)}
          </option>
          ${Object.keys(this.hass.states)
            .filter((entityId: string) => entityId.startsWith('zone.'))
            .map((entityId: string) => this._renderZoneOption(entityId))}
        </select>

        ${
          routeOrigin === 'device'
            ? html`
          <p class="origin-device-info">
            ${localize('editor.info_origin_device', lang)}
          </p>
        `
            : ''
        }

        <select
          .value=${this._config.routing_provider ?? DEFAULT_ROUTING_PROVIDER}
          @change=${this._onRoutingProviderChange}
          class="form-select margin-bottom"
        >
          ${Object.values(ROUTING_PROVIDERS).map(
            (rp: { id: string; nameKey: string; url: string }) => html`
              <option value="${rp.id}" ?selected=${(this._config.routing_provider ?? DEFAULT_ROUTING_PROVIDER) === rp.id}>
                ${localize(rp.nameKey, lang)}
              </option>
            `,
          )}
        </select>

        <p class="routing-provider-info">
          ${localize('editor.info_routing', lang)}
          <a href="${providerUrl}" target="_blank" rel="noopener noreferrer">
            ${providerUrl}
          </a>
        </p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'route-tracker-card-editor': RouteTrackerCardEditor;
  }
}
