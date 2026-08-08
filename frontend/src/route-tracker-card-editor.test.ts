import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { RouteTrackerCardEditor } from './route-tracker-card-editor';
import type { HomeAssistant } from 'custom-card-helpers';

interface RouteEntityConfig {
  entity: string;
  name?: string;
}

interface TestConfig {
  map_provider?: string;
  theme_mode?: string;
  entities?: RouteEntityConfig[];
  zones?: RouteEntityConfig[];
}

interface TestEntityState {
  state: string;
  attributes: Record<string, unknown>;
}

describe('RouteTrackerCardEditor', () => {
  let editor: RouteTrackerCardEditor;
  let container: HTMLElement;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    if (!customElements.get('route-tracker-card-editor')) {
      customElements.define('route-tracker-card-editor', RouteTrackerCardEditor);
    }

    editor = document.createElement('route-tracker-card-editor') as RouteTrackerCardEditor;

    editor.hass = {
      states: {},
      language: 'en',
    } as unknown as HomeAssistant;

    container.appendChild(editor);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('renders empty when config or hass is missing', async () => {
    const editorEmpty = document.createElement('route-tracker-card-editor') as RouteTrackerCardEditor;
    container.appendChild(editorEmpty);
    await editorEmpty.updateComplete;

    expect(editorEmpty.shadowRoot?.innerHTML).toContain('<!---->');
  });

  it('sets config and renders basic elements', async () => {
    editor.setConfig({
      map_provider: 'osm_default',
      theme_mode: 'auto',
      entities: [],
      zones: []
    });

    await editor.updateComplete;

    const root = editor.shadowRoot;
    expect(root).toBeDefined();

    const selects = root?.querySelectorAll('select');
    expect(selects?.length).toBeGreaterThan(1);
    expect((selects![0] as HTMLSelectElement).value).toBe('osm_default');
    expect((selects![1] as HTMLSelectElement).value).toBe('auto');
  });

  it('fires config-changed when map_provider changes', async () => {
    editor.setConfig({ map_provider: 'osm_default' });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const selects = editor.shadowRoot?.querySelectorAll('select');
    if (selects && selects.length > 0) {
      const select = selects[0] as HTMLSelectElement;
      select.value = 'carto_voyager';
      select.dispatchEvent(new Event('change'));
    }

    expect(firedConfig.map_provider).toBe('carto_voyager');
  });

  it('fires config-changed when theme_mode changes', async () => {
    editor.setConfig({ theme_mode: 'auto' });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const selects = editor.shadowRoot?.querySelectorAll('select');
    if (selects && selects.length > 1) {
      const select = selects[1] as HTMLSelectElement;
      select.value = 'dark';
      select.dispatchEvent(new Event('change'));
    }

    expect(firedConfig.theme_mode).toBe('dark');
  });

  it('validates entity eligibility for unsupported domains', () => {
    const errorSpy = (editor as unknown as { _routeEntityError: (id: string) => string | undefined })._routeEntityError;

    expect(errorSpy.call(editor, '')).toBeUndefined();

    Object.assign(editor.hass.states, {
      'sensor.virtual_device_tracker_foo': { state: 'on', attributes: {} } as TestEntityState,
      'person.test': {
        state: 'home',
        attributes: { device_trackers: ['device_tracker.foo'] }
      } as TestEntityState
    });
    expect(errorSpy.call(editor, 'person.test')).toBeUndefined();

    expect(errorSpy.call(editor, 'light.test')).toBe('Only persons and device trackers configured in Route Tracker are supported.');

    Object.assign(editor.hass.states, {
      'person.bad': { state: 'home', attributes: {} } as TestEntityState
    });
    expect(errorSpy.call(editor, 'person.bad')).toBe('This person has no device tracker selected in Route Tracker. Add a tracker to the integration and link it to this person.');

    Object.assign(editor.hass.states, {
      'device_tracker.bad': { state: 'home', attributes: {} } as TestEntityState
    });
    expect(errorSpy.call(editor, 'device_tracker.bad')).toBe('This device tracker is not configured in Route Tracker.');
  });

  it('adds a new entity when add button is clicked', async () => {
    editor.setConfig({ map_provider: 'osm_default', theme_mode: 'auto', entities: [], zones: [] });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const addButtons = editor.shadowRoot?.querySelectorAll('.btn-add');
    expect(addButtons?.length).toBeGreaterThan(0);

    (addButtons![0] as HTMLButtonElement).click();

    expect(firedConfig?.entities?.length).toBe(1);
    expect(firedConfig?.entities?.[0]).toEqual({ entity: '', name: '' });
  });

  it('updates an entity and name', async () => {
    editor.setConfig({
      map_provider: 'osm_default',
      theme_mode: 'auto',
      entities: [{ entity: 'person.old', name: 'Old Name' }],
      zones: []
    });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const picker = editor.shadowRoot?.querySelector('ha-entity-picker');
    expect(picker).not.toBeNull();
    picker?.dispatchEvent(new CustomEvent('value-changed', { detail: { value: 'person.new' } }));

    expect(firedConfig.entities?.[0]!.entity).toBe('person.new');

    const nameInput = editor.shadowRoot?.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    nameInput.value = 'New Name';
    nameInput.dispatchEvent(new Event('input'));

    expect(firedConfig.entities?.[0]!.name).toBe('New Name');
  });

  it('removes an entity', async () => {
    editor.setConfig({
      map_provider: 'osm_default',
      theme_mode: 'auto',
      entities: [{ entity: 'person.test', name: 'Test Name' }],
      zones: []
    });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const removeBtn = editor.shadowRoot?.querySelector('.btn-remove') as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();

    expect(firedConfig?.entities?.length).toBe(0);
  });

  it('handles drag and drop operations', async () => {
    editor.setConfig({
      map_provider: 'osm_default',
      theme_mode: 'auto',
      entities: [
        { entity: 'person.1', name: 'One' },
        { entity: 'person.2', name: 'Two' }
      ],
      zones: []
    });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const rows = editor.shadowRoot?.querySelectorAll('.entity-row');
    expect(rows?.length).toBe(2);

    const row0 = rows![0] as HTMLElement;
    const row1 = rows![1] as HTMLElement;

    const dragStartEvent = new Event('dragstart') as Event;
    Object.defineProperty(dragStartEvent, 'dataTransfer', { value: { effectAllowed: '' } });
    row0.dispatchEvent(dragStartEvent);
    expect(row0.classList.contains('dragging')).toBe(true);
    expect((dragStartEvent as unknown as { dataTransfer: { effectAllowed: string } }).dataTransfer.effectAllowed).toBe('move');

    const dragOverEvent = new Event('dragover') as Event;
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: { dropEffect: '' } });
    row1.dispatchEvent(dragOverEvent);
    expect(row1.classList.contains('drag-over')).toBe(true);

    const dragLeaveEvent = new Event('dragleave');
    row1.dispatchEvent(dragLeaveEvent);
    expect(row1.classList.contains('drag-over')).toBe(false);

    row1.dispatchEvent(dragOverEvent);

    const dropEvent = new Event('drop');
    row1.dispatchEvent(dropEvent);
    expect(row1.classList.contains('drag-over')).toBe(false);
    expect(firedConfig.entities?.length).toBe(2);
    expect(firedConfig.entities?.[0]!.entity).toBe('person.2');
    expect(firedConfig.entities?.[1]!.entity).toBe('person.1');

    const dragEndEvent = new Event('dragend');
    row0.dispatchEvent(dragEndEvent);
    expect(row0.classList.contains('dragging')).toBe(false);

    const dropEvent2 = new Event('drop');
    row0.dispatchEvent(dropEvent2);
  });

  it('filters entities correctly', async () => {
    editor.setConfig({
      map_provider: 'osm_default',
      theme_mode: 'auto',
      entities: [{ entity: '', name: '' }],
      zones: []
    });
    await editor.updateComplete;

    const picker = editor.shadowRoot?.querySelector('ha-entity-picker') as unknown as { entityFilter: (stateObj: { entity_id: string }) => boolean };
    expect(picker.entityFilter).toBeDefined();

    expect(picker.entityFilter({ entity_id: 'person.unknown' })).toBe(false);
  });

  it('renders entity error in HTML when entity is invalid', async () => {
    Object.assign(editor.hass.states, {
      'person.invalid_for_html': { state: 'home', attributes: {} } as TestEntityState
    });

    editor.setConfig({
      map_provider: 'osm_default',
      theme_mode: 'auto',
      entities: [{ entity: 'person.invalid_for_html', name: '' }],
      zones: []
    });
    await editor.updateComplete;

    const errorParagraph = editor.shadowRoot?.querySelector('.entity-error');
    expect(errorParagraph).not.toBeNull();
    expect(errorParagraph?.textContent).toContain('no device tracker selected');
  });

  it('handles drag and drop edge cases and state guards', () => {
    editor.setConfig({
      map_provider: 'osm_default',
      theme_mode: 'auto'
    });

    type EditorMethods = {
      _addItem: (section: 'entities' | 'zones') => void;
      _removeItem: (section: 'entities' | 'zones', index: number) => void;
      _updateItem: (section: 'entities' | 'zones', index: number, field: 'entity' | 'name', value: string) => void;
      _onDrop: (targetIndex: number, section: 'entities' | 'zones', e: Event) => void;
      _onDragLeave: (e: Event) => void;
      _onDragStart: (index: number, section: 'entities' | 'zones', e: DragEvent) => void;
      _onDragOver: (e: DragEvent) => void;
      _onDragEnd: (e: DragEvent) => void;
    };
    const methods = editor as unknown as EditorMethods;

    editor.setConfig({ map_provider: 'osm_default' });
    methods._removeItem('entities', 0);

    editor.setConfig({ map_provider: 'osm_default' });
    methods._updateItem('entities', 0, 'name', 'test');

    editor.setConfig({ map_provider: 'osm_default' });
    methods._addItem('entities');

    editor.setConfig({ map_provider: 'osm_default' });
    const dropEvent = new Event('drop');
    (editor as unknown as { _dragIndex: number })._dragIndex = 0;
    (editor as unknown as { _dragSection: string })._dragSection = 'entities';
    methods._onDrop(1, 'entities', dropEvent);
    editor.setConfig({ map_provider: 'osm_default', entities: [] });

    const dummyTarget = document.createElement('div');
    methods._onDragLeave({ target: dummyTarget } as unknown as DragEvent);
    
    expect(dummyTarget.classList.contains('drag-over')).toBe(false);

    const overTarget = document.createElement('div');
    overTarget.classList.add('drag-over');
    editor.shadowRoot?.appendChild(overTarget);

    methods._onDragStart(0, 'entities', { target: dummyTarget } as unknown as DragEvent);
    methods._onDragOver({ preventDefault: () => {}, target: dummyTarget } as unknown as DragEvent);
    
    overTarget.classList.add('drag-over');
    methods._onDragEnd({ target: dummyTarget } as unknown as DragEvent);
    
    overTarget.remove();
  });

  it('renders zones without errors', async () => {
    editor.setConfig({ 
      map_provider: 'osm_default', 
      theme_mode: 'auto', 
      entities: [], 
      zones: [{ entity: 'zone.home', name: 'Home' }] 
    });
    await editor.updateComplete;

    const row = editor.shadowRoot?.querySelector('.entity-row');
    expect(row).not.toBeNull();
    const errorParagraph = editor.shadowRoot?.querySelector('.entity-error');
    expect(errorParagraph).toBeNull();
  });

  it('renders entity without entity string', async () => {
    editor.setConfig({ 
      map_provider: 'osm_default', 
      theme_mode: 'auto', 
      entities: [{ name: 'Missing Entity String' } as unknown as RouteEntityConfig], 
      zones: [] 
    });
    await editor.updateComplete;

    const row = editor.shadowRoot?.querySelector('.entity-row');
    expect(row).not.toBeNull();
  });

  it('fires config-changed when enable_geocoding changes', async () => {
    editor.setConfig({ enable_geocoding: false });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const checkboxes = editor.shadowRoot?.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes?.length).toBeGreaterThan(0);
    const geocodingCheckbox = checkboxes![0] as HTMLInputElement;
    
    geocodingCheckbox.checked = true;
    geocodingCheckbox.dispatchEvent(new Event('change'));

    expect((firedConfig as any).enable_geocoding).toBe(true);
  });

  it('fires config-changed when enable_routing changes', async () => {
    editor.setConfig({ enable_routing: false });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const checkboxes = editor.shadowRoot?.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes?.length).toBeGreaterThan(1);
    const routingCheckbox = checkboxes![1] as HTMLInputElement;
    
    routingCheckbox.checked = true;
    routingCheckbox.dispatchEvent(new Event('change'));

    expect((firedConfig as any).enable_routing).toBe(true);
  });

  it('fires config-changed when route_origin changes', async () => {
    editor.setConfig({ enable_routing: true, route_origin: 'device' });
    Object.assign(editor.hass.states, {
      'zone.home': { state: 'zoning', attributes: { friendly_name: 'Home' } } as TestEntityState
    });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const selects = editor.shadowRoot?.querySelectorAll('select');
    const originSelect = selects![2] as HTMLSelectElement;
    
    originSelect.value = 'zone.home';
    originSelect.dispatchEvent(new Event('change'));

    expect((firedConfig as any).route_origin).toBe('zone.home');
  });

  it('fires config-changed when routing_provider changes', async () => {
    editor.setConfig({ enable_routing: true, routing_provider: 'osm' });
    await editor.updateComplete;

    let firedConfig: TestConfig = {} as TestConfig;
    editor.addEventListener('config-changed', (e: Event) => {
      firedConfig = (e as CustomEvent).detail.config as TestConfig;
    });

    const selects = editor.shadowRoot?.querySelectorAll('select');
    const providerSelect = selects![3] as HTMLSelectElement;
    
    providerSelect.value = 'google';
    providerSelect.dispatchEvent(new Event('change'));

    expect((firedConfig as any).routing_provider).toBe('google');
  });

  it('handles zones without friendly_name and invalid routing_provider gracefully', async () => {
    editor.setConfig({ enable_routing: true, route_origin: 'device', routing_provider: 'invalid' });
    Object.assign(editor.hass.states, {
      'zone.no_name': { state: 'zoning', attributes: {} } as TestEntityState
    });
    await editor.updateComplete;

    const selects = editor.shadowRoot?.querySelectorAll('select');
    const originSelect = selects![2] as HTMLSelectElement;
    
    const options = originSelect.querySelectorAll('option');
    const noNameOption = Array.from(options).find(opt => opt.value === 'zone.no_name');
    expect(noNameOption?.textContent?.trim()).toBe('zone.no_name');

    const providerLink = editor.shadowRoot?.querySelector('.routing-provider-info a') as HTMLAnchorElement;
    expect(providerLink.href).toContain('openstreetmap');
  });
});
