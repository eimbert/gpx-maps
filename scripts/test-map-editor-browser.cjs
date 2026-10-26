// Isolated browser regression: backend writes and routing calls are intercepted.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/editor-qa');
fs.mkdirSync(output, { recursive: true });
const points = Array.from({ length: 101 }, (_, i) => {
  const angle = i / 100 * Math.PI * 2;
  return { lat: 41.477 + .009 * Math.sin(angle), lon: 2.225 + .014 * Math.cos(angle),
    ele: 130 + Math.round(60 * Math.sin(angle * 2)), time: new Date(Date.UTC(2026,9,16,8,0,i*20)).toISOString() };
});
const gpx = `<gpx version="1.1" creator="Editor regression" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><metadata><name>Metadata retained</name></metadata><wpt lat="41.477" lon="2.225"><name>Fuente</name></wpt><trk><name>Circular de la Serralada de Marina</name><desc>Keep this description</desc><trkseg>${points.map(p => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele><time>${p.time}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>123</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('')}</trkseg></trk></gpx>`;
const seed = { viewOnly: true, trackId: 801, routeXml: gpx, tracks:[{ trkpts: points }], names:['Circular de la Serralada de Marina'], colors:['#3764d6'], mostrarPerfil:true, activarMusica:false, rmstops:true };
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(path.relative(root,file).startsWith('..')) {res.writeHead(403).end();return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()) file=path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
async function lineLocations(page) {
  return page.locator('.track-svg-overlay path').first().evaluate(svg=>{
    const points=[...svg.getAttribute('d').matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(m=>({x:+m[1],y:+m[2]}));
    return points.filter(p=>p.x>20&&p.y>180&&p.x<innerWidth-70&&p.y<innerHeight-200&&document.elementFromPoint(p.x,p.y)?.classList.contains('maplibregl-canvas'));
  });
}
async function assertUiFits(page) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  const save=page.getByRole('button',{name:'Guardar',exact:true});
  assert.ok(await save.evaluate(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),'Save is visible and uncovered');
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    // Exercise the XML serializer with separate tracks/segments and GPX extensions.
    const utilityPage=await browser.newPage();
    const ts=require('typescript');
    const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/app/utils/editable-gpx.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const checks=await utilityPage.evaluate(({code,xml})=>{
      const exports={};new Function('exports',code)(exports);
      const input=xml.replace('</trkseg>', '<extensions><note xmlns="urn:test">segment metadata</note></extensions></trkseg>')
        .replace('</gpx>','<trk><name>Second track</name><trkseg><trkpt lat="42" lon="3"><ele>80</ele></trkpt><trkpt lat="42.01" lon="3"><ele>85</ele></trkpt></trkseg></trk></gpx>');
      const points=exports.readEditableGpx(input);
      const edited=[...points].reverse().map(p=>({...p,time:''}));
      const output=exports.writeEditableGpx(input,edited);
      const doc=new DOMParser().parseFromString(output,'application/xml');
      return {points:doc.querySelectorAll('trkpt').length,tracks:doc.querySelectorAll('trk').length,
        times:doc.querySelectorAll('time').length,first:doc.querySelector('trk > name').textContent,
        waypoint:doc.querySelector('wpt > name').textContent,segmentMetadata:output.includes('segment metadata'),
        telemetry:output.includes('gpxtpx:hr'),invalid:!!doc.querySelector('parsererror')};
    },{code,xml:gpx});
    assert.deepEqual(checks,{points:103,tracks:2,times:0,first:'Second track',waypoint:'Fuente',segmentMetadata:true,telemetry:true,invalid:false});
    await utilityPage.close();
    console.log('PASS GPX: track/segment structure, metadata, waypoints, telemetry and removal of reversed timestamps');
    for(const width of [1440,390]) {
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',acceptDownloads:true});
      await context.addInitScript(payload=>{
        const token='mock.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.mock';
        localStorage.setItem('gpxAuthSession',JSON.stringify({token,id:901,nickname:'prueba',verified:true,exitCode:0}));
        sessionStorage.setItem('gpxViewerPayload',JSON.stringify(payload));
      },seed);
      let saved=[],routeCalls=0,failSave=true,failRoute=false;
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin===base) return route.continue();
        if(/tile\.openstreetmap|ign\.es|opentopomap|arcgisonline|fonts\.(googleapis|gstatic)/.test(url.hostname)) return route.continue();
        if(url.pathname.endsWith('/plan-folders/updateTrack')) {
          saved.push(route.request().postDataJSON());
          return route.fulfill({status:failSave?500:200,json:failSave?{}:{id:801,name:seed.names[0],routeXml:saved.at(-1).routeXml}});
        }
        if(url.pathname.endsWith('/routing/edit-section')) {
          routeCalls++;
          if(failRoute) return route.fulfill({status:503,json:{errorCode:'EDIT_ROUTING_UNAVAILABLE'}});
          const p=route.request().postDataJSON().coordinates;
          return route.fulfill({json:{coordinates:[p[0],[p[0][0]+.0001,p[0][1]+.0001,150],p.at(-1)]}});
        }
        if(url.pathname.endsWith('/auth/me')) return route.fulfill({json:{userId:901,nickname:'prueba',plan:'PREMIUM'}});
        return route.fulfill({json:{}});
      });
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.on('dialog',dialog=>dialog.accept());
      try {
        await page.goto(base+'/map?from=plan&folderId=901');
        await page.getByRole('button',{name:'Editar recorrido',exact:true}).click();
        await page.locator('.editor-handle').first().waitFor();
        await page.getByRole('button',{name:'Encuadrar recorrido',exact:true}).click();
        await page.waitForTimeout(800);
        await assertUiFits(page);
        if(width<600) await page.getByRole('button',{name:'Opciones del mapa',exact:true}).click();
        await page.screenshot({path:path.join(output,`editor-${width}.png`)});
        if(await page.getByRole('button',{name:'Cerrar opciones',exact:true}).isVisible()) await page.getByRole('button',{name:'Cerrar opciones',exact:true}).click();
        // Drag an actual handle; source timestamps must not make the point disappear.
        const handleIndex=await page.locator('.editor-handle').evaluateAll(elements=>elements.findIndex(el=>{
          const r=el.getBoundingClientRect();return r.x>25&&r.y>185&&r.x<innerWidth-100&&r.y<innerHeight-220&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
        }));
        assert.ok(handleIndex>=0,'At least one editable handle is reachable');
        const handle=page.locator('.editor-handle').nth(handleIndex),box=await handle.boundingBox();
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(100);await page.mouse.move(box.x+45,box.y+35,{steps:12});await page.waitForTimeout(100);await page.mouse.up();
        await page.getByText('Sin guardar',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Deshacer',exact:true}).click();
        assert.equal(await page.getByRole('button',{name:'Guardar',exact:true}).isDisabled(),true);
        await page.getByRole('button',{name:'Rehacer',exact:true}).click();
        assert.equal(await page.getByRole('button',{name:'Guardar',exact:true}).isDisabled(),false);
        // Explicit range selection must not delete until an action is chosen.
        await page.getByRole('button',{name:'Tramo',exact:true}).click();
        await page.getByRole('button',{name:'Cerrar opciones',exact:true}).click();
        const locations=await lineLocations(page);assert.ok(locations.length>5);
        await page.mouse.click(locations[1].x,locations[1].y);
        await page.mouse.click(locations[Math.min(12,locations.length-1)].x,locations[Math.min(12,locations.length-1)].y);
        await page.getByRole('button',{name:'Conservar tramo',exact:true}).waitFor();
        await page.screenshot({path:path.join(output,`selection-${width}.png`)});
        await page.getByRole('button',{name:'Conservar tramo',exact:true}).click();
        await page.keyboard.press('Control+z');
        // Insert on a visible segment.
        await page.getByRole('button',{name:'Insertar',exact:true}).click();
        if(await page.getByRole('button',{name:'Cerrar opciones',exact:true}).isVisible()) await page.getByRole('button',{name:'Cerrar opciones',exact:true}).click();
        const insertAt=(await lineLocations(page))[3];
        await page.mouse.click(insertAt.x,insertAt.y);
        // Extend manually and by paths; a server failure must preserve the existing geometry.
        await page.getByRole('button',{name:'Ampliar',exact:true}).click();
        await page.mouse.click(width*.60,410);
        await page.getByRole('button',{name:'Opciones del mapa',exact:true}).click();
        await page.getByLabel('Trazado al mover o ampliar').selectOption('paths');
        await page.getByRole('button',{name:'Cerrar opciones',exact:true}).click();
        failRoute=true;
        await page.mouse.click(width*.65,440);
        await page.getByText(/No se pudo calcular el tramo por caminos/).waitFor();
        failRoute=false;
        await page.mouse.click(width*.7,460);
        await page.getByText('Recorrido ampliado siguiendo caminos.',{exact:true}).waitFor();
        assert.equal(routeCalls,2);
        await page.getByRole('button',{name:'Guardar',exact:true}).click();
        await page.getByText('No se pudo guardar el track.',{exact:true}).waitFor();
        assert.equal(await page.getByText('Sin guardar',{exact:true}).count(),1);
        failSave=false;
        await page.getByRole('button',{name:'Guardar',exact:true}).click();
        await page.getByText('Cambios guardados.',{exact:true}).waitFor();
        assert.equal(saved.length,2);
        assert.ok(saved[1].routeXml.includes('Metadata retained'));
        assert.ok(saved[1].routeXml.includes('Keep this description'));
        assert.ok(saved[1].routeXml.includes('<name>Fuente</name>'));
        assert.ok(saved[1].routeXml.includes('gpxtpx:hr'));
        assert.ok((saved[1].routeXml.match(/<trkpt /g)||[]).length>points.length);
        await assertUiFits(page);
        assert.deepEqual(errors,[]);
        console.log(`PASS ${width}px: drag, undo/redo, range preview/crop, insertion, extension, routing failure, save retry and GPX metadata`);
      } catch(error) { await page.screenshot({path:path.join(output,`failure-${width}.png`)});throw error; }
      finally {await context.close();}
    }
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
