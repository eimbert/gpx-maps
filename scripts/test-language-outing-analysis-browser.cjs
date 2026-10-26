// Regression: language controls, translated redesigned screens, and separate analysis identities.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/gpx-map-viewer');
const output = path.resolve(__dirname, '../tmp/language-analysis-qa');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (path.relative(root, file).startsWith('..')) return res.writeHead(403).end();
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const gpx = `<gpx version="1.1"><trk><name>Shared GPX</name><trkseg>${Array.from({length:20},(_,i)=>`<trkpt lat="${41+i*.001}" lon="2"><ele>${100+i*5}</ele></trkpt>`).join('')}</trkseg></trk></gpx>`;
const report = { summary: 'OUTING REPORT', routeType: 'mixta', difficultyExplanation: 'Moderate', highlights: [], warnings: [], recommendations: [] };
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: {width,height:900}, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        if (!localStorage.getItem('tracketeo.language')) localStorage.setItem('tracketeo.language','en');
        localStorage.setItem('gpxAuthSession', JSON.stringify({token:'mock.'+btoa(JSON.stringify({exp:Date.now()/1000+3600}))+'.mock',id:901,name:'Enrique Test',nickname:'test',verified:true,exitCode:0,administrator:true}));
      });
      const analyses = { tracks: { id:71, trackId:42, source:'tracks', title:'Archive route', report:{...report,summary:'ARCHIVE REPORT'}, reportLanguage:'en' } };
      let lookupCalls = 0, postCalls = 0, wrongSource = false;
      const sources = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url()), p = url.pathname;
        if (url.origin === base || ['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)) return route.continue();
        let json = [];
        if (p.endsWith('/auth/me')) json = {userId:901,name:'Enrique Test',nickname:'test',plan:'ADMIN',administrator:true};
        if (p.endsWith('/account/entitlements')) json = {administrator:true,aiAnalysesUsedLastSixHours:0,aiAnalysesUsedThisMonth:0,aiAnalysesPerSixHours:20,aiAnalysesPerMonth:100};
        if (p.endsWith('/plan-folders')) json = [{id:901,name:'Test outing',ownerId:901,isOwner:true,tracksCount:1,plannedDate:null}];
        if (p.endsWith('/plan-folders/901/tracks')) json = [{id:42,folderId:901,name:'Outing route',createdByUserId:901,distanceKm:2,desnivel:95,difficultyLevel:1,routeXml:gpx}];
        if (p.endsWith('/tracks/me')) json = [{id:42,title:'Archive route',fileName:'archive.gpx',createdBy:901,shared:false,distanceKm:2,ascent:95}];
        if (p.endsWith('/tracks/42/gpx')) json = {id:42,fileName:'archive.gpx',routeXml:gpx};
        if (p.includes('/votes')) json = {votes:[]};
        if (p.endsWith('/route-analysis/public')) json = Object.values(analyses);
        if (p.endsWith('/route-analysis/track/42')) {
          const source = url.searchParams.get('source'); sources.push(source);
          json = wrongSource && source === 'plan' ? analyses.tracks : analyses[source] || null;
        }
        if (p.endsWith('/route-analysis/lookup')) { lookupCalls++; json = analyses.tracks; }
        if (p.endsWith('/route-analysis') && route.request().method()==='POST') {
          const payload = route.request().postDataJSON();
          assert.equal(payload.source,'plan'); assert.equal(payload.trackId,42);
          assert.equal(payload.reportLanguage,'en'); postCalls++;
          json = analyses.plan = {id:72,trackId:42,source:'plan',folderId:901,title:'Outing route',report,reportLanguage:'en',model:'test',usageCharged:true};
        }
        return route.fulfill({json});
      });
      const page = await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      try {
        await page.goto(base);
        await page.getByRole('heading',{name:'Hello, Enrique.'}).waitFor();
        assert.equal(await page.locator('app-language-selector').count(),1);
        assert.match(await page.locator('.dashboard').innerText(),/BACK TO YOUR LAST ROUTE|YOUR ROUTE ARCHIVE/);
        await page.getByRole('button',{name:'Account and usage',exact:true}).click();
        assert.equal(await page.locator('.dashboard-account select').count(),0);
        await page.locator('.dashboard-inbox').hover();
        await page.locator('.mat-tooltip').filter({hasText:'Inbox'}).waitFor();
        await page.locator('.dashboard-avatar').hover();
        await page.locator('.mat-tooltip').filter({hasText:'Account and usage'}).waitFor();
        await page.screenshot({path:path.join(output,`home-en-${width}.png`)});
        // All supported languages persist after changing from the header.
        for(const [locale,heading] of [['es','Hola, Enrique.'],['ca','Hola, Enrique.'],['gl','Ola, Enrique.'],['eu','Kaixo, Enrique.'],['en','Hello, Enrique.']]) {
          await Promise.all([page.waitForNavigation(),page.locator('app-language-selector select').selectOption(locale)]);
          await page.getByRole('heading',{name:heading,exact:true}).waitFor();
          assert.equal(await page.locator('html').getAttribute('lang'),locale);
        }
        await page.goto(base+'/plan?folderId=901');
        await page.locator('.outing-track').waitFor();
        assert.match(await page.locator('.comparison__toolbar').innerText(), /Select 2 tracks to compare/);
        const analyze = () => page.locator('.outing-links button').filter({hasText:/^(insights)?Analyze$/});
        await analyze().waitFor();
        assert.equal(await page.locator('.outing-more').getByText('Analyze',{exact:true}).count(),0);
        assert.match(await page.locator('.outing-weather').innerText(),/Easy/);
        await analyze().click();
        await page.locator('.analyzer__primary').waitFor();
        assert.equal(new URL(page.url()).searchParams.get('source'),'plan');
        assert.equal(lookupCalls,0,'Opening a saved route must not link a report by GPX hash');
        assert.doesNotMatch(await page.locator('.analyzer').innerText(),/ARCHIVE REPORT/);
        await page.locator('.analyzer__primary').click();
        await page.getByText('OUTING REPORT',{exact:true}).waitFor();
        assert.equal(postCalls,1);
        await page.getByRole('button',{name:/View saved route/}).click();
        await page.locator('.outing-analysis-available').waitFor();
        await page.locator('.outing-track').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,`plan-en-${width}.png`)});
        await page.reload();
        await page.locator('.outing-analysis-available').click();
        await page.getByText('OUTING REPORT',{exact:true}).waitFor();
        assert.equal(postCalls,1,'Reopening does not regenerate or spend credit');
        await page.goto(base+'/analysis?source=tracks&trackId=42');
        await page.getByText('ARCHIVE REPORT',{exact:true}).waitFor();
        assert.doesNotMatch(await page.locator('.analyzer').innerText(),/OUTING REPORT/);
        wrongSource=true;
        await page.goto(base+'/plan?folderId=901');
        await analyze().waitFor();
        assert.equal(await page.getByText('Analysis available',{exact:true}).count(),0);
        await analyze().click();
        await page.locator('.analyzer__primary').waitFor();
        assert.doesNotMatch(await page.locator('.analyzer').innerText(),/ARCHIVE REPORT/);
        assert.equal(lookupCalls,0);
        await page.goto(base+'/load?mode=routes&view=archive');
        await page.getByRole('button',{name:'Analyses',exact:true}).click();
        await page.locator('.analysis-library__row').waitFor();
        assert.equal(await page.locator('.analysis-library__row').count(),1,'Outing reports stay outside My routes');
        assert.match(await page.locator('.analysis-library__row').innerText(),/Archive route/);
        assert.equal(await page.locator('app-language-selector').count(),1);
        assert.ok(sources.includes('plan')&&sources.includes('tracks'));
        assert.deepEqual(errors,[]);
        console.log(`PASS ${width}px: five languages, header selector, tooltip, saved outing report, reload/reopen, separate same-ID reports, mismatched-source rejection`);
      } catch(error) { await page.screenshot({path:path.join(output,`failure-${width}.png`)}); throw error; }
      finally { await context.close(); }
    }
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
