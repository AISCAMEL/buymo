const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await b.newContext({viewport:{width:1180,height:1400}});
  await ctx.addInitScript(()=>{ try{
    localStorage.setItem('buymo_session', JSON.stringify({token:'dev',role:'partner',name:'p@x.com',email:'p@x.com',store:'いわき店',exp:Date.now()+9e9}));
    localStorage.setItem('buymo_expenses', JSON.stringify({'いわき店':[{id:'e1',date:'2026-08-05',cat:'陸送・輸送',amount:15000,caseId:'CS-7002',memo:'アルファード陸送'}]}));
    localStorage.setItem('buymo_invoices', JSON.stringify({'いわき店':[{id:'i1',date:'2026-08-31',type:'本部からの請求',title:'8月分 加盟料',amount:30000,due:'2026-09-10',status:'未入金'}]}));
  }catch(e){} });
  const p=await ctx.newPage(); const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto('file://'+process.cwd()+'/site/partner-sales.html',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1200);
  await p.screenshot({path:'scratchpad/psales.png',fullPage:true});
  const p2=await ctx.newPage();
  await p2.goto('file://'+process.cwd()+'/site/partner-downloads.html',{waitUntil:'domcontentloaded'});
  await p2.waitForTimeout(1000);
  await p2.screenshot({path:'scratchpad/pdl.png',fullPage:true});
  console.log('errors:',errs.slice(0,4));
  await b.close();
})();
