// Local implementation limits, never provider quotas or a safe sending volume.
export const LOCAL_LIMITS=Object.freeze({
 json_body_bytes:15*1024*1024,
 page_default:50,
 page_max:200,
 search_max_chars:200,
 text_max_chars:10000,
 media_upload_bytes:10*1024*1024,
 media_base64_max_chars:14*1024*1024,
 media_read_bytes:50*1024*1024,
 avatar_bytes:2*1024*1024,
 history_request_messages:50,
});
