// Start the local UI with the supplied dev env and explicit local addresses.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const state=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const clientDir=fileURLToPath(new URL('../../../../../client_v2/',import.meta.url));
const {createServer,loadEnv}=await import(pathToFileURL(path.join(clientDir,'node_modules/vite/dist/node/index.js')));
for(const [key,value] of Object.entries(loadEnv('development',state.frontendEnvDir,''))) {
 if(key.startsWith('VITE_') || key==='ADMIN_STORAGE_UI_ENABLED') process.env[key]=value;
}
Object.assign(process.env,{
 VITE_BACKEND:'http://127.0.0.1:5099/api/v2',VITE_XRAY_ENABLED:'true',
 VITE_FRONTEND:'http://127.0.0.1:5173',VITE_AMEMBER_LOGIN_URL:'/admin-login',
 VITE_SERVER_HOST:'127.0.0.1',VITE_SERVER_PORT:'5173',
});
const server=await createServer({root:clientDir,server:{host:'127.0.0.1',port:5173,strictPort:true},clearScreen:false});
await server.listen();
console.info('[XRAY TEST] supplied dev frontend env loaded; local backend :5099; local UI :5173');
server.printUrls();
