// Signature de développement entièrement locale via Web Crypto.
const enc = new TextEncoder();
const bytes=(...lists)=>{let b=new Uint8Array(lists.reduce((n,a)=>n+a.length,0)),i=0;for(const a of lists){b.set(a,i);i+=a.length;}return b;};
const len=n=>n<128?new Uint8Array([n]):(()=>{let a=[];while(n){a.unshift(n&255);n>>>=8;}return new Uint8Array([128|a.length,...a]);})();
const tlv=(tag,b)=>bytes(new Uint8Array([tag]),len(b.length),b);
const seq=(...a)=>tlv(48,bytes(...a));
const set=(...a)=>tlv(49,bytes(...a));
const oid=a=>{let b=[a[0]*40+a[1]];for(let n of a.slice(2)){let p=[n&127];n>>>=7;while(n){p.unshift((n&127)|128);n>>>=7;}b.push(...p);}return tlv(6,new Uint8Array(b));};
const utf8=s=>tlv(12,enc.encode(s));
const utc=t=>tlv(23,enc.encode(t.toISOString().slice(2,4)+t.toISOString().slice(5,7)+t.toISOString().slice(8,10)+t.toISOString().slice(11,13)+t.toISOString().slice(14,16)+t.toISOString().slice(17,19)+'Z'));
const rawInt=n=>tlv(2,new Uint8Array([n]));
const bit=b=>tlv(3,bytes(new Uint8Array([0]),b));
const alg=()=>seq(oid([1,2,840,113549,1,1,11]),new Uint8Array([5,0]));
const dn=s=>seq(set(seq(oid([2,5,4,3]),utf8(s))));
export const to64=raw=>{let s='';for(let i=0;i<raw.length;i+=16384)s+=String.fromCharCode(...raw.subarray(i,i+16384));return btoa(s);};
export const from64=str=>{let s=atob(str.replace(/\s/g,'')),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;};
const pem=(tag,raw)=>{let s=to64(raw);return '-----BEGIN '+tag+'-----\n'+s.match(/.{1,64}/g).join('\n')+'\n-----END '+tag+'-----\n';};
export async function developmentPem(){
 if(!globalThis.crypto?.subtle)throw Error('HTTPS ou localhost requis pour la signature Web Crypto.');
 const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const privateDer=new Uint8Array(await crypto.subtle.exportKey('pkcs8',key.privateKey));
 const publicDer=new Uint8Array(await crypto.subtle.exportKey('spki',key.publicKey));
 const now=new Date(),until=new Date(now.getTime()+365*86400000);
 const serial=crypto.getRandomValues(new Uint8Array(16));serial[0]&=127;
 const tbs=seq(tlv(0xa0,rawInt(2)),tlv(2,serial),alg(),dn('APK Forge Browser'),seq(utc(now),utc(until)),dn('APK Forge Browser'),publicDer);
 const signature=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,tbs));
 return pem('CERTIFICATE',seq(tbs,alg(),bit(signature)))+pem('PRIVATE KEY',privateDer);
}
