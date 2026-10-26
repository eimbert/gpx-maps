// Production browser checks with isolated fixtures; no live account or AI call.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/route-comparison/qa');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
const server = http.createServer((req,res) => {
  let file = path.resolve(root, '.' + new URL(req.url,'http://localhost').pathname);
  if (path.relative(root,file).startsWith('..')) return res.writeHead(403).end();
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file=path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}); fs.createReadStream(file).pipe(res);
});
const gpx = (index) => '<gpx><trk><trkseg>' + Array.from({length:201},(_,i)=>`<trkpt lat="${41+i*(index===2?.0001:index===0?.001:.0015)}" lon="2"><ele>${100+(i<=100?i:200-i)*(index===2?1:index===0?14:25)}</ele></trkpt>`).join('') + '</trkseg></trk></gpx>';
function metrics(b) {
  return { version:'irp-1-elevation-3',distanceKm: b?31.5:34,gainM:b?857:920,lossM:b?850:915,minAltitude:100,maxAltitude:700,
    elevationStatus:'ok',coveragePercent:100,uphillAverageGrade:b?8:5,max100:b?18:12,max250:10,max500:8,
    uphillPercent:43,downhillPercent:40,flatPercent:17,climbCount:b?12:4,descentCount:8,punchCount:b?10:2,punchesPerKm:.32,
    directionChanges:16,sharpGradeChanges:24,meanRecoveryM:b?180:800,chainedClimbs:b?8:1,finalThirdGainPercent:b?49:25,irp:b?7.8:3.2,
    dimensions:{overall:b?6.8:6.1,endurance:b?5.1:7.4,explosiveness:b?8.2:4.8,accumulatedFatigue:b?7.6:5.4,regularity:b?3:8,finalDemand:b?8:4},
    climbs:[{startKm:1,endKm:2.5,distanceKm:1.5,gainM:120,averageGrade:8,max100:12,max250:10,max500:8,character:['larga','irregular'],segment:0}],
    profile:Array.from({length:81},(_,i)=>({km:i*.4,altitude:100+(b?Math.abs(Math.sin(i*.5))*200:Math.abs(Math.sin(i*.07))*600),segment:0})),
    limitations:['Dificultad física estimada; el GPX no informa de terreno u obstáculos.','IRP heurístico, no validado fisiológicamente.'] };
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const width of (process.env.ROUTE_COMPARISON_QA_WIDTH ? [Number(process.env.ROUTE_COMPARISON_QA_WIDTH)] : [1440,390])) {
      const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
      const tracks=['Volta de les ascensions llargues — Sant Llorenç del Munt','Serrat dels Ginebres — dotze repechos encadenados','Paseo suave por la ribera'].map((name,i)=>({id:i+1,folderId:901,createdByUserId:901,name,routeXml:gpx(i),distanceKm:i===2?10:35,movingTimeSec:7500,desnivel:i===2?80:900,startPopulation:'Terrassa',difficultyLevel:i===2?1:i===0?3:4}));
      let requests=0, fallback=false, savedReports=[];
      const snapshots=new Map();
      await context.addInitScript(()=>{
        localStorage.setItem('tracketeo.language','es');
        localStorage.setItem('gpxAuthSession',JSON.stringify({token:'mock.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.mock',id:901,nickname:'prueba',verified:true,exitCode:0}));
      });
      await context.route('**/*',route=>{
        const url=new URL(route.request().url()); if(url.origin===base || ['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.continue();
        let json=[];
        if(url.pathname.endsWith('/auth/me'))json={userId:901,nom:'Prueba',nickname:'prueba',plan:'PREMIUM'};
        else if(url.pathname.endsWith('/plan-folders'))json=[{id:901,name:'Salida del domingo',ownerId:901,tracksCount:3,isOwner:true}];
        else if(url.pathname.endsWith('/plan-folders/901/tracks'))json=tracks;
        else if(url.pathname.endsWith('/route-analysis/comparison/folder/901'))json=savedReports;
        else if(/\/route-analysis\/comparison\/\d+$/.test(url.pathname))json=snapshots.get(Number(url.pathname.split('/').pop())) || null;
        else if(url.pathname.endsWith('/route-analysis/comparison')) {
          requests++; assert.deepEqual(route.request().postDataJSON(),{trackIds:[1,2],reportLanguage:'es'});
          tracks[0].irpScore=3.2; tracks[1].irpScore=7.8;
          json={id:500+requests,title:`${tracks[0].name} vs ${tracks[1].name}`,createdAt:'2026-10-22T17:00:00Z',routes:tracks.slice(0,2).map((t,i)=>({id:t.id,title:t.name,metrics:metrics(i===1),recorded:{elapsedSeconds:null,heartRate:{count:0,mean:null,maximum:null},power:{count:0,mean:null,maximum:null},notes:['Sin datos grabados; no se predicen tiempos.']}})),aiStatus:fallback?'unavailable':'generated',narrative:fallback?null:{summary:'Dos rutas de distancia y desnivel parecidos, pero con un reparto del esfuerzo muy distinto.',routeA:'Las ascensiones largas favorecen un pedaleo sostenido. La exigencia principal es mantener el esfuerzo durante la subida.',routeB:'Los repechos encadenados exigen cambios de intensidad y ofrecen poca distancia para recuperar.',answers:['La ruta B exige más cambios de intensidad, con un IRP de 7,8 frente a 3,2.','B presenta las rampas más exigentes.','A concentra el desnivel en subidas más largas.','B, por la sucesión de repechos.','A facilita mantener un ritmo constante.','B deja menos distancia entre subidas.','A para resistencia; B para un ciclista que tolere esfuerzos explosivos repetidos.'],verdict:'B tiene un perfil más rompepiernas; A exige mayor resistencia sostenida. Es una estimación física que no incorpora las condiciones del terreno.'}};
          snapshots.set(json.id,json);
          savedReports=[{id:json.id,title:json.title,trackAId:1,trackBId:2,createdAt:json.createdAt,aiStatus:json.aiStatus},...savedReports];
        } else if(url.pathname.includes('/votes'))json={votes:[]};
        else if(!url.pathname.includes('/api/'))return route.abort();
        return route.fulfill({json});
      });
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/plan?folderId=901');
      const button=page.getByRole('button',{name:'Comparar con IA'});
      await button.waitFor();assert.equal(await button.isDisabled(),true);
      const checks=page.locator(width>700?'.plan__table--desktop tbody .plan__track-checkbox':'.plan__track-cards .plan__track-checkbox');
      await checks.nth(0).check();assert.equal(await button.isDisabled(),true);
      await checks.nth(1).check();assert.equal(await button.isEnabled(),true);
      await checks.nth(2).check();assert.equal(await button.isDisabled(),true);
      await page.getByText('Solo se pueden comparar de dos en dos.',{exact:false}).waitFor();assert.equal(requests,0);
      await checks.nth(2).uncheck();
      await page.evaluate(()=>document.fonts.ready);
      await page.locator('.plan__tracks').screenshot({path:path.join(output,`selection-${width}.png`)});
      const colors=await page.locator('.plan__difficulty-pill:visible').evaluateAll(nodes=>nodes.map(n=>({background:getComputedStyle(n).backgroundColor,icon:getComputedStyle(n.querySelector('mat-icon')).color,color:getComputedStyle(n).color})));
      assert.equal(new Set(colors.map(c=>c.background)).size,3);assert.ok(colors.every(c=>c.icon===c.color));
      await button.click();await page.getByText('Informe:',{exact:false}).first().waitFor();
      assert.equal(requests,1);assert.equal(await page.locator('.comparison__route').count(),2);
      await page.getByText('La comparación, en lenguaje ciclista',{exact:true}).waitFor();
      await page.locator('.comparison__report').screenshot({path:path.join(output,`report-${width}.png`)});
      if(width===390){
        await page.evaluate(()=>{
          Object.defineProperty(navigator,'canShare',{configurable:true,value:undefined});
          Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__firstShare={type:data.files[0].type,size:data.files[0].size};}});
        });
        await page.getByRole('button',{name:'Compartir informe',exact:true}).click();
        await page.getByText('Informe compartido.',{exact:true}).waitFor();
        const firstShare=await page.evaluate(()=>window.__firstShare);
        assert.equal(firstShare.type,'application/pdf');assert.ok(firstShare.size>20000);
        assert.equal(context.pages().length,1,'Native sharing must not open a blank tab');
      }
      const downloadPromise=page.waitForEvent('download');
      await page.getByRole('button',{name:'Descargar PDF'}).click();
      const download=await downloadPromise;
      assert.match(download.suggestedFilename(),/Informe-.*-501\.pdf$/);
      const pdf=fs.readFileSync(await download.path());
      assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.ok(pdf.length>20000);
      fs.writeFileSync(path.join(output,`report-${width}.pdf`),pdf);
      if(width===390){
        await page.evaluate(()=>{
          Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
          Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shared=window.__shared||[];window.__shared.push({type:data.files[0].type,size:data.files[0].size,name:data.files[0].name});}});
        });
        await page.getByRole('button',{name:'Compartir informe',exact:true}).click();
        await page.getByText('Informe compartido.',{exact:true}).waitFor();
        const shared=await page.evaluate(()=>window.__shared[0]);
        assert.equal(shared.type,'application/pdf');assert.ok(shared.size>20000);
        await page.getByRole('button',{name:'Compartir informe',exact:true}).click();
        await page.waitForFunction(()=>window.__shared?.length===2);
        assert.equal((await page.evaluate(()=>window.__shared[1])).type,'application/pdf');
        await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new Error('Share failed');}}));
        await page.getByRole('button',{name:'Compartir informe',exact:true}).click();
        await page.getByText('No se pudo compartir el informe.',{exact:false}).waitFor();
        await page.waitForFunction(()=>!document.querySelector('.comparison__report--export'));
      }
      assert.equal(await page.locator('.plan__irp:visible').count(),2);
      if(width>700){
        const badges=await page.locator('.plan__table--desktop tbody tr').evaluateAll(rows=>rows.map(row=>{
          const cell=row.querySelector('td:nth-child(4)');
          const badge=cell.querySelector('.plan__difficulty-pill');
          const rect=badge.getBoundingClientRect(), rowRect=row.getBoundingClientRect();
          return {width:rect.width,offset:rect.top+rect.height/2-rowRect.top-rowRect.height/2,aligned:getComputedStyle(cell).textAlign};
        }));
        assert.equal(new Set(badges.map(item=>item.width)).size,1,'Difficulty badges must have the same width');
        assert.ok(badges.every(item=>Math.abs(item.offset)<2 && item.aligned==='center'),'Difficulty badges must be vertically and horizontally centered');
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Page must not overflow horizontally');
      // A selection change removes the old comparison; unavailable AI still shows objective metrics.
      await checks.nth(1).uncheck();assert.equal(await page.locator('.comparison__report').count(),0,
        await page.locator('.comparison__report').evaluateAll(nodes=>JSON.stringify(nodes.map(node=>({parent:node.parentElement?.tagName,hidden:node.hasAttribute('hidden'),export:node.classList.contains('comparison__report--export')})))));
      await checks.nth(1).check();fallback=true;await button.click();
      await page.getByText('La redacción de IA no está disponible.',{exact:false}).waitFor();
      assert.equal(await page.locator('.comparison__answers').count(),0);
      // Reloaded list still carries the backend-persisted IRP.
      await page.reload();await button.waitFor();assert.equal(await page.locator('.plan__irp:visible').count(),2);
      const reportList=page.locator('.plan__comparison-history');
      await reportList.waitFor();
      assert.equal(await reportList.locator('li').count(),2);
      assert.ok((await reportList.locator('li strong').first().innerText()).includes(' vs '));
      await reportList.locator('li button').last().click();
      await page.getByText('La comparación, en lenguaje ciclista',{exact:true}).waitFor();
      assert.equal(requests,2,'Opening a saved report must not generate another report');
      await reportList.screenshot({path:path.join(output,`history-${width}.png`)});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
      assert.equal(await page.locator('.plan__saved-reports').count(),0);
      await reportList.locator('li button').last().click();
      await page.getByText('La comparación, en lenguaje ciclista',{exact:true}).waitFor();
      assert.equal(requests,2);
      assert.deepEqual(errors,[]);console.log(`${width}px: saved report, PDF, share, guards and layout OK`);
      await context.close();
    }
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
