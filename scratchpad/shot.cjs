const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});
  await p.goto('file://'+process.cwd()+'/site/index.html',{waitUntil:'networkidle'});
  // scroll to trigger lazy + reveal
  for(let y=0;y<6000;y+=600){await p.evaluate(v=>window.scrollTo(0,v),y);await p.waitForTimeout(120);}
  await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(400);
  await p.screenshot({path:'scratchpad/b-hero.png',clip:{x:0,y:0,width:1200,height:900}});
  // campaign band + features: scroll to campaign
  const camp=await p.$('.campaign'); if(camp){await camp.scrollIntoViewIfNeeded();await p.waitForTimeout(300);await camp.screenshot({path:'scratchpad/b-campaign.png'});}
  const feat=await p.$('.feature-grid'); if(feat){await feat.scrollIntoViewIfNeeded();await p.waitForTimeout(300);await feat.screenshot({path:'scratchpad/b-features.png'});}
  const reas=await p.$('.reason-grid'); if(reas){await reas.scrollIntoViewIfNeeded();await p.waitForTimeout(300);await reas.screenshot({path:'scratchpad/b-reasons.png'});}
  await b.close();console.log('done');
})();
