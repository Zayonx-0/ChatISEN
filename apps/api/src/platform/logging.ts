const masked='[masqué]';
const identifier=(value:unknown,fallback='')=>typeof value==='string'&&/^[a-zA-Z0-9_]{1,64}$/.test(value)?value:fallback;

function safeMessage(message:string){
  return message.slice(0,4096).split(/[\r\n]/,1)[0]
    .replace(/\b(?:detail|détail|hint|parameters?|paramètres?|request body|response body|body|payload|query|sql)\s*[:=].*/i,masked)
    .replace(/\b(?:SELECT|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\S+\s+SET|WITH\s+\S+\s+AS)\b\s+.+/i,masked)
    .replace(/[\[{].*/,masked)
    .replace(/\b(?:set-cookie|cookie)\s*[:=].*|\$\d+\s*=.*/i,masked)
    .replace(/\b(?:bearer|basic)\s+[^\s,;]+/gi,masked)
    .replace(/\b(password|passwd|mot de passe|(?:(?:access|refresh|id)[_-])?token|jeton|cookie|authorization|secret|signature|(?:api|access)[_-]?key|csrf|dsn|database_url|user(?:name)?|dbname|host(?:name)?|address|port)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1$2'+masked)
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi,masked)
    .replace(/(^|[\s=(])\/[^\s<>"'`]+/g,'$1'+masked)
    .replace(/\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH)\s+\S+/g,'$1 '+masked)
    .replace(/\b(?:eyJ[\w-]*\.[\w-]+\.[\w-]+|ya29\.[\w.-]+)/g,masked)
    .replace(/\?[^\s<>"'`]*/g,masked)
    .replace(/["'`][^"'\x60]*["'`]/g,masked)
    .replace(/\b[\w.+-]+@[\w.-]+\b|\b[\w.-]+:\d{2,5}\b|\b(?:[a-z\d_-]+\.)+[a-z][a-z\d-]+\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:[a-f\d]{0,4}:){2,}[a-f\d:.%]*/gi,masked)
    .replace(/[\w+/=-]{24,}|[\x00-\x1f\x7f]/g,masked)
    .slice(0,240);
}

export function serializeError(error:unknown){
  if(!(error instanceof Error))return {type:'Error',message:'Erreur non standard',stack:''};
  const code=identifier((error as Error&{code?:unknown}).code);
  const type=identifier(error.name==='Error'?error.constructor.name:error.name,'Error');
  // Les lignes précédant les cadres peuvent répéter le message et ses données.
  const stack=(error.stack??'').split('\n').flatMap(line=>{
    const frame=/^\s+at (?:(?<fn>[\w.$<> [\]-]+) \()?(?<file>(?:file:\/\/)?[\/\w@.+-]+|node:[\/\w.-]+):(?<line>\d+):(?<column>\d+)\)?$/.exec(line)?.groups;
    if(!frame)return [];
    const file=frame.file.replace(/^file:\/\//,'');
    const name=file.startsWith('node:')?file:file.split('/').slice(-2).join('/');
    return [`    at ${frame.fn?`${frame.fn.slice(0,100)} (`:''}${name.slice(-120)}:${frame.line}:${frame.column}${frame.fn?')':''}`];
  }).slice(0,12).join('\n');
  return {type,...(code?{code}:{}),message:safeMessage(error.message),stack};
}
