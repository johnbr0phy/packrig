import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
  const p=await b.newPage(); await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
  await p.goto('https://johnbr0phy.github.io/packrig/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction('window.__READY_DONE === true',{timeout:40000});
  const w=(ms)=>new Promise(r=>setTimeout(r,ms)); await w(1500);
  await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1800);
  await p.evaluate(()=>document.querySelector('.pr-btn.is-primary')?.click()); await w(1500);
  await p.screenshot({path:process.argv[2]+'/LIVE-builder.png'});
  console.log('docked?', await p.evaluate(()=>{const r=document.querySelector('.panel').getBoundingClientRect();
    return `panel ${Math.round(r.left)}/${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;}));
} finally { await b.close(); }
