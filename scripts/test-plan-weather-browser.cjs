// Production UI with simulated forecasts: no real user accounts or weather quota.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../dist/gpx-map-viewer');
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(path.relative(root,file).startsWith('..'))return res.writeHead(403).end();
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   localStorage.setItem('tracketeo.language','es');localStorage.setItem('gpxAuthSession',JSON.stringify({token:'mock.'+btoa(JSON.stringify({exp:Date.now()/1000+3600}))+'.mock',id:901,verified:true,exitCode:0}));
   const original=window.fetch;window.forecastCacheModes=[];
   window.fetch=function(url,options){if(String(url).includes('open-meteo'))window.forecastCacheModes.push(options?.cache);return original.call(this,url,options);};
  });
  let requests=0,mode='success',minTemp=8,releaseDelayed;
  const date='2026-10-26';
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(url.origin===base||['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.continue();
   if(url.hostname==='api.open-meteo.com'){
    requests++;assert.equal(url.searchParams.get('forecast_days'),'16');assert.equal(url.searchParams.get('timezone'),'auto');
    if(mode==='failure')return route.fulfill({status:503,body:'unavailable'});
    const temperature=minTemp;
    const json={daily:{time:mode==='missing'?[]:[date],weathercode:[1],temperature_2m_max:[temperature+10],temperature_2m_min:[temperature]}};
    if(mode==='delayed'){mode='success';await new Promise(r=>releaseDelayed=r);}
    return route.fulfill({json,headers:{'Cache-Control':'public, max-age=3600'}}).catch(()=>{});
   }
   let json=[];
   if(p.endsWith('/auth/me'))json={userId:901,nickname:'Prueba',plan:'PREMIUM'};
   if(p.endsWith('/plan-folders'))json=[901,902].map(id=>({id,name:`Salida ${id}`,ownerId:901,isOwner:true,tracksCount:1,plannedDate:date}));
   if(/\/plan-folders\/90[12]\/tracks$/.test(p)){const id=Number(p.split('/').at(-2));json=[{id,folderId:id,name:`Ruta ${id}`,createdByUserId:901,distanceKm:25,desnivel:400,startLat:id===901?41:42,startLon:2,movingTimeSec:7000}];}
   if(p.includes('/votes'))json={votes:[]};
   return route.fulfill({json});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const weather=()=>page.locator('.outing-weather');
  const waitTemp=async value=>{await page.waitForFunction(t=>document.querySelector('.outing-weather')?.textContent.includes(t),`${value}°/${value+10}°`);};
  await page.goto(base+'/plan?folderId=901');await waitTemp(8);
  let before=requests;minTemp=9;
  await page.locator('.outing-choice__select').filter({hasText:'Salida 901'}).click();await waitTemp(9);assert.ok(requests>before);
  before=requests;minTemp=10;
  await page.locator('.plan__tabs button').filter({hasText:'Detalles'}).click();
  await page.locator('.plan__tabs button').filter({hasText:'Tracks'}).click();await waitTemp(10);assert.ok(requests>before);
  before=requests;minTemp=11;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await waitTemp(11);assert.ok(requests>before);
  mode='failure';await page.locator('.plan__tabs button').filter({hasText:'Tracks'}).click();
  await page.getByText('No se ha podido consultar el tiempo.',{exact:false}).waitFor();assert.match(await weather().innerText(),/Sin previsión/);
  assert.doesNotMatch(await weather().innerText(),/lejana/);
  mode='missing';await page.locator('.plan__tabs button').filter({hasText:'Tracks'}).click();await page.getByText('No hay previsión disponible para la fecha seleccionada.',{exact:true}).waitFor();
  mode='delayed';minTemp=1;await page.locator('.plan__tabs button').filter({hasText:'Tracks'}).click();
  await page.getByText('Actualizando previsión…',{exact:true}).waitFor();
  minTemp=15;await page.locator('.outing-choice__select').filter({hasText:'Salida 902'}).click();await waitTemp(15);
  if(releaseDelayed)releaseDelayed();await page.waitForTimeout(200);await waitTemp(15);
  assert.match(await page.locator('.outing-name').innerText(),/Ruta 902/);
  before=requests;minTemp=16;await page.reload();await waitTemp(16);assert.ok(requests>before);
  assert.ok((await page.evaluate(()=>window.forecastCacheModes)).every(m=>m==='no-store'));
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: entry, same outing, Tracks tab, foreground, HTTP failure/retry, absent date, stale response cancellation, reload and cache bypass`);
  await context.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
