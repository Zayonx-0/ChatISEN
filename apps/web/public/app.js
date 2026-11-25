const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api = async (path, options = {}) => {
  const response = await fetch(path, {credentials:'include', ...options, headers:{'Content-Type':'application/json', ...(options.headers || {})}});
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'Une erreur est survenue.'), {status:response.status});
  return result;
};
const state = {user:null,csrf:'',convs:[],selected:null,messages:[],ws:null,call:null,stream:null,peer:null,ice:[],unread:{},seen:new Set(),subscribed:new Set()};
let refreshTimer, reconnectTimer, notificationTimer, selectionVersion=0;
const mutate = body => ({method:'POST',headers:{'x-csrf-token':state.csrf},body:JSON.stringify(body)});
const conversationName = c => (c?.type==='direct' ? c.members?.find(x=>x.id!==state.user?.id)?.displayName : c?.title) || 'Conversation';
function showError(error){const el=$('#app-error');if(el){el.textContent=error instanceof Error?error.message:String(error);el.hidden=false;}}
function notify(title,body){
  const notice=$('#notice');if(notice){notice.textContent=`${title} : ${body}`;notice.hidden=false;clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>{if($('#notice'))$('#notice').hidden=true},5000);}
  if(document.hidden && !state.pushEnabled && 'Notification' in window && Notification.permission==='granted'){try{new Notification(title,{body,tag:'chatisen'})}catch{/* L'alerte dans l'application reste disponible. */}}
}
const icons = {
  brand:'M12 2c1.8 5.5 4.5 8.2 10 10-5.5 1.8-8.2 4.5-10 10C10.2 16.5 7.5 13.8 2 12c5.5-1.8 8.2-4.5 10-10Z',
  search:'M21 21l-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  chat:'M21 11.5c0 4.7-4 8-9 8-1.2 0-2.3-.1-3.3-.5L4 21l1.2-4A7.5 7.5 0 0 1 3 11.5C3 7 7 3.5 12 3.5s9 3.5 9 8ZM8 11.5h8M8 15h5',
  back:'m12 5-7 7 7 7M5 12h14',
  next:'m9 6 6 6-6 6',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  logout:'M10 17l5-5-5-5m5 5H3m10-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6',
  audio:'M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z',
  video:'M14 8l6-3v14l-6-3M4 6h10v12H4z',
};
const icon = name => '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+icons[name]+'"/></svg>';
const initials = name => name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase() || '·';
const app = $('#app');
let searchTimer, searchVersion=0, refreshing=false, authVersion=0, listMarkup='';
const drafts = new Map();
const timeFormat = new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'});

function auth(initialError=''){
  app.className='';
  app.innerHTML='<main class="auth"><section class="card auth-card"><div class="logo">'+icon('brand')+'</div><h1>ChatISEN</h1><p id="auth-intro">Connectez-vous à vos conversations.</p><form id="af"><label><span>Identifiant</span><input class="field" name="handle" autocomplete="username" autocapitalize="none" spellcheck="false" required pattern="[a-z0-9_]{3,32}"></label><label id="display-field" hidden><span>Nom affiché</span><input class="field" name="displayName" autocomplete="nickname" maxlength="80"></label><label><span>Mot de passe</span><input class="field" type="password" name="password" autocomplete="current-password" minlength="8" required></label><p id="ae" class="error" role="alert" hidden></p><button class="primary" type="submit">Se connecter</button><button type="button" class="ghost" id="register">Créer un compte</button></form></section></main>';
  let registering=false;
  const form=$('#af'), submit=form.querySelector('.primary'), toggle=$('#register'), errorBox=$('#ae');
  const displayError=message=>{errorBox.textContent=message;errorBox.hidden=!message;};
  displayError(initialError);
  toggle.onclick=()=>{
    registering=!registering;
    $('#display-field').hidden=!registering;
    $('#auth-intro').textContent=registering?'Choisissez un identifiant à partager avec vos contacts.':'Connectez-vous à vos conversations.';
    form.elements.password.autocomplete=registering?'new-password':'current-password';
    submit.textContent=registering?'S’inscrire':'Se connecter';
    toggle.textContent=registering?'J’ai déjà un compte':'Créer un compte';
    displayError('');
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    const body=Object.fromEntries(new FormData(form));
    if(!registering)delete body.displayName;
    submit.disabled=toggle.disabled=true;
    displayError('');
    try{
      const result=await api('/api/auth/'+(registering?'register':'login'),{method:'POST',body:JSON.stringify(body)});
      state.user=result.user;
      state.csrf=result.csrf;
      await load();
    }catch(error){
      displayError(error.message);
    }finally{
      submit.disabled=toggle.disabled=false;
    }
  };
}

function render(){
  app.className='';
  app.innerHTML='<div class="shell">'+
    '<header class="top"><div class="top-inner"><div class="brand"><span class="logo">'+icon('brand')+'</span>ChatISEN</div>'+
      '<div class="account"><span class="connection" id="connection"><span class="connection-dot"></span><span class="connection-label">Connexion…</span></span>'+
      '<span class="account-name" title="'+esc(state.user.displayName)+'">'+esc(state.user.displayName)+'</span>'+
      '<button class="icon-button" id="enable-notifications" title="Activer les notifications" aria-label="Activer les notifications">'+icon('bell')+'</button>'+
      '<button class="icon-button" id="logout" title="Déconnexion" aria-label="Déconnexion">'+icon('logout')+'</button></div></div></header>'+
    '<div class="layout" data-pane="list"><aside class="side" aria-labelledby="conversations-title"><h1 id="conversations-title">Conversations</h1>'+
      '<div class="search-box"><label class="search-label" for="search">Rechercher un contact</label><div class="search-field">'+icon('search')+
      '<input class="field" id="search" type="search" placeholder="Nom ou identifiant" autocomplete="off" spellcheck="false" aria-describedby="search-status"></div>'+
      '<p id="search-status" class="side-note" aria-live="polite" hidden></p></div>'+
      '<div class="side-scroll"><div id="results" class="results"></div><nav id="convs" class="conversations" aria-label="Vos conversations"></nav></div></aside>'+
    '<main class="chat" aria-label="Messagerie"><div id="app-error" class="error app-error" role="alert" hidden></div>'+
      '<section class="chat-empty" id="welcome"><div class="empty-content"><span class="empty-mark">'+icon('chat')+'</span>'+
      '<h2 id="welcome-title">Commencez une conversation</h2><p class="muted" id="welcome-help">Recherchez un contact par son nom ou son identifiant, puis sélectionnez-le pour lui écrire.</p>'+
      '<button type="button" class="primary" id="find-contact">'+icon('search')+'Rechercher un contact</button></div></section>'+
      '<header class="chathead" id="thread-head" hidden><button type="button" class="icon-button mobile-back" id="chat-back" aria-label="Retour aux conversations" title="Retour aux conversations">'+icon('back')+'</button>'+
      '<span class="avatar" id="thread-avatar" aria-hidden="true"></span><div class="chat-identity"><h2 class="chat-title" id="ct" tabindex="-1"></h2><small id="cm"></small></div>'+
      '<div class="actions" id="call-actions"><button class="icon-button" id="audio" title="Appel audio" aria-label="Appel audio">'+icon('audio')+'</button>'+
      '<button class="icon-button" id="video" title="Appel vidéo" aria-label="Appel vidéo">'+icon('video')+'</button></div></header>'+
      '<div class="messages" id="messages" role="log" aria-label="Messages" hidden></div>'+
      '<form class="compose" id="compose" hidden><input class="field" id="text" placeholder="Écrire un message…" aria-label="Message" maxlength="4000" autocomplete="off"><button type="submit" id="send" class="primary" disabled>Envoyer</button></form></main></div>'+
    '<div id="notice" class="notice" role="status" hidden></div><dialog id="modal" class="card call" aria-labelledby="call-title"></dialog></div>';

  $('#logout').onclick=logout;
  $('#enable-notifications').onclick=togglePushNotifications;
  $('#compose').onsubmit=send;
  $('#text').oninput=()=>{if(state.selected)drafts.set(state.selected.id,$('#text').value);syncComposer();};
  $('#search').oninput=search;
  $('#find-contact').onclick=()=>$('#search').focus();
  $('#chat-back').onclick=()=>closeThread({focus:true});
  $('#audio').onclick=()=>startCall('audio');
  $('#video').onclick=()=>startCall('video');
  $('#modal').addEventListener('cancel',event=>event.preventDefault());
  listMarkup='';
  drawConvs();
}

async function logout(){
  const button=$('#logout');
  button.disabled=true;
  try{
    if(state.call)await endCall();
    await api('/api/auth/logout',mutate({}));
    await removeBrowserSubscription();
    authVersion++;
    selectionVersion++;
    searchVersion++;
    clearInterval(refreshTimer);
    clearTimeout(reconnectTimer);
    clearTimeout(searchTimer);
    const socket=state.ws;
    state.ws=null;
    state.user=null;
    state.selected=null;
    state.messages=[];
    state.unread={};
    state.seen.clear();
    state.subscribed.clear();
    drafts.clear();
    socket?.close();
    auth();
  }catch(error){
    notify('Déconnexion',error.message);
  }finally{button.disabled=false;}
}

async function load(){
  const [config,result]=await Promise.all([api('/api/config'),api('/api/conversations')]);
  state.iceServers=config.iceServers;
  state.convs=result.conversations;
  for(const conversation of state.convs)if(conversation.lastMessage)state.seen.add(conversation.lastMessage.id);
  render();
  updatePushButton();
  void restorePushNotifications();
  connectSocket();
  clearInterval(refreshTimer);
  refreshTimer=setInterval(refreshConversations,3000);
  const previous=state.convs.find(conversation=>conversation.id===sessionStorage.getItem('chatisen:thread:'+state.user.id));
  const params=new URLSearchParams(location.search);
  const requested=params.get('conversation');
  const target=state.convs.find(conversation=>conversation.id===requested)||previous;
  if(target)await select(target);
  if(requested){params.delete('conversation');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}
  await checkIncoming().catch(showError);
}

function subscribe(){
  if(state.ws?.readyState!==WebSocket.OPEN)return;
  for(const conversation of state.convs){
    if(state.subscribed.has(conversation.id))continue;
    state.ws.send(JSON.stringify({subscribe:'conversation:'+conversation.id}));
    state.subscribed.add(conversation.id);
  }
}

function setConnection(online){
  const status=$('#connection');
  if(!status)return;
  status.dataset.online=String(online);
  status.title=online?'En ligne':'Reconnexion…';
  status.querySelector('.connection-label').textContent=status.title;
}

function connectSocket(){
  if(!state.user)return;
  const socket=new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/api/ws');
  state.ws=socket;
  state.subscribed.clear();
  socket.onopen=()=>{setConnection(true);subscribe();};
  socket.onmessage=async event=>{
    if(state.ws!==socket)return;
    try{await handleEvent(JSON.parse(event.data));}catch(error){showError(error);}
  };
  socket.onerror=()=>socket.close();
  socket.onclose=()=>{
    if(!state.user||state.ws!==socket)return;
    setConnection(false);
    reconnectTimer=setTimeout(connectSocket,1500);
  };
}

async function refreshConversations(){
  if(!state.user||refreshing)return;
  refreshing=true;
  const version=authVersion;
  try{
    const result=await api('/api/conversations');
    if(version!==authVersion)return;
    state.convs=result.conversations;
    if(state.selected&&!state.convs.some(c=>c.id===state.selected.id))closeThread();
    subscribe();
    for(const conversation of state.convs)if(conversation.lastMessage)handleMessage(conversation.id,conversation.lastMessage);
    drawConvs();
    await checkIncoming();
  }catch(error){if(version===authVersion)showError(error);}
  finally{refreshing=false;}
}

function personRow({id,name,subtitle,current,unread,result}){
  const unreadLabel=unread===1?'1 message non lu':unread+' messages non lus';
  return '<button type="button" class="person" data-id="'+esc(id)+'"'+(current?' aria-current="true"':'')+'>'+
    '<span class="avatar" aria-hidden="true">'+esc(initials(name))+'</span><span class="person-text"><b class="person-name">'+esc(name)+'</b>'+
    '<small class="preview">'+esc(subtitle)+'</small></span>'+
    (unread?'<span class="badge" aria-label="'+unreadLabel+'">'+unread+'</span>':'')+(result?icon('next'):'')+'</button>';
}

function drawConvs(){
  const list=$('#convs');
  if(!list||!state.user)return;
  $('#welcome-title').textContent=state.convs.length?'Reprenez une conversation':'Commencez une conversation';
  $('#welcome-help').textContent=state.convs.length?'Ouvrez un fil dans la liste ou recherchez un contact pour écrire à quelqu’un.':'Recherchez un contact par son nom ou son identifiant, puis sélectionnez-le pour lui écrire.';
  const markup=state.convs.map(c=>personRow({id:c.id,name:conversationName(c),subtitle:c.lastMessage?.text||'Aucun message',current:state.selected?.id===c.id,unread:state.unread[c.id]})).join('')||
    '<p class="side-note">Vos conversations apparaîtront ici.</p>';
  if(markup===listMarkup)return;
  listMarkup=markup;
  const focused=list.contains(document.activeElement)?document.activeElement.dataset.id:null;
  list.innerHTML=markup;
  for(const button of list.querySelectorAll('button')){
    button.onclick=()=>select(state.convs.find(c=>c.id===button.dataset.id),{focus:true});
    if(button.dataset.id===focused)button.focus({preventScroll:true});
  }
}

function search(){
  const query=$('#search').value.trim();
  const version=++searchVersion;
  clearTimeout(searchTimer);
  $('#results').replaceChildren();
  if(query.length<2){
    setSearchStatus(query?'Saisissez au moins deux caractères.':'');
    return;
  }
  setSearchStatus('Recherche…');
  searchTimer=setTimeout(()=>findContacts(query,version),180);
}

function setSearchStatus(message){
  $('#search-status').textContent=message;
  $('#search-status').hidden=!message;
}

async function findContacts(query,version){
  try{
    const result=await api('/api/users/search?q='+encodeURIComponent(query));
    if(version!==searchVersion)return;
    const contacts=result.users.filter(contact=>contact.id!==state.user.id);
    $('#results').innerHTML=contacts.map(contact=>personRow({id:contact.id,name:contact.displayName,subtitle:'@'+contact.handle,result:true})).join('');
    setSearchStatus(contacts.length?'':'Aucun contact trouvé.');
    for(const button of $('#results').querySelectorAll('button')){
      button.onclick=()=>openContact(button.dataset.id,version);
    }
  }catch(error){if(version===searchVersion)setSearchStatus(error.message);}
}

async function openContact(id,searchRequest){
  const results=$('#results');
  const buttons=[...results.querySelectorAll('button')];
  for(const button of buttons)button.disabled=true;
  try{
    const result=await api('/api/conversations',mutate({type:'direct',memberIds:[id]}));
    if(searchRequest!==searchVersion)return;
    const existing=state.convs.find(c=>c.id===result.conversation.id);
    const conversation={...existing,...result.conversation};
    state.convs=[conversation,...state.convs.filter(c=>c.id!==conversation.id)];
    subscribe();
    $('#search').value='';
    results.replaceChildren();
    setSearchStatus('');
    await select(conversation,{focus:true});
  }catch(error){if(searchRequest===searchVersion)setSearchStatus(error.message);}
  finally{for(const button of buttons)button.disabled=false;}
}

function closeThread({focus=false}={}){
  selectionVersion++;
  state.selected=null;
  state.messages=[];
  sessionStorage.removeItem('chatisen:thread:'+state.user.id);
  $('.layout').dataset.pane='list';
  $('#welcome').hidden=false;
  for(const element of ['#thread-head','#messages','#compose','#app-error'])$(element).hidden=true;
  drawConvs();
  if(focus)$('#search').focus();
}

async function select(conversation,{focus=false}={}){
  if(!conversation)return;
  const version=++selectionVersion;
  state.selected=conversation;
  state.messages=[];
  state.loadingThread=true;
  delete state.unread[conversation.id];
  sessionStorage.setItem('chatisen:thread:'+state.user.id,conversation.id);
  $('.layout').dataset.pane='chat';
  $('#welcome').hidden=true;
  $('#app-error').hidden=true;
  for(const element of ['#thread-head','#messages','#compose'])$(element).hidden=false;
  $('#call-actions').hidden=conversation.type!=='direct'||conversation.members?.length!==2;
  const title=conversationName(conversation);
  $('#ct').textContent=title;
  $('#ct').title=title;
  $('#thread-avatar').textContent=initials(title);
  $('#cm').textContent=conversation.type==='direct'?'Conversation privée':(conversation.members?.length||0)+' membres';
  $('#text').value=drafts.get(conversation.id)||'';
  syncComposer();
  drawMessages();
  drawConvs();
  if(focus)$('#ct').focus();
  try{
    const result=await api('/api/conversations/'+conversation.id+'/messages');
    if(version!==selectionVersion)return;
    state.messages=[...new Map([...result.messages,...state.messages].map(message=>[message.id,message])).values()].sort((a,b)=>a.seq-b.seq);
    for(const message of result.messages)state.seen.add(message.id);
  }catch(error){if(version===selectionVersion)showError(error);}
  finally{
    if(version===selectionVersion){
      state.loadingThread=false;
      syncComposer();
      drawMessages({bottom:true});
    }
  }
}

function drawMessages({bottom=false}={}){
  const log=$('#messages');
  if(!log||!state.selected)return;
  const atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<80;
  const previousScroll=log.scrollTop;
  log.innerHTML=state.messages.map(message=>{
    const time=new Date(message.createdAt);
    const clock=Number.isNaN(time.getTime())?'':timeFormat.format(time);
    return '<article class="msg '+(message.senderId===state.user.id?'mine':'')+'"><div class="bubble"><div class="meta"><b>'+
      esc(message.sender?.displayName||'Membre')+'</b><time>'+clock+'</time></div><p>'+esc(message.text)+'</p></div></article>';
  }).join('')||'<div class="thread-empty"><p>'+(state.loadingThread?'Chargement des messages…':'Aucun message. Écrivez le premier !')+'</p></div>';
  log.scrollTop=bottom||atBottom?log.scrollHeight:previousScroll;
}

function handleMessage(cid,message){
  if(!message?.id||state.seen.has(message.id))return;
  state.seen.add(message.id);
  if(state.seen.size>1000)state.seen.delete(state.seen.values().next().value);
  const conversation=state.convs.find(c=>c.id===cid);
  if(!message.sender&&conversation)message={...message,sender:conversation.members?.find(member=>member.id===message.senderId)};
  if(conversation)conversation.lastMessage=message;
  if(message.senderId!==state.user.id&&message.sender?.id!==state.user.id&&(state.selected?.id!==cid||document.hidden)){
    state.unread[cid]=(state.unread[cid]||0)+1;
    notify('Nouveau message',conversationName(conversation));
  }
  if(state.selected?.id===cid&&!state.messages.some(item=>item.id===message.id)){
    state.messages.push(message);
    drawMessages({bottom:message.senderId===state.user.id});
  }
  drawConvs();
}

function syncComposer(){
  const input=$('#text'),button=$('#send');
  if(!input||!button)return;
  const loading=!state.selected||Boolean(state.loadingThread);
  input.disabled=loading;
  button.disabled=loading||Boolean(state.sending)||!input.value.trim();
  button.textContent=state.sending?'Envoi…':'Envoyer';
}

async function send(event){
  event.preventDefault();
  const conversation=state.selected,input=$('#text');
  if(!conversation||$('#send').disabled)return;
  const text=input.value;
  const version=authVersion;
  state.sending=true;
  syncComposer();
  try{
    const result=await api('/api/conversations/'+conversation.id+'/messages',mutate({text,clientMessageId:crypto.randomUUID()}));
    if(version!==authVersion)return;
    handleMessage(conversation.id,result.message);
    if(drafts.get(conversation.id)===text)drafts.delete(conversation.id);
    if(state.selected?.id===conversation.id&&input.value===text)input.value='';
    $('#app-error').hidden=true;
  }catch(error){if(version===authVersion)showError(error);}
  finally{state.sending=false;syncComposer();}
}
function updatePushButton(message) {
  const button=$('#enable-notifications');
  if(!button)return;
  const label=message || (state.pushEnabled?'Désactiver les notifications':'Activer les notifications');
  button.title=label;
  button.setAttribute('aria-label',label);
  button.setAttribute('aria-pressed',String(Boolean(state.pushEnabled)));
}

async function removeBrowserSubscription() {
  if(!('serviceWorker' in navigator))return;
  try {
    const registration=await navigator.serviceWorker.getRegistration('/');
    const subscription=await registration?.pushManager.getSubscription();
    if(subscription)await subscription.unsubscribe();
  } catch {
    // Server-side revocation on logout remains authoritative.
  }
  state.pushEnabled=false;
}

function applicationServerKey(encoded) {
  const padding='='.repeat((4-encoded.length%4)%4);
  return Uint8Array.from(atob((encoded+padding).replace(/-/g,'+').replace(/_/g,'/')),character=>character.charCodeAt(0));
}

async function enablePushNotifications() {
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window)) {
    throw Error('Les notifications en arrière-plan ne sont pas prises en charge par ce navigateur.');
  }
  const config=await api('/api/push/config');
  if(!config.available||!config.publicKey)throw Error('Les notifications sont momentanément indisponibles.');
  const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
  await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  const key=applicationServerKey(config.publicKey);
  if(subscription && subscription.options.applicationServerKey) {
    const current=new Uint8Array(subscription.options.applicationServerKey);
    if(current.length!==key.length||current.some((byte,index)=>byte!==key[index])) {
      await subscription.unsubscribe();
      subscription=null;
    }
  }
  if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await api('/api/push/subscriptions',mutate(subscription.toJSON()));
  state.pushEnabled=true;
  updatePushButton();
}

async function restorePushNotifications() {
  state.pushEnabled=false;
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const version=authVersion;
  try {
    await enablePushNotifications();
    if(version!==authVersion)state.pushEnabled=false;
  } catch {
    if(version===authVersion)updatePushButton('Réessayer les notifications');
  }
}

async function togglePushNotifications() {
  const button=$('#enable-notifications');
  if(!button||button.disabled)return;
  button.disabled=true;
  try {
    if(state.pushEnabled) {
      const registration=await navigator.serviceWorker.getRegistration('/');
      const subscription=await registration?.pushManager.getSubscription();
      if(subscription) {
        await api('/api/push/subscriptions',{method:'DELETE',headers:{'x-csrf-token':state.csrf},body:JSON.stringify({endpoint:subscription.endpoint})});
        await subscription.unsubscribe();
      }
      state.pushEnabled=false;
      updatePushButton();
      notify('Notifications','désactivées');
      return;
    }
    if(!('Notification' in window))throw Error('Les notifications ne sont pas disponibles dans ce navigateur.');
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw Error(permission==='denied'?'Autorisez les notifications pour ce site dans les réglages du navigateur.':'Autorisation des notifications non accordée.');
    await enablePushNotifications();
    notify('Notifications','activées');
  } catch(error) {
    updatePushButton('Réessayer les notifications');
    const denied=error.name==='NotAllowedError'||/permission denied/i.test(error.message||'');
    notify('Notifications',denied?'Le navigateur a refusé l’abonnement. Vérifiez ses autorisations et utilisez une fenêtre normale.':error.message||'Activation impossible.');
  } finally {
    button.disabled=false;
  }
}

async function openNotificationConversation(conversationId) {
  if(!state.user||typeof conversationId!=='string')return;
  let conversation=state.convs.find(item=>item.id===conversationId);
  if(!conversation){await refreshConversations();conversation=state.convs.find(item=>item.id===conversationId);}
  if(conversation)await select(conversation,{focus:true});
}

if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type==='open-conversation')void openNotificationConversation(event.data.conversationId).catch(showError);
});

async function checkIncoming(){if(!state.user)return;const result=await api('/api/calls/incoming');if(state.user&&!state.call&&result.calls[0])incomingCall(result.calls[0]);}
function incomingCall(call){if(state.call||call.initiatorId===state.user?.id)return;state.call=call;state.callError='';drawCall();notify('Appel entrant',callContact(call));}
async function handleEvent(event){
  if(!state.user)return;
  if(event.type==='message.created')return handleMessage(event.conversationId,event.message);
  if(event.type==='call.invitation')return incomingCall(event.call);
  if(event.type==='call.updated'){
    if(state.call?.id!==event.call.id)return;
    state.call=event.call;
    if(event.call.status==='ended'){const reason=event.call.reason;cleanupCall();notify('Appel',reason==='declined'?'appel refusé':reason==='expired'?'appel expiré':'appel terminé');return}
    drawCall();if(event.call.status==='active'&&event.call.initiatorId===state.user.id&&!state.peer)await makeOffer();
  }
  if(event.type==='call.signal'&&state.call?.id===event.callId&&event.to===state.user.id){try{await receiveSignal(event.signal)}catch(error){callError(error)}}
}
function cleanupCall(){state.peer?.close();state.peer=null;for(const track of state.stream?.getTracks()||[])track.stop();state.stream=null;state.remoteStream=null;state.ice=[];state.call=null;state.callError='';drawCall();}
function callError(error){state.callError=error instanceof Error?error.message:String(error);drawCall();}
async function getMedia(kind){if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone et caméra nécessitent localhost ou HTTPS.');return navigator.mediaDevices.getUserMedia({audio:true,video:kind==='video'});}
async function startCall(kind){const conversation=state.selected;if(!conversation){showError('Sélectionnez une conversation.');return}if(state.call||state.callBusy){showError('Un appel est déjà en cours.');return}let stream;state.callBusy=true;try{stream=await getMedia(kind);if(state.call)throw Error('Un autre appel est arrivé.');state.stream=stream;const result=await api('/api/conversations/'+conversation.id+'/calls',mutate({kind}));state.call=result.call;state.callError='';drawCall()}catch(error){for(const track of stream?.getTracks()||[])track.stop();state.stream=null;showError(error)}finally{state.callBusy=false}}
async function answerCall(action){const call=state.call;if(!call||state.callBusy)return;let stream;state.callBusy=true;for(const button of document.querySelectorAll('#accept,#reject'))button.disabled=true;try{if(action==='accept'){stream=await getMedia(call.kind);state.stream=stream;}const result=await api('/api/calls/'+call.id+'/answer',mutate({action}));if(state.call?.id!==call.id){for(const track of stream?.getTracks()||[])track.stop();return}if(action==='decline'){cleanupCall();return}state.call=result.call;drawCall()}catch(error){for(const track of stream?.getTracks()||[])track.stop();state.stream=null;callError(error)}finally{state.callBusy=false;for(const button of document.querySelectorAll('#accept,#reject'))button.disabled=false}}
async function endCall(){const call=state.call;if(!call)return;try{await api('/api/calls/'+call.id+'/end',mutate({}));}catch(error){showError(error)}finally{cleanupCall()}}
function callContact(call){
  const conversation=state.convs.find(item=>item.id===call.conversationId);
  return conversation?conversationName(conversation):'Conversation privée';
}

function drawCall(){
  const modal=$('#modal');
  if(!modal)return;
  const call=state.call;
  if(!call){
    if(modal.open)modal.close();
    modal.replaceChildren();
    return;
  }
  const ringing=call.status==='ringing';
  const incoming=ringing&&call.initiatorId!==state.user.id;
  const audioEnabled=state.stream?.getAudioTracks()[0]?.enabled;
  const videoEnabled=state.stream?.getVideoTracks()[0]?.enabled;
  const title=incoming?'Appel entrant':ringing?'Appel en attente':'Appel en cours';
  const status=state.callError||(ringing?(incoming?'Souhaitez-vous répondre ?':'En attente de réponse…'):
    state.peer?.connectionState==='connected'?'Connecté':'Connexion média…');
  const activeButton=(id,enabled,label)=>'<button class="ghost'+(enabled?'':' is-off')+'" id="'+id+'">'+label+'</button>';
  modal.innerHTML='<div class="empty-mark">'+icon(call.kind)+'</div><h2 id="call-title">'+title+'</h2>'+
    '<p>'+esc(callContact(call))+' · '+(call.kind==='video'?'Vidéo':'Audio')+'</p>'+
    '<p id="call-status" class="'+(state.callError?'error':'muted')+'" role="status">'+esc(status)+'</p>'+
    (ringing?'':'<video id="remote-media" autoplay playsinline muted '+(call.kind==='audio'?'hidden':'')+'></video><audio id="remote-audio" autoplay></audio>')+
    '<div class="call-controls">'+(incoming?
      '<button class="danger" id="reject">Refuser</button><button class="primary" id="accept">Accepter</button>':
      (ringing?'':activeButton('mute',audioEnabled,audioEnabled?'Couper le micro':'Activer le micro')+
        (call.kind==='video'?activeButton('camera',videoEnabled,videoEnabled?'Couper la caméra':'Activer la caméra'):''))+
      '<button class="danger" id="hang">Raccrocher</button>')+'</div>';
  if(!modal.open)modal.showModal();
  if(state.remoteStream&&$('#remote-media')){
    $('#remote-media').srcObject=state.remoteStream;
    $('#remote-audio').srcObject=state.remoteStream;
  }
  if(incoming){
    $('#accept').onclick=()=>answerCall('accept');
    $('#reject').onclick=()=>answerCall('decline');
  }else{
    $('#hang').onclick=endCall;
  }
  for(const [id,tracks] of [['mute',state.stream?.getAudioTracks()],['camera',state.stream?.getVideoTracks()]]){
    const button=document.getElementById(id);
    const track=tracks?.[0];
    if(!button||!track)continue;
    button.onclick=()=>{
      track.enabled=!track.enabled;
      button.classList.toggle('is-off',!track.enabled);
      button.textContent=id==='mute'?(track.enabled?'Couper le micro':'Activer le micro'):
        (track.enabled?'Couper la caméra':'Activer la caméra');
    };
  }
}
function createPeer(){if(state.peer)return state.peer;const call=state.call,peer=new RTCPeerConnection({iceServers:state.iceServers||[]});state.peer=peer;state.ice=[];for(const track of state.stream?.getTracks()||[])peer.addTrack(track,state.stream);
  peer.onicecandidate=e=>{if(e.candidate&&state.call?.id===call.id)void sendSignal('ice',e.candidate.toJSON()).catch(callError)};
  peer.ontrack=e=>{if(state.call?.id!==call.id)return;state.remoteStream=e.streams[0]||new MediaStream([e.track]);const video=$('#remote-media'),audio=$('#remote-audio');if(video){video.srcObject=state.remoteStream;video.muted=true}if(audio)audio.srcObject=state.remoteStream;};
  peer.onconnectionstatechange=()=>{const el=$('#call-status');if(el&&state.call?.id===call.id)el.textContent=peer.connectionState==='connected'?'Connecté':peer.connectionState==='failed'?'Connexion média impossible':`Connexion : ${peer.connectionState}`;};return peer;
}
async function sendSignal(type,data){if(!state.call)throw Error('Appel terminé.');await api('/api/calls/'+state.call.id+'/signal',mutate({type,data}));}
async function makeOffer(){try{const peer=createPeer(),offer=await peer.createOffer();await peer.setLocalDescription(offer);await sendSignal('offer',peer.localDescription.toJSON())}catch(error){callError(error)}}
async function receiveSignal(signal){const peer=createPeer();if(signal.type==='ice'){if(peer.remoteDescription)await peer.addIceCandidate(signal.data);else state.ice.push(signal.data);return}if(signal.type==='offer'||signal.type==='answer'){await peer.setRemoteDescription(signal.data);for(const candidate of state.ice)await peer.addIceCandidate(candidate);state.ice=[];if(signal.type==='offer'){const answer=await peer.createAnswer();await peer.setLocalDescription(answer);await sendSignal('answer',peer.localDescription.toJSON())}}}
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&state.selected){delete state.unread[state.selected.id];drawConvs();}
});
(async()=>{
  try{
    const result=await api('/api/auth/me');
    state.user=result.user;
    state.csrf=result.csrf;
    await load();
  }catch(error){auth(error.status===401?'':error.message);}
})();
