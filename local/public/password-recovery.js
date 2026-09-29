const normalLogin=login;
function resetPasswordPage(token,error=''){
 const root=document.getElementById('app');
 root.innerHTML=`<main class="login"><section class="login-art"><div class="brand"><span class="brand-mark">w</span><div>WIS<small>WHATSAPP WORKSPACE</small></div></div><div class="login-copy"><span class="eyebrow" style="color:#8bd6b4">RECUPERACIÓN SEGURA</span><h1>Volvé a entrar.</h1><p>Elegí una contraseña nueva para proteger tu espacio WIS.</p></div><p class="login-foot">WIS Agency · WhatsApp Workspace</p></section><section class="login-main"><div class="login-box"><span class="eyebrow muted">CAMBIO DE CONTRASEÑA</span><h2>Definí tu nueva clave</h2><p>Usá 16 caracteres o más. El enlace se usa una sola vez y vence a los 30 minutos.</p>${error?`<div class="error" role="alert">${esc(error)}</div>`:''}<form id="reset-password-form"><label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" minlength="16" maxlength="128" required autofocus></label><label style="margin-top:18px">Repetí la contraseña<input name="confirmation" type="password" autocomplete="new-password" minlength="16" maxlength="128" required></label><button class="btn primary" type="submit">Guardar contraseña</button></form><p id="reset-status" class="local-note" role="status"></p><button type="button" id="return-login" class="subtle">Volver al ingreso</button></div></section></main>`;
 document.getElementById('reset-password-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),password=form.elements.password.value,confirmation=form.elements.confirmation.value;
  if(password!==confirmation){document.getElementById('reset-status').textContent='Las contraseñas no coinciden.';return;}
  button.disabled=true;try{await api('/api/reset-password','POST',{token,new_password:password});history.replaceState(null,'',location.pathname+location.search);await login('Contraseña actualizada. Ingresá con tu nueva clave.');}
  catch(error){document.getElementById('reset-status').textContent=error.message==='invalid_reset_token'?'El enlace venció o ya se usó. Pedí uno nuevo desde “Olvidé mi contraseña”.':error.message==='weak_password'?'La contraseña debe tener al menos 16 caracteres.':error.message;button.disabled=false;}
 };
 document.getElementById('return-login').onclick=()=>{history.replaceState(null,'',location.pathname+location.search);void login();};
}

login=async function(error=''){
 const resetMatch=/^#reset\/([A-Za-z0-9_-]{40,60})$/.exec(location.hash);
 if(resetMatch){resetPasswordPage(resetMatch[1]);return;}
 await normalLogin(error);
 const form=document.getElementById('login-form');if(!form||document.getElementById('forgot-password'))return;
 const button=document.createElement('button');button.id='forgot-password';button.type='button';button.className='btn';button.textContent='Olvidé mi contraseña';button.setAttribute('aria-label','Enviar enlace para recuperar la contraseña');button.style.cssText='display:block;width:100%;min-height:48px;margin:14px auto 0;border:1px solid #08775e;border-radius:12px;background:#e9f7f1;color:#07513f;font-size:15px;font-weight:700;cursor:pointer';
 const status=document.createElement('p');status.id='forgot-password-status';status.className='local-note';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='min-height:36px;margin-top:12px;text-align:center';
 form.after(button,status);
 button.onclick=async()=>{button.disabled=true;status.textContent='Enviando el enlace a tu correo de recuperación…';try{await api('/api/forgot-password','POST',{});status.textContent='Solicitud aceptada. Revisá Recibidos y Spam; el enlace llega por correo y vence en 30 minutos.';}catch(failure){status.textContent=failure.message==='recovery_unavailable'?'No se pudo enviar el correo. Revisaremos la configuración del servicio.':failure.message==='recovery_rate_limited'?'Ya se pidieron varios enlaces. Revisá Recibidos y Spam; si no llegó, esperá 15 minutos para volver a intentarlo.':'No se pudo enviar el enlace. Probá nuevamente más tarde.';}finally{button.disabled=false;}};
};

window.addEventListener('hashchange',()=>{
 const match=/^#reset\/([A-Za-z0-9_-]{40,60})$/.exec(location.hash);
 if(match&&!document.getElementById('content'))resetPasswordPage(match[1]);
});
