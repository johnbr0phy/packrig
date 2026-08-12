import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); await p.setViewport({width:1440,height:900});
 await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:40000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1500);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1800);
 console.log(await p.evaluate(()=>{
   const out=[];
   for(const x of [80, 400, 900, 1380]){
     const el=document.elementFromPoint(x,65);
     out.push(`x=${x} -> ${el ? el.tagName.toLowerCase()+'.'+[...el.classList].join('.') : 'null'}`);
   }
   // every element whose border-bottom is a live ember line
   for(const n of document.querySelectorAll('*')){
     const c=getComputedStyle(n);
     for(const [side,wprop] of [['Top','borderTopWidth'],['Bottom','borderBottomWidth']]){
       const col=c['border'+side+'Color'], wd=parseFloat(c[wprop]);
       if(wd>0 && /255,\s*106,\s*43/.test(col)){
         const r=n.getBoundingClientRect();
         out.push(`LIVE BORDER ${side} ${n.tagName.toLowerCase()}.${[...n.classList].join('.')} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)} ${wd}px`);
       }
     }
     const os=c.outlineStyle, ow=parseFloat(c.outlineWidth);
     if(os!=='none' && ow>0 && /255,\s*106,\s*43/.test(c.outlineColor)){
       const r=n.getBoundingClientRect();
       out.push(`LIVE OUTLINE ${n.tagName.toLowerCase()}.${[...n.classList].join('.')} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)} ${ow}px ${os}`);
     }
   }
   return out.join('\n');
 }));
} finally { await b.close(); }
