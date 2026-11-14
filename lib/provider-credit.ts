// A provider account with no credit (or no billing) left. Connecting a key only
// lists models, which is free, so the first sign is a refused generation. That
// refusal is final: the job fails at once with one plain sentence, nothing is
// left running, and no Studio budget stays reserved for it. Pure, no imports.
export type CreditProvider='openai'|'google'|'higgsfield'|'topaz';
const NAMES:Record<CreditProvider,{account:string;where:string}>={
 openai:{account:'OpenAI',where:'at OpenAI'},
 google:{account:'Google AI Studio',where:'or turn on billing in Google AI Studio'},
 higgsfield:{account:'Higgsfield',where:'in your Higgsfield developer account'},
 topaz:{account:'Topaz',where:'in your Topaz account'},
};
export const noCreditMessage=(provider:CreditProvider)=>`Your ${NAMES[provider].account} account has no credit left. Add credit ${NAMES[provider].where}, then try again. Nothing was charged here.`;
// The answer the Studio gives its own browser for this case.
export const NO_CREDIT_STATUS=402;
// Each provider's own billing codes (error.code, error.type or error.status).
const CODES:Record<CreditProvider,RegExp>={
 openai:/^(insufficient_quota|billing_hard_limit_reached|billing_not_active|billing_limit_user_error|account_deactivated_billing)$/i,
 google:/^(billing_disabled|billing_not_enabled|prepayment_credits_depleted|insufficient_credits)$/i,
 higgsfield:/^(insufficient_credits|not_enough_credits|insufficient_balance|insufficient_funds|payment_required|no_credits)$/i,
 topaz:/^(insufficient_credits|not_enough_credits|insufficient_balance|payment_required|no_credits)$/i,
};
// Words that only appear in billing refusals, not in a plain rate limit. Google's
// per-minute "You exceeded your current quota, please check your plan and billing
// details" mentions billing too, so Google needs its specific phrases.
const MONEY=/\b(billing|credits?|prepay(ment)?|balance|insufficient[_ ]quota|payment required|top up|out of funds)\b/i;
const WORDS:Record<CreditProvider,RegExp>={
 openai:MONEY,
 google:/prepayment credits|credits (are|have been) (depleted|exhausted)|billing (is )?not (enabled|active)|enable billing|no billing account|billing account .*(disabled|closed)/i,
 higgsfield:MONEY,
 topaz:MONEY,
};
export type ProviderAnswer={status:number;code?:unknown;type?:unknown;reason?:unknown;message?:unknown};
export function outOfCredit(provider:CreditProvider,answer:ProviderAnswer):boolean{
 const {status}=answer,tags=[answer.code,answer.type,answer.reason].filter((v):v is string=>typeof v==='string');
 if(tags.some(t=>CODES[provider].test(t)))return [400,402,403,429].includes(status);
 if(status===402)return true;
 // A 429 is a rate limit unless the provider says it is about money (a plain
 // per-minute "quota exceeded" names no billing words); a 403 or 400 is a
 // permission or request problem unless it names billing.
 const said=typeof answer.message==='string'?answer.message:'';
 return [400,403,429].includes(status)&&WORDS[provider].test(said);
}
// Read code/type/message from the common JSON error shapes:
// {error:{code,type,message,status}}, {code,message}, {detail:"..."}.
export function readProviderError(body:unknown):{code?:string;type?:string;reason?:string;message?:string}{
 const text=(v:unknown)=>typeof v==='string'&&v.length<=2000?v:undefined;
 const o=body&&typeof body==='object'?body as Record<string,unknown>:{};
 const e=o.error&&typeof o.error==='object'?o.error as Record<string,unknown>:o;
 const details=Array.isArray(e.details)?e.details as Record<string,unknown>[]:[];
 const reason=details.map(d=>text(d?.reason)).find(Boolean);
 return {code:text(e.code),type:text(e.type)??text(e.status),reason,message:text(e.message)??text(o.detail)??text(o.message)};
}
