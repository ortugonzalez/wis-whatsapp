import nodemailer from 'nodemailer';

const emailPattern=/^[^\s@<>]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,63}$/;

export function validRecoveryEmail(value){
 return typeof value==='string'&&value.length<=254&&emailPattern.test(value.trim());
}

export function createPasswordRecoverySender(environment=process.env){
 const recoveryEmail=String(environment.WIS_ADMIN_RECOVERY_EMAIL??'').trim();
 const gmailDefaults=recoveryEmail.toLowerCase().endsWith('@gmail.com');
 const host=String(environment.WIS_SMTP_HOST??(gmailDefaults?'smtp.gmail.com':'')).trim();
 const port=Number(environment.WIS_SMTP_PORT??(gmailDefaults?'465':0));
 const user=String(environment.WIS_SMTP_USER??recoveryEmail).trim();
 const password=environment.WIS_SMTP_PASS;
 const from=String(environment.WIS_SMTP_FROM??recoveryEmail).trim();
 if(!host||!Number.isInteger(port)||![465,587].includes(port)||!user||typeof password!=='string'||!password||!validRecoveryEmail(from))return null;
 const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port===587,auth:{user,pass:password},tls:{minVersion:'TLSv1.2'},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
 return async({to,url})=>{
  if(!validRecoveryEmail(to)||typeof url!=='string'||!/^https:\/\//.test(url))throw Error('invalid_recovery_message');
  try{return await transport.sendMail({from,to,subject:'Recuperar acceso a WIS WhatsApp',text:`Recibimos una solicitud para cambiar la contraseña de WIS WhatsApp. Abrí este enlace para elegir una contraseña nueva (vence en 30 minutos):\n\n${url}\n\nSi no hiciste esta solicitud, ignorá este correo.`,html:`<p>Recibimos una solicitud para cambiar la contraseña de WIS WhatsApp.</p><p><a href="${url}">Elegir una contraseña nueva</a></p><p>El enlace vence en 30 minutos. Si no hiciste esta solicitud, ignorá este correo.</p>`});}
  finally{transport.close();}
 };
}
