import { Injectable } from '@angular/core';
import * as L from 'leaflet';

@Injectable({
  providedIn: 'root'
})
export class MarkerFactoryService {
  private readonly defaultIconUrl = 'https://upload.wikimedia.org/wikipedia/commons/8/88/Map_marker.svg';

  /**
   * Creates a Leaflet icon from the provided URL.
   * @param iconUrl Icon URL to use.
   * @returns Leaflet icon instance.
   */
  createIcon(iconUrl: string): L.Icon {
    const resolvedIconUrl = iconUrl || this.defaultIconUrl;

    return L.icon({
      iconUrl: resolvedIconUrl,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  }

  /**
   * Resolves an icon key or URL to a final image URL.
   * @param icon Icon key or absolute URL.
   * @param iconUrls Icon dictionary.
   * @returns Resolved icon URL.
   */
  resolveIconSource(icon: string, iconUrls: { [key: string]: string }): string {
    if (icon && (icon.startsWith('http://') || icon.startsWith('https://'))) {
      return icon;
    }

    return iconUrls[icon] || iconUrls.default || this.defaultIconUrl;
  }

  /**
   * Creates a geometry layer and adds it to the target group.
   * @param element Feature payload.
   * @param iconValue Icon key or URL.
   * @param iconUrls Icon dictionary.
   * @param targetLayerGroup Leaflet layer group/cluster.
   * @param onMoreInfo Callback fired from popup action.
   */
  createAndAddLayer(
    element: any,
    iconValue: string,
    iconUrls: { [key: string]: string },
    targetLayerGroup: any,
    onMoreInfo: (element: any) => void
  ): void {
    const layer = this.createLayer(element, iconValue, iconUrls, onMoreInfo);

    if (layer && targetLayerGroup && typeof targetLayerGroup.addLayer === 'function') {
      targetLayerGroup.addLayer(layer);
    }
  }

  /**
   * Creates a Leaflet layer from element geometry.
   * @param element Feature payload.
   * @param iconValue Icon key or URL.
   * @param iconUrls Icon dictionary.
   * @param onMoreInfo Callback fired from popup action.
   * @returns Leaflet layer or null when unsupported.
   */
  private createLayer(
    element: any,
    iconValue: string,
    iconUrls: { [key: string]: string },
    onMoreInfo: (element: any) => void
  ): any {
    const location = element && element.properties && element.properties.location ? element.properties.location : null;

    if (!location || !location.type) {
      return null;
    }

    if (location.type === 'Point') {
      const rawCoordinates = location.value && location.value.coordinates
        ? location.value.coordinates
        : location.coordinates;

      if (!rawCoordinates || rawCoordinates.length < 2) {
        return null;
      }

      const marker = L.marker(
        [rawCoordinates[1], rawCoordinates[0]],
        { icon: this.createIcon(this.resolveIconSource(iconValue, iconUrls)) }
      );

      this.bindPopup(marker, element, onMoreInfo);
      return marker;
    }

    if (location.type === 'Polygon') {
      const fixedArray = [];
      location.coordinates.forEach((outerArray: any[]) =>
        outerArray.forEach((innerArrays: number[]) => {
          fixedArray.push([innerArrays[1], innerArrays[0]]);
        })
      );

      const polygon = L.polygon(fixedArray);
      this.bindPopup(polygon, element, onMoreInfo);
      return polygon;
    }

    if (location.type === 'LineString') {
      const fixedCoordinates = [];
      location.coordinates.forEach((coord: number[]) => {
        fixedCoordinates.push([coord[1], coord[0]]);
      });

      const polyline = L.polyline(fixedCoordinates, {
        color: '#FF5733',
        weight: 4,
        opacity: 0.7
      });

      this.bindPopup(polyline, element, onMoreInfo);
      return polyline;
    }

    return null;
  }

  /**
   * Attaches popup content and the More info action.
   * @param layer Leaflet layer.
   * @param element Feature payload.
   * @param onMoreInfo Callback fired from popup action.
   */
  private bindPopup(layer: any, element: any, onMoreInfo: (element: any) => void): void {
    layer.bindPopup(
      `<b>${element.properties.type}</b><button id=${element.id}>More info</button>`
    );

    layer.addEventListener('click', () => {
      const button = document.getElementById(element?.id);
      if (layer.isPopupOpen() && button) {
        button.onclick = () => onMoreInfo(element);
      }
    });

    layer.getPopup().addEventListener('remove', () => {
      const button = document.getElementById(element?.id);
      if (button) {
        button.onclick = null;
      }
    });
  }
}
