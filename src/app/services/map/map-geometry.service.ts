import { Injectable } from '@angular/core';
import * as L from 'leaflet';

@Injectable({
  providedIn: 'root'
})
export class MapGeometryService {
  /**
   * Approximates a circle as a polygon coordinate list.
    * @param circle Leaflet circle.
    * @param numPoints Number of points used for approximation.
    * @returns Polygon coordinates in [lng, lat].
   */
  circleToPolygon(circle: any, numPoints: number = 64): [number, number][] {
    const center = circle.getLatLng();
    const radius = circle.getRadius();
    const coordinates: [number, number][] = [];

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const lat = center.lat + (radius / 111320) * Math.cos(angle);
      const lng = center.lng + (radius / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
      coordinates.push([lng, lat]);
    }

    return coordinates;
  }

  /**
   * Extracts polygon-like coordinates from editable layers in requested order.
    * @param editableLayers Leaflet feature group.
    * @param coordinateOrder Desired point order.
    * @returns Array of polygon coordinate arrays.
   */
  extractPolygonCoordinatesForAnalysis(
    editableLayers: any,
    coordinateOrder: 'lnglat' | 'latlng' = 'lnglat'
  ): [number, number][][] {
    const polygons: [number, number][][] = [];

    if (!editableLayers) {
      return polygons;
    }

    const toOrder = ([lng, lat]: [number, number]): [number, number] => {
      return coordinateOrder === 'latlng' ? [lat, lng] : [lng, lat];
    };

    editableLayers.eachLayer((layer: any) => {
      let coordinates: [number, number][] = [];

      if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
        const geoJson = layer.toGeoJSON();
        const rawCoords = geoJson && geoJson.geometry && geoJson.geometry.coordinates && geoJson.geometry.coordinates[0]
          ? geoJson.geometry.coordinates[0]
          : [];
        coordinates = rawCoords.map(([lng, lat]: [number, number]) => toOrder([lng, lat]));
      } else if (layer instanceof L.Circle) {
        coordinates = this.circleToPolygon(layer).map((point: [number, number]) => toOrder(point));
      }

      if (coordinates.length > 0) {
        polygons.push(coordinates);
      }
    });

    return polygons;
  }

  /**
   * Converts extracted coordinates into Polygon geometry objects.
    * @param editableLayers Leaflet feature group.
    * @returns Polygon geometry array.
   */
  extractPolygonsForAnalysis(editableLayers: any): any[] {
    return this.extractPolygonCoordinatesForAnalysis(editableLayers, 'lnglat').map((coordinates: [number, number][]) => ({
      type: 'Polygon',
      coordinates: [coordinates],
    }));
  }

  /**
   * Extracts labeled polygon geometries from editable layers.
    * @param editableLayers Leaflet feature group.
    * @param ensureLayerFeature Callback to get or create a feature object.
    * @returns Labeled polygon coordinate array.
   */
  extractLabeledPolygonsForAnalysis(
    editableLayers: any,
    ensureLayerFeature: (layer: any) => any
  ): { label: string; coordinates: [number, number][] }[] {
    const polygons: { label: string; coordinates: [number, number][] }[] = [];

    if (!editableLayers) {
      return polygons;
    }

    editableLayers.eachLayer((layer: any) => {
      let coordinates: [number, number][] = [];

      if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
        const geoJson = layer.toGeoJSON();
        const rawCoords = geoJson && geoJson.geometry && geoJson.geometry.coordinates && geoJson.geometry.coordinates[0]
          ? geoJson.geometry.coordinates[0]
          : [];
        coordinates = rawCoords.map(([lng, lat]: [number, number]) => [lng, lat]);
      } else if (layer instanceof L.Circle) {
        coordinates = this.circleToPolygon(layer);
      }

      if (coordinates.length === 0) {
        return;
      }

      const feature = ensureLayerFeature(layer);
      const rawLabel = feature && feature.properties && feature.properties.label
        ? String(feature.properties.label).trim()
        : '';

      if (!rawLabel) {
        return;
      }

      polygons.push({
        label: rawLabel,
        coordinates,
      });
    });

    return polygons;
  }

  /**
   * Extracts unlabeled polygon geometries from editable layers.
   * @param editableLayers Leaflet feature group.
   * @param ensureLayerFeature Callback to get or create a feature object.
   * @returns Unlabeled polygon coordinate arrays.
   */
  extractUnlabeledPolygonsForAnalysis(
    editableLayers: any,
    ensureLayerFeature: (layer: any) => any
  ): [number, number][][] {
    const polygons: [number, number][][] = [];

    if (!editableLayers) {
      return polygons;
    }

    editableLayers.eachLayer((layer: any) => {
      let coordinates: [number, number][] = [];

      if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
        const geoJson = layer.toGeoJSON();
        const rawCoords = geoJson && geoJson.geometry && geoJson.geometry.coordinates && geoJson.geometry.coordinates[0]
          ? geoJson.geometry.coordinates[0]
          : [];
        coordinates = rawCoords.map(([lng, lat]: [number, number]) => [lng, lat]);
      } else if (layer instanceof L.Circle) {
        coordinates = this.circleToPolygon(layer);
      }

      if (coordinates.length === 0) {
        return;
      }

      const feature = ensureLayerFeature(layer);
      const rawLabel = feature && feature.properties && feature.properties.label
        ? String(feature.properties.label).trim()
        : '';

      if (rawLabel) {
        return;
      }

      polygons.push(coordinates);
    });

    return polygons;
  }
}
