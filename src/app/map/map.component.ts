import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import Overlay from 'ol/Overlay';
import { getCenter } from 'ol/extent';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Select from 'ol/interaction/Select';
import { click as clickCondition } from 'ol/events/condition';
import { Style, Stroke, Fill } from 'ol/style';

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent implements AfterViewInit {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('popup', { static: false }) popupEl!: ElementRef<HTMLDivElement>;

  private map!: Map;
  private layers: { [key: string]: VectorLayer<any> | TileLayer<any> } = {};
  private vectorSource!: VectorSource;
  private popupOverlay!: Overlay;
  private originalExtent: any = null;

  private draw!: Draw;
  private modify!: Modify;
  private selectDelete!: Select;

  ngAfterViewInit(): void {
    this.map = new Map({
      target: this.mapContainer.nativeElement,
      layers: [],
      view: new View({ center: fromLonLat([77.2090, 28.6139]), zoom: 4 })
    });

    this.addALayer('baseOSM', new TileLayer({ source: new OSM() }));


    const geoJsonLayer = new VectorLayer({
      
      source: new VectorSource({
        url: 'tanjavurrabi3.geojson',
        format: new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })
      }),

      style: new Style({
        stroke: new Stroke({ color: '#1e88e5', width: 2 }),
        fill: new Fill({ color: 'rgba(30,136,229,0.12)' })
      }
    )
    });

    this.addALayer('geojson', geoJsonLayer);

    this.vectorSource = geoJsonLayer.getSource()!;

    this.vectorSource.once('featuresloadend', () => {
      const feats = this.vectorSource.getFeatures();
      
      if (feats.length > 0) {
        const extent = this.vectorSource.getExtent();
        this.originalExtent = extent;
        this.map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 16, duration: 600 });
      }

    });

    this.popupOverlay = new Overlay({ element: this.popupEl.nativeElement, autoPan: true });
    
    this.map.addOverlay(this.popupOverlay);

    this.buildInteractions();
    this.installToolbarHandlers();

    const closer = this.popupEl.nativeElement.querySelector('#popup-closer') as HTMLAnchorElement;
    const content = this.popupEl.nativeElement.querySelector('#popup-content') as HTMLDivElement;
    closer.onclick = (ev) => { ev.preventDefault(); this.hidePopup(); return false; };

    this.map.on('singleclick', (evt) => {
      
      if (this.draw.getActive() || this.modify.getActive() || this.selectDelete.getActive()) return;
      
      const feature: any = this.map.forEachFeatureAtPixel(evt.pixel, f => f);
      
      if (!feature) { this.hidePopup(); return; }

      const props = { ...feature.getProperties() };
      delete props.geometry;

      let html = '<table style="border-collapse: collapse; width: 100%;">';
      
      for (const k in props) {
        html += `<tr><td style="border:1px solid #ddd;padding:6px;font-weight:600;">${k}</td><td style="border:1px solid #ddd;padding:6px;">${props[k]}</td></tr>`;
      }
      
      html += '</table>';
      content.innerHTML = html;

      const geom = feature.getGeometry();
      const coord = geom ? getCenter(geom.getExtent()) : evt.coordinate;
      
      this.popupEl.nativeElement.style.display = 'block';
      this.popupOverlay.setPosition(coord);

      this.map.getView().fit(geom.getExtent(), { padding: [50, 50, 50, 50], maxZoom: 16, duration: 500 });
    });
  }

  addALayer(name: string, layer: VectorLayer<any> | TileLayer<any>) {
    
    if (this.layers[name]) {
      console.warn(`Layer "${name}" already exists.`);
      return;
    }

    this.layers[name] = layer;
    this.map.addLayer(layer);
  }

  removeLayer(name: string) {
    const layer = this.layers[name];
    
    if (!layer) {
      console.warn(`Layer "${name}" not found.`);
      return;
    }

    this.map.removeLayer(layer);
    delete this.layers[name];
  
  }

  private buildInteractions() {
    
    this.draw = new Draw({ source: this.vectorSource, type: 'Polygon' });
    this.modify = new Modify({ source: this.vectorSource });
    this.selectDelete = new Select({ condition: clickCondition });

    this.draw.setActive(false);
    this.modify.setActive(false);
    this.selectDelete.setActive(false);

    this.map.addInteraction(this.draw);
    this.map.addInteraction(this.modify);
    this.map.addInteraction(this.selectDelete);

    this.selectDelete.on('select', e => {
      e.selected.forEach(f => this.vectorSource.removeFeature(f));
      this.selectDelete.getFeatures().clear();
    });
  }

  private installToolbarHandlers() {
    const get = (id: string) => document.getElementById(id) as HTMLButtonElement;
    const btnReset = get('btnReset');
    const btnAdd = get('btnAdd');
    const btnModify = get('btnModify');
    const btnDelete = get('btnDelete');
    const btnExit = get('btnExit');

    const setActiveButton = (btn?: HTMLButtonElement) => {
      [btnReset, btnAdd, btnModify, btnDelete, btnExit].forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
    };

    btnReset.onclick = () => { this.resetView(); setActiveButton(btnReset); setTimeout(() => setActiveButton(), 300); };
    btnAdd.onclick = () => { this.deactivateAll(); this.draw.setActive(true); setActiveButton(btnAdd); };
    btnModify.onclick = () => { this.deactivateAll(); this.modify.setActive(true); setActiveButton(btnModify); };
    btnDelete.onclick = () => { this.deactivateAll(); this.selectDelete.setActive(true); setActiveButton(btnDelete); };
    btnExit.onclick = () => { this.deactivateAll(); setActiveButton(btnExit); setTimeout(() => setActiveButton(), 200); };
  }

  private deactivateAll() {
    this.draw.setActive(false);
    this.modify.setActive(false);
    this.selectDelete.setActive(false);
  }

  resetView() {
    if (this.originalExtent) {
      this.map.getView().fit(this.originalExtent, { padding: [50, 50, 50, 50], maxZoom: 16, duration: 500 });
    }
  }

  private hidePopup() {
    this.popupOverlay.setPosition(undefined);
    this.popupEl.nativeElement.style.display = 'none';
  }
}
