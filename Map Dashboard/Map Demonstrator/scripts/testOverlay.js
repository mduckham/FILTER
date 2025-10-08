const turf = require('@turf/turf');
const fs = require('fs');
const path = require('path');

// Test spatial intersection for Montague precinct with 2011 DZN jobs
async function testMontague2011() {
  console.log('=== Testing Montague Precinct (2011) ===\n');
  
  const precinctPath = path.join(__dirname, '../public/data/fb-precincts-official-boundary.geojson');
  const jobsPath = path.join(__dirname, '../public/data/Number_of_Jobs_DZN_11.geojson');
  
  const precincts = JSON.parse(fs.readFileSync(precinctPath, 'utf8'));
  const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
  
  const montague = precincts.features.find(f => f.properties?.name === 'Montague');
  if (!montague) {
    console.error('Montague precinct not found!');
    return;
  }
  
  console.log('Montague precinct found');
  console.log('Type:', montague.geometry.type);
  
  const precinctPoly = turf.feature(montague.geometry);
  const precinctArea = turf.area(precinctPoly);
  console.log('Precinct area (m²):', precinctArea.toFixed(2));
  console.log('\nTesting intersections with DZN polygons...\n');
  
  const intersections = [];
  let processed = 0;
  let hasIntersection = 0;
  
  for (const dzn of jobs.features) {
    processed++;
    try {
      const inter = turf.intersect(precinctPoly, turf.feature(dzn.geometry));
      if (inter) {
        const interArea = turf.area(inter);
        if (interArea > 0) {
          hasIntersection++;
          const code = dzn.properties?.DZN_CODE11 || 'unknown';
          const value = parseFloat(dzn.properties?.TotJob_11 || 0);
          const areaPct = (interArea / precinctArea) * 100;
          
          intersections.push({
            code,
            value,
            area: interArea,
            areaPct
          });
        }
      }
    } catch (e) {
      // Skip invalid geometries
    }
  }
  
  console.log(`Processed ${processed} DZN polygons`);
  console.log(`Found ${hasIntersection} intersections\n`);
  
  intersections.sort((a, b) => b.areaPct - a.areaPct);
  
  console.log('Intersected DZN areas:');
  console.log('Code\t\tJobs\tArea%');
  console.log('─────────────────────────────────');
  intersections.forEach(i => {
    console.log(`${i.code}\t${i.value}\t${i.areaPct.toFixed(1)}%`);
  });
  
  const totalPct = intersections.reduce((sum, i) => sum + i.areaPct, 0);
  console.log(`\nTotal coverage: ${totalPct.toFixed(1)}%`);
}

testMontague2011().catch(console.error);
