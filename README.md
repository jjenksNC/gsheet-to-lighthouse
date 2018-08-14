# gsheet-to-lighthouse
To do batch audits from Google Sheet with Lighthouse and put all scores in Firestore. Also the screenshot of the web in Firebase Storage. You can modify the database and storage by modify the Tester module

Setup:
1. Install all depedencies `npm install`
2. Setup a Firebase project and use the [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup). 
3. Download the service account credentials to your project directory to connect with Firebase. Follow the instruction in Firebase Admin SDK setup and save the credentials as `service-account.json`.
4. Setup [Google API Node SDK](https://developers.google.com/sheets/api/quickstart/nodejs). 
5. You will need a `CLIENT_ID`, `CLIENT_SECRET` and `REDIRECT_URL`. You can find these pieces of information by going to the [Google Developer Console](https://console.developer.google.com/), clicking your project --> APIs & auth --> credentials. Save it as `credentials.json` in your project directory.
6. Don't forget to edit the `spreadsheetID` in `index.js` to your Google Sheet document. The Google Sheet document only has 2 columns like belows:
```
------------------------------------------------
|         Url            |      Category       |
------------------------------------------------
| https://xxx.com        | media               |
------------------------------------------------
| https://xxx.com        | media               |
------------------------------------------------
```
7. Run the script `node index.js`
8. You need to manually copy paste the authorization URL to browser to allow access to your Google Sheet.
9. Check the result in your Firestore Database
