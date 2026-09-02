const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await b.newContext({viewport:{width:1180,height:1400}});
  await ctx.addInitScript(()=>{ try{
    localStorage.setItem('buymo_session', JSON.stringify({token:'dev',role:'partner',name:'p',email:'p',store:'いわき店',exp:Date.now()+9e9}));
    localStorage.setItem('buymo_cases', JSON.stringify([
      {id:'CS-8001',date:'2026/09/01',name:'佐藤 太郎',tel:'090-1111-2222',email:'sato@x.com',genre:'プリウス',assignee:'',stage:'新規受付',amount:0,memo:'不動車・引取希望'},
      {id:'CS-8002',date:'2026/09/01',name:'田中 花子',tel:'080-3333-4444',email:'tanaka@x.com',genre:'ハイエース',assignee:'',stage:'新規受付',amount:0,memo:''},
      {id:'CS-7006',date:'2026/06/18',name:'伊藤',tel:'',email:'ito@x.com',genre:'セダン',assignee:'いわき店',stage:'完了',amount:1500000,memo:''},
      {id:'CS-7003',date:'2026/06/25',name:'鈴木',tel:'',email:'s@x.com',genre:'SUV',assignee:'郡山店',stage:'完了',amount:1820000,memo:''}
    ]));
  }catch(e){} });
  const p=await ctx.newPage(); const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto('file://'+process.cwd()+'/site/partner-leads.html',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200);
  await p.screenshot({path:'scratchpad/leads.png',fullPage:true});
  const p2=await ctx.newPage();
  await p2.goto('file://'+process.cwd()+'/site/partner-info.html#claim',{waitUntil:'domcontentloaded'}); await p2.waitForTimeout(900);
  const claim=await p2.$('#claim'); if(claim){await claim.screenshot({path:'scratchpad/claim.png'});}
  const logs=await p2.$('#logs'); if(logs){await logs.screenshot({path:'scratchpad/logs.png'});}
  console.log('errors:',errs.slice(0,3));
  await b.close();
})();
