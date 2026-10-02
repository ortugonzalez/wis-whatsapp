import {validRecoveryEmail} from './password-recovery.mjs';

const KEY='workspace_profile';
const validName=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=80&&!/[\x00-\x1f\x7f]/.test(value);
export function expectedLineSuffix(environment=process.env){
 const value=environment.WIS_EXPECTED_PHONE_SUFFIX??'5679';
 if(typeof value!=='string'||!/^\d{4}$/.test(value))throw Error('invalid_expected_phone_suffix');
 return value;
}
export function workspaceProfile(database,environment=process.env){
 let saved={};try{saved=JSON.parse(database.prepare('SELECT value FROM settings WHERE key=?').get(KEY)?.value??'{}')??{};}catch{}
 const fallback=validName(environment.WIS_WORKSPACE_NAME)?environment.WIS_WORKSPACE_NAME.trim():'WIS';
 return {name:validName(saved.name)?saved.name.trim():fallback,connection_name:validName(saved.connection_name)?saved.connection_name.trim():'WhatsApp principal',support_email:validRecoveryEmail(saved.support_email)?saved.support_email:'',expected_phone_suffix:expectedLineSuffix(environment),model:'dedicated_instance',max_connections:1,member_management:false,self_service_billing:false};
}
export function updateWorkspaceProfile(database,body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['name','connection_name','support_email'].includes(key))||!validName(body.name)||!validName(body.connection_name)||typeof body.support_email!=='string'||body.support_email!==''&&!validRecoveryEmail(body.support_email))throw Object.assign(Error('invalid_workspace_profile'),{status:400});
 const profile={name:body.name.trim(),connection_name:body.connection_name.trim(),support_email:body.support_email.trim()};
 database.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(KEY,JSON.stringify(profile));
}
export function workspaceStatus(database,{environment=process.env,recoveryAvailable=false,now=Date.now()}={}){
 const c=database.prepare("SELECT status,phone,expected_phone_e164,lease_expires_at FROM connections WHERE id='wis-5679'").get();
 const identity=Boolean(c?.phone&&c.expected_phone_e164&&c.phone.replace(/\D/g,'')===c.expected_phone_e164.replace(/\D/g,''));
 return {profile:workspaceProfile(database,environment),checks:{identity_verified:identity,connected:c?.status==='connected'&&identity,worker_live:Boolean(c?.lease_expires_at&&Date.parse(c.lease_expires_at)>now),password_recovery_configured:recoveryAvailable,active_api_tokens:database.prepare('SELECT count(*) AS n FROM tokens WHERE revoked_at IS NULL').get().n},commercial_status:'managed_beta',limitations:['one_administrator','one_connection','no_automatic_billing','whapi_partial'],observed_at:new Date(now).toISOString()};
}
