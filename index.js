const Tester = require("./modules/tester");
const {google} = require('googleapis');
const sheets = google.sheets('v4');
const Authentication = require("./authentication");
const nconf = require('nconf');
const path = require('path');
const spreadsheetId='1eHBAB_M3gVhmV_4ba2npHz6ePq0z6QmQQEy0EzA_gvE';
const serviceAccount=require('./service-account.json');


  nconf.argv().env().file(path.join(__dirname, '/credentials.json'));
  const keys = nconf.get('web');
  const CLIENT_ID = keys.client_id;
  const CLIENT_SECRET = keys.client_secret;
  const REDIRECT_URL = keys.redirect_uris[0];
  const auth=new Authentication(CLIENT_ID,CLIENT_SECRET,REDIRECT_URL,'https://www.googleapis.com/auth/spreadsheets');

  const webTester=new Tester(serviceAccount);
  const testWebsites = async (websites)=>{
    console.log(`Websites to test: ${websites.length}`);
    if(websites.length>0){
      const website=websites.shift(),
            url=website[0],
            category=website[1];
      
      try {
        const result= await webTester.testWebsite(url,category);
      } catch (error) {
        console.log(`Can\'t test ${url}. Skip it.`,error.stack);
      }
      testWebsites(websites);
    } else {
      await webTester.stopBrowser();
    }
    
    
  }

  const processWebsite =  (auth) =>  {
    let sheets = google.sheets('v4');
    return sheets.spreadsheets.values.get({
      auth: auth,
      spreadsheetId: spreadsheetId,
      range: 'Sheet1!A2:B52', //Change Sheet1 if your worksheet's name is something else
      
    }, (err, response) => {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      } else {
          console.log('Got the data, testing the websites now...');
          testWebsites(response.data.values);
      }
    });
  }


  auth.authorize((auth)=>{
      processWebsite(auth);    
    });

  