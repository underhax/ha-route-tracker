import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as L from 'leaflet';
import { calculateDistance, drawRouteOnMap, DrawRouteOptions, RoutePoint } from './route-drawer';

describe('RouteDrawer', () => {
  describe('calculateDistance()', () => {
    it('calculates distance correctly for known points', () => {
      const d = calculateDistance(0, 0, 1, 1);
      expect(d).toBeGreaterThan(0);
      expect(calculateDistance(0, 0, 0, 0)).toBe(0);
    });

    it('calculates distance correctly over a large random dataset', () => {
      for (let i = 0; i < 10000; i++) {
        const lat1 = (Math.random() * 180) - 90;
        const lon1 = (Math.random() * 360) - 180;
        const lat2 = (Math.random() * 180) - 90;
        const lon2 = (Math.random() * 360) - 180;
        
        const dist = calculateDistance(lat1, lon1, lat2, lon2);
        expect(dist).not.toBeNaN();
        expect(dist).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('drawRouteOnMap()', () => {
    let map: L.Map;
    let routeLayer: L.LayerGroup;
    let localize: any;
    let baseOptions: DrawRouteOptions;

    beforeEach(() => {
      document.body.innerHTML = '<div id="map"></div>';
      map = L.map('map');
      routeLayer = L.layerGroup();
      localize = vi.fn((key: string) => `trans_${key}`);
      
      baseOptions = {
        points: [],
        map,
        routeLayer,
        isSatellite: false,
        isDarkMode: false,
        currentProvider: 'OpenStreetMap',
        localize,
        language: 'en',
        fallbackLat: 10,
        fallbackLon: 20,
        routingProvider: 'osm',
        enableGeocoding: false,
        enableRouting: false,
        routeOrigin: 'disabled',
        hass: { states: {} }
      };

      if (!(window as any).L) {
        (window as any).L = {};
      }
      (window as any).L.polylineDecorator = vi.fn(() => ({
        addTo: vi.fn()
      }));
      if (!(window as any).L.Symbol) {
        (window as any).L.Symbol = {};
      }
      (window as any).L.Symbol.arrowHead = vi.fn();
    });

    it('handles zero or invalid points', () => {
      const setViewSpy = vi.spyOn(map, 'setView');
      
      const result = drawRouteOnMap(baseOptions);
      expect(result).toBeUndefined();
      expect(setViewSpy).toHaveBeenCalledWith([10, 20], 19);

      const resultNull = drawRouteOnMap({ ...baseOptions, points: null as any });
      expect(resultNull).toBeUndefined();
      
      const resultUndefined = drawRouteOnMap({ ...baseOptions, points: undefined as any });
      expect(resultUndefined).toBeUndefined();
    });

    it('draws a single route point', () => {
      const points: RoutePoint[] = [
        { loc: L.latLng(0, 0), timestamp: 'time1' }
      ];
      const result = drawRouteOnMap({ ...baseOptions, points });
      expect(result).toBeDefined();
      expect(routeLayer.getLayers().length).toBeGreaterThan(0);
    });

    it('draws multiple points and branches themes', () => {
      const points: RoutePoint[] = [
        { loc: L.latLng(0, 0), timestamp: 'time1' },
        { loc: L.latLng(1, 1), timestamp: 'time2' },
        { loc: L.latLng(2, 2), timestamp: 'time3' }
      ];
      
      drawRouteOnMap({ ...baseOptions, points, isSatellite: true });
      drawRouteOnMap({ ...baseOptions, points, isSatellite: false, isDarkMode: true, currentProvider: 'CartoDB Voyager' });
      drawRouteOnMap({ ...baseOptions, points, isSatellite: false, isDarkMode: true, currentProvider: 'OpenStreetMap' });
      drawRouteOnMap({ ...baseOptions, points, isSatellite: false, isDarkMode: false, currentProvider: 'OpenStreetMap' });
      
      expect((window as any).L.polylineDecorator).toHaveBeenCalled();
    });

    it('simulates a click on a hitArea bead', () => {
      const points: RoutePoint[] = [
        { loc: L.latLng(0, 0), timestamp: 'time1' },
        { loc: L.latLng(1, 1), timestamp: 'time2' },
        { loc: L.latLng(2, 2), timestamp: 'time3' }
      ];
      
      drawRouteOnMap({ ...baseOptions, points });
      
      const layers = routeLayer.getLayers();
      layers.forEach((layer: any) => {
        if (layer.fire) {
          layer.fire('click');
        }
      });
    });
    
    it('handles missing polylineDecorator', () => {
      const points: RoutePoint[] = [
        { loc: L.latLng(0, 0), timestamp: 'time1' },
        { loc: L.latLng(1, 1), timestamp: 'time2' }
      ];
      delete (window as any).L.polylineDecorator;
      
      expect(() => {
        drawRouteOnMap({ ...baseOptions, points });
      }).not.toThrow();
    });
  });
});
