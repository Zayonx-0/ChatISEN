import React,{useState} from 'react';
import {api} from './api.js';
import type {User} from './types.js';

export function Auth({onAuthenticated,initialError}:{onAuthenticated:(user:User)=>void;initialError:string}){
  const [mode,setMode]=useState<'login'|'register'>('login');const [handle,setHandle]=useState('');const [displayName,setDisplayName]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState(initialError);const [busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');
    try{
      const body=mode==='register'?{handle:handle.toLowerCase(),displayName,password}:{handle:handle.toLowerCase(),password};
      onAuthenticated(await api<User>(mode==='register'?'/users':'/sessions',{method:'POST',body:JSON.stringify(body)}));
    }catch(e){setError(e instanceof Error?e.message:'Connexion impossible.');}
    finally{setBusy(false);}
  };
  return <main className="auth">
    <section className="hero"><div className="logo">✦</div><h1>ChatISEN</h1><p>Conversations privées, groupes et échanges en temps réel.</p><ul><li>Retrouvez votre historique</li><li>Échangez en groupe</li><li>Restez informé de votre connexion</li></ul></section>
    <form className="auth-card card" onSubmit={submit}>
      <h2>{mode==='login'?'Content de vous revoir':'Créer un compte'}</h2>
      {mode==='register'&&<label>Nom affiché<input value={displayName} onChange={e=>setDisplayName(e.target.value)} required maxLength={80} autoComplete="name"/></label>}
      <label>Identifiant<input value={handle} onChange={e=>setHandle(e.target.value)} required pattern="[a-zA-Z0-9_]{3,32}" autoComplete="username"/></label>
      <label>Mot de passe<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==='register'?12:1} maxLength={128} autoComplete={mode==='register'?'new-password':'current-password'}/></label>
      {error&&<div className="error" role="alert">{error}</div>}
      <button className="primary" disabled={busy}>{busy?'Patientez…':mode==='login'?'Se connecter':'S’inscrire'}</button>
      <button type="button" className="link" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');}}>{mode==='login'?'Créer un compte':'J’ai déjà un compte'}</button>
    </form>
  </main>;
}
