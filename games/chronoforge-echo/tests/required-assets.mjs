import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname;
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage();
const report={method:'Deliberately fail one required source request in an isolated production browser context; assert a visible failure and no false readiness. No project files are removed.',expectedNetworkFailures:[],errors:[]};
page.on('requestfailed',r=>report.expectedNetworkFailures.push(r.url()));page.on('pageerror',e=>report.errors.push(String(e)));
try{
 await page.route('**/assets/kaida-showcase-source.png',r=>r.abort('failed'));
 await page.goto('http://127.0.0.1:4322/');await page.locator('.fatal').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>window.__ECHO_READY__),false);assert.ok((await page.locator('.fatal').innerText()).includes('kaida-showcase-source.png'));
 await page.screenshot({path:base+'evidence/required-asset-visible-failure.png'});report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}
finally{await fs.writeFile(base+'evidence/required-assets.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
