const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await b.newContext({viewport:{width:1000,height:1500}});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('buymo_session', JSON.stringify({token:'dev',role:'hq',name:'本部',email:'hq@buymo.me',exp:Date.now()+9e9}));
    localStorage.setItem('buymo_payments', JSON.stringify({'いわき店':{joinDate:'2024-04-01',years:5,monthly:30000,payments:[{id:'a',date:'2024-04-10',amount:30000}],addr:'福島県いわき市○○1-2-3',rep:'鈴木 一郎',initFee:300000}})); }catch(e){} });
  // agreement via ?store=
  const p=await ctx.newPage();
  await p.goto('file://'+process.cwd()+'/site/hq-payments.html?store='+encodeURIComponent('いわき店'),{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1000);
  const [pop]=await Promise.all([ ctx.waitForEvent('page'), p.click('#btnAgreement') ]);
  await pop.waitForTimeout(600);
  await pop.screenshot({path:'scratchpad/agreement2.png',fullPage:true});
  // stores page pay-link
  const p2=await ctx.newPage();
  await p2.goto('file://'+process.cwd()+'/site/hq-stores.html',{waitUntil:'domcontentloaded'});
  await p2.waitForTimeout(1000);
  const card=await p2.$('.store-card');
  if(card){ await card.screenshot({path:'scratchpad/store-card.png'}); }
  await b.close(); console.log('done');
})();
