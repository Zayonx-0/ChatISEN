import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import {api,ApiError,write} from './api.js';
import {AdminPanel} from './AdminPanel.js';
import {Attachment} from './Attachment.js';
import {Auth} from './Auth.js';
import {CallPanel} from './CallPanel.js';
import {useCalls} from './calls.js';
import {acceptedTypes,sizeText,uploadFile} from './files.js';
import {GroupPanel} from './GroupPanel.js';
import {usePush} from './push.js';
import {useRealtime,type Frame} from './realtime.js';
import {errorText,type Conversation,type Member,type Message,type User} from './types.js';
import {UserSearch} from './UserSearch.js';

type Page={items:Message[];nextBeforeSeq:string|null};
type Pending={conversationId:string;key:string;clientId:string;fileId?:string};
const bySequence=(a:Message,b:Message)=>BigInt(a.seq)<BigInt(b.seq)?-1:BigInt(a.seq)>BigInt(b.seq)?1:0;
const upsert=(existing:Message[],incoming:Message)=>[...existing.filter(m=>m.id!==incoming.id),incoming].sort(bySequence);
const nameOf=(conversation:Conversation,userId:string)=>conversation.title||conversation.members?.find(m=>m.user.id!==userId)?.user.displayName||'Conversation privée';

function App(){
  const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);const [conversations,setConversations]=useState<Conversation[]>([]);const [selected,setSelected]=useState<Conversation|null>(null);const [messages,setMessages]=useState<Message[]>([]);const [before,setBefore]=useState<string|null>(null);
  const [draft,setDraft]=useState('');const [attached,setAttached]=useState<File|null>(null);const [error,setError]=useState('');const [sendBusy,setSendBusy]=useState(false);const [showList,setShowList]=useState(true);const [unread,setUnread]=useState<Record<string,number>>({});
  const [showMembers,setShowMembers]=useState(false);const [showAdmin,setShowAdmin]=useState(false);
  const cursor=useRef('0');const selection=useRef(0);const selectedId=useRef<string|null>(null);const drafts=useRef<Record<string,string>>({});const pending=useRef<Record<string,Pending>>({});const sending=useRef(false);const picker=useRef<HTMLInputElement>(null);
  const [callMembers,setCallMembers]=useState<Member[]>([]);
  const csrf=user?.csrfToken||'';
  const mutation=useCallback((method:string,body?:unknown)=>write(csrf,method,body),[csrf]);
  const calls=useCalls(user?.id,csrf);const push=usePush(user?.id,csrf);const wanted=useRef<string|null>(new URLSearchParams(location.search).get('conversation'));

  /** La liste ne donne pas les membres : les conversations privées sont complétées pour leur nom. */
  const details=useRef(new Map<string,Conversation>());
  const loadConversations=useCallback(async()=>{
    const all:Conversation[]=[];let next:string|null=null;
    do{
      const page:{items:Conversation[];nextCursor:string|null}=await api<{items:Conversation[];nextCursor:string|null}>(`/conversations${next?`?cursor=${encodeURIComponent(next)}`:''}`);
      all.push(...page.items);next=page.nextCursor;
    }while(next);
    const full=await Promise.all(all.map(async item=>{
      if(item.type==='group')return item;
      const known=details.current.get(item.id)??await api<Conversation>(`/conversations/${item.id}`);details.current.set(item.id,known);
      return {...item,members:known.members};
    }));
    full.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));setConversations(full);return full;
  },[]);

  const reset=useCallback(()=>{selection.current++;selectedId.current=null;setSelected(null);setMessages([]);setBefore(null);setShowList(true);setShowMembers(false);setAttached(null);},[]);
  useEffect(()=>{
    let active=true;
    api<User>('/users/me').then(async profile=>{
      if(!active)return;setUser(profile);
      try{await loadConversations();}catch(e){if(active)setError(errorText(e,'Conversations indisponibles.'));}
    }).catch(e=>{if(active&&!(e instanceof ApiError&&e.status===401))setError(errorText(e,'Service indisponible.'));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[loadConversations]);

  const select=async(conversation:Conversation)=>{
    const request=++selection.current;setError('');
    if(selectedId.current===conversation.id){setShowList(false);return;}
    try{
      const detail=await api<Conversation>(`/conversations/${conversation.id}`);
      const page=await api<Page>(`/conversations/${conversation.id}/messages`);
      if(request!==selection.current)return;
      const chronological=page.items.sort(bySequence);
      cursor.current=chronological.at(-1)?.seq||'0';selectedId.current=conversation.id;
      setSelected(detail);setMessages(chronological);setBefore(page.nextBeforeSeq);setDraft(drafts.current[conversation.id]||'');setAttached(null);setShowMembers(false);setShowList(false);
      setUnread(old=>{const next={...old};delete next[conversation.id];return next;});
    }catch(e){if(request===selection.current)setError(errorText(e,'Conversation indisponible.'));}
  };

  /** Membres, rôles et titre de la conversation ouverte, relus après chaque changement. */
  const refreshSelected=async()=>{
    const id=selectedId.current;if(!id)return;
    try{const detail=await api<Conversation>(`/conversations/${id}`);if(selectedId.current===id)setSelected(detail);}
    catch(e){if(e instanceof ApiError&&e.status===404&&selectedId.current===id)reset();}
  };

  const onFrame=(frame:Frame)=>{
    if(frame.type==='user_event'){calls.onEvent(frame.event!,frame.data);return;}
    if(frame.type==='conversation_list_changed'){
      const changed=frame.conversationId;const reason=(frame as Frame&{reason?:string}).reason;
      void loadConversations().then(all=>{
        if(selectedId.current&&!all.some(c=>c.id===selectedId.current))reset();
        const target=all.find(c=>c.id===changed);
        if(reason==='message'&&target&&user&&(selectedId.current!==target.id||document.hidden)){setUnread(old=>({...old,[target.id]:(old[target.id]||0)+1}));calls.setNotice(`Nouveau message : ${nameOf(target,user.id)}`);}
      }).catch(()=>{});
      return;
    }
    if(frame.type!=='event'||frame.conversationId!==selectedId.current||!frame.seq||BigInt(frame.seq)<=BigInt(cursor.current))return;
    cursor.current=frame.seq;
    if(frame.event==='message.created'){
      const data=frame.data as {id:string;senderId:string;clientId:string;text?:string;fileId?:string};
      setMessages(old=>upsert(old,{id:data.id,conversationId:frame.conversationId!,seq:frame.seq!,senderId:data.senderId,clientId:data.clientId,text:data.text,fileId:data.fileId,createdAt:frame.at!}));
    }else if(frame.event?.startsWith('conversation.')){void loadConversations().catch(()=>{});void refreshSelected();}
  };
  const connection=useRealtime(user?.id,selected?.id,cursor,onFrame,()=>{void loadConversations().catch(()=>{});void refreshSelected();void calls.recover().catch(()=>{});});
  // Noms des participants d'une conférence, même si une autre conversation est ouverte.
  useEffect(()=>{
    const id=calls.view.conversationId;if(!id||calls.view.topology!=='sfu'){setCallMembers([]);return;}
    let active=true;api<Conversation>(`/conversations/${id}`).then(detail=>{if(active)setCallMembers(detail.members??[]);}).catch(()=>{});
    return()=>{active=false;};
  },[calls.view.conversationId,calls.view.topology,calls.view.tiles?.length]);
  useEffect(()=>{if(!calls.notice)return;const timer=setTimeout(()=>calls.setNotice(''),5000);return()=>clearTimeout(timer);},[calls.notice,calls.setNotice]);

  const send=async(event:React.FormEvent)=>{
    event.preventDefault();if(!selected||(!draft.trim()&&!attached)||sending.current)return;
    const cid=selected.id,text=draft,file=attached;
    // Le même contenu garde la même clé : un nouvel essai ne crée pas de doublon.
    const key=JSON.stringify([text,file?.name,file?.size,file?.lastModified]);
    const previous=pending.current[cid];
    const command:Pending=previous?.key===key?previous:{conversationId:cid,key,clientId:crypto.randomUUID()};
    pending.current[cid]=command;sending.current=true;setSendBusy(true);setError('');
    try{
      if(file&&!command.fileId)command.fileId=(await uploadFile(cid,file,csrf)).id;
      const message=await api<Message>(`/conversations/${cid}/messages`,mutation('POST',{clientId:command.clientId,...(text.trim()?{text}:{}),...(command.fileId?{fileId:command.fileId}:{})}));
      delete pending.current[cid];if(drafts.current[cid]===text)delete drafts.current[cid];
      if(selectedId.current===cid){setMessages(old=>upsert(old,message));setDraft(drafts.current[cid]||'');setAttached(null);}
    }catch(e){setError(errorText(e,'Envoi impossible. Réessayez.'));}
    finally{sending.current=false;setSendBusy(false);}
  };
  const history=async()=>{
    if(!selected||!before)return;const cid=selected.id;
    try{
      const page=await api<Page>(`/conversations/${cid}/messages?beforeSeq=${encodeURIComponent(before)}`);
      if(selectedId.current!==cid)return;
      setMessages(old=>[...page.items,...old].filter((m,i,all)=>all.findIndex(x=>x.id===m.id)===i).sort(bySequence));setBefore(page.nextBeforeSeq);
    }catch(e){setError(errorText(e,'Historique indisponible.'));}
  };
  const openRef=useRef<(id:string)=>void>(()=>{});openRef.current=id=>{const target=conversations.find(c=>c.id===id);if(target)void select(target);else wanted.current=id;};
  useEffect(()=>{if(!wanted.current)return;const target=conversations.find(c=>c.id===wanted.current);if(target){wanted.current=null;window.history.replaceState(null,'',location.pathname);void select(target);}},[conversations]);
  useEffect(()=>{if(!('serviceWorker' in navigator))return;const listen=(event:MessageEvent)=>{if(event.data?.type==='open-conversation'&&typeof event.data.conversationId==='string')openRef.current(event.data.conversationId);};navigator.serviceWorker.addEventListener('message',listen);return()=>navigator.serviceWorker.removeEventListener('message',listen);},[]);

  const open=async(conversation:Conversation)=>{await loadConversations();await select(conversation);};
  const direct=async(contact:User)=>{try{await open(await api<Conversation>('/conversations',mutation('POST',{peerId:contact.id})));}catch(e){setError(errorText(e,'Création impossible.'));}};
  const createGroup=async(contact:User)=>{
    const title=window.prompt('Nom du groupe');if(!title?.trim())return;
    try{await open(await api<Conversation>('/groups',mutation('POST',{title:title.trim(),memberIds:[contact.id],clientId:crypto.randomUUID()})));}
    catch(e){setError(errorText(e,'Création impossible.'));}
  };
  const rename=async()=>{
    const name=window.prompt('Votre nom affiché',user?.displayName);if(!name?.trim()||name.trim()===user?.displayName)return;
    try{setUser(await api<User>('/users/me',mutation('PATCH',{displayName:name.trim()})));details.current.clear();await loadConversations();await refreshSelected();}
    catch(e){setError(errorText(e,'Modification impossible.'));}
  };
  const logout=async()=>{
    try{
      await api('/sessions/current',mutation('DELETE'));
      reset();pending.current={};drafts.current={};details.current.clear();setDraft('');setError('');setUnread({});setShowAdmin(false);setUser(null);setConversations([]);
    }catch(e){setError(errorText(e,'Déconnexion impossible.'));}
  };

  if(loading)return <main className="empty">Chargement de votre session…</main>;
  if(!user)return <Auth initialError={error} onAuthenticated={profile=>{setError('');setUser(profile);void loadConversations().catch(e=>setError(e.message));}}/>;
  const pageError=error&&<div className="error inline" role="alert">{error}<button onClick={()=>setError('')} aria-label="Fermer">×</button></div>;
  const members=selected?.members||[];const authors=new Map(members.map(m=>[m.user.id,m.user.displayName]));
  const callBusy=calls.view.phase!=='idle'||connection!=='online';
  return (
    <div className="shell">
      <header>
        <div className="brand"><span className="logo small">✦</span><b>ChatISEN</b></div>
        <div className="status">
          <span className="dot"/>
          <span className="account-status">{connection==='online'?'Connecté':connection==='connecting'?'Connexion…':'Reconnexion…'} · {user.displayName}</span>
          <button className="ghost" onClick={()=>void rename()}>Mon nom</button>
          {(push.state==='on'||push.state==='off'||push.state==='busy')&&<button className="ghost" disabled={push.state==='busy'} aria-pressed={push.state==='on'} onClick={()=>void (push.state==='on'?push.disable():push.enable())}>{push.state==='on'?'Notifications activées':'Activer les notifications'}</button>}
          {push.state==='denied'&&<span className="push-hint">Notifications bloquées par le navigateur</span>}
          {user.globalRole==='admin'&&<button className="ghost" onClick={()=>setShowAdmin(true)}>Administration</button>}
          <button className="ghost" onClick={()=>void logout()}>Déconnexion</button>
        </div>
      </header>
      {calls.notice&&<div className="toast" role="status">{calls.notice}</div>}
      {push.error&&<div className="error inline" role="alert">{push.error}</div>}
      {showAdmin&&<AdminPanel user={user} csrf={csrf} onClose={()=>setShowAdmin(false)}/>}
      <CallPanel calls={calls} peerName={(()=>{const c=conversations.find(x=>x.id===calls.view.conversationId);return c?nameOf(c,user.id):'Correspondant';})()}
        memberName={id=>callMembers.find(m=>m.user.id===id)?.user.displayName??'Participant'}/>
      <div className={`layout ${showList?'show-list':'show-chat'}`}>
        <aside>
          {showList&&pageError}
          <div className="side-title"><h2>Conversations</h2></div>
          <UserSearch id="handle-search" label="Rechercher un contact" exclude={[user.id]} onError={setError}
            actions={(contact,done)=><>
              <button onClick={()=>{done();void direct(contact);}}>Ouvrir une conversation</button>
              <button onClick={()=>{done();void createGroup(contact);}}>Créer un groupe avec ce contact</button>
            </>}/>
          <nav className="conversation-list" aria-label="Vos conversations">
            {!conversations.length&&<p className="side-note">Vos conversations apparaîtront ici.</p>}
            {conversations.map(c=>(
              <button className={'conversation '+(selected?.id===c.id?'active':'')} aria-current={selected?.id===c.id||undefined} key={c.id} onClick={()=>void select(c)}>
                <span className="avatar" aria-hidden="true">{nameOf(c,user.id).slice(0,1).toUpperCase()}</span>
                <span><b>{nameOf(c,user.id)}</b><small>{c.type==='group'?'Groupe':'Conversation privée'}</small></span>
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
                <h2>{nameOf(selected,user.id)}</h2><small>{members.length} participant(s)</small>
              </div>
              <div className="call-buttons">
                {selected.type==='group'&&<button aria-expanded={showMembers} onClick={()=>setShowMembers(value=>!value)}>Membres</button>}
                <button disabled={callBusy} onClick={()=>void calls.start(selected.id,'audio',selected.type==='group'?'sfu':'p2p')}>{selected.type==='group'?'Conférence audio':'Appel audio'}</button>
                <button disabled={callBusy} onClick={()=>void calls.start(selected.id,'video',selected.type==='group'?'sfu':'p2p')}>{selected.type==='group'?'Conférence vidéo':'Appel vidéo'}</button>
              </div>
            </div>
            {showMembers&&selected.type==='group'&&<GroupPanel key={selected.id+selected.title} conversation={selected} userId={user.id} csrf={csrf} onError={setError}
              onChanged={detail=>{setSelected(detail);void loadConversations().catch(()=>{});}} onLeft={()=>{reset();void loadConversations().catch(()=>{});}} onClose={()=>setShowMembers(false)}/>}
            <div className="messages">
              {before&&<button className="history" onClick={()=>void history()}>Charger les messages précédents</button>}
              {!messages.length&&<p className="empty">Aucun message. Écrivez le premier !</p>}
              {messages.map(m=>(
                <article className={'message '+(m.senderId===user.id?'mine':'')} key={m.id}>
                  <div className="bubble">
                    <div className="meta"><b>{authors.get(m.senderId)||'Ancien membre'}</b><time>{new Date(m.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</time></div>
                    {m.text&&<p>{m.text}</p>}
                    {m.fileId&&<Attachment fileId={m.fileId}/>}
                  </div>
                </article>
              ))}
            </div>
            {!showList&&pageError}
            {attached&&<div className="attached"><span>📎 {attached.name} · {sizeText(attached.size)}</span><button type="button" onClick={()=>setAttached(null)} aria-label="Retirer le fichier">×</button></div>}
            <form className="composer" onSubmit={send}>
              <input ref={picker} type="file" hidden aria-label="Fichier à joindre" accept={acceptedTypes.join(',')} onChange={e=>{setAttached(e.target.files?.[0]??null);e.target.value='';}}/>
              <button type="button" className="icon" aria-label="Joindre un fichier" disabled={sendBusy} onClick={()=>picker.current?.click()}>📎</button>
              <input value={draft} onChange={e=>{drafts.current[selected.id]=e.target.value;setDraft(e.target.value);}} placeholder="Écrire un message…" aria-label="Message" maxLength={4000}/>
              <button className="primary" disabled={sendBusy||(!draft.trim()&&!attached)}>{sendBusy?'Envoi…':'Envoyer'}</button>
            </form>
          </>:<section className="welcome">
            <h2>{conversations.length?'Reprenez une conversation':'Commencez une conversation'}</h2>
            <p>Ouvrez un fil ou recherchez un contact pour lui écrire.</p>
            <button className="primary" onClick={()=>document.getElementById('handle-search')?.focus()}>Rechercher un contact</button>
          </section>}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App/>);
