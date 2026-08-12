import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); await p.setViewport({width:1440,height:900});
 await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:40000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1500);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1800);
 console.log(await p.evaluate(()=>{
   const EMBER=/255,\s*10[0-9],\s*4[0-9]|#FF6A2B/i;
   const out=[];
   const scan=(n,pseudo)=>{
     const c=getComputedStyle(n,pseudo||null);
     const props=['backgroundColor','backgroundImage','borderTopColor','borderBottomColor',
                  'borderLeftColor','borderRightColor','color','outlineColor','boxShadow'];
     const hits=props.filter(k=>EMBER.test(c[k]||''));
     if(!hits.length) return;
     // ignore borders whose width is 0 — a colour on a zero-width border paints nothing
     const live=hits.filter(k=>{
       if(k==='borderTopColor') return parseFloat(c.borderTopWidth)>0;
       if(k==='borderBottomColor') return parseFloat(c.borderBottomWidth)>0;
       if(k==='borderLeftColor') return parseFloat(c.borderLeftWidth)>0;
       if(k==='borderRightColor') return parseFloat(c.borderRightWidth)>0;
       return true;});
     if(!live.length) return;
     const r=n.getBoundingClientRect();
     out.push(`${n.tagName.toLowerCase()}.${[...n.classList].join('.')}${pseudo||''}  `
       +`${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}  `
       +live.map(k=>k+'='+c[k]).join(' '));
   };
   for(const n of document.querySelectorAll('*')){ scan(n); scan(n,'::before'); scan(n,'::after'); }
   return out.join('\n') || '(none)';
 }));
} finally { await b.close(); }
