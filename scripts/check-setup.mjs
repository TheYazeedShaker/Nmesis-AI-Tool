const required=['NEXTAUTH_URL','NEXTAUTH_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','STUDIO_ALLOWED_EMAILS','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','KEY_ENCRYPTION_SECRET'];
const missing=required.filter(k=>!process.env[k]?.trim());
for(const key of required)console.log(key+': '+(missing.includes(key)?'MISSING':'set'));
const issues=[];
for(const key of ['NEXTAUTH_SECRET','KEY_ENCRYPTION_SECRET'])if(process.env[key]&&process.env[key].length<32)issues.push(key+' must be at least 32 characters.');
if(process.env.NEXTAUTH_SECRET&&process.env.NEXTAUTH_SECRET===process.env.KEY_ENCRYPTION_SECRET)issues.push('Use different values for the two secrets.');
if(process.env.NEXTAUTH_URL){try{const u=new URL(process.env.NEXTAUTH_URL);if(u.protocol!=='https:'&&u.hostname!=='localhost')issues.push('Use HTTPS for the hosted studio.')}catch{issues.push('NEXTAUTH_URL must be a valid URL.')}}
if(missing.length||issues.length){console.error(issues.join('\n'));console.error('Complete .env.local or the matching Vercel environment settings.');process.exitCode=1}else console.log('Configuration fields are present. This checks names and basic format, not live credentials.');
