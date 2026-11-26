import React,{useCallback,useEffect,useState} from 'react';
import {api,write} from './api.js';
import {UserSearch} from './UserSearch.js';
import {errorText,type User} from './types.js';

type AuditEvent={id:string;actorId:string;action:string;targetType:string;targetId:string;detail:Record<string,unknown>;at:string};
const actions:Record<string,string>={'user.administered':'Compte modifié','user.promoted_by_operator':'Administrateur nommé par l’exploitant','group.role_changed':'Rôle changé','group.owner_transferred':'Propriété transférée','group.member_removed':'Membre retiré'};

/** Administrateur global : désactiver ou réactiver un compte, lire le journal. Aucune lecture des conversations. */
export function AdminPanel({user,csrf,onClose}:{user:User;csrf:string;onClose:()=>void}){
  const [events,setEvents]=useState<AuditEvent[]>([]);const [message,setMessage]=useState('');
  const load=useCallback(()=>api<{items:AuditEvent[]}>('/audit-events?limit=30').then(page=>setEvents(page.items)).catch(error=>setMessage(errorText(error,'Journal indisponible.'))),[]);
  useEffect(()=>{void load();},[load]);
  const set=async(id:string,disabled:boolean)=>{
    try{await api(`/users/${id}`,write(csrf,'PATCH',{disabled}));setMessage(disabled?'Compte désactivé.':'Compte réactivé.');await load();}
    catch(error){setMessage(errorText(error,'Action impossible.'));}
  };
  return <div className="call-layer"><section className="call-card admin-panel" role="dialog" aria-label="Administration">
    <div className="group-panel-head"><h2>Administration</h2><button type="button" className="ghost" onClick={onClose}>Fermer</button></div>
    {message&&<p role="status">{message}</p>}
    <UserSearch id="admin-search" label="Compte à désactiver" exclude={[user.id]} onError={setMessage}
      actions={(found,done)=><button onClick={()=>{if(window.confirm(`Désactiver le compte @${found.handle} ?`)){done();void set(found.id,true);}}}>Désactiver ce compte</button>}/>
    <h3>Journal d’audit</h3>
    <ul className="audit">
      {!events.length&&<li className="side-note">Aucune entrée.</li>}
      {events.map(event=><li key={event.id}>
        <span><b>{actions[event.action]??event.action}</b> <small>{new Date(event.at).toLocaleString('fr-FR')} · {event.targetType} {event.targetId.slice(0,8)}</small></span>
        {event.action==='user.administered'&&event.detail.disabled===true&&<button onClick={()=>void set(event.targetId,false)}>Réactiver</button>}
      </li>)}
    </ul>
  </section></div>;
}
