import React,{useState} from 'react';
import {api,write} from './api.js';
import {UserSearch} from './UserSearch.js';
import {errorText,roleNames,type Conversation,type Role,type User} from './types.js';

/**
 * Gestion d'un groupe selon la matrice des droits. L'interface masque les actions
 * interdites ; le serveur reste seul juge.
 */
export function GroupPanel({conversation,userId,csrf,onChanged,onLeft,onClose,onError}:{conversation:Conversation;userId:string;csrf:string;onChanged:(detail:Conversation)=>void;onLeft:()=>void;onClose:()=>void;onError:(message:string)=>void}){
  const [title,setTitle]=useState(conversation.title??'');const [busy,setBusy]=useState(false);
  const members=conversation.members??[],mine=conversation.role,owner=mine==='owner';
  const group=`/groups/${conversation.id}`;
  const run=async(action:()=>Promise<Conversation|void>)=>{
    setBusy(true);onError('');
    try{const detail=await action();if(detail)onChanged(detail);}
    catch(error){onError(errorText(error,'Action impossible.'));}
    finally{setBusy(false);}
  };
  const put=(id:string,role:Role)=>run(()=>api<Conversation>(`${group}/members/${id}`,write(csrf,'PUT',{role})));
  const remove=(id:string)=>run(async()=>{await api(`${group}/members/${id}`,write(csrf,'DELETE'));return api<Conversation>(`/conversations/${conversation.id}`);});
  const leave=()=>run(async()=>{await api(`${group}/members/${userId}`,write(csrf,'DELETE'));onLeft();});
  const rename=(event:React.FormEvent)=>{event.preventDefault();void run(()=>api<Conversation>(group,write(csrf,'PATCH',{title:title.trim()})));};

  return <section className="group-panel" aria-label="Gestion du groupe">
    <div className="group-panel-head"><h3>Membres du groupe</h3><button type="button" className="ghost" onClick={onClose}>Fermer</button></div>
    {owner&&<form className="group-rename" onSubmit={rename}>
      <input aria-label="Nom du groupe" value={title} onChange={e=>setTitle(e.target.value)} maxLength={120}/>
      <button disabled={busy||!title.trim()||title.trim()===conversation.title}>Renommer</button>
    </form>}
    <ul>
      {members.map(({user,role})=><li key={user.id}>
        <span><b>{user.displayName}</b> <small>@{user.handle} · {roleNames[role]}</small></span>
        {user.id!==userId&&<span className="member-actions">
          {owner&&<button disabled={busy} onClick={()=>void put(user.id,role==='moderator'?'member':'moderator')}>{role==='moderator'?'Retirer le rôle modérateur':'Nommer modérateur'}</button>}
          {owner&&<button disabled={busy} onClick={()=>{if(window.confirm(`Transférer la propriété à ${user.displayName} ?`))void put(user.id,'owner');}}>Transférer la propriété</button>}
          {(owner||(mine==='moderator'&&role==='member'))&&<button disabled={busy} className="danger-text" onClick={()=>void remove(user.id)}>Retirer</button>}
        </span>}
      </li>)}
    </ul>
    {owner&&<UserSearch id="member-search" label="Ajouter un membre" exclude={members.map(m=>m.user.id)} onError={onError}
      actions={(user:User,done)=><button onClick={()=>{done();void put(user.id,'member');}}>Ajouter au groupe</button>}/>}
    <button type="button" className="danger-text" disabled={busy||(owner&&members.length>1)} onClick={()=>{if(window.confirm(owner?'Fermer définitivement ce groupe ?':'Quitter ce groupe ?'))void leave();}}>{owner&&members.length<2?'Fermer le groupe':'Quitter le groupe'}</button>
    {owner&&members.length>1&&<p className="side-note">Transférez la propriété avant de quitter le groupe.</p>}
  </section>;
}
