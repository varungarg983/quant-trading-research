const https = require('https');

const lat = -37.017832308895976;
const lng = 174.89049596127705;

function get(url) {
  return new Promise((resolve, reject) => {
    let raw = '';
    const req = https.get(url, res => {
      res.setEncoding('utf8');
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('JSON parse failed. Raw length: ' + raw.length + ' chars')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function km(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dL = (lat2-lat1)*Math.PI/180, dN = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dL/2)*Math.sin(dL/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dN/2)*Math.sin(dN/2);
  return (R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(2);
}

function namesMatch(a, b) {
  const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean(a).includes(clean(b)) || clean(b).includes(clean(a));
}

async function run() {
  console.log('Fetching data...\n');

  const delta = 0.05;
  const resourceId = '4b292323-9fcc-41f8-814b-3c7b19cf14b3';
  const sql = `SELECT "Org_Name","Org_Type","Latitude","Longitude" FROM "${resourceId}" WHERE "Latitude" > ${lat-delta} AND "Latitude" < ${lat+delta} AND "Longitude" > ${lng-delta} AND "Longitude" < ${lng+delta} AND "Status" = 'Open' LIMIT 20`;

  const schoolsUrl = 'https://catalogue.data.govt.nz/api/action/datastore_search_sql?sql=' + encodeURIComponent(sql);

  // No returnGeometry=false — this server needs geometry included to return features
  const zoneUrl = 'https://gis.ecan.govt.nz/arcgis/rest/services/Public/Education/MapServer/3/query'
    + '?geometry=' + encodeURIComponent(JSON.stringify({x: lng, y: lat}))
    + '&geometryType=esriGeometryPoint&inSR=4326'
    + '&spatialRel=esriSpatialRelIntersects'
    + '&outFields=*&f=json';

  console.log('Calling zone API...');
  const zoneData = await get(zoneUrl);
  console.log('Zone features count:', (zoneData.features || []).length);

  if (zoneData.features && zoneData.features[0]) {
    console.log('Attribute keys:', Object.keys(zoneData.features[0].attributes).join(', '));
    console.log('First zone school:', zoneData.features[0].attributes);
  }

  const inZoneNames = (zoneData.features || []).map(f => f.attributes.School_name || f.attributes.NAME || '');

  console.log('In-zone schools:', inZoneNames);
  console.log('\nFetching nearby schools...');

  const schoolData = await get(schoolsUrl);
  console.log('\nNEARBY SCHOOLS:');
  console.log('─'.repeat(75));

  schoolData.result.records
    .map(s => ({
      name: s.Org_Name,
      type: s.Org_Type,
      dist: km(lat, lng, +s.Latitude, +s.Longitude),
      zone: inZoneNames.some(z => namesMatch(z, s.Org_Name)) ? '✓ YES' : '─ no'
    }))
    .sort((a, b) => a.dist - b.dist)
    .forEach(s => {
      console.log(`${s.dist}km`.padEnd(10), s.zone.padEnd(8), s.name.padEnd(40), s.type);
    });
}

run().catch(console.error);