// chat.js (ES module) - plug this into your chat page as <script type="module" src="chat.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, onValue, push, set, update, onDisconnect, get, child, remove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getStorage, ref as sRef, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

/* ---------- FIREBASE CONFIG ----------
   Make sure storageBucket matches your console (usually *.appspot.com)
---------------------------------------*/
const firebaseConfig = {
  apiKey: "AIzaSyDEPxzueUia3bqkXIrWB_4xF_qOh5ZvAjI",
  authDomain: "chatapp-9a742.firebaseapp.com",
  databaseURL: "https://chatapp-9a742-default-rtdb.firebaseio.com",
  projectId: "chatapp-9a742",
  storageBucket: "chatapp-9a742.appspot.com", // <- confirm in Firebase Console
  messagingSenderId: "384469214707",
  appId: "1:384469214707:web:ac32854938c240e14c5e86"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth();
const storage = getStorage(app);

/* ---------- DOM refs ---------- */
const userListEl = document.getElementById('userList');
const chatBox = document.getElementById('chatBox');
const chatName = document.getElementById('chatName');
const chatStatus = document.getElementById('chatStatus');
const chatAvatar = document.getElementById('chatAvatar');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const attachBtn = document.getElementById('attachBtn');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPanel = document.getElementById('emojiPanel');
const searchUser = document.getElementById('searchUser');

/* ---------- App state ---------- */
let currentUser = null;
let selectedUser = null;
let selectedUserMeta = null;
let messagesUnsub = null; // store unsubscribe function for message listener

/* ---------- Helpers ---------- */
const el = html => { const tmp = document.createElement('div'); tmp.innerHTML = html; return tmp.firstElementChild; };
function formatTime(ts=Date.now()){
  const d = new Date(ts);
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}
// stable chatId so both sides refer to same typing path (smallerId_first)
function makeChatId(a,b){
  if(!a || !b) return `${a}_${b}`;
  return (a < b) ? `${a}_${b}` : `${b}_${a}`;
}

/* ---------- AUTH / PRESENCE ---------- */
onAuthStateChanged(auth, (user) => {
  if(!user){
    console.warn('No auth user. Redirect to login or sign in test user for dev.');
    //window.location.href = 'index.html'; // optionally redirect
    return;
  }
  currentUser = user.uid;
  // set presence online and ensure offline when disconnected
  set(ref(db, `status/${currentUser}`), 'online').catch(console.error);
  onDisconnect(ref(db, `status/${currentUser}`)).set('offline');
  // ensure profile node exists
  ensureUserProfile();
  // load UI
  loadUserList();
  listenTyping();
  watchIncomingAndMarkDelivered();
});

/* ---------- Ensure simple profile node for display ---------- */
async function ensureUserProfile(){
  if(!currentUser) return;
  try {
    const profileSnap = await get(child(ref(db), `users/${currentUser}`));
    if(!profileSnap.exists()){
      await set(ref(db, `users/${currentUser}`), { name: `User_${currentUser.slice(-5)}` });
    }
  } catch(err){ console.error('ensureUserProfile:', err); }
}

/* ---------- Load user list (from /status and /users) ---------- */
function loadUserList(){
  // listen to /status for quick reactive list
  onValue(ref(db, 'status'), async (snap) => {
    const statuses = snap.val() || {};
    // fetch users meta for names
    const usersSnap = await get(child(ref(db), 'users'));
    const usersMeta = usersSnap.exists() ? usersSnap.val() : {};
    let html = `<h5 class="p-3 border-bottom bg-light">Users</h5>`;
    for (let uid in statuses){
      if(uid === currentUser) continue;
      const meta = usersMeta[uid] || { name: uid };
      html += `
        <div class="userItem" data-id="${uid}">
          <div class="user-avatar">${(meta.name||'U').charAt(0).toUpperCase()}</div>
          <div style="flex:1">
            <strong>${meta.name}</strong><br>
            <small class="${statuses[uid]==='online' ? 'text-success' : 'text-secondary'}">● ${statuses[uid]}</small>
          </div>
          <div><span class="status-dot ${statuses[uid]==='online' ? 'status-online' : ''}"></span></div>
        </div>`;
    }
    userListEl.innerHTML = html || '<div class="p-3 text-muted">No other users</div>';
    // attach click handlers
    document.querySelectorAll('.userItem').forEach(elm => {
      elm.onclick = () => selectUser(elm.dataset.id);
    });
  });
}

/* ---------- Select user (open chat) ---------- */
function selectUser(uid){
  if(!uid) return;
  if(messagesUnsub){ messagesUnsub(); messagesUnsub = null; } // unsubscribe previous
  selectedUser = uid;

  // fetch meta
  get(child(ref(db), `users/${uid}`)).then(snap=>{
    const meta = snap.exists() ? snap.val() : { name: uid };
    selectedUserMeta = meta;
    chatName.innerText = meta.name || uid;
    chatAvatar.innerText = (meta.name||uid).charAt(0).toUpperCase();
  }).catch(console.error);

  // listen for status
  const statusRef = ref(db, `status/${uid}`);
  onValue(statusRef, s=> {
    chatStatus.innerText = s.exists() ? s.val() : 'offline';
  });

  // listen to messages path for current user -> selected user
  const myPath = ref(db, `messages/${currentUser}/${selectedUser}`);
  messagesUnsub = onValue(myPath, snap => {
    const data = snap.val() || {};
    renderMessages(data);
  });

  // when opening chat, mark incoming messages from selectedUser -> currentUser as seen
  const incomingPath = ref(db, `messages/${selectedUser}/${currentUser}`);
  onValue(incomingPath, snap => {
    const all = snap.val() || {};
    // iterate and mark messages from selectedUser (i.e. sender === selectedUser) as seen
    for(const key in all){
      const m = all[key];
      if(m && m.sender === selectedUser && m.status !== 'seen'){
        // update both sender & receiver copy
        update(ref(db, `messages/${selectedUser}/${currentUser}/${key}`), { status: 'seen' }).catch(console.error);
        update(ref(db, `messages/${currentUser}/${selectedUser}/${key}`), { status: 'seen' }).catch(console.error);
      }
    }
  });
}

/* ---------- Render messages ---------- */
function renderMessages(dataObj){
  const entries = Object.entries(dataObj || {}).sort((a,b)=> (a[1].time||0) - (b[1].time||0));
  chatBox.innerHTML = '';
  for(const [key,m] of entries){
    if(!m) continue;
    const isSender = m.sender === currentUser;
    const row = document.createElement('div');
    row.className = 'msg-row ' + (isSender ? 'send' : 'recv');
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + (isSender ? 'bubble-send' : 'bubble-recv');

    // media
    if(m.type === 'image' || m.type === 'video'){
      const tag = document.createElement(m.type === 'image' ? 'img' : 'video');
      tag.className = 'media-thumb';
      tag.src = m.mediaURL;
      if(m.type === 'video') tag.controls = true;
      bubble.appendChild(tag);
    }

    // text
    if(m.text){
      const p = document.createElement('div'); p.innerText = m.text;
      bubble.appendChild(p);
    }

    // meta
    const meta = document.createElement('div'); meta.className = 'meta-info';
    const timeSpan = document.createElement('span'); timeSpan.className = 'time'; timeSpan.innerText = formatTime(m.time || Date.now());
    meta.appendChild(timeSpan);

    if(isSender){
      const tick = document.createElement('span'); tick.className = 'tick';
      if(m.status === 'seen'){ tick.innerHTML = '✔✔'; tick.style.color = '#34B7F1'; }
      else if(m.status === 'delivered'){ tick.innerHTML = '✔✔'; tick.classList.add('delivered'); }
      else { tick.innerHTML = '✔'; }
      meta.appendChild(tick);
    }

    bubble.appendChild(meta);
    row.appendChild(bubble);
    chatBox.appendChild(row);
  }
  // scroll
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* ---------- Send message (text) ---------- */
sendBtn.onclick = sendMessage;
msgInput.addEventListener('keypress', (e)=>{
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    sendMessage();
  }
  // typing true
  sendTyping(true);
  debounceTypingOff();
});

let typingTimer = null;
function debounceTypingOff(){
  if(typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(()=> sendTyping(false), 1200);
}

async function sendMessage(){
  if(!selectedUser){ alert('Select a user first'); return; }
  const text = msgInput.value.trim();
  if(!text) return;
  const msgObj = {
    text,
    sender: currentUser,
    time: Date.now(),
    status: 'sent',
    type: 'text'
  };

  try {
    // push to sender path and receiver path using same key
    const myRef = push(ref(db, `messages/${currentUser}/${selectedUser}`));
    await set(myRef, msgObj);
    const key = myRef.key;
    await set(ref(db, `messages/${selectedUser}/${currentUser}/${key}`), msgObj);
    msgInput.value = '';
    sendTyping(false);
  } catch(err){
    console.error('sendMessage error', err);
  }
}

/* ---------- File attach & upload ---------- */
attachBtn.onclick = ()=> fileInput.click();
fileInput.addEventListener('change', async (e)=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  if(!selectedUser){ alert('Select a user first'); fileInput.value=''; return; }

  const ext = file.name.split('.').pop();
  const filePath = `chat_media/${currentUser}_${Date.now()}.${ext}`;
  const storageRef = sRef(storage, filePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  uploadTask.on('state_changed',
    (snap)=> {
      // optionally implement progress UI
    },
    (err)=> { alert('Upload failed: '+ err.message); },
    async ()=> {
      try {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        const type = file.type.startsWith('image') ? 'image' : (file.type.startsWith('video') ? 'video' : 'file');
        const msgObj = {
          text: '',
          sender: currentUser,
          time: Date.now(),
          status: 'sent',
          type,
          mediaURL: url
        };
        const myRef = push(ref(db, `messages/${currentUser}/${selectedUser}`));
        await set(myRef, msgObj);
        await set(ref(db, `messages/${selectedUser}/${currentUser}/${myRef.key}`), msgObj);
      } catch(err){ console.error('upload finalize', err); }
    }
  );
  fileInput.value = '';
});

/* ---------- Typing indicator ----------
   path used: typing/<sortedChatId>/<uid> = true
-----------------------------------------*/
function sendTyping(state){
  if(!selectedUser || !currentUser) return;
  const chatId = makeChatId(currentUser, selectedUser);
  const typingRef = ref(db, `typing/${chatId}/${currentUser}`);
  if(state){
    set(typingRef, true).catch(console.error);
    onDisconnect(typingRef).remove().catch(()=>{});
  } else {
    // remove
    remove(typingRef).catch(console.error);
  }
}

/* listen for typing across chats (shows typing in header if current chat partner types) */
function listenTyping(){
  onValue(ref(db, 'typing'), (snap)=>{
    const all = snap.val() || {};
    // check small set only: chats involving currentUser
    for(const chatId in all){
      if(!chatId.includes('_')) continue;
      const parts = chatId.split('_');
      if(!parts.includes(currentUser)) continue;
      // identify other
      const other = parts[0] === currentUser ? parts[1] : parts[0];
      const typingObj = all[chatId] || {};
      if(typingObj[other]){
        // other typing
        if(selectedUser === other){
          chatStatus.innerText = 'typing...';
        } else {
          // optionally show a badge on user list
        }
      } else {
        if(selectedUser === other){
          // restore status from /status/<other>
          get(child(ref(db), `status/${other}`)).then(s => {
            chatStatus.innerText = s.exists() ? s.val() : 'offline';
          }).catch(()=>{ chatStatus.innerText = 'offline'; });
        }
      }
    }
  });
}

/* ---------- Mark incoming messages delivered when this client sees them ----------
   We watch messages/${currentUser} and set 'delivered' for any incoming message from other that is 'sent'
------------------------------------------*/
function watchIncomingAndMarkDelivered(){
  onValue(ref(db, `messages/${currentUser}`), (snap)=>{
    const chats = snap.val() || {};
    for(const other in chats){
      const msgs = chats[other] || {};
      for(const key in msgs){
        const m = msgs[key];
        if(!m) continue;
        // if message came from other (sender===other) and status is still 'sent', mark delivered
        if(m.sender === other && m.status === 'sent'){
          update(ref(db, `messages/${currentUser}/${other}/${key}`), { status: 'delivered' }).catch(console.error);
          update(ref(db, `messages/${other}/${currentUser}/${key}`), { status: 'delivered' }).catch(console.error);
        }
      }
    }
  });
}

/* ---------- Search users (client-side) ---------- */
if(searchUser) searchUser.addEventListener('input', (e)=>{
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.userItem').forEach(it => {
    it.style.display = it.innerText.toLowerCase().includes(q) ? '' : 'none';
  });
});

/* ---------- Emoji panel basic ----------
   Toggle and insert emoji into msgInput
-------------------------------------*/
if(emojiBtn && emojiPanel){
  emojiBtn.onclick = (e)=> { emojiPanel.style.display = emojiPanel.style.display === 'none' ? 'block' : 'none'; };
  emojiPanel.addEventListener('click', (e)=>{
    if(e.target && e.target.nodeType === 1){
      msgInput.value += (e.target.innerText || e.target.textContent);
      msgInput.focus();
    }
  });
  document.addEventListener('click', (e)=>{
    if(!emojiPanel.contains(e.target) && e.target !== emojiBtn) emojiPanel.style.display = 'none';
  });
}

/* ---------- Cleanup on page unload ---------- */
window.addEventListener('beforeunload', ()=>{
  if(currentUser) {
    set(ref(db, `status/${currentUser}`), 'offline').catch(()=>{});
    // Also remove typing key for safety
    // Note: onDisconnect should handle this in normal cases
  }
});
 <!-- Firebase and App scripts -->
  