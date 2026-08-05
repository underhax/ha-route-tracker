import { describe, expect, it } from 'vitest';
import {
  getEligibleRouteEntities,
  getRouteEntityEligibility,
  getSelectedTrackersForPerson,
  isEligibleRouteEntity,
  toVirtualSensorId,
  type RouteTrackerStates,
} from './tracker-eligibility';

const states: RouteTrackerStates = {
  'device_tracker.phone': { attributes: {} },
  'device_tracker.tablet': { attributes: {} },
  'person.a': { attributes: { device_trackers: [] } },
  'person.b': { attributes: { device_trackers: ['device_tracker.tablet'] } },
  'person.c': { attributes: { device_trackers: ['device_tracker.phone'] } },
  'sensor.virtual_device_tracker_phone': {
    attributes: { source_entity: 'device_tracker.phone' },
  },
};

describe('tracker eligibility', () => {
  it('derives the virtual sensor entity ID from a device tracker', () => {
    expect(toVirtualSensorId('device_tracker.phone')).toBe(
      'sensor.virtual_device_tracker_phone'
    );
    expect(toVirtualSensorId('person.c')).toBe('sensor.virtual_device_tracker_c');
  });

  it('allows only trackers selected by the integration', () => {
    expect(isEligibleRouteEntity('device_tracker.phone', states)).toBe(true);
    expect(isEligibleRouteEntity('device_tracker.tablet', states)).toBe(false);
    expect(getRouteEntityEligibility('device_tracker.tablet', states)).toBe(
      'unsupported_tracker'
    );
  });

  it('requires a person to link a selected device tracker', () => {
    expect(isEligibleRouteEntity('person.a', states)).toBe(false);
    expect(isEligibleRouteEntity('person.b', states)).toBe(false);
    expect(isEligibleRouteEntity('person.c', states)).toBe(true);
    expect(getRouteEntityEligibility('person.b', states)).toBe(
      'unsupported_person'
    );
  });

  it('uses only selected trackers when resolving a person route', () => {
    const personState = {
      attributes: {
        device_trackers: ['device_tracker.phone', 'device_tracker.tablet'],
      },
    };

    expect(getSelectedTrackersForPerson(personState, states)).toEqual([
      'device_tracker.phone',
    ]);
  });

  it('returns the same eligible set for the default card list', () => {
    expect(getEligibleRouteEntities(states).map(entity => entity.entityId)).toEqual([
      'device_tracker.phone',
      'person.c',
    ]);
  });

  it('rejects manually supplied unsupported entity domains', () => {
    expect(getRouteEntityEligibility('zone.home', states)).toBe(
      'unsupported_entity'
    );
  });
});
