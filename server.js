// server.js — Express server untuk upload shapefile & server-side overlap
// RUN: npm install express multer unzipper pg uuid cors
// Ensure ogr2ogr is installed and PostgreSQL + PostGIS running.

const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// === Postgres/PostGIS config - sesuaikan ===
const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'sigap2025',
  password: process.env.PGPASSWORD || 'postgres',
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.'))); // serve index.html, css, js jika buka via server

const upload = multer({ dest: 'uploads/' });

// helper to run ogr2ogr
async function importShpToPostgres(shpPath, tableName, epsg = 4326) {
  return new Promise((resolve, reject) => {
    // Connection string for ogr2ogr PG:
    const pgConn = `PG:host=${pool.options.host} user=${pool.options.user} dbname=${pool.options.database} password=${pool.options.password}`;
    const args = [
      '-f', 'PostgreSQL',
      pgConn,
      shpPath,
      '-nln', tableName,
      '-lco', 'GEOMETRY_NAME=geom',
      '-lco', 'FID=id',
      '-nlt', 'PROMOTE_TO_MULTI',
      '-a_srs', `EPSG:${epsg}`,
      '-overwrite'
    ];
    const ogr = spawn('ogr2ogr', args);

    ogr.stdout.on('data', (d) => console.log('[ogr2ogr]', d.toString()));
    ogr.stderr.on('data', (d) => console.error('[ogr2ogr][ERR]', d.toString()));
    ogr.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ogr2ogr exited with code ${code}`));
    });
  });
}

// POST /upload - menerima zip shapefile
app.post('/upload', upload.single('shpzip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: 'No file uploaded' });
  const tmpZip = req.file.path;
  const workDir = path.join('uploads', uuidv4());
  fs.mkdirSync(workDir, { recursive: true });

  try {
    // extract
    await fs.createReadStream(tmpZip).pipe(unzipper.Extract({ path: workDir })).promise();

    // find .shp
    const shpFile = fs.readdirSync(workDir).find(f => f.toLowerCase().endsWith('.shp'));
    if (!shpFile) throw new Error('SHP file not found inside ZIP.');

    const shpPath = path.join(workDir, shpFile);
    const tableName = path.parse(shpFile).name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // import to PostGIS
    await importShpToPostgres(shpPath, tableName, 4326);

    // cleanup
    try { fs.unlinkSync(tmpZip); } catch (e) {}
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) {}

    console.log(`Imported ${shpFile} -> ${tableName}`);
    res.json({ ok: true, message: `Imported to table ${tableName}` });
  } catch (err) {
    console.error('Upload/import error:', err);
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

// helper table name validation
const isValidTableName = (s) => typeof s === 'string' && /^[a-z0-9_]+$/.test(s);

// GET /overlap?bbox=minx,miny,maxx,maxy&layer1=table1&layer2=table2
app.get('/overlap', async (req, res) => {
  try {
    const bbox = req.query.bbox;
    let layer1 = (req.query.layer1 || 'pippib_ar_250k_2025_1').toLowerCase().replace(/[^a-z0-9_]/g,'_');
    let layer2 = (req.query.layer2 || 'kwshutan_overlap').toLowerCase().replace(/[^a-z0-9_]/g,'_');

    if (!isValidTableName(layer1) || !isValidTableName(layer2)) {
      return res.status(400).json({ ok: false, message: 'Invalid table names' });
    }

    let bboxFilter = '';
    if (bbox) {
      const parts = bbox.split(',').map(p => parseFloat(p));
      if (parts.length === 4 && parts.every(p => !isNaN(p))) {
        const [minx, miny, maxx, maxy] = parts;
        bboxFilter = `AND ST_Intersects(a.geom, ST_MakeEnvelope(${minx}, ${miny}, ${maxx}, ${maxy}, 4326))`;
      }
    }

    const query = `
      SELECT 
        a.id AS id1,
        b.id AS id2,
        ST_Area(ST_Intersection(a.geom, b.geom)::geography) AS luas_m2,
        ST_AsGeoJSON(ST_Intersection(a.geom, b.geom)) AS geom_json
      FROM ${layer1} a
      JOIN ${layer2} b
      ON ST_Intersects(a.geom, b.geom)
      ${bboxFilter};
    `;

    const { rows } = await pool.query(query);
    const features = rows.map(r => {
      let geom = null;
      try { geom = JSON.parse(r.geom_json); } catch (e) {}
      return {
        type: 'Feature',
        geometry: geom,
        properties: {
          id1: r.id1,
          id2: r.id2,
          luas_overlap_m2: parseFloat(r.luas_m2 || 0)
        }
      };
    });

    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    console.error('Error /overlap:', err);
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

// start server
app.listen(PORT, () => {
  console.log(`Server berjalan pada http://localhost:${PORT}`);
});
