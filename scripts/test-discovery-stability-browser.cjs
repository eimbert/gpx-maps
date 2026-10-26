// Real MapLibre/WebGL with the actual component logic and deterministic local tiles.
// Angular decorators/services are stubbed; no external accounts or terrain services are used.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fixtures = path.join(__dirname, 'fixtures/discovery');
function compile(file) {
  return ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true }
  }).outputText;
}
const sources = {
  '../utils/discovery-route': compile('src/app/utils/discovery-route.ts'),
  '../utils/gpx-elevation': compile('src/app/utils/gpx-elevation.ts'),
  component: compile('src/app/discover-route/discover-route.component.ts')
};
const server = http.createServer((req, res) => {
  const files = {
    '/maplibre.js': 'node_modules/maplibre-gl/dist/maplibre-gl-csp.js',
    '/worker.js': 'node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js',
    '/maplibre.css': 'node_modules/maplibre-gl/dist/maplibre-gl.css'
  };
  const file = files[req.url];
  if (file) { res.writeHead(200, {'Content-Type':req.url.endsWith('.css')?'text/css':'text/javascript'});fs.createReadStream(path.join(root,file)).pipe(res);return; }
  res.writeHead(200, {'Content-Type':'text/html'});
  res.end('<link rel="stylesheet" href="/maplibre.css"><style>body{margin:0}#map{width:100vw;height:100vh}</style><div id="map"></div><script src="/maplibre.js"></script>');
});
(async () => {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    for (const width of [390,1440]) {
      const page = await browser.newPage({viewport:{width,height:844}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/terrarium/**',r=>r.fulfill({contentType:'image/png',path:path.join(fixtures,'dem.png')}));
      await page.route('**/World_Imagery/**',r=>r.fulfill({contentType:'image/png',path:path.join(fixtures,'satellite.png')}));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(sources=>{
        maplibregl.setWorkerUrl('/worker.js');
        const noopDecorator=()=>()=>{};
        const modules={
          '@angular/core':{Component:noopDecorator,ViewChild:noopDecorator,HostListener:noopDecorator},
          'maplibre-gl':{default:maplibregl},
          '../utils/workspace-return':{workspaceReturnUrl:()=>null},
          '../../environments/environment':{environment:{}},
          '../services/screen-texts':{selectedUiText:k=>k}
        };
        const require=name=>{
          if(!modules[name]) {const exports={};new Function('require','exports',sources[name])(require,exports);modules[name]=exports;}
          return modules[name];
        };
        const points=Array.from({length:300},(_,i)=>({lat:41.45+i*0.00002,lon:2.05+Math.sin(i/40)*0.0002,ele:300}));
        const payload={tipoAnimacion:'descubrir',names:['Stability test'],tracks:[{trkpts:points}],camaraDescubrir:'cercana'};
        const C=require('component').DiscoverRouteComponent;
        window.component=new C({getCurrentNavigation:()=>({extras:{state:{gpxViewerPayload:payload}}})},{}, {clear(){}},
          {pauseCapture(){},resumeCapture(){}}, {run:f=>f(),runOutsideAngular:f=>f()},
          {refreshAvailability:async()=>{},getKnownCooldown:()=>null,claimFullPlayback:async()=>null},{getValidToken:()=>null});
        component.mapContainer={nativeElement:document.querySelector('#map')};
        component.ngAfterViewInit();
      },sources);
      await page.waitForFunction(()=>component.ready||component.error,{},{timeout:30000});
      const result=await page.evaluate(async()=>{
        const c=component,m=c.map;
        if(c.error)throw Error(c.error);
        const clamp=m.getCenterClampedToGround();
        await c.play();c.pause();c.accessGranted=true;
        // Drive the actual tick deterministically. MapLibre retains its own render loop.
        function frame(delta){c.playing=true;c.tick(c.lastFrame+delta);cancelAnimationFrame(c.raf);}
        c.lastFrame=1000;
        for(let i=0;i<240;i++)frame(1000/60);
        const before=c.elapsed,center=m.getCenter();frame(3000);
        const after=c.elapsed,shift=center.distanceTo(m.getCenter());
        const elevationQuery=m.queryTerrainElevation.bind(m);
        const heights=[];
        for(let i=0;i<60;i++){
          m.queryTerrainElevation=()=>i%2?420:360;
          frame(1000/60);
          await new Promise(r=>{m.once('render',r);m.triggerRepaint();});
          heights.push({expected:c.cameraElevation,actual:m.getCenterElevation()});
        }
        m.queryTerrainElevation=elevationQuery;
        c.pause();const paused=c.elapsed;
        await new Promise(r=>setTimeout(r,150));const stillPaused=c.elapsed===paused;
        await c.play();c.pause();const resumed=c.elapsed===paused;
        c.elapsed=c.duration-4.02;c.lastDraw=-Infinity;c.ending=undefined;
        for(let i=0;i<250;i++)frame(1000/60);
        const complete=c.completed&&c.progress===1;
        await c.play();c.pause();const replay=c.elapsed===0&&c.progress===0;
        const oldLoaded=m.isSourceLoaded.bind(m);m.queryTerrainElevation=()=>0;m.isSourceLoaded=()=>false;
        const held=c.cameraElevation;c.applyCamera(c.flight,1/60);const missingHolds=c.cameraElevation===held;
        m.isSourceLoaded=oldLoaded;m.queryTerrainElevation=elevationQuery;
        c.terrainAvailable=false;m.setTerrain(null);
        for(let i=0;i<900;i++)c.applyCamera(c.flight,1/60);
        const fallback=Math.abs(c.cameraElevation)<0.1;
        c.ngOnDestroy();
        return {clamp,before,after,shift,heights,stillPaused,resumed,complete,replay,missingHolds,fallback};
      });
      assert.equal(result.clamp,false,'Terrain renders must not independently reset camera altitude');
      assert.ok(result.after-result.before<=1/15+1e-9,'A 3-second stall must not skip the route');
      assert.ok(result.shift<25,`Unexpected camera jump: ${result.shift}m`);
      for(let i=0;i<result.heights.length;i++){
        const h=result.heights[i];assert.ok(Math.abs(h.expected-h.actual)<1e-6,'Rendered altitude must keep the smoothed value');
        if(i)assert.ok(Math.abs(h.actual-result.heights[i-1].actual)<=1.000001);
      }
      for(const key of ['stillPaused','resumed','complete','replay','missingHolds','fallback'])assert.ok(result[key],key);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}px: real terrain rendering, altitude jitter, stalled frame, pause/resume, ending, replay, missing tiles and terrain fallback`);
      await page.close();
    }
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
