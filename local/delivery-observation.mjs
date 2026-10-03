const labels = Object.freeze({2:'sent',3:'delivered',4:'read',5:'played'});

function canonicalEvent(item) {
  if(item?.source!=='baileys.messages.update'||!Number.isInteger(item.raw_status_code)||!Object.hasOwn(labels,item.raw_status_code)||item.interpreted_status!==labels[item.raw_status_code]||typeof item.observed_at!=='string'||!Number.isFinite(Date.parse(item.observed_at)))return null;
  return {source:'baileys.messages.update',raw_status_code:item.raw_status_code,interpreted_status:labels[item.raw_status_code],observed_at:new Date(item.observed_at).toISOString()};
}

export function projectDeliveryObservation(value) {
  const latest=canonicalEvent(value);
  if(!latest)return null;
  const observations=Array.isArray(value.observations)?value.observations.map(canonicalEvent).filter(Boolean).slice(-20):[];
  return {...latest,observations,history_complete:false};
}

// This records provider event evidence. It does not change the local message state.
export function nextDeliveryObservation(previous, rawCode, observedAt) {
  if (!Number.isInteger(rawCode) || !Object.hasOwn(labels,rawCode)) return null;
  if (typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) return null;
  const event={source:'baileys.messages.update',raw_status_code:rawCode,interpreted_status:labels[rawCode],observed_at:new Date(observedAt).toISOString()};
  const prior=Array.isArray(previous?.observations)?previous.observations.map(canonicalEvent).filter(Boolean).slice(-19):[];
  return {...event,observations:[...prior,event],history_complete:false};
}
