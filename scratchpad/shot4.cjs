const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1200,height:900}});
  await p.goto('file://'+process.cwd()+'/site/index.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(300);
  await p.screenshot({path:'scratchpad/c-nav.png',clip:{x:0,y:0,width:1200,height:80}});
  for(let y=0;y<9000;y+=600){await p.evaluate(v=>window.scrollTo(0,v),y);await p.waitForTimeout(130);}
  const c=await p.$('.columns-top'); if(c){await c.scrollIntoViewIfNeeded();await p.waitForTimeout(700);await c.screenshot({path:'scratchpad/c-section.png'});}
  await b.close();console.log('done');
})();
