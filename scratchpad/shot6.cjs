const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1050}});
  await p.addInitScript(()=>{ try{ localStorage.setItem('buymo_session', JSON.stringify({token:'dev',role:'hq',name:'本部',email:'hq@buymo.me',exp:Date.now()+9e9})); }catch(e){} });
  await p.goto('file://'+process.cwd()+'/site/hq-stores.html',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1500);
  console.log('URL:',p.url());
  await p.screenshot({path:'scratchpad/stores.png',fullPage:false});
  await b.close();
})();
