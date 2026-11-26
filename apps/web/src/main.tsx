import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import {api,ApiError,write} from './api.js';
import {useRealtime,type Frame} from './realtime.js';
import {useCalls} from './calls.js';
import {CallPanel} from './CallPanel.js';
import {usePush} from './push.js';

type User={id:string;handle:string;displayName:string;createdAt?:string;csrfToken?:string};
type Member={user:User;role:'owner'|'member';joinedAt:string};
type Conversation={id:string;type:'direct'|'group';title:string|null;lastSeq:string;role:'owner'|'member';updatedAt:string;members?:Member[]};
type Message={id:string;conversationId:string;seq:string;senderId:string;clientId:string;text:string;createdAt:string};
type EventEnvelope={v:1;type:'event';conversationId:string;seq:string;at:string;event:string;data:{id?:string;senderId?:string;clientId?:string;text?:string}};
const bySequence=(a:Message,b:Message)=>BigInt(a.seq)<BigInt(b.seq)?-1:BigInt(a.seq)>BigInt(b.seq)?1:0;
const upsert=(existing:Message[],incoming:Message)=>[...existing.filter(m=>m.id!==incoming.id),incoming].sort(bySequence);
const displayName=(conversation:Conversation,userId:string)=>conversation.title||conversation.members?.find(m=>m.user.id!==userId)?.user.displayName||'Conversation privée';

function Auth({onAuthenticated,initialError}:{onAuthenticated:(user:User)=>void;initialError:string}){
  const [mode,setMode]=useState<'login'|'register'>('login');const [handle,setHandle]=useState('');const [displayName,setDisplayName]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState(initialError);const [busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setBusy(true);setError('');try{const body=mode==='register'?{handle:handle.toLowerCase(),displayName,password}:{handle:handle.toLowerCase(),password};const result=await api<{user:User}>(`/auth/${mode}`,{method:'POST',body:JSON.stringify(body)});onAuthenticated(result.user);}catch(e){setError(e instanceof Error?e.message:'Connexion impossible.');}finally{setBusy(false);}};
  return <main className="auth"><section className="hero"><div className="logo">✦</div><h1>ChatISEN</h1><p>Conversations privées, groupes et échanges en temps réel.</p><ul><li>Retrouvez votre historique</li><li>Échangez en groupe</li><li>Restez informé de votre connexion</li></ul></section><form className="card auth-card" onSubmit={submit}><h2>{mode==='login'?'Se connecter':'Créer un compte'}</h2>{mode==='register'&&<label>Nom affiché<input value={displayName} onChange={e=>setDisplayName(e.target.value)} required maxLength={80}/></label>}<label>Identifiant<input value={handle} onChange={e=>setHandle(e.target.value)} autoComplete="username" required pattern="[a-z0-9_]{3,32}" title="3 à 32 lettres minuscules, chiffres ou underscores"/></label><label>Mot de passe<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} minLength={12} maxLength={128} required/></label>{error&&<div className="error" role="alert">{error}</div>}<button className="primary" disabled={busy}>{busy?'Patientez…':mode==='login'?'Entrer':'S’inscrire'}</button><button type="button" className="link" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');}}>{mode==='login'?'Créer un compte':'J’ai déjà un compte'}</button></form></main>;
}

function App(){
  const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);const [conversations,setConversations]=useState<Conversation[]>([]);const [selected,setSelected]=useState<Conversation|null>(null);const [messages,setMessages]=useState<Message[]>([]);const [before,setBefore]=useState<string|null>(null);const [draft,setDraft]=useState('');const [search,setSearch]=useState('');const [contact,setContact]=useState<User|null>(null);const [error,setError]=useState('');const [unread,setUnread]=useState<Record<string,number>>({});const [showList,setShowList]=useState(true);const cursor=useRef('0');const selection=useRef(0);const selectedId=useRef<string|null>(null);const sending=useRef(false);const [sendBusy,setSendBusy]=useState(false);const drafts=useRef<Record<string,string>>({});const pending=useRef<Record<string,{conversationId:string;text:string;clientId:string}>>({});
  const csrf=user?.csrfToken||'';
  const mutation=useCallback((method:string,body?:unknown)=>write(csrf,method,body),[csrf]);
  const calls=useCalls(user?.id,csrf);const push=usePush(user?.id,csrf);const wanted=useRef<string|null>(new URLSearchParams(location.search).get('conversation'));
  const loadConversations=useCallback(async()=>{const all:Conversation[]=[];let next:string|null=null;do{const page:{items:Conversation[];nextCursor:string|null}=await api<{items:Conversation[];nextCursor:string|null}>(`/conversations${next?`?cursor=${encodeURIComponent(next)}`:''}`);all.push(...page.items);next=page.nextCursor;}while(next);const details=await Promise.all(all.map(c=>api<Conversation>(`/conversations/${c.id}`)));setConversations(details);return details;},[]);
  useEffect(()=>{let active=true;api<User>('/me').then(async profile=>{if(!active)return;setUser(profile);try{await loadConversations();}catch(e){if(active)setError(e instanceof Error?e.message:'Conversations indisponibles.');}}).catch(e=>{if(active&&!(e instanceof ApiError&&e.status===401))setError(e instanceof Error?e.message:'Session indisponible.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[loadConversations]);
  const select=async(conversation:Conversation)=>{const request=++selection.current;setError('');if(selectedId.current===conversation.id){setShowList(false);return;}try{const detail=await api<Conversation>(`/conversations/${conversation.id}`);const page=await api<{items:Message[];nextBeforeSeq:string|null}>(`/conversations/${conversation.id}/messages`);if(request!==selection.current)return;cursor.current=page.items.at(-1)?.seq||'0';if(selectedId.current!==detail.id)setDraft(drafts.current[detail.id]||'');selectedId.current=detail.id;setSelected(detail);setUnread(old=>({...old,[detail.id]:0}));setMessages(page.items);setBefore(page.nextBeforeSeq);setShowList(false);}catch(e){if(request===selection.current)setError(e instanceof Error?e.message:'Conversation indisponible.');}};
  const onFrame=(frame:Frame)=>{
    if(frame.type==='user_event'){calls.onEvent(frame.event!,frame.data);return;}
    if(frame.type==='conversation_list_changed'){
      const changed=frame.conversationId;const reason=(frame as Frame&{reason?:string}).reason;
      void loadConversations().then(all=>{
        if(selectedId.current&&!all.some(c=>c.id===selectedId.current)){selection.current++;selectedId.current=null;setSelected(null);setMessages([]);setShowList(true);}
        const target=all.find(c=>c.id===changed);
        if(reason==='message'&&target&&user&&(selectedId.current!==target.id||document.hidden)){setUnread(old=>({...old,[target.id]:(old[target.id]||0)+1}));calls.setNotice(`Nouveau message : ${displayName(target,user.id)}`);}
      }).catch(()=>{});
      return;
    }
    if(frame.type!=='event'||frame.conversationId!==selectedId.current)return;
    const ev=frame as unknown as EventEnvelope;if(BigInt(ev.seq)>BigInt(cursor.current))cursor.current=ev.seq;
    if(ev.event==='message.created'&&ev.data.id&&ev.data.senderId&&ev.data.clientId&&typeof ev.data.text==='string')setMessages(old=>upsert(old,{id:ev.data.id!,conversationId:ev.conversationId,seq:ev.seq,senderId:ev.data.senderId!,clientId:ev.data.clientId!,text:ev.data.text!,createdAt:ev.at}));
    else if(ev.event.startsWith('conversation.'))void loadConversations().then(all=>{const fresh=all.find(c=>c.id===selectedId.current);if(fresh)setSelected(fresh);}).catch(()=>{});
  };
  const connection=useRealtime(user?.id,selected?.id,cursor,onFrame,()=>{void loadConversations().catch(()=>{});void calls.recover().catch(()=>{});});
  useEffect(()=>{if(!calls.notice)return;const timer=setTimeout(()=>calls.setNotice(''),5000);return()=>clearTimeout(timer);},[calls.notice,calls.setNotice]);
  const send=async(event:React.FormEvent)=>{event.preventDefault();if(!selected||!draft.trim()||sending.current)return;const cid=selected.id;const previous=pending.current[cid];const command=previous?.text===draft?previous:{conversationId:cid,text:draft,clientId:crypto.randomUUID()};pending.current[cid]=command;sending.current=true;setSendBusy(true);try{const message=await api<Message>(`/conversations/${cid}/messages`,mutation('POST',{text:command.text,clientId:command.clientId}));if(drafts.current[cid]===command.text)drafts.current[cid]='';if(selectedId.current===cid){setMessages(old=>upsert(old,message));setDraft(current=>current===command.text?'':current);setError('');}if(pending.current[cid]===command)delete pending.current[cid];}catch(e){if(selectedId.current===cid)setError(`${e instanceof Error?e.message:'Envoi impossible.'} Réessayez sans modifier le message.`);}finally{sending.current=false;setSendBusy(false);}};
  const history=async()=>{if(!selected||!before)return;const cid=selected.id;try{const page=await api<{items:Message[];nextBeforeSeq:string|null}>(`/conversations/${cid}/messages?beforeSeq=${encodeURIComponent(before)}`);if(selectedId.current!==cid)return;setMessages(old=>[...page.items,...old].filter((m,i,a)=>a.findIndex(x=>x.id===m.id)===i).sort(bySequence));setBefore(page.nextBeforeSeq);}catch(e){if(selectedId.current===cid)setError(e instanceof Error?e.message:'Historique indisponible.');}};
  const openRef=useRef<(id:string)=>void>(()=>{});openRef.current=id=>{const target=conversations.find(c=>c.id===id);if(target)void select(target);else wanted.current=id;};
  useEffect(()=>{if(!wanted.current)return;const target=conversations.find(c=>c.id===wanted.current);if(target){wanted.current=null;window.history.replaceState(null,'',location.pathname);void select(target);}},[conversations]);
  useEffect(()=>{if(!('serviceWorker' in navigator))return;const listen=(event:MessageEvent)=>{if(event.data?.type==='open-conversation'&&typeof event.data.conversationId==='string')openRef.current(event.data.conversationId);};navigator.serviceWorker.addEventListener('message',listen);return()=>navigator.serviceWorker.removeEventListener('message',listen);},[]);
  const findContact=async(event:React.FormEvent)=>{event.preventDefault();setContact(null);try{const found=await api<User>(`/users?handle=${encodeURIComponent(search.trim().toLowerCase())}`);if(found.id===user?.id)throw new Error('Choisissez un autre compte.');setContact(found);setError('');}catch(e){setError(e instanceof Error?e.message:'Contact introuvable.');}};
  const direct=async()=>{if(!contact)return;try{const conversation=await api<Conversation>('/conversations/direct',mutation('POST',{peerId:contact.id}));await loadConversations();setContact(null);setSearch('');await select(conversation);}catch(e){setError(e instanceof Error?e.message:'Création impossible.');}};
  const createGroup=async()=>{if(!contact)return;const title=window.prompt('Nom du groupe');if(!title?.trim())return;try{const group=await api<Conversation>('/conversations/groups',mutation('POST',{title:title.trim(),memberIds:[contact.id],clientId:crypto.randomUUID()}));await loadConversations();setContact(null);setSearch('');await select(group);}catch(e){setError(e instanceof Error?e.message:'Création impossible.');}};
  const logout=async()=>{try{await api('/auth/logout',mutation('POST'));selection.current++;selectedId.current=null;pending.current={};drafts.current={};setDraft('');setError('');setSearch('');setContact(null);setUnread({});setUser(null);setSelected(null);setConversations([]);setMessages([]);setShowList(true);}catch(e){setError(e instanceof Error?e.message:'Déconnexion impossible.');}};
  if(loading)return <main className="empty">Chargement de votre session…</main>;
  if(!user)return <Auth initialError={error} onAuthenticated={profile=>{setError('');setUser(profile);void loadConversations().catch(e=>setError(e.message));}}/>;
  const pageError=error&&<div className="error inline" role="alert">{error}<button onClick={()=>setError('')} aria-label="Fermer">×</button></div>;const members=selected?.members||[];const authors=new Map(members.map(m=>[m.user.id,m.user.displayName]));
  return (
    <div className="shell">
      <header>
        <div className="brand"><span className="logo small">✦</span><b>ChatISEN</b></div>
        <div className="status">
          <span className="dot"/>
          <span className="account-status">{connection==='online'?'Connecté':connection==='connecting'?'Connexion…':'Reconnexion…'} · {user.displayName}</span>
          {(push.state==='on'||push.state==='off'||push.state==='busy')&&<button className="ghost" disabled={push.state==='busy'} aria-pressed={push.state==='on'} onClick={()=>void (push.state==='on'?push.disable():push.enable())}>{push.state==='on'?'Notifications activées':'Activer les notifications'}</button>}
          {push.state==='denied'&&<span className="push-hint">Notifications bloquées par le navigateur</span>}
          <button className="ghost" onClick={()=>void logout()}>Déconnexion</button>
        </div>
      </header>
      {calls.notice&&<div className="toast" role="status">{calls.notice}</div>}
      {push.error&&<div className="error inline" role="alert">{push.error}</div>}
      <CallPanel calls={calls} peerName={(()=>{const c=conversations.find(x=>x.id===calls.view.conversationId);return c?displayName(c,user.id):'Correspondant';})()}/>
      <div className={`layout ${showList?'show-list':'show-chat'}`}>
        <aside>
          {showList&&pageError}
          <div className="side-title"><h2>Conversations</h2></div>
          <form className="contact-search" onSubmit={findContact}>
            <label htmlFor="handle-search">Rechercher un identifiant exact</label>
            <div>
              <input id="handle-search" className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ex. bob" autoComplete="off"/>
              <button className="icon" aria-label="Rechercher" disabled={!search.trim()}>⌕</button>
            </div>
          </form>
          {contact&&<div className="results">
            <strong>{contact.displayName} · @{contact.handle}</strong>
            <button onClick={()=>void direct()}>Ouvrir une conversation</button>
            <button onClick={()=>void createGroup()}>Créer un groupe avec ce contact</button>
          </div>}
          <nav className="conversation-list" aria-label="Vos conversations">
            {!conversations.length&&<p className="side-note">Vos conversations apparaîtront ici.</p>}
            {conversations.map(c=>(
              <button className={'conversation '+(selected?.id===c.id?'active':'')} aria-current={selected?.id===c.id||undefined} key={c.id} onClick={()=>void select(c)}>
                <span className="avatar" aria-hidden="true">{displayName(c,user.id).slice(0,1).toUpperCase()}</span>
                <span><b>{displayName(c,user.id)}</b><small>{c.type==='group'?'Groupe':'Conversation privée'}</small></span>
                {Boolean(unread[c.id])&&<span className="badge" aria-label={`${unread[c.id]} message${unread[c.id]>1?'s':''} non lu${unread[c.id]>1?'s':''}`}>{unread[c.id]}</span>}
              </button>
            ))}
          </nav>
        </aside>
        <main className="chat">
          {selected?<>
            <div className="chat-head">
              <div>
                <button className="mobile-back" onClick={()=>setShowList(true)}>← Conversations</button>
                <h2>{displayName(selected,user.id)}</h2><small>{members.length} participant(s)</small>
              </div>
              {selected.type==='direct'&&<div className="call-buttons">
                <button disabled={calls.view.phase!=='idle'||connection!=='online'} onClick={()=>void calls.start(selected.id,'audio')}>Appel audio</button>
                <button disabled={calls.view.phase!=='idle'||connection!=='online'} onClick={()=>void calls.start(selected.id,'video')}>Appel vidéo</button>
              </div>}
            </div>
            <div className="messages">
              {before&&<button className="history" onClick={()=>void history()}>Charger les messages précédents</button>}
              {!messages.length&&<p className="empty">Aucun message. Écrivez le premier !</p>}
              {messages.map(m=>(
                <article className={'message '+(m.senderId===user.id?'mine':'')} key={m.id}>
                  <div className="bubble">
                    <div className="meta"><b>{authors.get(m.senderId)||'Membre'}</b><time>{new Date(m.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</time></div>
                    <p>{m.text}</p>
                  </div>
                </article>
              ))}
            </div>
            {!showList&&pageError}
            <form className="composer" onSubmit={send}>
              <input value={draft} onChange={e=>{drafts.current[selected.id]=e.target.value;setDraft(e.target.value);}} placeholder="Écrire un message…" aria-label="Message" maxLength={4000}/>
              <button className="primary" disabled={sendBusy||!draft.trim()}>{sendBusy?'Envoi…':'Envoyer'}</button>
            </form>
          </>:<section className="welcome">
            <h2>{conversations.length?'Reprenez une conversation':'Commencez une conversation'}</h2>
            <p>Ouvrez un fil ou recherchez un contact par son identifiant pour lui écrire.</p>
            <button className="primary" onClick={()=>document.getElementById('handle-search')?.focus()}>Rechercher un contact</button>
          </section>}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App/>);
