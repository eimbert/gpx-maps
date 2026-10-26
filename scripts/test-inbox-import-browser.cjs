// Exercises the production bundle with isolated API fixtures; no real accounts are changed.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/inbox-import-qa');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (path.relative(root, file).startsWith('..')) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  try {
    for (const width of [390,1440]) {
      const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',timezoneId:'Europe/Madrid'});
      await context.addInitScript(() => {
        const token='mock.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.mock';
        localStorage.setItem('gpxAuthSession',JSON.stringify({token,id:901,nickname:'Enrique',verified:true,plan:'ADMIN',administrator:true,exitCode:0}));
        localStorage.setItem('tracketeo.language','es');
      });
      const common={id:7,trackId:null,pointCount:3,distanceKm:28.4,ascentMeters:400,durationSeconds:3600};
      const rides={
        garmin:[{...common,rideStart:Date.parse('2026-10-24T06:25:00Z')/1000,lastReceivedAt:'2026-10-24T08:00:00Z',inboxStatus:'PENDING'}],
        polar:[{...common,name:'Salida Polar',startTime:'2026-10-24T09:00:00Z',status:'PENDING'}],
        wahoo:[{...common,name:'Salida Wahoo',startTime:'2026-10-24T10:00:00Z',status:'PENDING'}]
      };
      const imports=[];
      await context.route('**/*',route=>{
        const request=route.request(),url=new URL(request.url()),p=url.pathname;
        if(url.origin===base||['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.continue();
        let json=[];
        if(p.endsWith('/auth/me'))json={userId:901,nickname:'Enrique',plan:'ADMIN',administrator:true};
        if(p.endsWith('/garmin/devices'))json=[{id:1,totalPoints:3}];
        if(p.endsWith('/connection'))json={available:true,connected:true,sandbox:true};
        for(const provider of Object.keys(rides)){
          if(p.endsWith(`/${provider}/rides`))json=rides[provider];
          if(p.endsWith(`/${provider}/rides/7/incorporate`)){
            const {name,shared}=request.postDataJSON();
            imports.push({provider,name,shared});
            rides[provider][0]={...rides[provider][0],name,trackId:99,status:'INCORPORATED',inboxStatus:'INCORPORATED',province:'Barcelona',population:'Santa Coloma de Gramenet'};
            json=rides[provider][0];
          }
        }
        return route.fulfill({json});
      });
      const page=await context.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/garmin');
      await page.waitForFunction(()=>document.querySelectorAll('.ride-card').length===3);
      for(const provider of ['Garmin','Polar','Wahoo']){
        const card=page.locator('.ride-card').filter({has:page.locator('.ride-card__top strong',{hasText:provider})});
        await card.getByRole('button',{name:'Incorporar',exact:true}).click();
        const dialog=page.getByRole('dialog'),input=dialog.getByLabel('Nombre de la ruta');
        assert.equal(await dialog.getByRole('checkbox',{name:'Compartir con la comunidad'}).isChecked(),true);
        const expectedTime={Garmin:'08:25',Polar:'11:00',Wahoo:'12:00'}[provider];
        assert.equal(await input.inputValue(),`${provider==='Garmin'?'Actividad Garmin':`Salida ${provider}`} · 24/10/2026 ${expectedTime}`);
        await input.focus();
        assert.equal(await input.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
        assert.match(await input.evaluate(el=>getComputedStyle(el).boxShadow),/inset/);
        if(provider==='Garmin')await dialog.screenshot({path:path.join(output,`suggested-name-${width}.png`)});
        const before=imports.length;
        await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
        assert.equal(imports.length,before,'Cancel must not incorporate');
        await card.getByRole('button',{name:'Incorporar',exact:true}).click();
        const shared=width===390;
        if(!shared)await dialog.getByText('Compartir con la comunidad',{exact:true}).click();
        assert.equal(await dialog.getByRole('checkbox',{name:'Compartir con la comunidad'}).isChecked(),shared);
        await input.fill('   ');
        assert.ok(await dialog.getByRole('button',{name:'Incorporar',exact:true}).isDisabled());
        const name=`Ruta ${provider} por Collserola`;
        await input.fill('  '+name+'  ');
        if(provider==='Garmin')await dialog.screenshot({path:path.join(output,`incorporate-${width}.png`)});
        await dialog.getByRole('button',{name:'Incorporar',exact:true}).click();
        await page.locator('.incorporated-name strong',{hasText:name}).waitFor();
        assert.deepEqual(imports[before],{provider:provider.toLowerCase(),name,shared});
      }
      await page.reload();
      await page.waitForFunction(()=>document.querySelectorAll('.incorporated-row').length===3);
      assert.equal(await page.locator('.incorporated-row a').count(),0);
      assert.equal(await page.locator('.ride-card').count(),0);
      assert.equal(await page.locator('.incorporated-name strong').filter({hasText:'por Collserola'}).count(),3);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.deepEqual(errors,[]);
      console.log(`Inbox import ${width}px: default name, cancel, validation, renamed Garmin/Polar/Wahoo, reload and no archive links passed`);
      await context.close();
    }
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
