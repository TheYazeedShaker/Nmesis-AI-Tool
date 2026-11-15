import {AsyncLocalStorage} from 'node:async_hooks';
import {plainProviderText} from './provider-words';
import {featureOn,type Entitlements} from './accounts/plan';
import {setClientTextRewrite} from './client-text';
// Whether this request's person may read provider and model names (owner's
// decision F-050): Nmesis staff, and companies whose plan includes their own
// keys. Set once per API request by context() (lib/studio-server.ts) and read
// wherever a provider's words could reach the page: errors (fail()), job errors
// and recovery messages (the public row mappers), diagnostics.
const scope=new AsyncLocalStorage<{names:boolean}>();
export const providerNamesVisible=(ctx:{staff:unknown;entitlements:Entitlements})=>!!ctx.staff||featureOn(ctx.entitlements,'studio.own_keys');
export function enterProviderScope(names:boolean){scope.enterWith({names})}
// A message as this person may read it. Outside a request (scripts, tests that
// call a library directly) the text is left as it is.
export function forClient<T extends string|null|undefined>(text:T):T{
 if(!text)return text;
 const store=scope.getStore();
 if(!store||store.names)return text;
 const plain=plainProviderText(text);
 if(plain!==text)console.info('Provider message shown in plain words',JSON.stringify({original:text.slice(0,300)}));
 return plain as T;
}
setClientTextRewrite(forClient);
