// ---------------- CONFIG ----------------
const GEOSERVER_BASE = "http://localhost:8080/geoserver";
const WORKSPACE = "sigap";
const LAYER_KWS = `${WORKSPACE}:KWSHutan_Overlap`;
const LAYER_PIPPIB = `${WORKSPACE}:PIPPIB_AR_250K_2025_1`;

// ---------------- INIT MAP ----------------
const map = L.map("map", {
  center: [-2.5, 118],
  zoom: 5,
  zoomControl: false,
});

// Basemap
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
});
const esri = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "© Esri Satellite" }
);
osm.addTo(map);

// ---------------- WMS LAYERS ----------------
const layerKws = L.tileLayer.wms(`${GEOSERVER_BASE}/wms`, {
  layers: LAYER_KWS,
  format: "image/png",
  transparent: true,
  attribution: "Kawasan Hutan - GeoServer",
});

const layerPippib = L.tileLayer.wms(`${GEOSERVER_BASE}/wms`, {
  layers: LAYER_PIPPIB,
  format: "image/png",
  transparent: true,
  attribution: "PIPPIB 2025 - GeoServer",
});

// Layer upload shapefile (overlay)
let uploadedLayer = null;

// ---------------- BASEMAP CONTROL ----------------
const baseMaps = {
  "OpenStreetMap": osm,
  "Esri Satellite": esri,
};

const overlayMaps = {
  "Kawasan Hutan": layerKws,
  "PIPPIB 2025": layerPippib,
};

L.control.layers(baseMaps, overlayMaps, { collapsed: false, position: "topright" }).addTo(map);

// ---------------- LEGEND DINAMIS ----------------
const legendControl = L.control({ position: "bottomright" });

function getLegendHTML(layerName) {
  if (layerName === "Kawasan Hutan") {
    return `
      <h4>Keterangan Kawasan Hutan</h4>
      <div><i style="background:#8000FF"></i>Kawasan Konservasi</div>
      <div><i style="background:#00FF00"></i>Hutan Lindung</div>
      <div><i style="background:#FFFF00"></i>Hutan Produksi Tetap</div>
      <div><i style="background:#99FF00"></i>Hutan Produksi Terbatas</div>
      <div><i style="background:#FF00FF"></i>HPK (Konversi)</div>
      <div><i style="background:#FFB6C1"></i>Area Penggunaan Lain</div>
      <div><i style="background:#00FFFF"></i>Tubuh Air</div>
    `;
  } else if (layerName === "PIPPIB 2025") {
    return `
      <h4>Keterangan PIPPIB 2025</h4>
      <div><i style="background:#FF0000"></i>PIPPIB</div>
      <div><i style="background:#A9A9A9"></i>Non-PIPPIB</div>
    `;
  }
  return "";
}

legendControl.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = "";
  return div;
};
legendControl.addTo(map);

// Update legend ketika layer diaktifkan/dinonaktifkan
map.on("overlayadd", function (e) {
  const legendDiv = document.querySelector(".legend");
  legendDiv.innerHTML = getLegendHTML(e.name);
});
map.on("overlayremove", function () {
  const legendDiv = document.querySelector(".legend");
  legendDiv.innerHTML = "";
});

// ---------------- UPLOAD SHAPEFILE ----------------
document.getElementById("shapefile").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const zip = e.target.result;
    shp(zip).then(function (geojson) {
      if (uploadedLayer) {
        map.removeLayer(uploadedLayer);
      }
      uploadedLayer = L.geoJSON(geojson, {
        style: { color: "red", weight: 2, fillOpacity: 0.2 },
      }).addTo(map);
      map.fitBounds(uploadedLayer.getBounds());
    });
  };
  reader.readAsArrayBuffer(file);
});

// ---------------- DONUT CHART ----------------
const ctx = document.getElementById("chartLuasan").getContext("2d");
new Chart(ctx, {
  type: "doughnut",
  data: {
    labels: ["Overlap Kawasan Hutan", "Area Lain"],
    datasets: [
      {
        data: [35, 65],
        backgroundColor: ["#e74c3c", "#bdc3c7"],
        borderWidth: 0,
      },
    ],
  },
  options: {
    cutout: "70%",
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
  },
});
