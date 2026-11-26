import React,{useState} from 'react';
import {api} from './api.js';
import {errorText,type User} from './types.js';

/** Recherche dans l'annuaire par début d'identifiant ou fragment du nom. */
export function UserSearch({id,label,exclude,onError,actions}:{id:string;label:string;exclude:string[];onError:(message:string)=>void;actions:(user:User,done:()=>void)=>React.ReactNode}){
  const [query,setQuery]=useState('');const [results,setResults]=useState<User[]|null>(null);
  const find=async(event:React.FormEvent)=>{
    event.preventDefault();setResults(null);
    try{const {items}=await api<{items:User[]}>(`/users?q=${encodeURIComponent(query.trim())}&limit=8`);setResults(items.filter(user=>!exclude.includes(user.id)));onError('');}
    catch(error){onError(errorText(error,'Recherche impossible.'));}
  };
  const done=()=>{setResults(null);setQuery('');};
  return <>
    <form className="contact-search" onSubmit={find}>
      <label htmlFor={id}>{label}</label>
      <div>
        <input id={id} className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ex. bob" autoComplete="off" maxLength={32}/>
        <button className="icon" aria-label="Rechercher" disabled={query.trim().length<2}>⌕</button>
      </div>
    </form>
    {results&&<div className="results">
      {!results.length&&<p className="side-note">Aucun compte ne correspond.</p>}
      {results.map(user=><div className="result" key={user.id}><strong>{user.displayName} · @{user.handle}</strong>{actions(user,done)}</div>)}
    </div>}
  </>;
}
