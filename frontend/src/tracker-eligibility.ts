export interface RouteTrackerEntityAttributes {
  altitude?: number;
  battery_level?: number;
  device_trackers?: string[];
  friendly_name?: string;
  gps_accuracy?: number;
  latitude?: number;
  longitude?: number;
  radius?: number;
  source_type?: string;
  speed?: number;
  [key: string]: unknown;
}

export interface RouteTrackerEntityState {
  attributes: RouteTrackerEntityAttributes;
}

export type RouteTrackerStates = Record<string, RouteTrackerEntityState | undefined>;

export type RouteEntityEligibility =
  | 'eligible'
  | 'unsupported_person'
  | 'unsupported_tracker'
  | 'unsupported_entity';

export interface EligibleRouteEntity {
  entityId: string;
  state: RouteTrackerEntityState;
}

export function toVirtualSensorId(entityId: string): string {
  const [, objectId] = entityId.split('.', 2);
  return objectId ? `sensor.virtual_device_tracker_${objectId}` : '';
}

export function isSelectedTracker(entityId: string, states: RouteTrackerStates): boolean {
  return entityId.startsWith('device_tracker.') && Boolean(states[toVirtualSensorId(entityId)]);
}

export function getSelectedTrackersForPerson(
  personState: RouteTrackerEntityState | undefined,
  states: RouteTrackerStates,
): string[] {
  const deviceTrackers = personState?.attributes?.device_trackers;

  if (!Array.isArray(deviceTrackers)) {
    return [];
  }

  return deviceTrackers.filter(
    (entityId): entityId is string =>
      typeof entityId === 'string' && isSelectedTracker(entityId, states),
  );
}

export function getRouteEntityEligibility(
  entityId: string,
  states: RouteTrackerStates,
): RouteEntityEligibility {
  if (entityId.startsWith('device_tracker.')) {
    return isSelectedTracker(entityId, states) ? 'eligible' : 'unsupported_tracker';
  }

  if (entityId.startsWith('person.')) {
    return getSelectedTrackersForPerson(states[entityId], states).length > 0
      ? 'eligible'
      : 'unsupported_person';
  }

  return 'unsupported_entity';
}

export function isEligibleRouteEntity(entityId: string, states: RouteTrackerStates): boolean {
  return getRouteEntityEligibility(entityId, states) === 'eligible';
}

export function getEligibleRouteEntities(states: RouteTrackerStates): EligibleRouteEntity[] {
  const eligibleEntities: EligibleRouteEntity[] = [];

  for (const [entityId, state] of Object.entries(states)) {
    if (state && isEligibleRouteEntity(entityId, states)) {
      eligibleEntities.push({ entityId, state });
    }
  }

  return eligibleEntities;
}
