// The six-digit code step for Nmesis staff (Supabase TOTP, AAL2). Staff use the
// same Supabase user, and the same factor, as in the Nmesis admin. Pure helpers,
// no imports, so tests load them directly.
export const CODE=/^\d{6}$/;
export const cleanCode=(value:unknown)=>{const v=typeof value==='string'?value.replace(/\s+/g,''):'';return CODE.test(v)?v:''};
// Supabase returns the enrolment QR code as raw SVG markup (older versions as a
// "data:image/svg+xml;utf-8,<svg…" string). Either way it becomes a properly
// encoded data URL an <img> can show; anything else is dropped (the person can
// still type the key instead).
export function qrImageSrc(raw:unknown):string|null{
 if(typeof raw!=='string'||raw.length>200_000)return null;
 let svg=raw.trim();
 const data=/^data:image\/svg\+xml(;[^,]*)?,/i.exec(svg);
 if(data){svg=svg.slice(data[0].length);if(/%[0-9a-f]{2}/i.test(svg)){try{svg=decodeURIComponent(svg)}catch{return null}}}
 if(!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg))return null;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
// The TOTP secret, grouped in fours so it can be typed into an app by hand.
export const groupedSecret=(secret:unknown)=>typeof secret==='string'&&/^[A-Z2-7]{16,128}=*$/i.test(secret)?secret.toUpperCase().replace(/=+$/,'').match(/.{1,4}/g)!.join(' '):'';
type Factor={id:string;factor_type?:string;status?:string};
// The verified TOTP factor to challenge, or (during enrolment) the one just made.
export function pickFactor(factors:Factor[]|undefined,wanted?:unknown):Factor|null{
 const totp=(factors||[]).filter(f=>f.factor_type==='totp');
 if(typeof wanted==='string'&&wanted)return totp.find(f=>f.id===wanted)||null;
 return totp.find(f=>f.status==='verified')||null;
}
