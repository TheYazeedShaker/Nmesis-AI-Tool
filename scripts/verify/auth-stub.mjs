// Stand-in for '@/lib/studio-context', used only by scripts/verify (see hooks.mjs):
// every request is the same synthetic, signed-in owner of one synthetic company on
// no plan yet (legacy: everything allowed). Ids are random-looking but fixed.
export const ORG_COOKIE='studio_org';
export const USER={id:'00000000-0000-4000-8000-0000000000a1',email:'owner@example.test',appMetadata:{nmesis_password_set:true}};
export const ORG={id:'00000000-0000-4000-8000-00000000000a',name:'Demo Company',kind:'client'};
const entitlements={legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}};
export async function sessionUser(){return USER}
export async function getStudioContext(){return {ok:true,ctx:{user:{id:USER.id,email:USER.email},org:ORG,role:'owner',entitlements,staff:null,viewingAs:false,orgs:[{id:ORG.id,name:ORG.name}]}}}
