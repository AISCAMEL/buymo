const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1150}});
  await p.addInitScript(()=>{ try{ localStorage.setItem('buymo_session', JSON.stringify({token:'dev',role:'hq',name:'本部',email:'hq@buymo.me',exp:Date.now()+9e9})); }catch(e){} });
  const errs=[]; p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.goto('file://'+process.cwd()+'/site/hq-payments.html',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1200);
  // add a couple of payments to see running total + summary
  await p.evaluate(()=>{
    document.getElementById('cJoin').value='2024-04-01'; document.getElementById('cJoin').dispatchEvent(new Event('change'));
    document.getElementById('cYears').value='5'; document.getElementById('cYears').dispatchEvent(new Event('change'));
    document.getElementById('cMonthly').value='30000'; document.getElementById('cMonthly').dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(300);
  // add payments
  for(const [d,a] of [['2024-04-10','30000'],['2024-05-10','30000'],['2024-06-10','30000']]){
    await p.fill('#pDate',d); await p.fill('#pAmount',a); await p.click('#payAdd button[type=submit]'); await p.waitForTimeout(150);
  }
  await p.evaluate(()=>{ document.getElementById('cancelDate').value='2025-04-01'; document.getElementById('cancelDate').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  console.log('URL:',p.url(),'errors:',errs.slice(0,4));
  await p.screenshot({path:'scratchpad/payments.png',fullPage:true});
  await b.close();
})();
