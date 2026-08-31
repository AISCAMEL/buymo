const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1200,height:900}});
  await p.goto('file://'+process.cwd()+'/site/index.html',{waitUntil:'networkidle'});
  for(let y=0;y<2200;y+=400){await p.evaluate(v=>window.scrollTo(0,v),y);await p.waitForTimeout(150);}
  const camp=await p.$('.campaign'); if(camp){await camp.scrollIntoViewIfNeeded();await p.waitForTimeout(600);await camp.screenshot({path:'scratchpad/f-campaign.png'});}
  // column index
  await p.goto('file://'+process.cwd()+'/site/column/index.html',{waitUntil:'networkidle'});
  for(let y=0;y<2500;y+=400){await p.evaluate(v=>window.scrollTo(0,v),y);await p.waitForTimeout(150);}
  await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(500);
  await p.screenshot({path:'scratchpad/f-column-index.png',fullPage:false});
  // one article cover
  await p.goto('file://'+process.cwd()+'/site/column/soba.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(600);
  await p.screenshot({path:'scratchpad/f-soba.png',fullPage:false});
  await b.close();console.log('done');
})();
