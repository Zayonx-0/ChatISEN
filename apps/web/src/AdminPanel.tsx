import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api,ApiError,write} from './api.js';
import {sizeText} from './files.js';
import {errorText,type User} from './types.js';
import './admin.css';

type Health='healthy'|'down'|'unknown';
type Series=(number|null)[];
type Target='app-a'|'app-b'|'sfu-1'|'sfu-2'|'coturn'|'supervision';
type Server={target:Target;health:Health;confirmationName:string|null;resources:{cpu:Series;memory:Series;disk:Series};digests:{api:string|null;edge:string|null}|null};
type Overview={
  servers:Server[];database:Health;alerts:{name:string;count:number}[]|null;metrics:Record<string,Series>;
  activity:{accounts:{total:number;active:number;disabled:number}|null;conversations:number|null;
    dailyMessages:{day:string;count:number}[]|null;activeCalls:number|null;fileBytes:number|null};
  lastBackup:string|null;tls:{endpoint:'load-balancer'|'coturn';expiresAt:string|null;expiring:boolean|null}[];grafanaCommand:string|null;
  restarts:{enabled:boolean;active:Target|null;retryAt:string|null}|null;
};
type AuditEvent={id:string;actorId:string;action:string;targetType:string;targetId:string;detail:Record<string,unknown>;at:string};
type Account={id:string;handle:string;displayName:string;globalRole:'admin'|'user';disabled:boolean;createdAt:string;activeSessions:number};
type Denied=(status:number)=>void;

const serverNames:Record<Target,string>={'app-a':'Application A','app-b':'Application B','sfu-1':'SFU 1','sfu-2':'SFU 2',coturn:'coturn',supervision:'Supervision'};
const peers:Partial<Record<Target,Target>>={'app-a':'app-b','app-b':'app-a','sfu-1':'sfu-2','sfu-2':'sfu-1'};
const warnings:Partial<Record<Target,string>>={coturn:'Les appels relayés par coturn seront coupés.',supervision:'La collecte des métriques sera interrompue pendant le redémarrage.'};
const actions:Record<string,string>={'user.administered':'Compte modifié','user.promoted_by_operator':'Administrateur nommé par l’exploitant',
  'group.role_changed':'Rôle changé','group.owner_transferred':'Propriété transférée','group.member_removed':'Membre retiré',
  'server.restart_requested':'Redémarrage demandé','server.restart_result':'Résultat du redémarrage'};
const outcomes:Record<string,string>={reboot_observed:'Redémarrage observé',rejected:'Refusé',unknown:'Résultat incertain'};
const healthLabels:Record<Health,string>={healthy:'Sain',down:'En panne',unknown:'Indisponible'};
const missing='Indisponible';
const date=(value:string|null)=>value?new Date(value).toLocaleString('fr-FR'):missing;
const number=(value:number|null|undefined)=>value==null?missing:value.toLocaleString('fr-FR',{maximumFractionDigits:3});
const pathWith=(path:string,query:Record<string,string|undefined>)=>{
  const params=new URLSearchParams();for(const [key,value] of Object.entries(query))if(value)params.set(key,value);
  return path+'?'+params;
};

function useRead<T>(path:string,version:number,onDenied:Denied){
  const [state,setState]=useState<{data?:T;error?:string}>({});
  useEffect(()=>{
    const abort=new AbortController();
    api<T>(path,{signal:abort.signal}).then(data=>{if(!abort.signal.aborted)setState({data});}).catch(error=>{
      if(abort.signal.aborted)return;
      if(error instanceof ApiError&&(error.status===401||error.status===403))onDenied(error.status);
      setState({error:errorText(error,missing)});
    });
    return()=>abort.abort();
  },[path,version,onDenied]);
  return state;
}

function Sparkline({values}:{values:Series}){
  const finite=values.filter((value):value is number=>value!==null);
  if(!finite.length)return null;
  const high=Math.max(...finite),low=Math.min(...finite,0),width=Math.max(1,values.length-1);
  const lines:string[][]=[];let segment:string[]|undefined;
  values.forEach((value,index)=>{
    if(value===null){segment=undefined;return;}
    if(!segment){segment=[];lines.push(segment);}
    segment.push(`${2+index*116/width},${high===low?18:32-(value-low)*28/(high-low)}`);
  });
  return <svg viewBox="0 0 120 36" aria-hidden="true" focusable="false">
    <path d="M2 33H118" stroke="#e5eaf2" />
    {lines.map((points,index)=>points.length>1
      ?<polyline key={index} points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      :<circle key={index} cx={points[0].split(',')[0]} cy={points[0].split(',')[1]} r="2" fill="currentColor" />)}
  </svg>;
}
function Metric({label,values=[],unit=''}:{label:string;values?:Series;unit?:string}){
  const value=values.at(-1);
  return <div className="admin-metric"><span>{label}</span><strong>{number(value)}{value!=null&&unit&&` ${unit}`}</strong><Sparkline values={values}/></div>;
}
function Status({health}:{health:Health}){return <span className={`admin-health ${health}`}>{healthLabels[health]}</span>;}

const metricLabels=[
  ['httpRequests','Requêtes HTTP','/s'],['httpErrors','Erreurs HTTP 4xx et 5xx','/s'],['httpP95','Latence HTTP p95','s'],
  ['websockets','Connexions WebSocket',''],['messages','Messages','/s'],['deliveryP95','Délai de livraison p95','s'],
  ['outboxAge','Âge du plus ancien événement de l’outbox','s'],['pushFailures','Échecs Push','/s'],
  ['directCalls','Appels directs','/s'],['relayCalls','Appels relayés','/s'],
  ['callRtt','Temps aller-retour des appels p95','ms'],['callJitter','Gigue des appels p95','ms'],
  ['callBitrate','Débit des appels p95','kbit/s'],['callLoss','Perte de paquets','%'],
] as const;

function Dashboard({view}:{view:Overview}){
  const {activity}=view;
  return <>
    <div className="admin-columns">
      <section aria-labelledby="admin-health-title">
        <h2 id="admin-health-title">Santé des services</h2>
        <dl className="admin-pairs">
          {view.servers.map(server=><div key={server.target}><dt>{serverNames[server.target]}</dt><dd><Status health={server.health}/></dd></div>)}
          <div><dt>Base SQL</dt><dd><Status health={view.database}/></dd></div>
        </dl>
      </section>
      <section aria-labelledby="admin-alerts-title">
        <h2 id="admin-alerts-title">Alertes actives</h2>
        {view.alerts===null?<p>{missing}</p>:view.alerts.length?<ul className="admin-list">
          {view.alerts.map(alert=><li key={alert.name}>{alert.name} <strong>× {alert.count}</strong></li>)}
        </ul>:<p>Aucune alerte active.</p>}
        {view.tls.filter(tls=>tls.expiring).map(tls=><p className="admin-warning" key={tls.endpoint}>
          Certificat {tls.endpoint==='load-balancer'?'du load balancer':'de coturn'} à renouveler · {date(tls.expiresAt)}
        </p>)}
      </section>
    </div>
    <section>
      <h2>Activité</h2>
      <div className="admin-metrics">
        <Metric label="Comptes" values={[activity.accounts?.total??null]}/>
        <Metric label="Comptes actifs" values={[activity.accounts?.active??null]}/>
        <Metric label="Comptes désactivés" values={[activity.accounts?.disabled??null]}/>
        <Metric label="Conversations" values={[activity.conversations]}/>
        <Metric label="Appels en cours" values={[activity.activeCalls]}/>
        <div className="admin-metric"><span>Volume de fichiers</span><strong>{activity.fileBytes===null?missing:sizeText(activity.fileBytes)}</strong></div>
      </div>
      <h3>Messages par jour (UTC)</h3>
      {activity.dailyMessages?<dl className="admin-days">{activity.dailyMessages.map(item=><div key={item.day}><dt>{item.day.slice(8)}/{item.day.slice(5,7)}</dt><dd>{number(item.count)}</dd></div>)}</dl>:<p>{missing}</p>}
    </section>
    <section>
      <h2>Mesures sur 15 minutes</h2>
      <div className="admin-metrics">{metricLabels.map(([key,label,unit])=><Metric key={key} label={label} values={view.metrics[key]} unit={unit}/>)}</div>
    </section>
    <section>
      <h2>Ressources des VM sur 15 minutes</h2>
      <div className="admin-columns">{view.servers.map(server=><div className="admin-vm" key={server.target}>
        <h3>{serverNames[server.target]}</h3>
        <div className="admin-metrics admin-resources">
          <Metric label="CPU" values={server.resources.cpu} unit="%"/><Metric label="Mémoire" values={server.resources.memory} unit="%"/>
          <Metric label="Disque (racine)" values={server.resources.disk} unit="%"/>
        </div>
      </div>)}</div>
    </section>
    <section>
      <h2>Exploitation</h2>
      <dl className="admin-pairs admin-technical">
        {view.servers.filter(server=>server.target==='app-a'||server.target==='app-b').map(server=>
          <div key={server.target}>
            <dt>{serverNames[server.target]} · digests actifs</dt><dd>API <code>{server.digests?.api??missing}</code><br/>Nginx <code>{server.digests?.edge??missing}</code></dd>
          </div>)}
        <div><dt>Dernière sauvegarde SQL réussie</dt><dd>{date(view.lastBackup)}</dd></div>
        {view.tls.map(tls=><div key={tls.endpoint}><dt>Expiration TLS · {tls.endpoint==='load-balancer'?'Load balancer':'coturn'}</dt><dd>{date(tls.expiresAt)}
          {tls.endpoint==='load-balancer'&&<small>Renouvellement manuel</small>}
        </dd></div>)}
        <div><dt>Grafana par IAP</dt><dd>{view.grafanaCommand?<><code>{view.grafanaCommand}</code><small>Puis ouvrir http://localhost:3000</small></>:missing}</dd></div>
      </dl>
    </section>
  </>;
}

function Pager({stack,next,change}:{stack:string[];next?:string|null;change:(value:string[])=>void}){
  return <div className="admin-page-buttons">
    <button disabled={!stack.length} onClick={()=>change(stack.slice(0,-1))}>Précédente</button>
    <button disabled={!next} onClick={()=>{if(next)change([...stack,next]);}}>Suivante</button>
  </div>;
}
function Accounts({user,onDenied}:{user:User;onDenied:Denied}){
  const [text,setText]=useState(''),[query,setQuery]=useState(''),[stack,setStack]=useState<string[]>([]);
  const [message,setMessage]=useState(''),[version,setVersion]=useState(0),[busy,setBusy]=useState(false);
  const {data,error}=useRead<{items:Account[];nextCursor:string|null}>(pathWith('/admin/users',{q:query,cursor:stack.at(-1),limit:'20'}),version,onDenied);
  const change=async(account:Account,body:{disabled?:boolean;globalRole?:'admin'|'user';revokeSessions?:true},prompt:string,done:string)=>{
    if(busy||!window.confirm(`${prompt} @${account.handle} ?`))return;
    setBusy(true);setMessage('');
    try{
      await api(`/users/${account.id}`,write(user.csrfToken??'','PATCH',body));
      if(account.id===user.id){
        if(body.revokeSessions){onDenied(401);return;}
        if(body.globalRole==='user'){onDenied(403);return;}
      }
      setMessage(done);setVersion(value=>value+1);
    }catch(error){
      if(error instanceof ApiError&&(error.status===401||(error.status===403&&error.code==='FORBIDDEN')))onDenied(error.status);
      setMessage(errorText(error,'Action impossible.'));
    }finally{setBusy(false);}
  };
  return <section>
    <h2>Comptes</h2>
    <form className="admin-filter" onSubmit={event=>{event.preventDefault();setStack([]);setQuery(text.trim());}}>
      <label>Identifiant ou nom<input value={text} onChange={event=>setText(event.target.value)} maxLength={80}/></label>
      <button className="primary">Rechercher</button>
    </form>
    {message&&<p role="status">{message}</p>}
    {error?<p role="alert">{error}</p>:!data?<p>Chargement…</p>:<>
      {!data.items.length&&<p>Aucun compte trouvé.</p>}
      <ul className="admin-list admin-accounts">{data.items.map(account=><li key={account.id}>
        <div><strong>{account.displayName}</strong> <span>@{account.handle}</span>
          <small>{account.globalRole==='admin'?'Administrateur':'Utilisateur'} · {account.disabled?'Désactivé':'Actif'}</small>
          <small>Création · {date(account.createdAt)} · {account.activeSessions} session(s) active(s)</small>
        </div>
        <div className="admin-actions">
          {account.id!==user.id&&<button disabled={busy} onClick={()=>void change(account,{disabled:!account.disabled},account.disabled?'Réactiver':'Désactiver',
            account.disabled?'Compte réactivé.':'Compte désactivé.')}>{account.disabled?'Réactiver':'Désactiver'}</button>}
          <button disabled={busy} onClick={()=>void change(account,{globalRole:account.globalRole==='admin'?'user':'admin'},
            account.globalRole==='admin'?'Retirer le rôle administrateur à':'Nommer administrateur','Rôle mis à jour.')}>
            {account.globalRole==='admin'?'Retirer le rôle admin':'Nommer administrateur'}</button>
          <button disabled={busy||account.activeSessions===0} onClick={()=>void change(account,{revokeSessions:true},'Révoquer les sessions de','Sessions révoquées.')}>Révoquer les sessions</button>
        </div>
      </li>)}</ul>
      <Pager stack={stack} next={data.nextCursor} change={setStack}/>
    </>}
  </section>;
}
function Audit({onDenied}:{onDenied:Denied}){
  const [stack,setStack]=useState<string[]>([]),[action,setAction]=useState(''),[targetType,setTargetType]=useState('');
  const {data,error}=useRead<{items:AuditEvent[];nextBeforeId:string|null}>(pathWith('/audit-events',{action,targetType,beforeId:stack.at(-1),limit:'20'}),0,onDenied);
  return <section>
    <h2>Journal d’audit</h2>
    <div className="admin-filter">
      <label>Action<select value={action} onChange={event=>{setStack([]);setAction(event.target.value);}}>
        <option value="">Toutes les actions</option>{Object.entries(actions).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Type de cible<select value={targetType} onChange={event=>{setStack([]);setTargetType(event.target.value);}}>
        <option value="">Toutes les cibles</option><option value="user">Compte</option><option value="conversation">Conversation</option><option value="server">Serveur</option>
      </select></label>
    </div>
    {error?<p role="alert">{error}</p>:!data?<p>Chargement…</p>:<>
      {!data.items.length&&<p>Aucune entrée.</p>}
      <ul className="admin-list">{data.items.map(event=>{
        const target=event.detail.target as Target,result=String(event.detail.result??'');
        const details=event.targetType==='server'
          ?[serverNames[target],outcomes[result],event.targetId.slice(0,8)]
          :[event.targetType==='user'?'Compte':'Conversation',event.targetId.slice(0,8),
            event.detail.disabled===true?'Désactivation':event.detail.disabled===false?'Réactivation':null,
            event.detail.revokeSessions===true?'Révocation des sessions':null,
            event.detail.globalRole==='admin'?'Nomination admin':event.detail.globalRole==='user'?'Retrait du rôle admin':null];
        return <li key={event.id}><strong>{actions[event.action]??event.action}</strong>
          <small>{date(event.at)} · Auteur {event.actorId.slice(0,8)}</small><span>{details.filter(Boolean).join(' · ')}</span>
        </li>;
      })}</ul>
      <Pager stack={stack} next={data.nextBeforeId} change={setStack}/>
    </>}
  </section>;
}

function Servers({view,user,refresh,onDenied}:{view:Overview;user:User;refresh:()=>void;onDenied:Denied}){
  const [target,setTarget]=useState<Target|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const form=useRef<HTMLFormElement>(null);
  const server=view.servers.find(item=>item.target===target),state=view.restarts;
  const cooldown=state?.retryAt&&Date.parse(state.retryAt)>Date.now();
  const ready=(item:Server)=>{
    const peer=peers[item.target];
    return state?.enabled&&!state.active&&!cooldown&&item.confirmationName&&item.health!=='unknown'&&
      (!peer||view.servers.some(candidate=>candidate.target===peer&&candidate.health==='healthy'));
  };
  const restart=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!server||!ready(server)||busy)return;
    const dialog=event.currentTarget,values=new FormData(dialog);
    setBusy(true);setMessage('');
    const request=api('/admin/restarts',write(user.csrfToken??'','POST',{target:server.target,confirmation:values.get('confirmation'),password:values.get('password')}));
    dialog.reset();
    try{
      await request;setTarget(null);setMessage('Redémarrage demandé. Vérification en cours.');
    }catch(error){
      if(error instanceof ApiError&&(error.status===401||(error.status===403&&error.code==='FORBIDDEN')))onDenied(error.status);
      setMessage(errorText(error,'Redémarrage impossible.'));
    }finally{refresh();setBusy(false);}
  };
  return <section>
    <h2>Pilotage des serveurs</h2>
    {!state?<p>{missing}</p>:!state.enabled?<p>Redémarrages désactivés.</p>:<>
      {state.active&&<p role="status">Vérification du redémarrage de {serverNames[state.active]} en cours.</p>}
      {cooldown&&<p>Prochaine action après {date(state.retryAt)}.</p>}
    </>}
    {message&&<p role="status">{message}</p>}
    <ul className="admin-list">{view.servers.map(item=><li className="admin-server" key={item.target}>
      <div><strong>{serverNames[item.target]}</strong> <Status health={item.health}/>
        {warnings[item.target]&&<small>{warnings[item.target]}</small>}
      </div>
      <button aria-label={`Redémarrer ${serverNames[item.target]}`} disabled={!ready(item)||busy}
        onClick={()=>{form.current?.reset();setTarget(item.target);setMessage('');}}>Redémarrer</button>
    </li>)}</ul>
    {server&&<form className="admin-restart" ref={form} onSubmit={event=>void restart(event)}>
      <h3>Redémarrer {serverNames[server.target]}</h3>
      {warnings[server.target]&&<p className="admin-warning" role="alert">{warnings[server.target]}</p>}
      <p>Saisir <code>{server.confirmationName}</code> pour confirmer.</p>
      <label>Nom de la VM<input name="confirmation" required maxLength={63} autoComplete="off" spellCheck={false}/></label>
      <label>Mot de passe<input name="password" type="password" maxLength={128} autoComplete="current-password"/></label>
      <div className="admin-actions"><button type="button" disabled={busy} onClick={()=>setTarget(null)}>Annuler</button>
        <button className="primary" disabled={!ready(server)||busy}>Confirmer le redémarrage</button>
      </div>
    </form>}
  </section>;
}

const tabs=['Vue d’ensemble','Comptes','Serveurs','Journal d’audit'] as const;
export default function AdminPanel({user,onDenied}:{user:User;onDenied:Denied}){
  const [tab,setTab]=useState<typeof tabs[number]>(tabs[0]),[version,setVersion]=useState(0);
  const refresh=useCallback(()=>setVersion(count=>count+1),[]);
  const {data:view,error}=useRead<Overview>('/admin/overview',version,onDenied);
  useEffect(()=>{const timer=setInterval(refresh,30_000);return()=>clearInterval(timer);},[refresh]);
  return <div className="shell admin-shell">
    <header><div className="brand"><span className="logo small">✦</span><b>ChatISEN</b></div><a className="ghost" href="/">Retour à la messagerie</a></header>
    <main className="admin-main">
      <div className="admin-heading"><h1>Administration</h1>
        {(tab===tabs[0]||tab===tabs[2])&&<button onClick={refresh}>Actualiser</button>}
      </div>
      <nav aria-label="Sections d’administration">{tabs.map(label=><button type="button" key={label} aria-current={tab===label?'page':undefined} onClick={()=>setTab(label)}>{label}</button>)}</nav>
      {(tab===tabs[0]||tab===tabs[2])&&(error?<p role="alert">{error}</p>:!view?<p role="status">Chargement…</p>:tab===tabs[0]?
        <Dashboard view={view}/>:<Servers view={view} user={user} refresh={refresh} onDenied={onDenied}/>)}
      {tab===tabs[1]&&<Accounts user={user} onDenied={onDenied}/>}
      {tab===tabs[3]&&<Audit onDenied={onDenied}/>}
    </main>
  </div>;
}
