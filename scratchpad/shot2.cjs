const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1200,height:900}});
  // genre prius
  await p.goto('file://'+process.cwd()+'/site/genre/prius/index.html',{waitUntil:'networkidle'});
  for(let y=0;y<3000;y+=500){await p.evaluate(v=>window.scrollTo(0,v),y);await p.waitForTimeout(100);}
  const g=await p.$('.results'); if(g){await g.scrollIntoViewIfNeeded();await p.waitForTimeout(400);await g.screenshot({path:'scratchpad/g-prius.png'});}
  // top results slider
  await p.goto('file://'+process.cwd()+'/site/index.html',{waitUntil:'networkidle'});
  for(let y=0;y<7000;y+=600){await p.evaluate(v=>window.scrollTo(0,v),y);await p.waitForTimeout(120);}
  const r=await p.$('.results'); if(r){await r.scrollIntoViewIfNeeded();await p.waitForTimeout(500);await r.screenshot({path:'scratchpad/top-results.png'});}
  await b.close();console.log('done');
})();
