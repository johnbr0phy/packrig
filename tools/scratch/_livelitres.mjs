import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); await p.setViewport({width:1440,height:900});
 await p.goto('https://johnbr0phy.github.io/packrig/',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:45000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1600);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1800);
 console.log('menu figures :', await p.evaluate(()=>[...document.querySelectorAll('.pr-fig-v,.pr-fig-k')].map(n=>n.textContent).join(' ')));
 console.log('grade line   :', await p.evaluate(()=>document.querySelector('.pr-grade')?.textContent||'ABSENT'));
 await p.evaluate(()=>document.querySelector('.pr-btn.is-primary')?.click()); await w(1500);
 console.log('kit litres   :', await p.evaluate(()=>[...document.querySelectorAll('.bag-liters')].slice(0,4).map(n=>n.textContent).join('  ')));
} finally { await b.close(); }
