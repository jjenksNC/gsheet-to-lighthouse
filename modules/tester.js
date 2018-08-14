
const fs = require('fs');
const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const _BUCKET='pwaid-screenshots';
const util = require('util');
const request = require('request');

const _STATUS={
    ADDED:0,
    TESTING:1,
    TESTED:2,
    ERROR:9
};



module.exports = class Tester {
    constructor(serviceAccount){
        const admin = require('firebase-admin');
        this.FieldValue = require('firebase-admin').firestore.FieldValue;
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "pwaid-dir.appspot.com",
            databaseURL: 'https://pwaid-dir.firebaseio.com'
        });
        this.bucket=admin.storage().bucket(`${_BUCKET}`);
        this.db= admin.firestore();
        const width=412;
        const height=732;
        this._opts = {
            chromeFlags: ['--headless',`--window-size=${width},${height}`,'--disable-gpu'],
            output: 'json'
          };
        this._browser=null;
        this._chrome=null;
        
    }
   
    async getChrome(){
        if(this._chrome===null){
            this._chrome = await chromeLauncher.launch({chromeFlags: this._opts.chromeFlags});
        }   
        return Promise.resolve(this._chrome);
    }

    async getBrowser(){
        if(this._browser===null){
            const chrome=await this.getChrome();
            this._opts.port = chrome.port;
            this._opts.chromeFlags.port=chrome.port;
            // Connect to it using puppeteer.connect().
            const resp = await util.promisify(request)(`http://localhost:${this._opts.port}/json/version`);
            const {webSocketDebuggerUrl} = JSON.parse(resp.body);
            this._browser = await puppeteer.connect({browserWSEndpoint: webSocketDebuggerUrl,headless: true});
        }
        return Promise.resolve(this._browser);
    }

    async parseSite(url,websiteRef) {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
       
        try {
             //sum the resources weight
            let pageStats={};
            //calculates resources request
            page.on('response', async resp=>{
                //checking the resource type
                const resource=await resp.buffer();
                const resourceType=resp.request().resourceType();
                if(!pageStats.hasOwnProperty(resourceType)){
                    Object.defineProperty(pageStats, resourceType, {
                        value: {
                            weight:0,
                            requests:0
                        }
                      });
                }
    
                pageStats[resourceType].weight=+resource.length;
                pageStats[resourceType].requests++;
            });
            console.log('Opening the page...');
            await page.setViewport({
                width:411,
                height:731,
                isMobile:true,
                hasTouch:true
            });
            await page.goto(url,{waitUntil:'networkidle2'});
            //take screenshot
            try {
                const screenshot=await this.takeScreenshot(page,url);
                //update website data with screeenshot path
                await websiteRef.update({
                    screenshot:{
                        bucket:_BUCKET,
                        name:screenshot.name
                    }
                });
                page.close();
                return  Promise.resolve(websiteRef);
            } catch (error) {
                console.log('Can\'t take screenshot from website.');
                Promise.reject(error);
            } 
        } catch (error) {
            console.log('Can\'t open the page. Skip it..');
            Promise.reject(error);
        }       
    }

    async stopBrowser(){
        const browser=await this.getBrowser();
        await browser.disconnect();
        await this.chrome.kill();
        Promise.resolve(true);
    }
    async takeScreenshot(page,url){
        const host=this.getHostName(url);
        const path=`/tmp/${host}.png`;
        console.log(`Saving temp screenshot at ${path}`);
        await page.screenshot({path: path});
        const uploaded= await this.bucket.upload(path,{
            public:true
        });
   
        try {
            fs.unlinkSync(path);
            console.log(`save screenshot on ${uploaded[0].bucket.name}/${uploaded[0].name}`);
            return Promise.resolve(uploaded[0]);
        } catch (error) {
            console.log(`Can't update the website data with uploaded file`);
            return Promise.reject(error);
        }
    }

    async runLighthouse(url,config) {
        try {
            const chrome=await this.getChrome();
            const result=await lighthouse(url, {port:chrome.port}, config);
            delete result.artifacts;
            return Promise.resolve(result);
        } catch (error) {
            console.log('Error on Lighthouse testing.');
            return Promise.reject(error);
        }
        
    }

    getHostName(url){
        const match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
        if (match != null && match.length > 2 && typeof match[2] === 'string' && match[2].length > 0) {
            return match[2];
        }
        else {
            return null;
        }
    }

    async addToDatabase (url,category){
        console.log('add website '+url+' to database...');
        const host=this.getHostName(url);
        return this.db.collection('websites').doc(host.replace('.','-')).get().then(website => {
            if (!website.exists) {
                console.log('No such document!');
                return website.ref.set({
                    host:host,
                    category:category,
                    url:url,
                    status:_STATUS.ADDED,
                    latest_test:null,
                    score:0,
                    addedOn:this.FieldValue.serverTimestamp()
                }).then(()=>{
                    return website.ref;
                });
            } else {
                console.log('Website updated!');
                return website.ref;
            }
        }).catch(err => {
            console.log('Error getting website from Firestore', err);
            return Promise.reject(err);
        });
    }

    async testWebsite(url,category){
        try {
            const websiteRef= await this.addToDatabase(url,category);
            //tell browser we save the url and will update the result later
            if(websiteRef!==null){
                console.log(`Website ${url} added.`);
                try {
                    await this.parseSite(url,websiteRef);
                } catch (error) {
                    console.log('Can\'t parse website');
                    return Promise.reject(error);
                }
               
                //update status to on testing
                await websiteRef.update({status:_STATUS.TESTING});
                
                try {
                    console.log('Testing with Lighthouse...')
                    let result=  await this.runLighthouse(url);
                   
                    let report={
                        lighthouseVersion:result.lighthouseVersion,
                        score:result.score,
                        testedOn:this.FieldValue.serverTimestamp(),
                    };
            
                    result.reportCategories.forEach(element => {
                        report[element.id]={
                            score:element.score
                        };
                    
                        let audits={};
                        element.audits.forEach(audit => {
                            audits[audit.id]=audit.result.rawValue;
                        });
                        report[element.id].audits=audits;
                    });
                    try {
                        websiteRef.update({
                            score:result.score,
                            category:category,
                            testedOn:this.FieldValue.serverTimestamp(),
                            latest_test:report,
                            status:_STATUS.TESTED
                        });
                    } catch (error) {
                        console.log('Error on update report',error.stack);
                        Promise.reject(error);
                    }
                    
                    //add test result to tests collection
                    return websiteRef.collection('tests').add(report).then(testRef=>{
                        console.log('Website tested, result added to test collection!');
                        return testRef;
                    });
                } catch (error) {
                    console.log(`Can\'t test the website.`,error.stack);
                    return Promise.reject(error);
                }
            } else {
                console.log('Can\'t process a website now. Try again later.');
                return Promise.reject('Can\'t process a website now. Try again later.');
                
            }
        } catch (error) {
            console.log('Can\'t add website. Error: '+error);
            return Promise.reject(error);
        }
        
      }
}