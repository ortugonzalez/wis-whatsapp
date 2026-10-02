const booleanFields = Object.freeze({
  timeFormat:'isTwentyFourHourFormatEnabled',
  privacySettingRelayAllCalls:'isEnabled',
  disableLinkPreviews:'isPreviewsDisabled',
  channelsPersonalisedRecommendation:'isUserOptedOut'
});

export function normalizeAccountSetting(input, observedAt = new Date().toISOString()) {
  if (!input || typeof input.setting !== 'string') return null;
  const setting=input.setting;
  let value;
  if (setting==='locale') {
    if (typeof input.value!=='string'||!/^[a-zA-Z]{2,8}(?:[-_][a-zA-Z0-9]{1,8}){0,3}$/.test(input.value)) return null;
    value=input.value;
  } else if(setting==='unarchiveChats') {
    if(typeof input.value!=='boolean')return null;
    value=input.value;
  } else if(Object.hasOwn(booleanFields,setting)) {
    const field=booleanFields[setting];
    if(!input.value||!Object.hasOwn(input.value,field)||typeof input.value[field]!=='boolean')return null;
    value=input.value[field];
  } else return null;
  return {setting,value,observed_at:observedAt,source:'baileys_passive_setting',scope:'last_received_value'};
}

export function attachAccountSettings(emitter,{guarded,snapshot}) {
  const record=input=>{const data=normalizeAccountSetting(input);if(data)snapshot('account_setting',data.setting,data);};
  emitter.on('settings.update',guarded(record));
  emitter.on('creds.update',guarded(value=>{
    // Extract this explicit field only. Never serialize the credentials object.
    if(value?.accountSettings&&Object.hasOwn(value.accountSettings,'unarchiveChats'))record({setting:'unarchiveChats',value:value.accountSettings.unarchiveChats});
  }));
}
