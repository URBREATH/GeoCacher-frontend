import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-draw';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: any;
  private editableLayers: any;
  private osm: any;

  constructor() {
    // Initialize the base tile layer
    this.osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        "&copy; <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
    });
  }

  /**
   * Initialize a map in the given container with the specified center and custom draw options
   * @param containerId The HTML element ID where the map should be rendered
   * @param center The center coordinates [lat, lng]
   * @param zoom The initial zoom level
   * @param drawOptions Custom draw control options (optional)
   * @returns The initialized map instance
   */
  initializeMap(containerId: string, center: [number, number], zoom: number = 13, drawOptions?: any): any {
    // Clear any existing map
    this.clearMap();

    this.map = L.map(containerId, {
      center: center,
      zoom: zoom,
      layers: [this.osm],
    });

    // Initialize editable layers
    this.editableLayers = new L.FeatureGroup();
    this.map.addLayer(this.editableLayers);

    // Add draw controls with custom options or default
    this.addDrawControls(drawOptions);

    return this.map;
  }

  /**
   * Add drawing controls to the map
   * @param customOptions Custom draw control options
   */
  private addDrawControls(customOptions?: any): void {
    const defaultOptions = {
      draw: {
        polygon: {
          shapeOptions: {
            color: "#3388ff",
          },
          showArea: true,
        },
        polyline: false,
        circle: {
          shapeOptions: {
            color: "#3388ff",
          },
        },
        rectangle: {
          shapeOptions: {
            color: "#3388ff",
          },
        },
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: this.editableLayers,
        remove: true,
      },
    };

    const drawOptions = customOptions ? { ...defaultOptions, ...customOptions } : defaultOptions;

    const drawControl = new L.Control.Draw(drawOptions);
    this.map.addControl(drawControl);

    // Handle draw events
    this.map.on("draw:created", (e: any) => {
      const layer = e.layer;
      // Prompt user for an optional label for the new shape
      try {
        const label = window.prompt('Enter label for this shape (optional):', '');
        if (label !== null && label !== '') {
          // Attach label to layer's feature properties so it persists in GeoJSON
          const feat = layer.toGeoJSON();
          feat.properties = feat.properties || {};
          feat.properties.label = label;
          // store feature so toGeoJSON includes properties later
          (layer as any).feature = feat;
          // show a tooltip with the label
          try {
            layer.bindTooltip(label, { permanent: true, direction: 'center', className: 'editable-label' }).openTooltip();
          } catch (err) {
            // non-fatal
          }
        }
      } catch (err) {
        // ignore prompt failures
      }

      // add click handler to edit label later
      layer.on('click', () => {
        try {
          const current = ((layer as any).feature && (layer as any).feature.properties && (layer as any).feature.properties.label) || '';
          const newLabel = window.prompt('Edit label for this shape (leave empty to remove):', current || '');
          if (newLabel === null) return; // cancelled
          const feat = (layer as any).feature || layer.toGeoJSON();
          feat.properties = feat.properties || {};
          if (newLabel === '') {
            delete feat.properties.label;
            if ((layer as any).getTooltip && (layer as any).getTooltip()) {
              try { layer.unbindTooltip(); } catch(e) {}
            }
          } else {
            feat.properties.label = newLabel;
            try {
              if ((layer as any).getTooltip && (layer as any).getTooltip()) {
                (layer as any).getTooltip().setContent(newLabel);
              } else {
                layer.bindTooltip(newLabel, { permanent: true, direction: 'center', className: 'editable-label' }).openTooltip();
              }
            } catch (err) {}
          }
          (layer as any).feature = feat;
        } catch (err) {}
      });

      this.editableLayers.addLayer(layer);
    });

    // When shapes are edited, re-attach labels from properties (if any)
    // and prompt to add a label if missing after an edit
    this.map.on('draw:edited', (e: any) => {
      const layers = e.layers;
      layers.eachLayer((layer: any) => {
        try {
          const feat = (layer as any).feature || layer.toGeoJSON();
          feat.properties = feat.properties || {};
          let label = feat.properties.label;

          if (!label) {
            // Ask user to add a label for the edited shape (optional)
            try {
              const userLabel = window.prompt('Add a label for the edited shape (optional):', '');
              if (userLabel !== null && userLabel !== '') {
                feat.properties.label = userLabel;
                label = userLabel;
              }
            } catch (err) {
              // ignore prompt failures
            }
          }

          if (label) {
            try {
              if ((layer as any).getTooltip && (layer as any).getTooltip()) {
                (layer as any).getTooltip().setContent(label);
              } else {
                layer.bindTooltip(label, { permanent: true, direction: 'center', className: 'editable-label' }).openTooltip();
              }
            } catch (err) {}
          } else {
            try { if ((layer as any).getTooltip && (layer as any).getTooltip()) layer.unbindTooltip(); } catch(e) {}
          }
          (layer as any).feature = feat;
        } catch (err) {}
      });
    });
  }

  /**
   * Clear the map and remove all layers
   */
  clearMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  /**
   * Get the current map instance
   */
  getMap(): any {
    return this.map;
  }

  /**
   * Get the editable layers group
   */
  getEditableLayers(): any {
    return this.editableLayers;
  }

  /**
   * Add a layer to the editable layers group
   * @param layer The layer to add
   */
  addEditableLayer(layer: any): void {
    if (this.editableLayers) {
      this.editableLayers.addLayer(layer);
    }
  }

  /**
   * Remove all layers from the editable layers group
   */
  clearEditableLayers(): void {
    if (this.editableLayers) {
      this.editableLayers.clearLayers();
    }
  }

  /**
   * Get all features from editable layers as GeoJSON
   * @returns Array of GeoJSON features
   */
  getEditableFeatures(): any[] {
    const features: any[] = [];
    if (this.editableLayers) {
      this.editableLayers.eachLayer((layer: any) => {
        features.push(layer.toGeoJSON());
      });
    }
    return features;
  }

  /**
   * Convert circle to polygon for analysis
   * @param circle The circle layer
   * @param numPoints Number of points for the polygon approximation
   * @returns Array of coordinates
   */
  circleToPolygon(circle: any, numPoints: number = 32): [number, number][] {
    const center = circle.getLatLng();
    const radius = circle.getRadius();
    const coords: [number, number][] = [];

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const lat = center.lat + (radius / 111320) * Math.cos(angle);
      const lng = center.lng + (radius / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
      coords.push([lng, lat]);
    }

    return coords;
  }

  /**
   * Extract polygons from editable layers for analysis submission
   * @returns Array of polygon coordinates
   */
  extractPolygonsForAnalysis(): any[] {
    const polygons: any[] = [];

    if (this.editableLayers) {
      this.editableLayers.eachLayer((layer: any) => {
        if (layer instanceof L.Polygon) {
          const latlngs = layer.getLatLngs();
          const coords = Array.isArray(latlngs[0]) ? latlngs[0].map((latlng: any) => [latlng.lng, latlng.lat]) : [];
          polygons.push({
            type: 'Polygon',
            coordinates: [coords]
          });
        } else if (layer instanceof L.Circle) {
          const coords = this.circleToPolygon(layer);
          polygons.push({
            type: 'Polygon',
            coordinates: [coords]
          });
        }
      });
    }

    return polygons;
  }

  /**
   * Set the map view to the specified center and zoom
   * @param center The center coordinates [lat, lng]
   * @param zoom The zoom level
   */
  setView(center: [number, number], zoom?: number): void {
    if (this.map) {
      this.map.setView(center, zoom);
    }
  }

  /**
   * Fit the map to show all editable layers
   */
  fitBounds(): void {
    if (this.map && this.editableLayers && this.editableLayers.getLayers().length > 0) {
      this.map.fitBounds(this.editableLayers.getBounds());
    }
  }
}