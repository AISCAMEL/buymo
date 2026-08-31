const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1000}});
  // seed auth token so AUTH.guard passes
  await p.addInitScript(()=>{ try{ localStorage.setItem('buymo_auth', JSON.stringify({role:'hq',token:'dev',exp:Date.now()+9e9})); localStorage.setItem('hq_auth','dev'); }catch(e){} });
  const errs=[];
  p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.goto('file://'+process.cwd()+'/site/hq-stores.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(1200);
  await p.screenshot({path:'scratchpad/stores.png',fullPage:false});
  console.log('URL:',p.url());
  console.log('errors:',errs.slice(0,5));
  await b.close();
})();
