// Production bundle, simulated APIs; optional local GPX argument is never uploaded to a real service.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../dist/gpx-map-viewer');
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(path.relative(root,file).startsWith('..'))return res.writeHead(403).end();
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
const degree=180/(Math.PI*6371000);
const xml=(count,step,height)=>'<gpx><trk><trkseg>'+Array.from({length:count},(_,i)=>`<trkpt lat="0" lon="${i*step*degree}">${height(i)===null?'':`<ele>${height(i)}</ele>`}</trkpt>`).join('')+'</trkseg></trk></gpx>';
const fixtures=[['A',xml(1001,5,i=>100+i/4),250],['B',xml(51,100,i=>100+i*5),250],['C',xml(10001,1,i=>100+7*Math.sin(i*2*Math.PI/10.3)),0], [null,xml(101,10,()=>null),null]];
if(process.argv[2])fixtures.push(['A',fs.readFileSync(process.argv[2],'utf8'),966]);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 fs.mkdirSync(path.resolve(__dirname,'../tmp/elevation-quality-qa'),{recursive:true});
 try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   localStorage.setItem('tracketeo.language','es');localStorage.setItem('gpxAuthSession',JSON.stringify({token:'mock.'+btoa(JSON.stringify({exp:Date.now()/1000+3600}))+'.mock',id:901,nickname:'Prueba',verified:true,exitCode:0}));
  });
  const tracks=['A','B','C'].map((elevationQuality,i)=>({id:901+i,title:'Ruta '+elevationQuality,name:'Ruta '+elevationQuality,folderId:901,createdBy:901,createdByUserId:901,nickname:'Prueba',routeId:null,province:'Huesca',population:'Aínsa',distanceKm:25,ascent:966,desnivel:966,timeSeconds:7000,movingTimeSec:7000,uploadedAt:'2026-10-25',elevationQuality}));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(url.origin===base||['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.continue();
   let json=[];
   if(p.endsWith('/auth/me'))json={userId:901,nickname:'Prueba',plan:'PREMIUM'};
   if(p.endsWith('/tracks/me'))json=tracks;
   if(p.endsWith('/plan-folders'))json=[{id:901,name:'Salida',ownerId:901,isOwner:true,tracksCount:3,plannedDate:'2026-10-25'}];
   if(p.endsWith('/plan-folders/901/tracks'))json=tracks;
   if(p.includes('/votes'))json={votes:[]};
   if(p.includes('/route-analysis') && !p.includes('/comparison'))json=null;
   return route.fulfill({json});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error' && m.text().startsWith('ERROR'))errors.push(m.text());});
  await page.goto(base+'/analysis');
  for(const [grade,gpx,gain] of fixtures){
   await page.locator('input[type=file]').setInputFiles({name:'prueba.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx)});
   if(grade){
    const badge=page.locator(`app-elevation-quality button[data-quality="${grade}"]`).first();await badge.waitFor();
    const stats=page.locator('.analyzer__stats');
    if(await stats.count())assert.match(await stats.innerText(),new RegExp(`${gain} m`));
    await badge.click();await page.getByRole('heading',{name:'Calidad estimada de la altitud'}).waitFor();
    assert.match(await page.locator('app-info-dialog').innerText(),/No identifica el sensor/);
    await page.getByRole('button',{name:'Aceptar',exact:true}).click();
    await page.locator('app-info-dialog').waitFor({state:'detached'});
   }else{await page.waitForTimeout(100);assert.equal(await page.locator('app-elevation-quality button').count(),0);}
  }
  await page.goto(base+'/load?mode=routes&view=archive');
  await page.locator('.archive-destination').first().click();
  for(const grade of ['A','B','C'])await page.locator(`app-elevation-quality button[data-quality="${grade}"]`).waitFor();
  await page.locator('app-elevation-quality button[data-quality="A"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.resolve(__dirname,`../tmp/elevation-quality-qa/archive-${width}.png`)});
  await page.goto(base+'/plan?folderId=901');
  for(const grade of ['A','B','C'])await page.locator(`app-elevation-quality button[data-quality="${grade}"]`).waitFor();
  const badge=page.locator('app-elevation-quality button[data-quality="A"]');await badge.scrollIntoViewIfNeeded();
  const rect=await badge.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width);
  await page.screenshot({path:path.resolve(__dirname,`../tmp/elevation-quality-qa/plan-${width}.png`)});
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: local A/B/C calculation, absent altitude, explanations, archive and plan badges`);
  await context.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
